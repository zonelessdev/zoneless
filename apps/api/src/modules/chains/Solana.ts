/**
 * @fileOverview Methods for Solana.
 *
 *
 * @module Solana
 */

import {
  Keypair,
  Connection,
  clusterApiUrl,
  Cluster,
  PublicKey,
  Transaction,
  TransactionInstruction,
  SystemProgram,
  ParsedTransactionWithMeta,
  ConfirmedSignatureInfo,
} from '@solana/web3.js';
import { createHash } from 'crypto';
import bs58 from 'bs58';
import {
  getAssociatedTokenAddress,
  createTransferInstruction,
  createAssociatedTokenAccountIdempotentInstruction,
  createApproveCheckedInstruction,
  TOKEN_PROGRAM_ID,
} from '@solana/spl-token';

/** Represents a single recipient in a batch USDC transfer */
export interface TransferRecipient {
  destinationAddress: string;
  amountInCents: number;
}

/** Represents an incoming USDC deposit detected on-chain */
export interface IncomingDeposit {
  /** Transaction signature (unique identifier) */
  signature: string;
  /** Amount in USDC (human-readable, e.g., 10.50) */
  amount: number;
  /** Amount in cents (e.g., 1050) */
  amountCents: number;
  /** Sender's wallet address */
  senderAddress: string;
  /** Unix timestamp of the transaction */
  timestamp: number;
  /** Block slot number */
  slot: number;
}

// Rate limiting configuration - public Solana RPC has strict limits
const RPC_DELAY_MS = 2000; // 2 second delay between RPC calls to avoid rate limits
const MAX_RETRIES = 3;
const INITIAL_RETRY_DELAY_MS = 2000;

// Solana transaction size limit (~1232 bytes) constrains how many transfers fit in one tx.
// Each transfer is ~35 bytes, creating a token account adds ~165 bytes.
// Conservative limit to ensure transactions don't exceed size limit.
export const MAX_BATCH_RECIPIENTS = 10;

/** Sleep helper */
const Sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Build a Solana Explorer URL without needing a full Solana instance.
 * Reads LIVEMODE from env to determine the cluster.
 */
export function SolanaExplorerUrl(
  type: 'tx' | 'address',
  value: string
): string {
  const livemode = process.env.LIVEMODE === 'true';
  const clusterParam = livemode ? '' : '?cluster=devnet';
  return `https://explorer.solana.com/${type}/${value}${clusterParam}`;
}

export class Solana {
  connection: Connection;
  network: Cluster;

  constructor() {
    const livemode = process.env.LIVEMODE === 'true';
    this.network = livemode ? 'mainnet-beta' : 'devnet';
    const rpcUrl = process.env.SOLANA_RPC_URL || clusterApiUrl(this.network);
    this.connection = new Connection(rpcUrl);
  }

  /**
   * Build a Solana Explorer URL for a transaction or address.
   * Appends the correct cluster query param for non-mainnet networks.
   */
  ExplorerUrl(type: 'tx' | 'address', value: string): string {
    const clusterParam =
      this.network === 'mainnet-beta' ? '' : `?cluster=${this.network}`;
    return `https://explorer.solana.com/${type}/${value}${clusterParam}`;
  }

  async CheckWalletExists(address: string): Promise<boolean> {
    try {
      const publicKey = new PublicKey(address);
      return PublicKey.isOnCurve(publicKey.toBytes());
    } catch (error) {
      return false;
    }
  }

  async GetSOLBalance(publicKeyString: string): Promise<number> {
    if (!publicKeyString) {
      throw new Error('Public key is required');
    }
    const publicKey = new PublicKey(publicKeyString);
    const lamports = await this.connection.getBalance(publicKey);
    return lamports / 1_000_000_000;
  }

  async GetUSDCBalance(publicKeyString: string): Promise<number> {
    if (!publicKeyString) {
      throw new Error('Public key is required');
    }
    const publicKey = new PublicKey(publicKeyString);

    // USDC Mint Address depends on the network
    const usdcMintAddress =
      this.network === 'mainnet-beta'
        ? 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v' // Mainnet USDC
        : '4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU'; // Devnet USDC

    const usdcMint = new PublicKey(usdcMintAddress);

    const tokenAccounts = await this.connection.getParsedTokenAccountsByOwner(
      publicKey,
      {
        mint: usdcMint,
      }
    );

    if (tokenAccounts.value.length === 0) {
      return 0;
    }

    let totalBalance = 0;
    for (const account of tokenAccounts.value) {
      totalBalance += account.account.data.parsed.info.tokenAmount.uiAmount;
    }

    return totalBalance;
  }

  /**
   * Build an unsigned batch USDC transfer transaction.
   * The transaction can be signed locally by the platform and then broadcast.
   *
   * @param senderPublicKey - The sender's public key (for fee payer and token account)
   * @param recipients - Array of recipients with destination addresses and amounts
   * @returns Object containing the unsigned transaction (base64), fee estimate, and blockhash
   */
  async BuildBatchPayoutTransaction(
    senderPublicKey: string,
    recipients: TransferRecipient[]
  ): Promise<{
    unsigned_transaction: string;
    estimated_fee_lamports: number;
    blockhash: string;
    last_valid_block_height: number;
    recipients_count: number;
  }> {
    if (recipients.length === 0) {
      throw new Error('At least one recipient is required');
    }

    if (recipients.length > MAX_BATCH_RECIPIENTS) {
      throw new Error(
        `Batch size ${recipients.length} exceeds maximum of ${MAX_BATCH_RECIPIENTS} recipients per transaction`
      );
    }

    const totalAmount = recipients.reduce((sum, r) => sum + r.amountInCents, 0);
    console.log(
      `[Solana] Building unsigned transaction for ${
        totalAmount / 100
      } USDC to ${recipients.length} recipient(s)...`
    );

    const sender = new PublicKey(senderPublicKey);
    const usdcMint = new PublicKey(this.GetUSDCMintAddress());

    // Get sender's token account
    const senderTokenAccount = await getAssociatedTokenAddress(
      usdcMint,
      sender
    );

    // Pre-compute all recipient token accounts (local computation, no RPC)
    const recipientData = await Promise.all(
      recipients.map(async (recipient) => {
        const destination = new PublicKey(recipient.destinationAddress);
        const tokenAccount = await getAssociatedTokenAddress(
          usdcMint,
          destination
        );
        return { recipient, destination, tokenAccount };
      })
    );

    // Batch fetch all token account info in a single RPC call
    const tokenAccountKeys = recipientData.map((r) => r.tokenAccount);
    const accountInfos = await this.WithRetry(() =>
      this.connection.getMultipleAccountsInfo(tokenAccountKeys)
    );

    // Create Transaction
    const transaction = new Transaction();

    // Add instructions for each recipient
    for (let i = 0; i < recipientData.length; i++) {
      const { recipient, destination, tokenAccount } = recipientData[i];
      const accountInfo = accountInfos[i];

      // Create token account if it doesn't exist
      if (!accountInfo) {
        console.log(
          `[Solana] Adding create ATA instruction for ${recipient.destinationAddress}...`
        );
        transaction.add(
          createAssociatedTokenAccountIdempotentInstruction(
            sender,
            tokenAccount,
            destination,
            usdcMint
          )
        );
      }

      // Convert Cents to USDC Atomic Units (6 decimals)
      const amountInSmallestUnit = Math.floor(recipient.amountInCents * 10000);

      transaction.add(
        createTransferInstruction(
          senderTokenAccount,
          tokenAccount,
          sender,
          amountInSmallestUnit,
          [],
          TOKEN_PROGRAM_ID
        )
      );
    }

    // Get Latest Blockhash
    const { blockhash, lastValidBlockHeight } = await this.WithRetry(() =>
      this.connection.getLatestBlockhash('confirmed')
    );
    transaction.recentBlockhash = blockhash;
    transaction.feePayer = sender;

    // Estimate fee
    const fee = await this.WithRetry(() =>
      this.connection.getFeeForMessage(
        transaction.compileMessage(),
        'confirmed'
      )
    );
    console.log(
      `[Solana] Estimated Gas Fee: ${fee.value} lamports (${
        (fee.value || 0) / 1_000_000_000
      } SOL)`
    );

    // Serialize the unsigned transaction
    const serializedTransaction = transaction
      .serialize({ requireAllSignatures: false })
      .toString('base64');

    return {
      unsigned_transaction: serializedTransaction,
      estimated_fee_lamports: fee.value || 0,
      blockhash,
      last_valid_block_height: lastValidBlockHeight,
      recipients_count: recipients.length,
    };
  }

  /**
   * Broadcast a signed transaction to the Solana network.
   * The transaction must be fully signed before calling this method.
   *
   * @param signedTransaction - The signed transaction as a base64-encoded string
   * @param options - Optional blockhash info from the build step to avoid a redundant RPC call
   * @returns Transaction result with signature and status
   */
  async BroadcastSignedTransaction(
    signedTransaction: string,
    options?: { blockhash?: string; lastValidBlockHeight?: number }
  ): Promise<{
    signature: string;
    status: 'paid' | 'failed';
    viewer_url: string;
    failure_message?: string;
  }> {
    try {
      const transactionBuffer = Buffer.from(signedTransaction, 'base64');

      const signature = await this.WithRetry(() =>
        this.connection.sendRawTransaction(transactionBuffer, {
          skipPreflight: true,
          maxRetries: 3,
        })
      );

      const transaction = Transaction.from(transactionBuffer);
      const blockhash = options?.blockhash || transaction.recentBlockhash!;

      // Reuse lastValidBlockHeight from build step when available
      let lastValidBlockHeight = options?.lastValidBlockHeight;
      if (!lastValidBlockHeight) {
        const latest = await this.WithRetry(() =>
          this.connection.getLatestBlockhash('confirmed')
        );
        lastValidBlockHeight = latest.lastValidBlockHeight;
      }

      const confirmation = await this.WithRetry(() =>
        this.connection.confirmTransaction(
          { signature, blockhash, lastValidBlockHeight: lastValidBlockHeight! },
          'confirmed'
        )
      );

      if (confirmation.value.err) {
        return {
          signature,
          status: 'failed',
          viewer_url: this.ExplorerUrl('tx', signature),
          failure_message: `Transaction failed: ${JSON.stringify(
            confirmation.value.err
          )}`,
        };
      }

      return {
        signature,
        status: 'paid',
        viewer_url: this.ExplorerUrl('tx', signature),
      };
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';

      return {
        signature: '',
        status: 'failed',
        viewer_url: '',
        failure_message: `Broadcast failed: ${errorMessage}`,
      };
    }
  }

  /**
   * Generate a new Solana keypair.
   * Returns the public and secret keys as base58 strings.
   */
  GenerateKeypair(): { publicKey: string; secretKey: string } {
    const keypair = Keypair.generate();
    return {
      publicKey: keypair.publicKey.toBase58(),
      secretKey: bs58.encode(keypair.secretKey),
    };
  }

  /**
   * Get the USDC token account address for a given wallet.
   * This is the Associated Token Account (ATA) that receives USDC.
   *
   * @param walletPublicKey - The wallet's public key
   * @returns The associated token account address
   */
  async GetUSDCTokenAccount(walletPublicKey: string): Promise<PublicKey> {
    const publicKey = new PublicKey(walletPublicKey);
    const usdcMint = new PublicKey(this.GetUSDCMintAddress());
    return getAssociatedTokenAddress(usdcMint, publicKey);
  }

  /**
   * Get the USDC mint address for the current network.
   */
  GetUSDCMintAddress(): string {
    return this.network === 'mainnet-beta'
      ? 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v' // Mainnet USDC
      : '4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU'; // Devnet USDC
  }

  /**
   * Fetch recent transaction signatures for a wallet's USDC token account.
   * Used to detect incoming USDC transfers.
   *
   * @param walletPublicKey - The wallet's public key
   * @param limit - Maximum number of signatures to fetch (default: 100)
   * @param beforeSignature - Fetch signatures before this one (for pagination)
   * @returns Array of signature info objects
   */
  async GetRecentSignatures(
    walletPublicKey: string,
    limit: number = 100,
    beforeSignature?: string
  ): Promise<ConfirmedSignatureInfo[]> {
    const tokenAccount = await this.GetUSDCTokenAccount(walletPublicKey);

    const options: { limit: number; before?: string } = { limit };
    if (beforeSignature) {
      options.before = beforeSignature;
    }

    return this.connection.getSignaturesForAddress(tokenAccount, options);
  }

  /**
   * Get parsed transaction details for a given signature.
   * Includes retry logic for rate limit errors.
   *
   * @param signature - The transaction signature to fetch
   * @returns Parsed transaction or null if not found
   */
  async GetParsedTransaction(
    signature: string
  ): Promise<ParsedTransactionWithMeta | null> {
    return this.WithRetry(async () => {
      return this.connection.getParsedTransaction(signature, {
        maxSupportedTransactionVersion: 0,
      });
    });
  }

  /**
   * Wrapper that adds retry logic with exponential backoff for rate limits.
   */
  private async WithRetry<T>(fn: () => Promise<T>): Promise<T> {
    let lastError: Error | null = null;
    let delay = INITIAL_RETRY_DELAY_MS;

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      try {
        return await fn();
      } catch (error) {
        lastError = error as Error;
        const errorMessage = lastError.message || '';

        // Check if it's a rate limit error
        if (errorMessage.includes('429') || errorMessage.includes('Too many')) {
          if (attempt < MAX_RETRIES) {
            console.log(`Rate limited, retrying in ${delay}ms...`);
            await Sleep(delay);
            delay *= 2; // Exponential backoff
            continue;
          }
        }

        // For non-rate-limit errors, throw immediately
        throw error;
      }
    }

    throw lastError || new Error('Max retries exceeded');
  }

  /**
   * Fetch incoming USDC deposits to a wallet.
   * Parses transaction data to extract deposit details.
   * Includes throttling to avoid RPC rate limits.
   *
   * @param walletPublicKey - The wallet's public key to monitor
   * @param limit - Maximum number of recent signatures to check
   * @param processedSignatures - Set of already processed signatures to skip
   * @returns Array of incoming deposit details
   */
  async GetIncomingDeposits(
    walletPublicKey: string,
    limit: number = 50,
    processedSignatures: Set<string> = new Set()
  ): Promise<IncomingDeposit[]> {
    const signatures = await this.GetRecentSignatures(walletPublicKey, limit);
    const tokenAccount = await this.GetUSDCTokenAccount(walletPublicKey);
    const tokenAccountStr = tokenAccount.toBase58();

    const incomingDeposits: IncomingDeposit[] = [];

    // Filter to only unprocessed signatures first
    const unprocessedSignatures = signatures.filter(
      (sig) => !processedSignatures.has(sig.signature) && !sig.err
    );

    console.log(
      `[Solana] Found ${signatures.length} recent signatures, ${unprocessedSignatures.length} unprocessed`
    );

    for (const sigInfo of unprocessedSignatures) {
      try {
        // Add delay between RPC calls to avoid rate limits
        await Sleep(RPC_DELAY_MS);

        const tx = await this.GetParsedTransaction(sigInfo.signature);
        if (!tx || !tx.meta) continue;

        // Look for token deposits to our account
        const deposit = this.ExtractIncomingDeposit(
          tx,
          sigInfo,
          tokenAccountStr
        );

        if (deposit) {
          incomingDeposits.push(deposit);
        }
      } catch (error) {
        console.error(
          `Failed to parse transaction ${sigInfo.signature}:`,
          error
        );
        // Continue processing other transactions
      }
    }

    return incomingDeposits;
  }

  /**
   * Extract incoming deposit details from a parsed transaction.
   * Returns null if the transaction is not an incoming USDC deposit to our account.
   */
  private ExtractIncomingDeposit(
    tx: ParsedTransactionWithMeta,
    sigInfo: ConfirmedSignatureInfo,
    tokenAccountStr: string
  ): IncomingDeposit | null {
    if (!tx.meta || !tx.transaction.message.instructions) {
      return null;
    }

    // Look through all instructions for SPL token transfers
    for (const instruction of tx.transaction.message.instructions) {
      // Check if this is a parsed instruction (SPL Token program)
      if ('parsed' in instruction && instruction.program === 'spl-token') {
        const parsed = instruction.parsed;

        // Check for transfer or transferChecked instructions
        if (parsed.type === 'transfer' || parsed.type === 'transferChecked') {
          const info = parsed.info;

          // Check if the destination is our token account
          if (info.destination === tokenAccountStr) {
            // For transferChecked, amount is in info.tokenAmount.amount
            // For transfer, amount is in info.amount
            let amountRaw: string;
            if (parsed.type === 'transferChecked') {
              amountRaw = info.tokenAmount?.amount || '0';
            } else {
              amountRaw = info.amount || '0';
            }

            // USDC has 6 decimals
            const amountNumber = parseInt(amountRaw, 10);
            const amount = amountNumber / 1_000_000;
            const amountCents = Math.round(amount * 100);

            // Get sender address (authority or source owner)
            const senderAddress = info.authority || info.source || 'unknown';

            return {
              signature: sigInfo.signature,
              amount,
              amountCents,
              senderAddress,
              timestamp: sigInfo.blockTime || Math.floor(Date.now() / 1000),
              slot: sigInfo.slot,
            };
          }
        }
      }
    }

    return null;
  }

  async CreateSubscription(
    subscriberPublicKey: string,
    amount: number,
    periodSeconds: number
  ): Promise<{
    unsigned_transaction: string;
    estimated_fee_lamports: number;
    blockhash: string;
    last_valid_block_height: number;
    subscription_pda: string;
    amount_cents: number;
    amount_atomic: number;
    period_seconds: number;
  }> {
    if (!subscriberPublicKey) {
      throw new Error('Subscriber public key is required');
    }

    if (!Number.isFinite(amount) || amount <= 0) {
      throw new Error('Amount must be a positive number');
    }

    const subscriberPubkey = new PublicKey(subscriberPublicKey);
    if (amount <= 0) {
      throw new Error('Amount is too small after rounding to cents');
    }

    // Input amount is expected in USD (e.g. 0.01), then converted:
    // dollars -> cents -> USDC atomic units (6 decimals => 1 cent = 10_000 units)
    const chargeAmountAtomic = amount * 10_000;

    // Approve for 60 months (60 times monthly price)
    const approvedAmountAtomic = chargeAmountAtomic * 60;

    // Combined one-signature flow:
    // 1) Approve delegate (authority PDA) to spend subscription amount
    // 2) Create subscription PDA in your program
    const approveDelegateInstruction = await this.ApproveDelegateInstruction(
      subscriberPubkey,
      approvedAmountAtomic
    );
    const createSubscriptionInstruction = this.CreateSubscriptionInstruction(
      subscriberPubkey,
      chargeAmountAtomic,
      periodSeconds
    );

    const transaction = new Transaction()
      .add(approveDelegateInstruction)
      .add(createSubscriptionInstruction);

    const { blockhash, lastValidBlockHeight } = await this.WithRetry(() =>
      this.connection.getLatestBlockhash('confirmed')
    );
    transaction.recentBlockhash = blockhash;
    transaction.feePayer = subscriberPubkey;

    const fee = await this.WithRetry(() =>
      this.connection.getFeeForMessage(
        transaction.compileMessage(),
        'confirmed'
      )
    );

    const serializedTransaction = transaction
      .serialize({ requireAllSignatures: false })
      .toString('base64');

    return {
      unsigned_transaction: serializedTransaction,
      estimated_fee_lamports: fee.value || 0,
      blockhash,
      last_valid_block_height: lastValidBlockHeight,
      subscription_pda: this.GetSubscriptionPda(subscriberPubkey).toBase58(),
      amount_cents: amount,
      amount_atomic: chargeAmountAtomic,
      period_seconds: periodSeconds,
    };
  }

  private GetProgramId(): PublicKey {
    return new PublicKey('9JAVCcRBhZz4Jjx1qMdCgZj7bzEkVE5aMSeHwM94278F');
  }

  private GetMerchantPubkey(): PublicKey {
    const MERCHANT_PUBLIC_KEY = 'HxXyrNpFT6oioH2whDC3oCu54auNcQUhSwh6yX48EsEJ';
    return new PublicKey(MERCHANT_PUBLIC_KEY);
  }

  private GetSubscriptionPda(subscriberPubkey: PublicKey): PublicKey {
    const [subscriptionPda] = PublicKey.findProgramAddressSync(
      [
        Buffer.from('subscription'),
        subscriberPubkey.toBuffer(),
        this.GetMerchantPubkey().toBuffer(),
      ],
      this.GetProgramId()
    );
    return subscriptionPda;
  }

  private GetAuthorityPda(): PublicKey {
    const [authorityPda] = PublicKey.findProgramAddressSync(
      [Buffer.from('authority')],
      this.GetProgramId()
    );
    return authorityPda;
  }

  private async ApproveDelegateInstruction(
    subscriberPubkey: PublicKey,
    amountAtomic: number
  ): Promise<TransactionInstruction> {
    const mintPubkey = new PublicKey(this.GetUSDCMintAddress());
    const subscriberTokenAccount = await getAssociatedTokenAddress(
      mintPubkey,
      subscriberPubkey
    );

    return createApproveCheckedInstruction(
      subscriberTokenAccount,
      mintPubkey,
      this.GetAuthorityPda(),
      subscriberPubkey,
      amountAtomic,
      6
    );
  }

  private CreateSubscriptionInstruction(
    subscriberPubkey: PublicKey,
    amountAtomic: number,
    periodSeconds: number
  ): TransactionInstruction {
    const mintPubkey = new PublicKey(this.GetUSDCMintAddress());
    const amountBuffer = Buffer.alloc(8);
    amountBuffer.writeBigUInt64LE(BigInt(amountAtomic));

    const periodBuffer = Buffer.alloc(8);
    periodBuffer.writeBigInt64LE(BigInt(periodSeconds));

    const discriminator = createHash('sha256')
      .update('global:create_subscription')
      .digest()
      .subarray(0, 8);

    const instructionData = Buffer.concat([
      discriminator,
      amountBuffer,
      periodBuffer,
    ]);

    return new TransactionInstruction({
      programId: this.GetProgramId(),
      keys: [
        { pubkey: subscriberPubkey, isSigner: true, isWritable: true },
        {
          pubkey: this.GetMerchantPubkey(),
          isSigner: false,
          isWritable: false,
        },
        { pubkey: mintPubkey, isSigner: false, isWritable: false },
        {
          pubkey: this.GetSubscriptionPda(subscriberPubkey),
          isSigner: false,
          isWritable: true,
        },
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      ],
      data: instructionData,
    });
  }

  async GetSubscription(subscriberPublicKey: string): Promise<{
    exists: boolean;
    subscription_pda: string;
    subscriber?: string;
    merchant?: string;
    mint?: string;
    amount_atomic?: string;
    amount_ui?: number;
    period_seconds?: number;
    next_charge_at?: number;
    status?: 'active' | 'paused' | 'unknown';
    bump?: number;
  }> {
    if (!subscriberPublicKey) {
      throw new Error('Subscriber public key is required');
    }

    const programId = new PublicKey(
      '9JAVCcRBhZz4Jjx1qMdCgZj7bzEkVE5aMSeHwM94278F'
    );
    const merchantPubkey = new PublicKey(
      'HxXyrNpFT6oioH2whDC3oCu54auNcQUhSwh6yX48EsEJ'
    );
    const subscriberPubkey = new PublicKey(subscriberPublicKey);

    const [subscriptionPda] = PublicKey.findProgramAddressSync(
      [
        Buffer.from('subscription'),
        subscriberPubkey.toBuffer(),
        merchantPubkey.toBuffer(),
      ],
      programId
    );

    const accountInfo = await this.WithRetry(() =>
      this.connection.getAccountInfo(subscriptionPda, 'confirmed')
    );

    if (!accountInfo) {
      return {
        exists: false,
        subscription_pda: subscriptionPda.toBase58(),
      };
    }

    if (!accountInfo.owner.equals(programId)) {
      throw new Error(
        'Subscription PDA exists but is not owned by the program'
      );
    }

    const data = accountInfo.data;
    const minimumExpectedDataLength = 8 + 32 + 32 + 32 + 8 + 8 + 8 + 1 + 1;
    if (data.length < minimumExpectedDataLength) {
      throw new Error('Subscription account data is too short');
    }

    let offset = 8; // Skip account discriminator

    const subscriber = new PublicKey(
      data.subarray(offset, offset + 32)
    ).toBase58();
    offset += 32;
    const merchant = new PublicKey(
      data.subarray(offset, offset + 32)
    ).toBase58();
    offset += 32;
    const mint = new PublicKey(data.subarray(offset, offset + 32)).toBase58();
    offset += 32;

    const amountAtomic = data.readBigUInt64LE(offset);
    offset += 8;

    const periodSeconds = Number(data.readBigInt64LE(offset));
    offset += 8;

    const nextChargeAt = Number(data.readBigInt64LE(offset));
    offset += 8;

    const statusRaw = data.readUInt8(offset);
    offset += 1;

    const bump = data.readUInt8(offset);

    const status =
      statusRaw === 0 ? 'active' : statusRaw === 1 ? 'paused' : 'unknown';

    return {
      exists: true,
      subscription_pda: subscriptionPda.toBase58(),
      subscriber,
      merchant,
      mint,
      amount_atomic: amountAtomic.toString(),
      amount_ui: Number(amountAtomic) / 1_000_000,
      period_seconds: periodSeconds,
      next_charge_at: nextChargeAt,
      status,
      bump,
    };
  }

  async CancelSubscription(subscriberPublicKey: string): Promise<{
    unsigned_transaction: string;
    estimated_fee_lamports: number;
    blockhash: string;
    last_valid_block_height: number;
    subscription_pda: string;
  }> {
    if (!subscriberPublicKey) {
      throw new Error('Subscriber public key is required');
    }

    const subscriberPubkey = new PublicKey(subscriberPublicKey);
    const cancelInstruction =
      this.CancelSubscriptionInstruction(subscriberPubkey);

    const transaction = new Transaction().add(cancelInstruction);
    const { blockhash, lastValidBlockHeight } = await this.WithRetry(() =>
      this.connection.getLatestBlockhash('confirmed')
    );
    transaction.recentBlockhash = blockhash;
    transaction.feePayer = subscriberPubkey;

    const fee = await this.WithRetry(() =>
      this.connection.getFeeForMessage(
        transaction.compileMessage(),
        'confirmed'
      )
    );

    const serializedTransaction = transaction
      .serialize({ requireAllSignatures: false })
      .toString('base64');

    return {
      unsigned_transaction: serializedTransaction,
      estimated_fee_lamports: fee.value || 0,
      blockhash,
      last_valid_block_height: lastValidBlockHeight,
      subscription_pda: this.GetSubscriptionPda(subscriberPubkey).toBase58(),
    };
  }

  async ChargeSubscription(
    subscriberPublicKey: string,
    feePayerPublicKey: string
  ): Promise<{
    unsigned_transaction: string;
    estimated_fee_lamports: number;
    blockhash: string;
    last_valid_block_height: number;
    subscription_pda: string;
    subscriber_token_account: string;
    merchant_token_account: string;
  }> {
    if (!subscriberPublicKey) {
      throw new Error('Subscriber public key is required');
    }

    if (!feePayerPublicKey) {
      throw new Error('Fee payer public key is required');
    }

    const subscriberPubkey = new PublicKey(subscriberPublicKey);
    const feePayerPubkey = new PublicKey(feePayerPublicKey);

    const mintPubkey = new PublicKey(this.GetUSDCMintAddress());
    const subscriberTokenAccount = await getAssociatedTokenAddress(
      mintPubkey,
      subscriberPubkey
    );
    const merchantTokenAccount = await getAssociatedTokenAddress(
      mintPubkey,
      this.GetMerchantPubkey()
    );

    const chargeInstruction = this.ChargeSubscriptionInstruction(
      subscriberPubkey,
      subscriberTokenAccount,
      merchantTokenAccount
    );

    const createMerchantTokenAccountInstruction =
      createAssociatedTokenAccountIdempotentInstruction(
        feePayerPubkey,
        merchantTokenAccount,
        this.GetMerchantPubkey(),
        mintPubkey
      );

    const transaction = new Transaction()
      .add(createMerchantTokenAccountInstruction)
      .add(chargeInstruction);
    const { blockhash, lastValidBlockHeight } = await this.WithRetry(() =>
      this.connection.getLatestBlockhash('confirmed')
    );
    transaction.recentBlockhash = blockhash;
    transaction.feePayer = feePayerPubkey;

    const fee = await this.WithRetry(() =>
      this.connection.getFeeForMessage(
        transaction.compileMessage(),
        'confirmed'
      )
    );

    const serializedTransaction = transaction
      .serialize({ requireAllSignatures: false })
      .toString('base64');

    return {
      unsigned_transaction: serializedTransaction,
      estimated_fee_lamports: fee.value || 0,
      blockhash,
      last_valid_block_height: lastValidBlockHeight,
      subscription_pda: this.GetSubscriptionPda(subscriberPubkey).toBase58(),
      subscriber_token_account: subscriberTokenAccount.toBase58(),
      merchant_token_account: merchantTokenAccount.toBase58(),
    };
  }

  async GetSubscriptionDebugInfo(subscriberPublicKey: string): Promise<{
    network: Cluster;
    program_id: string;
    authority_pda: string;
    subscriber: {
      public_key: string;
      token_account: string;
      token_account_exists: boolean;
      amount_atomic: string | null;
      amount_ui: number | null;
      delegate: string | null;
      delegated_amount_atomic: string | null;
    };
    merchant: {
      public_key: string;
      token_account: string;
      token_account_exists: boolean;
      amount_atomic: string | null;
      amount_ui: number | null;
    };
  }> {
    if (!subscriberPublicKey) {
      throw new Error('Subscriber public key is required');
    }

    const subscriberPubkey = new PublicKey(subscriberPublicKey);
    const merchantPubkey = this.GetMerchantPubkey();
    const mintPubkey = new PublicKey(this.GetUSDCMintAddress());

    const subscriberTokenAccount = await getAssociatedTokenAddress(
      mintPubkey,
      subscriberPubkey
    );
    const merchantTokenAccount = await getAssociatedTokenAddress(
      mintPubkey,
      merchantPubkey
    );

    const [subscriberInfo, merchantInfo] = await this.WithRetry(() =>
      this.connection.getMultipleAccountsInfo(
        [subscriberTokenAccount, merchantTokenAccount],
        'confirmed'
      )
    );

    const parseTokenInfo = (
      accountInfo: Awaited<ReturnType<Connection['getAccountInfo']>>
    ) => {
      if (!accountInfo) {
        return {
          token_account_exists: false,
          amount_atomic: null,
          amount_ui: null,
          delegate: null as string | null,
          delegated_amount_atomic: null as string | null,
        };
      }

      const parsed = accountInfo.data;
      const amountAtomic = parsed.readBigUInt64LE(64).toString();
      const delegateOption = parsed.readUInt32LE(72);
      const delegate =
        delegateOption === 1
          ? new PublicKey(parsed.subarray(76, 108)).toBase58()
          : null;
      const delegatedAmountAtomic =
        delegateOption === 1 ? parsed.readBigUInt64LE(121).toString() : null;

      return {
        token_account_exists: true,
        amount_atomic: amountAtomic,
        amount_ui: Number(amountAtomic) / 1_000_000,
        delegate,
        delegated_amount_atomic: delegatedAmountAtomic,
      };
    };

    const subscriberParsed = parseTokenInfo(subscriberInfo);
    const merchantParsed = parseTokenInfo(merchantInfo);

    return {
      network: this.network,
      program_id: this.GetProgramId().toBase58(),
      authority_pda: this.GetAuthorityPda().toBase58(),
      subscriber: {
        public_key: subscriberPubkey.toBase58(),
        token_account: subscriberTokenAccount.toBase58(),
        token_account_exists: subscriberParsed.token_account_exists,
        amount_atomic: subscriberParsed.amount_atomic,
        amount_ui: subscriberParsed.amount_ui,
        delegate: subscriberParsed.delegate,
        delegated_amount_atomic: subscriberParsed.delegated_amount_atomic,
      },
      merchant: {
        public_key: merchantPubkey.toBase58(),
        token_account: merchantTokenAccount.toBase58(),
        token_account_exists: merchantParsed.token_account_exists,
        amount_atomic: merchantParsed.amount_atomic,
        amount_ui: merchantParsed.amount_ui,
      },
    };
  }

  private CancelSubscriptionInstruction(
    subscriberPubkey: PublicKey
  ): TransactionInstruction {
    const discriminator = createHash('sha256')
      .update('global:cancel_subscription')
      .digest()
      .subarray(0, 8);

    return new TransactionInstruction({
      programId: this.GetProgramId(),
      keys: [
        {
          pubkey: this.GetSubscriptionPda(subscriberPubkey),
          isSigner: false,
          isWritable: true,
        },
        { pubkey: subscriberPubkey, isSigner: false, isWritable: true },
        {
          pubkey: this.GetMerchantPubkey(),
          isSigner: false,
          isWritable: false,
        },
        { pubkey: subscriberPubkey, isSigner: true, isWritable: false },
      ],
      data: discriminator,
    });
  }

  private ChargeSubscriptionInstruction(
    subscriberPubkey: PublicKey,
    subscriberTokenAccount: PublicKey,
    merchantTokenAccount: PublicKey
  ): TransactionInstruction {
    const discriminator = createHash('sha256')
      .update('global:charge_subscription')
      .digest()
      .subarray(0, 8);

    return new TransactionInstruction({
      programId: this.GetProgramId(),
      keys: [
        {
          pubkey: this.GetSubscriptionPda(subscriberPubkey),
          isSigner: false,
          isWritable: true,
        },
        { pubkey: subscriberPubkey, isSigner: false, isWritable: false },
        {
          pubkey: this.GetMerchantPubkey(),
          isSigner: false,
          isWritable: false,
        },
        {
          pubkey: new PublicKey(this.GetUSDCMintAddress()),
          isSigner: false,
          isWritable: false,
        },
        { pubkey: subscriberTokenAccount, isSigner: false, isWritable: true },
        { pubkey: merchantTokenAccount, isSigner: false, isWritable: true },
        { pubkey: this.GetAuthorityPda(), isSigner: false, isWritable: false },
        { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
      ],
      data: discriminator,
    });
  }
}
