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
  AccountRole,
  createClient,
  createKeyPairSignerFromBytes,
  createNoopSigner,
} from '@solana/kit';
import type { Instruction } from '@solana/instructions';
import { solanaRpc } from '@solana/kit-plugin-rpc';
import { signer } from '@solana/kit-plugin-signer';
import {
  findAssociatedTokenPda,
  TOKEN_PROGRAM_ADDRESS,
} from '@solana-program/token';
import {
  findPlanPda,
  findSubscriptionDelegationPda,
  findSubscriptionAuthorityPda,
  fetchMaybePlan,
  fetchMaybeSubscriptionAuthority,
  fetchMaybeSubscriptionDelegation,
  getInitSubscriptionAuthorityOverlayInstructionAsync,
  getSubscribeOverlayInstructionAsync,
  subscriptionsProgram,
} from '@solana/subscriptions';
import {
  GetCheckoutFeePayerSecretKey,
  RequireSubscriptionOperatorSecretKey,
} from '../AppConfig';

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

/** Result of verifying an on-chain subscribe transaction */
export interface CheckoutSubscribeVerification {
  verified: boolean;
  /** Subscriber wallet that signed the subscribe transaction */
  subscriber_address: string | null;
  /** Subscription delegation PDA created by the subscribe instruction */
  subscription_delegation_pda: string | null;
  /** Reason verification failed, if it did */
  failure_reason?: string;
}

/** Shared shape returned by unsigned transaction builders */
export interface UnsignedSolanaTransaction {
  unsigned_transaction: string;
  estimated_fee_lamports: number;
  blockhash: string;
  last_valid_block_height: number;
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

// Rate limiting for bulk deposit scanning (public RPC is strict).
const RPC_DELAY_MS = 2000;
// Confirmation polling should be snappy — not the deposit-scan delay.
const CONFIRM_POLL_MS = 400;
const CONFIRM_MAX_ATTEMPTS = 75; // ~30s at 400ms
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
   * @returns Transaction result with signature and status
   */
  async BroadcastSignedTransaction(signedTransaction: string): Promise<{
    signature: string;
    status: 'paid' | 'failed';
    viewer_url: string;
    failure_message?: string;
  }> {
    try {
      const transactionBuffer = Buffer.from(signedTransaction, 'base64');

      const signature = await this.WithRetry(() =>
        this.connection.sendRawTransaction(transactionBuffer, {
          skipPreflight: false,
          preflightCommitment: 'confirmed',
          maxRetries: 3,
        })
      );

      // Poll via HTTP — confirmTransaction's websocket path hangs on many RPCs.
      const confirmed = await this.WaitForSignatureConfirmation(signature);
      if (!confirmed.ok) {
        return {
          signature,
          status: 'failed',
          viewer_url: this.ExplorerUrl('tx', signature),
          failure_message:
            confirmed.failure_message ||
            'Transaction was submitted but failed to confirm',
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

      // sendRawTransaction can throw if the tx already landed (duplicate).
      const maybeSignature = this.ExtractSignatureFromSendError(error);
      if (maybeSignature) {
        const confirmed = await this.WaitForSignatureConfirmation(
          maybeSignature
        );
        if (confirmed.ok) {
          return {
            signature: maybeSignature,
            status: 'paid',
            viewer_url: this.ExplorerUrl('tx', maybeSignature),
          };
        }
      }

      return {
        signature: '',
        status: 'failed',
        viewer_url: '',
        failure_message: `Broadcast failed: ${errorMessage}`,
      };
    }
  }

  private async WaitForSignatureConfirmation(
    signature: string
  ): Promise<{ ok: boolean; failure_message?: string }> {
    for (let attempt = 0; attempt < CONFIRM_MAX_ATTEMPTS; attempt++) {
      const statuses = await this.WithRetry(() =>
        this.connection.getSignatureStatuses([signature], {
          searchTransactionHistory: true,
        })
      );
      const status = statuses?.value?.[0];
      if (status?.err) {
        return {
          ok: false,
          failure_message: `Transaction failed: ${JSON.stringify(status.err)}`,
        };
      }
      if (
        status?.confirmationStatus === 'confirmed' ||
        status?.confirmationStatus === 'finalized'
      ) {
        return { ok: true };
      }
      await Sleep(CONFIRM_POLL_MS);
    }
    return {
      ok: false,
      failure_message: 'Transaction confirmation timed out',
    };
  }

  private ExtractSignatureFromSendError(error: unknown): string | null {
    if (!error || typeof error !== 'object') return null;
    const withSignature = error as { signature?: string };
    if (
      typeof withSignature.signature === 'string' &&
      withSignature.signature.length > 0
    ) {
      return withSignature.signature;
    }
    const message = error instanceof Error ? error.message : String(error);
    // web3.js often embeds: "Transaction ... already been processed: <sig>"
    const match = message.match(
      /already (?:been )?processed[:\s]+([1-9A-HJ-NP-Za-km-z]{64,100})/i
    );
    return match?.[1] ?? null;
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
   * When `feeSponsored` is true, TRANSACTION_FEE_PAYER_KEY pays network fees
   * and ATA rent; the customer only co-signs the transfer.
   */
  async BuildCheckoutPaymentTransaction(
    payerPublicKey: string,
    merchantWalletAddress: string,
    amountInCents: number,
    checkoutSessionId: string,
    options?: { feeSponsored?: boolean }
  ): Promise<UnsignedSolanaTransaction> {
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

    const feeSponsored = !!options?.feeSponsored;
    const payer = new PublicKey(payerPublicKey);
    const merchant = new PublicKey(merchantWalletAddress);
    const usdcMint = new PublicKey(this.GetUSDCMintAddress());
    const rentPayer = feeSponsored
      ? Keypair.fromSecretKey(
          bs58.decode(this.RequireCheckoutFeePayerSecretKey())
        ).publicKey
      : payer;

    const payerTokenAccount = await getAssociatedTokenAddress(usdcMint, payer);
    const merchantTokenAccount = await getAssociatedTokenAddress(
      usdcMint,
      merchant
    );

    // Convert cents to USDC atomic units (6 decimals => 1 cent = 10,000 units)
    const amountInSmallestUnit = amountInCents * 10_000;

    const transaction = new Transaction();

    // Ensure the merchant's USDC token account exists
    transaction.add(
      createAssociatedTokenAccountIdempotentInstruction(
        rentPayer,
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

    return this.FinalizeUnsignedTransaction(transaction, rentPayer, {
      feeSponsored: !!options?.feeSponsored,
    });
  }

  /**
   * Build an init-only SubscriptionAuthority tx when the subscriber has none
   * for the USDC mint. Returns null when the authority already exists.
   *
   * Must land in its own transaction before subscribe: the program stores
   * `init_id = Clock::slot` at execution, and bundling with subscribe is
   * unreliable across program versions / wallet simulation.
   */
  async BuildInitSubscriptionAuthorityTransaction(
    subscriberWallet: string,
    options?: { feeSponsored?: boolean }
  ): Promise<UnsignedSolanaTransaction | null> {
    if (!subscriberWallet) {
      throw new Error('Subscriber wallet is required');
    }

    const feeSponsored = !!options?.feeSponsored;
    const usdcMintAddress = this.GetUSDCMintAddress();
    const tokenMint = address(usdcMintAddress);
    const subscriberAddress = address(subscriberWallet);
    const subscriberSigner = createNoopSigner(subscriberAddress);

    const rentPayerPubkey = feeSponsored
      ? Keypair.fromSecretKey(
          bs58.decode(this.RequireCheckoutFeePayerSecretKey())
        ).publicKey
      : new PublicKey(subscriberWallet);
    const rentPayerSigner = createNoopSigner(
      address(rentPayerPubkey.toBase58())
    );

    const [authorityPda] = await findSubscriptionAuthorityPda({
      user: subscriberAddress,
      tokenMint,
    });
    const authority = await fetchMaybeSubscriptionAuthority(
      this.CreateSubscriptionsRpc(subscriberSigner).rpc,
      authorityPda
    );
    if (authority.exists) {
      return null;
    }

    const [subscriberAta] = await findAssociatedTokenPda({
      mint: tokenMint,
      owner: subscriberAddress,
      tokenProgram: TOKEN_PROGRAM_ADDRESS,
    });

    const initIx = await getInitSubscriptionAuthorityOverlayInstructionAsync({
      owner: subscriberSigner,
      payer: rentPayerSigner,
      tokenMint,
      tokenProgram: TOKEN_PROGRAM_ADDRESS,
      userAta: subscriberAta,
    });

    const transaction = new Transaction();
    transaction.add(
      createAssociatedTokenAccountIdempotentInstruction(
        rentPayerPubkey,
        new PublicKey(subscriberAta),
        new PublicKey(subscriberWallet),
        new PublicKey(usdcMintAddress)
      )
    );
    transaction.add(this.ToWeb3Instruction(initIx));

    return this.FinalizeUnsignedTransaction(transaction, rentPayerPubkey, {
      feeSponsored,
    });
  }

  /**
   * Build a subscribe-only transaction. Requires an existing
   * SubscriptionAuthority; call BuildInitSubscriptionAuthorityTransaction
   * first for new wallets.
   *
   * Plan owner is always SUBSCRIPTION_OPERATOR_KEY. Fee/rent payer is
   * TRANSACTION_FEE_PAYER_KEY when sponsored, otherwise the subscriber.
   */
  async BuildSubscribeTransaction(
    subscriberWallet: string,
    priceId: string,
    planPda: string,
    options?: { feeSponsored?: boolean }
  ): Promise<UnsignedSolanaTransaction> {
    if (!subscriberWallet) {
      throw new Error('Subscriber wallet is required');
    }
    if (!priceId) {
      throw new Error('Price ID is required');
    }
    if (!planPda) {
      throw new Error('Plan PDA is required');
    }

    const feeSponsored = !!options?.feeSponsored;
    const planOwner = this.GetPlanOwnerPublicKey();
    const planId = PlanIdFromPriceId(priceId);
    const usdcMintAddress = this.GetUSDCMintAddress();
    const tokenMint = address(usdcMintAddress);
    const subscriberAddress = address(subscriberWallet);
    const subscriberSigner = createNoopSigner(subscriberAddress);

    const rentPayerPubkey = feeSponsored
      ? Keypair.fromSecretKey(
          bs58.decode(this.RequireCheckoutFeePayerSecretKey())
        ).publicKey
      : new PublicKey(subscriberWallet);
    const rentPayerSigner = createNoopSigner(
      address(rentPayerPubkey.toBase58())
    );

    const [expectedPlanPda] = await findPlanPda({
      owner: address(planOwner),
      planId,
    });
    if (expectedPlanPda !== planPda) {
      throw new Error(
        `Plan PDA mismatch for price ${priceId}: expected ${expectedPlanPda}, got ${planPda}`
      );
    }

    const rpcClient = this.CreateSubscriptionsRpc(subscriberSigner);

    const planAccount = await fetchMaybePlan(rpcClient.rpc, address(planPda));
    if (!planAccount.exists) {
      throw new Error(
        'On-chain subscription plan was not found. Recreate the recurring price and try again.'
      );
    }

    const [subscriptionPda] = await findSubscriptionDelegationPda({
      planPda: address(planPda),
      subscriber: subscriberAddress,
    });
    const existingSubscription = await fetchMaybeSubscriptionDelegation(
      rpcClient.rpc,
      subscriptionPda
    );
    if (existingSubscription.exists) {
      throw new Error(
        'This wallet is already subscribed to this plan on-chain.'
      );
    }

    const [authorityPda] = await findSubscriptionAuthorityPda({
      user: subscriberAddress,
      tokenMint,
    });
    const authority = await fetchMaybeSubscriptionAuthority(
      rpcClient.rpc,
      authorityPda
    );
    if (!authority.exists) {
      throw new Error(
        'Subscription authority is not initialized for this wallet. Init it first.'
      );
    }

    const planData = planAccount.data.data;
    const subscribeIx = await getSubscribeOverlayInstructionAsync({
      merchant: address(planOwner),
      planId,
      tokenMint,
      payer: rentPayerSigner,
      subscriber: subscriberSigner,
      expectedAmount: planData.terms.amount,
      expectedPeriodHours: planData.terms.periodHours,
      expectedCreatedAt: planData.terms.createdAt,
      expectedSubscriptionAuthorityInitId: authority.data.initId,
    });

    const transaction = new Transaction();
    transaction.add(this.ToWeb3Instruction(subscribeIx));

    return this.FinalizeUnsignedTransaction(transaction, rentPayerPubkey, {
      feeSponsored,
    });
  }

  /**
   * Poll until the subscriber's SubscriptionAuthority PDA exists (after init).
   */
  async WaitForSubscriptionAuthority(
    subscriberWallet: string,
    maxAttempts = 20
  ): Promise<void> {
    const tokenMint = address(this.GetUSDCMintAddress());
    const subscriberAddress = address(subscriberWallet);
    const [authorityPda] = await findSubscriptionAuthorityPda({
      user: subscriberAddress,
      tokenMint,
    });

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const info = await this.WithRetry(() =>
        this.connection.getAccountInfo(new PublicKey(authorityPda), 'confirmed')
      );
      if (info) return;
      await Sleep(CONFIRM_POLL_MS);
    }
    throw new Error(
      'Subscription authority was not found on-chain after init. Please try again.'
    );
  }

  private CreateSubscriptionsRpc(
    subscriberSigner: ReturnType<typeof createNoopSigner>
  ) {
    return createClient()
      .use(signer(subscriberSigner))
      .use(
        solanaRpc({
          rpcUrl: process.env.SOLANA_RPC_URL || clusterApiUrl(this.network),
        })
      )
      .use(subscriptionsProgram());
  }

  /**
   * After the customer co-signs a fee-sponsored checkout tx, add the
   * TRANSACTION_FEE_PAYER signature and broadcast on our RPC.
   */
  async CosignAndBroadcastCheckoutTransaction(
    signedByCustomerBase64: string
  ): Promise<{ signature: string }> {
    const transaction = Transaction.from(
      Buffer.from(signedByCustomerBase64, 'base64')
    );
    const feePayerKeypair = Keypair.fromSecretKey(
      bs58.decode(this.RequireCheckoutFeePayerSecretKey())
    );
    transaction.partialSign(feePayerKeypair);

    const broadcast = await this.BroadcastSignedTransaction(
      transaction.serialize().toString('base64')
    );
    if (broadcast.status === 'failed') {
      throw new Error(
        broadcast.failure_message || 'Failed to broadcast checkout transaction'
      );
    }
    return { signature: broadcast.signature };
  }

  /** @deprecated Use CosignAndBroadcastCheckoutTransaction */
  async CosignAndBroadcastSubscribeTransaction(
    signedBySubscriberBase64: string
  ): Promise<{ signature: string }> {
    return this.CosignAndBroadcastCheckoutTransaction(signedBySubscriberBase64);
  }

  /**
   * Return the subscription delegation PDA when this wallet is already
   * subscribed to the plan, otherwise null.
   */
  async FindExistingSubscriptionDelegation(
    planPda: string,
    subscriberWallet: string
  ): Promise<string | null> {
    const [subscriptionPda] = await findSubscriptionDelegationPda({
      planPda: address(planPda),
      subscriber: address(subscriberWallet),
    });
    const account = await this.WithRetry(() =>
      this.connection.getAccountInfo(
        new PublicKey(subscriptionPda),
        'confirmed'
      )
    );
    return account ? subscriptionPda : null;
  }

  /**
   * Verify that a broadcast transaction successfully created a subscription
   * delegation PDA for the given plan and subscriber.
   */
  async VerifySubscribeTransaction(
    signature: string,
    expected: {
      planPda: string;
      subscriberWallet: string;
    }
  ): Promise<CheckoutSubscribeVerification> {
    const maxAttempts = 20;
    let tx: ParsedTransactionWithMeta | null = null;
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      tx = await this.GetParsedTransaction(signature);
      if (tx) break;
      await Sleep(CONFIRM_POLL_MS);
    }

    if (!tx || !tx.meta) {
      return {
        verified: false,
        subscriber_address: null,
        subscription_delegation_pda: null,
        failure_reason:
          'Transaction not found on-chain (may not be confirmed yet)',
      };
    }

    if (tx.meta.err) {
      return {
        verified: false,
        subscriber_address: null,
        subscription_delegation_pda: null,
        failure_reason: `Transaction failed on-chain: ${JSON.stringify(
          tx.meta.err
        )}`,
      };
    }

    const [subscriptionPda] = await findSubscriptionDelegationPda({
      planPda: address(expected.planPda),
      subscriber: address(expected.subscriberWallet),
    });

    const subscriptionAccount = await this.WithRetry(() =>
      this.connection.getAccountInfo(
        new PublicKey(subscriptionPda),
        'confirmed'
      )
    );

    if (!subscriptionAccount) {
      return {
        verified: false,
        subscriber_address: expected.subscriberWallet,
        subscription_delegation_pda: null,
        failure_reason:
          'Subscription account was not created for this subscriber and plan',
      };
    }

    const feePayer = tx.transaction.message.accountKeys[0];
    const feePayerAddress =
      typeof feePayer === 'string'
        ? feePayer
        : feePayer?.pubkey?.toBase58?.() ?? null;

    // Fee payer may be the platform sponsor; subscriber must still appear as a
    // signer on the transaction (account key with signer flag).
    const accountKeys = tx.transaction.message.accountKeys;
    const subscriberSigned = accountKeys.some((key) => {
      const address =
        typeof key === 'string' ? key : key?.pubkey?.toBase58?.() ?? '';
      if (address !== expected.subscriberWallet) return false;
      if (typeof key === 'string') return true;
      return key.signer === true || key.signer === undefined;
    });

    if (!subscriberSigned) {
      return {
        verified: false,
        subscriber_address: feePayerAddress,
        subscription_delegation_pda: subscriptionPda,
        failure_reason:
          'Subscribe transaction was not signed by the expected wallet',
      };
    }

    return {
      verified: true,
      subscriber_address: expected.subscriberWallet,
      subscription_delegation_pda: subscriptionPda,
    };
  }

  /**
   * Collect a subscription period payment. Signed by the plan owner
   * (`SUBSCRIPTION_OPERATOR_KEY`). Funds go to the plan's on-chain destination
   * allowlist (not an arbitrary merchant wallet — mismatched receivers fail
   * on-chain).
   */
  async CollectSubscriptionPayment(params: {
    subscriberWallet: string;
    planPda: string;
    subscriptionPda: string;
    amountCents: number;
    /** Optional; must match a plan destination if the plan has an allowlist. */
    destinationWallet?: string;
  }): Promise<{ signature: string }> {
    const {
      subscriberWallet,
      planPda,
      subscriptionPda,
      amountCents,
      destinationWallet,
    } = params;

    if (!Number.isInteger(amountCents) || amountCents <= 0) {
      throw new Error('Amount must be a positive integer number of cents');
    }

    // Prefer transaction fee payer for ATA rent when configured; else operator.
    const ataRentPayerSecret =
      GetCheckoutFeePayerSecretKey() || RequireSubscriptionOperatorSecretKey();
    const feePayerKeypair = Keypair.fromSecretKey(
      bs58.decode(ataRentPayerSecret)
    );
    const merchantSigner = await this.GetPlanOwnerSigner();
    const tokenMint = address(this.GetUSDCMintAddress());
    const usdcMint = new PublicKey(this.GetUSDCMintAddress());

    const rpcClient = createClient()
      .use(signer(merchantSigner))
      .use(
        solanaRpc({
          rpcUrl: process.env.SOLANA_RPC_URL || clusterApiUrl(this.network),
        })
      )
      .use(subscriptionsProgram());

    const planAccount = await fetchMaybePlan(rpcClient.rpc, address(planPda));
    if (!planAccount.exists) {
      throw new Error(`Subscription plan not found on-chain: ${planPda}`);
    }

    const SYSTEM_PROGRAM = '11111111111111111111111111111111';
    const allowlisted = planAccount.data.data.destinations
      .map((dest) => String(dest))
      .filter((dest) => dest && dest !== SYSTEM_PROGRAM);
    // Plans bake the receiving wallet in at create time — collect must use it.
    const resolvedDestination = allowlisted[0] || destinationWallet;

    if (!resolvedDestination) {
      throw new Error(
        'Subscription plan has no destination wallet configured on-chain'
      );
    }

    if (
      destinationWallet &&
      allowlisted.length > 0 &&
      !allowlisted.includes(destinationWallet)
    ) {
      console.warn(
        `[Solana] Collect using plan destination ${resolvedDestination} (merchant wallet ${destinationWallet} is not in the plan allowlist)`
      );
    }

    const destinationPubkey = new PublicKey(resolvedDestination);
    const receiverAta = await getAssociatedTokenAddress(
      usdcMint,
      destinationPubkey
    );

    // Only create+confirm the destination ATA when missing — otherwise every
    // collect burns a full confirmation wait on a no-op idempotent create.
    const existingAta = await this.WithRetry(() =>
      this.connection.getAccountInfo(receiverAta, 'confirmed')
    );
    if (!existingAta) {
      const createAtaTx = new Transaction().add(
        createAssociatedTokenAccountIdempotentInstruction(
          feePayerKeypair.publicKey,
          receiverAta,
          destinationPubkey,
          usdcMint
        )
      );
      const { blockhash } = await this.WithRetry(() =>
        this.connection.getLatestBlockhash('confirmed')
      );
      createAtaTx.recentBlockhash = blockhash;
      createAtaTx.feePayer = feePayerKeypair.publicKey;
      createAtaTx.sign(feePayerKeypair);
      const createAtaSignature = await this.WithRetry(() =>
        this.connection.sendRawTransaction(createAtaTx.serialize(), {
          skipPreflight: false,
          preflightCommitment: 'confirmed',
        })
      );
      const createAtaConfirmed = await this.WaitForSignatureConfirmation(
        createAtaSignature
      );
      if (!createAtaConfirmed.ok) {
        throw new Error(
          createAtaConfirmed.failure_message ||
            `Failed to confirm destination ATA creation (${createAtaSignature})`
        );
      }
    }

    const amount = BigInt(amountCents * 10_000);

    const existingSub = await fetchMaybeSubscriptionDelegation(
      rpcClient.rpc,
      address(subscriptionPda)
    );
    if (existingSub.exists && existingSub.data.amountPulledInPeriod >= amount) {
      // Already collected this billing period (e.g. retry after a partial confirm).
      return { signature: 'already_collected' };
    }

    try {
      const result = await rpcClient.subscriptions.instructions
        .transferSubscription({
          caller: merchantSigner,
          delegator: address(subscriberWallet),
          tokenMint,
          subscriptionPda: address(subscriptionPda),
          planPda: address(planPda),
          amount,
          receiverAta: address(receiverAta.toBase58()),
          tokenProgram: TOKEN_PROGRAM_ADDRESS,
        })
        .sendTransaction();

      return { signature: result.context.signature };
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      if (/#400|exceeds period limit/i.test(message)) {
        return { signature: 'already_collected' };
      }
      throw new Error(
        `Subscription collect failed (destination ${resolvedDestination}, ATA ${receiverAta.toBase58()}): ${message}`
      );
    }
  }

  /**
   * Public key of the wallet that owns on-chain subscription plans
   * (SUBSCRIPTION_OPERATOR_KEY). This is the `merchant` argument to `subscribe`
   * and the authorized puller.
   */
  GetPlanOwnerPublicKey(): string {
    const secretKey = RequireSubscriptionOperatorSecretKey();
    return Keypair.fromSecretKey(bs58.decode(secretKey)).publicKey.toBase58();
  }

  private async GetPlanOwnerSigner() {
    return createKeyPairSignerFromBytes(
      bs58.decode(RequireSubscriptionOperatorSecretKey())
    );
  }

  private RequireCheckoutFeePayerSecretKey(): string {
    const secretKey = GetCheckoutFeePayerSecretKey();
    if (!secretKey) {
      throw new Error(
        'TRANSACTION_FEE_PAYER_KEY is required for fee sponsorship'
      );
    }
    return secretKey;
  }

  private ToWeb3Instruction(instruction: Instruction): TransactionInstruction {
    return new TransactionInstruction({
      programId: new PublicKey(instruction.programAddress),
      keys: (instruction.accounts ?? []).map((account) => ({
        pubkey: new PublicKey(account.address),
        isSigner:
          account.role === AccountRole.READONLY_SIGNER ||
          account.role === AccountRole.WRITABLE_SIGNER,
        isWritable:
          account.role === AccountRole.WRITABLE ||
          account.role === AccountRole.WRITABLE_SIGNER,
      })),
      data: Buffer.from(instruction.data ?? new Uint8Array()),
    });
  }

  private async FinalizeUnsignedTransaction(
    transaction: Transaction,
    feePayer: PublicKey,
    options?: { feeSponsored?: boolean }
  ): Promise<UnsignedSolanaTransaction> {
    const { blockhash, lastValidBlockHeight } = await this.WithRetry(() =>
      this.connection.getLatestBlockhash('confirmed')
    );
    transaction.recentBlockhash = blockhash;
    transaction.feePayer = feePayer;

    // Pre-sign with the fee payer so wallet simulation sees a funded payer
    // and does not warn about the subscriber's empty SOL balance.
    if (options?.feeSponsored) {
      const feePayerKeypair = Keypair.fromSecretKey(
        bs58.decode(this.RequireCheckoutFeePayerSecretKey())
      );
      transaction.partialSign(feePayerKeypair);
    }

    const fee = await this.WithRetry(() =>
      this.connection.getFeeForMessage(
        transaction.compileMessage(),
        'confirmed'
      )
    );

    return {
      unsigned_transaction: transaction
        .serialize({ requireAllSignatures: false })
        .toString('base64'),
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
    const maxAttempts = 20;
    let tx: ParsedTransactionWithMeta | null = null;
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      tx = await this.GetParsedTransaction(signature);
      if (tx) break;
      await Sleep(CONFIRM_POLL_MS);
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
    const merchantSigner = await this.GetPlanOwnerSigner();

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
    const tokenMint = address(this.GetUSDCMintAddress());
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
    return planPda;
  }
}
