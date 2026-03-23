export interface ExternalWallet {
  /** Unique identifier for the object */
  id: string;
  /** String representing the object's type. Objects of the same type share the same value. */
  object: 'wallet';
  /** The account this wallet belongs to */
  account: string | null;
  /** The name of the person or business that owns the wallet */
  account_holder_name: string | null;
  /** The type of entity that holds the account. Can be `individual` or `company` */
  account_holder_type: 'individual' | 'company' | null;
  /** A set of available payout methods for this wallet. Only values from this set should be passed as the method when creating a payout */
  available_payout_methods: ('instant' | 'standard')[] | null;
  /** Time at which the object was created. Measured in seconds since the Unix epoch */
  created: number;
  /** Two-letter ISO code representing the country the wallet holder is in */
  country: string;
  /** Three-letter ISO code for the currency (e.g., 'usdc') */
  currency: string;
  /** The ID of the customer that the wallet is associated with (if applicable) */
  customer: string | null;
  /** Whether this wallet is the default external account for its currency */
  default_for_currency: boolean | null;
  /** Uniquely identifies this particular wallet. You can use this attribute to check whether two wallets are the same */
  fingerprint: string | null;
  /** Information about upcoming new requirements for the wallet */
  future_requirements: ExternalWalletRequirements | null;
  /** The last four characters of the wallet address */
  last4: string;
  /** Set of key-value pairs that you can attach to an object */
  metadata: Record<string, string> | null;
  /** The blockchain network this wallet is on (e.g., 'solana') */
  network: string;
  /** Information about the requirements for the wallet */
  requirements: ExternalWalletRequirements | null;
  /** The status of the wallet */
  status: ExternalWalletStatus;
  /** The full wallet address */
  wallet_address: string;

  /**
   * The platform account that owns this resource.
   * For connected account resources, this is the platform's account ID.
   * For platform's own resources, this equals the account field (self-referential).
   * @zoneless_extension
   */
  platform_account: string;
}

export interface ExternalWalletRequirements {
  currently_due: string[] | null;
  errors: ExternalWalletRequirementError[] | null;
  past_due: string[] | null;
  pending_verification: string[] | null;
}

export interface ExternalWalletRequirementError {
  code: string;
  reason: string;
  requirement: string;
}

export type ExternalWalletStatus =
  | 'new'
  | 'validated'
  | 'verified'
  | 'verification_failed'
  | 'errored'
  | 'archived';
