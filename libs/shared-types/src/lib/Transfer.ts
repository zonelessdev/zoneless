/**
 * Stripe-compatible Transfer object for Zoneless Connect.
 * A Transfer is created when you move funds between accounts as part of Connect.
 *
 * @see https://docs.stripe.com/api/transfers/object
 */

/**
 * The source balance this transfer came from.
 * In Stripe, this is typically 'card', 'fpx', or 'bank_account'.
 * For Zoneless (crypto), we use 'wallet'.
 */
export type TransferSourceType = 'card' | 'fpx' | 'bank_account' | 'wallet';

/**
 * Transfer Reversal object - represents a reversal of a transfer.
 * @see https://docs.stripe.com/api/transfer_reversals/object
 */
export interface TransferReversal {
  /** Unique identifier for the object */
  id: string;

  /** String representing the object's type */
  object: 'transfer_reversal';

  /** Amount reversed, in cents */
  amount: number;

  /** Balance transaction that describes the impact on your account balance */
  balance_transaction: string | null;

  /** Time at which the object was created. Measured in seconds since the Unix epoch */
  created: number;

  /** Three-letter ISO currency code, in lowercase */
  currency: string;

  /** Linked payment refund for the transfer reversal */
  destination_payment_refund: string | null;

  /** Set of key-value pairs for storing additional information */
  metadata: Record<string, string>;

  /** ID of the refund responsible for the transfer reversal */
  source_refund: string | null;

  /** ID of the transfer that was reversed */
  transfer: string;
}

/**
 * List of transfer reversals embedded in Transfer object
 */
export interface TransferReversalsList {
  /** String representing the object's type. Always 'list' */
  object: 'list';

  /** Details about each reversal */
  data: TransferReversal[];

  /** True if this list has another page of items after this one */
  has_more: boolean;

  /** The URL where this list can be accessed */
  url: string;
}

export interface Transfer {
  /** Unique identifier for the object */
  id: string;

  /** String representing the object's type */
  object: 'transfer';

  /** Amount in cents to be transferred */
  amount: number;

  /** Amount in cents reversed (can be less than the amount if partial reversal was issued) */
  amount_reversed: number;

  /** Balance transaction that describes the impact of this transfer on your account balance */
  balance_transaction: string | null;

  /** Time that this record of the transfer was first created. Unix timestamp in seconds */
  created: number;

  /** Three-letter ISO currency code, in lowercase. Must be a supported currency */
  currency: string;

  /** An arbitrary string attached to the object. Often useful for displaying to users */
  description: string | null;

  /** ID of the connected account the transfer was sent to */
  destination: string;

  /** The ID of the payment that the destination account received for the transfer */
  destination_payment: string | null;

  /** Has the value true if the object exists in live mode or the value false if the object exists in test mode */
  livemode: boolean;

  /** Set of key-value pairs for storing additional information about the object */
  metadata: Record<string, string>;

  /** A list of reversals that have been applied to the transfer */
  reversals: TransferReversalsList;

  /** Whether the transfer has been fully reversed. If only partially reversed, this will still be false */
  reversed: boolean;

  /** ID of the charge that was used to fund the transfer. If null, the transfer was funded from the available balance */
  source_transaction: string | null;

  /** The source balance this transfer came from. One of card, fpx, bank_account, or wallet */
  source_type: TransferSourceType;

  /** A string that identifies this transaction as part of a group */
  transfer_group: string | null;

  /**
   * The account ID that created/owns this transfer.
   * @zoneless_extension - Not in Stripe API, used for internal storage.
   */
  account: string;

  /**
   * The platform account that owns this resource.
   * For connected account resources, this is the platform's account ID.
   * For platform's own resources, this equals the account field (self-referential).
   * @zoneless_extension
   */
  platform_account: string;
}
