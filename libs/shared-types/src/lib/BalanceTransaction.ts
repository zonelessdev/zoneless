/**
 * Stripe-compatible Balance Transaction object for Zoneless Connect.
 * Represents funds moving through an account balance.
 *
 * @see https://docs.stripe.com/api/balance_transactions/object
 */

/**
 * Fee detail breakdown for a balance transaction.
 */
export interface BalanceTransactionFeeDetail {
  /** Amount of the fee, in cents */
  amount: number;
  /** ID of the Connect application that earned the fee (nullable) */
  application: string | null;
  /** Three-letter ISO currency code, in lowercase */
  currency: string;
  /** Description of the fee (nullable) */
  description: string | null;
  /** Type of the fee: application_fee, payment_method_passthrough_fee, stripe_fee, or tax */
  type:
    | 'application_fee'
    | 'payment_method_passthrough_fee'
    | 'stripe_fee'
    | 'tax';
}

/**
 * Balance type that this transaction impacts.
 */
export type BalanceTransactionBalanceType =
  | 'issuing'
  | 'payments'
  | 'refund_and_dispute_prefunding';

/**
 * Transaction status.
 */
export type BalanceTransactionStatus = 'available' | 'pending';

/**
 * Transaction type for balance transactions.
 */
export type BalanceTransactionType =
  | 'adjustment'
  | 'advance'
  | 'advance_funding'
  | 'anticipation_repayment'
  | 'application_fee'
  | 'application_fee_refund'
  | 'charge'
  | 'connect_collection_transfer'
  | 'contribution'
  | 'payment'
  | 'payment_failure_refund'
  | 'payment_refund'
  | 'payment_reversal'
  | 'payout'
  | 'payout_cancel'
  | 'payout_failure'
  | 'refund'
  | 'refund_failure'
  | 'reserve_transaction'
  | 'reserved_funds'
  | 'stripe_fee'
  | 'stripe_fx_fee'
  | 'tax_fee'
  | 'topup'
  | 'topup_reversal'
  | 'transfer'
  | 'transfer_cancel'
  | 'transfer_failure'
  | 'transfer_refund';

export interface BalanceTransaction {
  /** Unique identifier for the object */
  id: string;
  /** String representing the object's type. Always "balance_transaction" */
  object: 'balance_transaction';
  /** Gross amount of this transaction (in cents). A positive value represents funds charged to another party, and a negative value represents funds sent to another party */
  amount: number;
  /** The date that the transaction's net funds become available in the balance */
  available_on: number;
  /** The balance that this transaction impacts */
  balance_type: BalanceTransactionBalanceType;
  /** Unix timestamp in seconds when the transaction was created */
  created: number;
  /** Three-letter ISO currency code, in lowercase */
  currency: string;
  /** An arbitrary string attached to the object. Often useful for displaying to users (nullable) */
  description: string | null;
  /** Fees (in cents) paid for this transaction. Represented as a positive integer when assessed */
  fee: number;
  /** Detailed breakdown of fees (in cents) paid for this transaction */
  fee_details: BalanceTransactionFeeDetail[];
  /** Net impact to the account balance (in cents). A positive value represents incrementing the balance, and a negative value decrementing it. Calculated as amount - fee */
  net: number;
  /** Learn more about how reporting categories can help you understand balance transactions from an accounting perspective */
  reporting_category: string;
  /** The ID of the source object for this transaction (nullable) */
  source: string | null;
  /** The transaction's net funds status, which is either available or pending */
  status: BalanceTransactionStatus;
  /** Transaction type */
  type: BalanceTransactionType;
  /**
   * The account ID this balance transaction belongs to.
   * @zoneless_extension - Not in Stripe API, used for internal storage.
   */
  account: string;
  /**
   * Metadata key-value pairs.
   * @zoneless_extension - Not in Stripe API, used for internal storage.
   */
  metadata?: Record<string, string>;

  /**
   * The platform account that owns this resource.
   * For connected account resources, this is the platform's account ID.
   * For platform's own resources, this equals the account field (self-referential).
   * @zoneless_extension
   */
  platform_account: string;
}
