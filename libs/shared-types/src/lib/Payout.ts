/**
 * Payout failure codes
 * These map to crypto/blockchain-specific failure reasons
 */
export type PayoutFailureCode =
  | 'account_closed'
  | 'account_frozen'
  | 'could_not_process'
  | 'declined'
  | 'insufficient_funds'
  | 'invalid_account_number'
  | 'invalid_currency'
  | 'wallet_not_found'
  | 'sanctioned_address'
  | 'blockchain_error';

/**
 * Payout status values matching Stripe's API
 */
export type PayoutStatus =
  | 'pending'
  | 'processing'
  | 'in_transit'
  | 'paid'
  | 'failed'
  | 'canceled';

/**
 * Payout method - how the payout is sent
 * For crypto, 'instant' is the primary method
 */
export type PayoutMethod = 'standard' | 'instant';

/**
 * Payout destination type
 * Stripe uses 'bank_account' or 'card', we use 'wallet' for crypto
 */
export type PayoutDestinationType = 'wallet';

/**
 * Source type - the balance source the payout draws from
 * Stripe uses 'card', 'bank_account', or 'fpx'
 * We use 'wallet' for crypto balances
 */
export type PayoutSourceType = 'wallet';

export interface Payout {
  /** Unique identifier for the object */
  id: string;

  /** String representing the object's type */
  object: 'payout';

  /** The connected account ID this payout belongs to */
  account: string;

  /** The amount (in cents) that transfers to the external wallet */
  amount: number;

  /** Unix timestamp in seconds when the payout is expected to arrive */
  arrival_date: number;

  /** Returns true if the payout is created by an automated payout schedule */
  automatic: boolean;

  /** ID of the balance transaction that describes the impact of this payout */
  balance_transaction: string | null;

  /** Unix timestamp in seconds when the payout was created */
  created: number;

  /** Three-letter ISO currency code, in lowercase */
  currency: string;

  /** An arbitrary string attached to the object */
  description: string | null;

  /** ID of the external wallet the payout is sent to */
  destination: string;

  /** Error code that provides a reason for a payout failure, if available */
  failure_code?: PayoutFailureCode | null;

  /** Message that provides the reason for a payout failure, if available */
  failure_message?: string | null;

  /** Has the value true if the object exists in live mode or false if in test mode */
  livemode: boolean;

  /** Set of key-value pairs for storing additional information */
  metadata: {
    blockchain_tx?: string;
    network?: string;
    viewer_url?: string;
    gas_fee?: number;
    gas_fee_currency?: string;
    [key: string]: string | number | undefined;
  };

  /** The method used to send this payout: standard or instant */
  method: PayoutMethod;

  /** The source balance this payout came from */
  source_type: PayoutSourceType;

  /** Extra information about a payout that displays on the user's statement */
  statement_descriptor?: string | null;

  /** Current status of the payout */
  status: PayoutStatus;

  /** Can be 'wallet' for crypto payouts (equivalent to Stripe's 'bank_account' or 'card') */
  type: PayoutDestinationType;

  /**
   * The platform account that owns this resource.
   * For connected account resources, this is the platform's account ID.
   * For platform's own resources, this equals the account field (self-referential).
   * @zoneless_extension
   */
  platform_account: string;
}

export interface PayoutResponse {
  network: string;
  blockchain_tx: string;
  gas_fee: number;
  gas_fee_currency: string;
  viewer_url: string;
  status: 'paid' | 'failed';
  failure_code?: PayoutFailureCode;
  failure_message?: string;
}

/**
 * Response from the build endpoint for batch payouts.
 * Contains an unsigned transaction ready for local signing.
 */
export interface PayoutBatchBuildResponse {
  object: 'payout_batch_build';
  /** Base64-encoded unsigned Solana transaction */
  unsigned_transaction: string;
  /** Estimated transaction fee in lamports */
  estimated_fee_lamports: number;
  /** Blockhash used for the transaction */
  blockhash: string;
  /** Block height after which the transaction expires */
  last_valid_block_height: number;
  /** Array of payout objects included in the transaction */
  payouts: Payout[];
  /** Total amount in cents being paid out */
  total_amount: number;
  /** Number of recipients in the transaction */
  recipients_count: number;
}

/**
 * Response from the broadcast endpoint for batch payouts.
 * Contains the result of broadcasting the signed transaction.
 */
export interface PayoutBatchBroadcastResponse {
  object: 'payout_batch_broadcast';
  /** Transaction signature on Solana */
  signature: string;
  /** Status of the broadcast: 'paid' or 'failed' */
  status: 'paid' | 'failed';
  /** URL to view the transaction on Solana Explorer */
  viewer_url: string;
  /** Array of updated payout objects */
  payouts: Payout[];
  /** Error message if the transaction failed */
  failure_message?: string;
}

/**
 * Result of the processPending operation.
 */
export interface ProcessPendingResult {
  /** Transaction signature on Solana */
  signature: string;
  /** Status of the operation: 'paid' or 'failed' */
  status: 'paid' | 'failed';
  /** URL to view the transaction on Solana Explorer */
  viewer_url: string;
  /** Array of processed payout objects */
  payouts: Payout[];
  /** Total amount in cents that was paid out */
  total_amount: number;
  /** Whether there are more pending payouts to process (call again if true) */
  has_more: boolean;
  /** Error message if the operation failed */
  failure_message?: string;
}
