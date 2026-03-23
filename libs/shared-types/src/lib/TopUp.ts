/**
 * Top-up object representing an incoming deposit to the platform balance.
 * Follows Stripe's TopUp API structure.
 * @see https://docs.stripe.com/api/topups/object
 */
export interface TopUp {
  /** Unique identifier for the object */
  id: string;
  /** String representing the object's type */
  object: 'topup';
  /** Amount transferred in the smallest currency unit (e.g., cents) */
  amount: number;
  /** ID of the balance transaction that describes the impact of this top-up on your account balance */
  balance_transaction: string | null;
  /** Unix timestamp in seconds when the top-up was created */
  created: number;
  /** Three-letter ISO currency code, in lowercase */
  currency: string;
  /** An arbitrary string attached to the object. Often useful for displaying to users */
  description: string | null;
  /** Unix timestamp in seconds when funds are expected to arrive */
  expected_availability_date: number | null;
  /** Error code explaining reason for top-up failure if available */
  failure_code: string | null;
  /** Message to user further explaining reason for top-up failure if available */
  failure_message: string | null;
  /** Has the value true if the object exists in live mode or false if in test mode */
  livemode: boolean;
  /** Set of key-value pairs for storing additional information */
  metadata: Record<string, string>;
  /** The source field contains information about the funding source (deprecated in Stripe, simplified here) */
  source: TopUpSource | null;
  /** Extra information about a top-up. Appears on your source's bank statement. Limited to 15 ASCII characters */
  statement_descriptor: string | null;
  /** The status of the top-up */
  status: TopUpStatus;
  /** A string that identifies this top-up as part of a group */
  transfer_group: string | null;

  // Zoneless extensions (not in Stripe)
  /** The account this top-up belongs to */
  account: string;
  /** Unix timestamp in seconds when funds actually arrived (null if pending) */
  arrival_date: number | null;

  /**
   * The platform account that owns this resource.
   * For connected account resources, this is the platform's account ID.
   * For platform's own resources, this equals the account field (self-referential).
   * @zoneless_extension
   */
  platform_account: string;
}

/**
 * Top-up status values matching Stripe's API
 */
export type TopUpStatus =
  | 'canceled'
  | 'failed'
  | 'pending'
  | 'reversed'
  | 'succeeded';

/**
 * Simplified source object for top-ups.
 * In Stripe, this is a complex deprecated field. We use a simplified version for crypto deposits.
 */
export interface TopUpSource {
  /** Unique identifier for the source */
  id: string;
  /** String representing the object's type */
  object: 'source';
  /** The type of source - for Zoneless, this is crypto_deposit */
  type: 'crypto_deposit';
  /** Additional metadata about the source */
  metadata?: Record<string, string>;
}

/**
 * Input for creating a top-up via the API
 */
export interface CreateTopUpInput {
  /** A positive integer representing how much to transfer (required) */
  amount: number;
  /** Three-letter ISO currency code, in lowercase (required) */
  currency: string;
  /** An arbitrary string attached to the object */
  description?: string;
  /** Set of key-value pairs for storing additional information */
  metadata?: Record<string, string>;
  /** The ID of a source to transfer funds from */
  source?: string;
  /** Extra information about a top-up for the source's bank statement. Limited to 15 ASCII characters */
  statement_descriptor?: string;
  /** A string that identifies this top-up as part of a group */
  transfer_group?: string;
}

/**
 * Input for updating a top-up via the API
 */
export interface UpdateTopUpInput {
  /** An arbitrary string attached to the object */
  description?: string;
  /** Set of key-value pairs for storing additional information */
  metadata?: Record<string, string>;
}

/**
 * Response from POST /v1/topups/check-deposits
 * Returns the result of checking the blockchain for new deposits.
 */
export interface CheckDepositsResponse {
  /** The object type */
  object: 'check_deposits_result';
  /** Number of new deposits successfully processed */
  processed: number;
  /** Number of errors encountered during processing */
  errors: number;
  /** Array of newly created TopUp objects */
  topups: TopUp[];
  /** Message describing the result */
  message: string;
}
