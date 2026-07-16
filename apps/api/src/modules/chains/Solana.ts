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
  ParsedTransactionWithMeta,
  ConfirmedSignatureInfo,
} from '@solana/web3.js';
import bs58 from 'bs58';
import {
  getAssociatedTokenAddress,
  createTransferInstruction,
  createTransferCheckedInstruction,
  createAssociatedTokenAccountIdempotentInstruction,
  TOKEN_PROGRAM_ID,
} from '@solana/spl-token';
import { createHash } from 'crypto';
import {
  address,
  createClient,
  createKeyPairSignerFromBytes,
} from '@solana/kit';
import { solanaRpc } from '@solana/kit-plugin-rpc';
import { signer } from '@solana/kit-plugin-signer';
import { findPlanPda, subscriptionsProgram } from '@solana/subscriptions';

/**
 * Derive a deterministic on-chain planId (u64) from an off-chain price id string.
 * Same price id always maps to the same plan PDA for a given merchant.
 */
export function PlanIdFromPriceId(priceId: string): bigint {
  const hash = createHash('sha256').update(priceId).digest();
  return hash.readBigUInt64BE(0);
}

/** SPL Memo program, used to bind a payment transaction to a checkout session. */
const MEMO_PROGRAM_ID = new PublicKey(
  'MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr'
);

/** Result of verifying a checkout payment transaction on-chain */
export interface CheckoutPaymentVerification {
  verified: boolean;
  /** Total USDC (in cents) transferred to the merchant in this transaction */
  amount_cents: number;
  /** The payer's wallet address (transfer authority) */
  payer_address: string | null;
  /** Reason verification failed, if it did */
  failure_reason?: string;
}

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

  /**
   * Build an unsigned one-time USDC payment transaction for a checkout session.
   * Transfers the session total from the payer to the merchant wallet and
   * attaches an SPL Memo with the checkout session ID so the payment can be
   * unambiguously matched to the session during verification.
   *
   * @param payerPublicKey - The customer's wallet public key (fee payer and source)
   * @param merchantWalletAddress - The merchant's wallet address (destination)
   * @param amountInCents - Payment amount in cents (1 cent = 10,000 USDC atomic units)
   * @param checkoutSessionId - The checkout session ID to embed in the memo
   * @returns Object containing the unsigned transaction (base64), fee estimate, and blockhash
   */
  async BuildCheckoutPaymentTransaction(
    payerPublicKey: string,
    merchantWalletAddress: string,
    amountInCents: number,
    checkoutSessionId: string
  ): Promise<{
    unsigned_transaction: string;
    estimated_fee_lamports: number;
    blockhash: string;
    last_valid_block_height: number;
  }> {
    if (!payerPublicKey) {
      throw new Error('Payer public key is required');
    }
    if (!merchantWalletAddress) {
      throw new Error('Merchant wallet address is required');
    }
    if (!Number.isInteger(amountInCents) || amountInCents <= 0) {
      throw new Error('Amount must be a positive integer number of cents');
    }
    if (!checkoutSessionId) {
      throw new Error('Checkout session ID is required');
    }

    const payer = new PublicKey(payerPublicKey);
    const merchant = new PublicKey(merchantWalletAddress);
    const usdcMint = new PublicKey(this.GetUSDCMintAddress());

    const payerTokenAccount = await getAssociatedTokenAddress(usdcMint, payer);
    const merchantTokenAccount = await getAssociatedTokenAddress(
      usdcMint,
      merchant
    );

    // Convert cents to USDC atomic units (6 decimals => 1 cent = 10,000 units)
    const amountInSmallestUnit = amountInCents * 10_000;

    const transaction = new Transaction();

    // Ensure the merchant's USDC token account exists (payer funds rent if not)
    transaction.add(
      createAssociatedTokenAccountIdempotentInstruction(
        payer,
        merchantTokenAccount,
        merchant,
        usdcMint
      )
    );

    transaction.add(
      createTransferCheckedInstruction(
        payerTokenAccount,
        usdcMint,
        merchantTokenAccount,
        payer,
        amountInSmallestUnit,
        6
      )
    );

    // Memo binds this transaction to the checkout session
    transaction.add(
      new TransactionInstruction({
        programId: MEMO_PROGRAM_ID,
        keys: [],
        data: Buffer.from(checkoutSessionId, 'utf8'),
      })
    );

    const { blockhash, lastValidBlockHeight } = await this.WithRetry(() =>
      this.connection.getLatestBlockhash('confirmed')
    );
    transaction.recentBlockhash = blockhash;
    transaction.feePayer = payer;

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
    };
  }

  /**
   * Verify that a broadcast transaction is a valid payment for a checkout
   * session: it succeeded, transferred at least the expected USDC amount to
   * the merchant's token account, and carries the session ID memo.
   *
   * Polls until the transaction is visible at 'confirmed' commitment or a
   * timeout is reached (the customer's wallet broadcasts the transaction, so
   * it may not be queryable immediately).
   *
   * @param signature - The transaction signature to verify
   * @param expected - Expected merchant wallet, amount, and session ID
   * @returns Verification result with the payer address on success
   */
  async VerifyCheckoutPayment(
    signature: string,
    expected: {
      merchantWalletAddress: string;
      amountInCents: number;
      checkoutSessionId: string;
    }
  ): Promise<CheckoutPaymentVerification> {
    const merchant = new PublicKey(expected.merchantWalletAddress);
    const usdcMint = new PublicKey(this.GetUSDCMintAddress());
    const merchantTokenAccount = await getAssociatedTokenAddress(
      usdcMint,
      merchant
    );
    const merchantTokenAccountStr = merchantTokenAccount.toBase58();

    // Poll for the transaction to reach 'confirmed' commitment
    const maxAttempts = 15;
    let tx: ParsedTransactionWithMeta | null = null;
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      tx = await this.GetParsedTransaction(signature);
      if (tx) break;
      await Sleep(RPC_DELAY_MS);
    }

    if (!tx || !tx.meta) {
      return {
        verified: false,
        amount_cents: 0,
        payer_address: null,
        failure_reason:
          'Transaction not found on-chain (may not be confirmed yet)',
      };
    }

    if (tx.meta.err) {
      return {
        verified: false,
        amount_cents: 0,
        payer_address: null,
        failure_reason: `Transaction failed on-chain: ${JSON.stringify(
          tx.meta.err
        )}`,
      };
    }

    let transferredAtomic = 0;
    let payerAddress: string | null = null;
    let memoMatches = false;

    for (const instruction of tx.transaction.message.instructions) {
      if (!('parsed' in instruction)) continue;

      if (instruction.program === 'spl-token') {
        const parsed = instruction.parsed;
        if (parsed.type !== 'transfer' && parsed.type !== 'transferChecked') {
          continue;
        }

        const info = parsed.info;
        if (info.destination !== merchantTokenAccountStr) continue;

        // transferChecked carries the mint; reject transfers of other tokens
        if (info.mint && info.mint !== usdcMint.toBase58()) continue;

        const amountRaw =
          parsed.type === 'transferChecked'
            ? info.tokenAmount?.amount || '0'
            : info.amount || '0';

        transferredAtomic += parseInt(amountRaw, 10);
        payerAddress = info.authority || info.source || payerAddress;
      }

      if (instruction.program === 'spl-memo') {
        // Parsed memo instructions expose the memo string directly
        if (instruction.parsed === expected.checkoutSessionId) {
          memoMatches = true;
        }
      }
    }

    const transferredCents = Math.floor(transferredAtomic / 10_000);

    if (!memoMatches) {
      return {
        verified: false,
        amount_cents: transferredCents,
        payer_address: payerAddress,
        failure_reason:
          'Transaction does not reference this checkout session (memo missing or mismatched)',
      };
    }

    if (transferredAtomic < expected.amountInCents * 10_000) {
      return {
        verified: false,
        amount_cents: transferredCents,
        payer_address: payerAddress,
        failure_reason: `Insufficient amount: expected ${expected.amountInCents} cents, received ${transferredCents} cents`,
      };
    }

    return {
      verified: true,
      amount_cents: transferredCents,
      payer_address: payerAddress,
    };
  }

  async CreateSubscriptionPlan(
    priceId: string,
    periodHours: number,
    amountCents: number,
    destinationAddress: string,
    pullerAddress: string
  ): Promise<string> {
    const secretKey = process.env.FEE_PAYER_KEY;

    if (!secretKey) {
      throw new Error('FEE_PAYER_KEY is required');
    }

    const merchantSigner = await createKeyPairSignerFromBytes(
      bs58.decode(secretKey)
    );

    const merchantClient = createClient()
      .use(signer(merchantSigner))
      .use(
        solanaRpc({
          rpcUrl: process.env.SOLANA_RPC_URL || clusterApiUrl(this.network),
        })
      )
      .use(subscriptionsProgram());

    // USDC has 6 decimals → 10_000 base units = $0.01
    const planId = PlanIdFromPriceId(priceId);
    const usdcMintAddress =
      this.network === 'mainnet-beta'
        ? 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v' // Mainnet USDC
        : '4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU'; // Devnet USDC
    const tokenMint = address(usdcMintAddress);
    const amount = BigInt(amountCents * 10_000);
    const periodHoursBigInt = BigInt(periodHours);
    const metadataUri = '';
    const destinations = [address(destinationAddress)];
    const pullers = [address(pullerAddress)];

    await merchantClient.subscriptions.instructions
      .createPlan({
        planId,
        mint: tokenMint,
        amount,
        periodHours: periodHoursBigInt,
        endTs: BigInt(0),
        destinations,
        pullers,
        metadataUri,
      })
      .sendTransaction();

    const [planPda] = await findPlanPda({
      owner: merchantSigner.address,
      planId,
    });
    console.log('PDA CREATED: ', planPda);
    return planPda;
  }
}
