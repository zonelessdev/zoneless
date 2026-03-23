/**
 * Stripe-compatible Balance object for Zoneless Connect.
 * Represents the balance of funds in an account.
 *
 * @see https://docs.stripe.com/api/balance/balance_object
 */

// ─────────────────────────────────────────────────────────────────────────────
// Balance Details (extended view with on-chain data)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Extended balance view combining on-chain wallet data with
 * internal balance records. Used by the platform dashboard
 * to show a full breakdown of funds.
 * @zoneless_extension
 */
export interface BalanceDetails {
  object: 'balance_details';
  /** USDC balance held in the on-chain wallet (human-readable, e.g. 100.50) */
  wallet_usdc: number;
  /** SOL balance held in the on-chain wallet (human-readable, e.g. 0.05) */
  wallet_sol: number;
  /** Total available balance across all connected accounts (in cents) */
  connected_accounts_owed: number;
  /** Platform's own available balance from the internal ledger (in cents) */
  platform_available: number;
  /** Platform's own pending balance from the internal ledger (in cents) */
  platform_pending: number;
  /** The wallet address these balances correspond to */
  wallet_address: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Source Types (breakdown by source)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Breakdown of balance by source types.
 * For Zoneless, we use `wallet` instead of Stripe's `card`.
 */
export interface BalanceSourceTypes {
  /**
   * Amount from wallet-based payments (USDC transfers).
   * Equivalent to Stripe's `card` source type.
   */
  wallet?: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Balance Amount (for available/pending arrays)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Balance amount for a specific currency.
 */
export interface BalanceAmount {
  /** Balance amount in smallest currency unit (e.g., cents for USDC) */
  amount: number;

  /**
   * Three-letter currency code, in lowercase.
   * For Zoneless, this is typically 'usdc'.
   */
  currency: string;

  /**
   * Breakdown of balance by source types.
   * Optional - when omitted, all funds are from the default source type (wallet).
   */
  source_types?: BalanceSourceTypes;
}

// ─────────────────────────────────────────────────────────────────────────────
// Balance Object
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The Balance object represents the current balance of an account.
 *
 * Note: Stripe's Balance object doesn't have `id`, `account`, or `created` fields.
 * These are Zoneless extensions for internal storage and are marked as such.
 */
export interface Balance {
  /**
   * Unique identifier for the balance record.
   * @zoneless_extension - Not in Stripe API, used for internal storage.
   */
  id: string;

  /** String representing the object's type. Always "balance". */
  object: 'balance';

  /**
   * The account ID this balance belongs to.
   * @zoneless_extension - Not in Stripe API, used for internal storage.
   */
  account: string;

  /**
   * Has the value `true` if the object exists in live mode or the value
   * `false` if the object exists in test mode.
   */
  livemode: boolean;

  /**
   * Available funds that you can transfer or pay out.
   * You can find the available balance for each currency in this array.
   */
  available: BalanceAmount[];

  /**
   * Funds that aren't available in the balance yet.
   * You can find the pending balance for each currency in this array.
   */
  pending: BalanceAmount[];

  /**
   * The platform account that owns this resource.
   * For connected account resources, this is the platform's account ID.
   * For platform's own resources, this equals the account field (self-referential).
   * @zoneless_extension
   */
  platform_account: string;
}
