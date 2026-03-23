import { Person } from './Person';
import { ExternalWallet } from './ExternalWallet';
import { LoginLink } from './LoginLink';

/**
 * Stripe-compatible Account object for Zoneless Connect.
 * @see https://docs.stripe.com/api/accounts/object
 */
export interface Account {
  /** Unique identifier for the object (e.g., "acct_z1234...") */
  id: string;

  /** String representing the object's type. Always "account" */
  object: 'account';

  /**
   * Business information about the account.
   */
  business_profile?: AccountBusinessProfile | null;

  /**
   * The business type.
   * Individual, company, non-profit, or government entity.
   */
  business_type?: AccountBusinessType | null;

  /**
   * A hash containing the set of capabilities that was requested for this account
   * and their associated states.
   */
  capabilities?: AccountCapabilities;

  /** Whether the account can accept charges/payments */
  charges_enabled: boolean;

  /**
   * Information about the controller of this account.
   */
  controller?: AccountController;

  /** The account's country (ISO 3166-1 alpha-2) */
  country: string;

  /** Unix timestamp in seconds when the account was created */
  created: number;

  /** Three-letter currency code, in lowercase (e.g., "usdc") */
  default_currency: string;

  /** Whether account details have been submitted */
  details_submitted: boolean;

  /** An email address associated with the account */
  email?: string | null;

  /**
   * External accounts (wallets) attached to this account.
   * Only returned for requests where controller.is_controller is true.
   */
  external_accounts?: AccountExternalAccounts;

  /**
   * Information about future requirements for the account.
   * Shows requirements that will be needed in the future.
   */
  future_requirements?: AccountFutureRequirements | null;

  /**
   * Information about the person represented by the account.
   * Only present when business_type is "individual".
   */
  individual?: Person | null;

  /**
   * Login links for the Express dashboard.
   * Only returned for Express accounts.
   */
  login_links?: AccountLoginLinks;

  /** Set of key-value pairs for storing additional information */
  metadata: Record<string, string>;

  /** Whether payouts can be sent to the external wallet */
  payouts_enabled: boolean;

  /**
   * Information about the requirements for the account.
   * Shows what information is needed to enable capabilities.
   */
  requirements?: AccountRequirements | null;

  /**
   * Account settings for various features.
   */
  settings?: AccountSettings | null;

  /** Details on the acceptance of the Terms of Service */
  tos_acceptance?: AccountTosAcceptance | null;

  /**
   * The Zoneless account type.
   * - express: Zoneless-hosted onboarding and dashboard
   * - custom: Platform handles onboarding, Zoneless handles payouts
   * - standard: Full dashboard access (rarely used)
   * - none: Created with controller attributes that don't map to a type
   */
  type?: AccountType;

  // ─────────────────────────────────────────────────────────────────────────────
  // Zoneless-specific extensions (not in Stripe API)
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * The platform account that owns this account.
   * For connected accounts, this is the platform's account ID.
   * For platform accounts, this is self-referential (equals the account's own id).
   * This enables multi-tenant operation where multiple platforms
   * can each have their own connected accounts.
   * @zoneless_extension
   */
  platform_account: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Account Type Enums
// ─────────────────────────────────────────────────────────────────────────────

export type AccountType = 'standard' | 'express' | 'custom' | 'none';

export type AccountBusinessType =
  | 'individual'
  | 'company'
  | 'non_profit'
  | 'government_entity';

// ─────────────────────────────────────────────────────────────────────────────
// Business Profile
// ─────────────────────────────────────────────────────────────────────────────

export interface AccountBusinessProfile {
  /**
   * The merchant category code for the account.
   * MCCs classify businesses by the type of goods or services they provide.
   */
  mcc?: string | null;

  /** The customer-facing business name */
  name?: string | null;

  /**
   * Internal-only description of the product sold or service provided.
   * Used for risk assessment and won't be shown to customers.
   */
  product_description?: string | null;

  /** A publicly available email for support */
  support_email?: string | null;

  /** A publicly available phone number for support */
  support_phone?: string | null;

  /** A publicly available website for the business */
  support_url?: string | null;

  /** The business's public-facing URL */
  url?: string | null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Capabilities
// ─────────────────────────────────────────────────────────────────────────────

export type CapabilityStatus = 'active' | 'inactive' | 'pending';

export interface AccountCapabilities {
  /** The status of the transfers capability */
  transfers?: CapabilityStatus;

  /**
   * The status of the USDC payouts capability.
   * @zoneless_extension - Stripe uses card_payments, we use usdc_payouts
   */
  usdc_payouts?: CapabilityStatus;
}

// ─────────────────────────────────────────────────────────────────────────────
// Controller
// ─────────────────────────────────────────────────────────────────────────────

export interface AccountController {
  /**
   * `true` if the Connect application retrieving the resource controls the account
   * and can therefore exercise platform controls. Otherwise, this field is null.
   */
  is_controller?: boolean;

  /**
   * The controller type. Can be `application` or `account`.
   * For Express accounts, this is typically `application`.
   */
  type?: 'application' | 'account';

  /**
   * A hash of configuration for who pays Zoneless fees for product usage on this account.
   */
  fees?: {
    /**
     * A value indicating the responsible payer of fees.
     * - account: The account is responsible for paying Zoneless fees
     * - application: The Connect application is responsible for Zoneless fees
     * - application_custom: The application is responsible for fees matching Custom account behavior
     * - application_express: The application is responsible for fees matching Express account behavior
     */
    payer:
      | 'account'
      | 'application'
      | 'application_custom'
      | 'application_express';
  };

  /**
   * A hash of configuration for products that have negative balance liability.
   */
  losses?: {
    /** A value indicating who is liable for losses */
    payments: 'application' | 'zoneless';
  };

  /**
   * A value indicating responsibility for collecting requirements on this account.
   * For Express, this is `zoneless`. For Custom, this is `application`.
   */
  requirement_collection?: 'application' | 'zoneless';

  /**
   * A hash of configuration for Zoneless-hosted dashboards.
   */
  zoneless_dashboard?: {
    /** Whether this account has access to the full Zoneless dashboard */
    type: 'express' | 'full' | 'none';
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Requirements
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Alternative fields that can be provided to resolve requirements.
 */
export interface AccountRequirementAlternative {
  /** Fields that can be provided to resolve all fields in original_fields_due */
  alternative_fields_due: string[];

  /** Fields that are due and can be resolved by providing all fields in alternative_fields_due */
  original_fields_due: string[];
}

export interface AccountRequirements {
  /**
   * Fields that are due and can be resolved by providing alternative fields instead.
   */
  alternatives?: AccountRequirementAlternative[];

  /**
   * Date by which the fields in `currently_due` must be collected to keep the account enabled.
   * Unix timestamp in seconds.
   */
  current_deadline?: number | null;

  /**
   * Fields that are required and currently missing.
   * These must be provided before charges can be processed.
   */
  currently_due?: string[];

  /**
   * If the account is disabled, this explains why.
   */
  disabled_reason?: string | null;

  /**
   * Fields that are currently errored and require user intervention.
   */
  errors?: AccountRequirementError[];

  /**
   * Fields that need to be collected assuming all volume thresholds are reached.
   */
  eventually_due?: string[];

  /**
   * Fields that weren't collected yet but are required before the deadline.
   * These fields need to be collected to keep the capability enabled.
   */
  past_due?: string[];

  /**
   * Fields that might become required depending on the results of verification.
   * Will be an empty array unless a verification check fails.
   */
  pending_verification?: string[];
}

export interface AccountRequirementError {
  /** The code for the type of error */
  code: string;

  /** An informative message that indicates the error type and provides additional details */
  reason: string;

  /** The specific field that caused the error */
  requirement: string;
}

export interface AccountFutureRequirements {
  /**
   * Fields that are due and can be resolved by providing alternative fields instead.
   */
  alternatives?: AccountRequirementAlternative[];

  /**
   * This is set when there's a deadline for collecting requirements.
   * Unix timestamp in seconds.
   */
  current_deadline?: number | null;

  /**
   * Fields that are required and must be collected by the specified date.
   */
  currently_due?: string[];

  /**
   * If the capability is disabled, this explains why.
   */
  disabled_reason?: string | null;

  /**
   * Fields that are errored and require user intervention.
   */
  errors?: AccountRequirementError[];

  /**
   * Fields that need to be collected assuming all volume thresholds are reached.
   */
  eventually_due?: string[];

  /**
   * Fields that weren't collected by the deadline.
   */
  past_due?: string[];

  /**
   * Fields that might become required depending on verification results.
   */
  pending_verification?: string[];
}

// ─────────────────────────────────────────────────────────────────────────────
// Settings
// ─────────────────────────────────────────────────────────────────────────────

export interface AccountSettings {
  /**
   * Settings related to the account's branding.
   */
  branding?: AccountBrandingSettings;

  /**
   * Settings used to configure the account within the Zoneless dashboard.
   */
  dashboard?: AccountDashboardSettings;

  /**
   * Settings specific to the account's payouts.
   */
  payouts?: AccountPayoutSettings;

  /**
   * URL to the platform's Terms of Service page.
   * Only applicable for platform accounts.
   * @zoneless_extension
   */
  terms_url?: string | null;

  /**
   * URL to the platform's Privacy Policy page.
   * Only applicable for platform accounts.
   * @zoneless_extension
   */
  privacy_url?: string | null;
}

export interface AccountBrandingSettings {
  /** An icon for the account (file upload ID or URL) */
  icon?: string | null;

  /** A logo for the account (file upload ID or URL) */
  logo?: string | null;

  /** A CSS hex color value for the primary branding color */
  primary_color?: string | null;

  /** A CSS hex color value for the secondary branding color */
  secondary_color?: string | null;
}

export interface AccountDashboardSettings {
  /**
   * The display name for this account.
   * This is used on the Zoneless Dashboard to differentiate between accounts.
   */
  display_name?: string | null;

  /**
   * The timezone used in the Zoneless Dashboard for this account.
   * A list of possible time zone values is maintained at the IANA Time Zone Database.
   */
  timezone?: string | null;
}

export interface AccountPayoutSettings {
  /**
   * A Boolean indicating if Zoneless should attempt to reclaim negative balances
   * from an attached wallet.
   */
  debit_negative_balances?: boolean;

  /**
   * Details on when funds from charges are available.
   */
  schedule?: AccountPayoutSchedule;

  /**
   * The text that appears on the bank statement for payouts.
   */
  statement_descriptor?: string | null;
}

export interface AccountPayoutSchedule {
  /**
   * The number of days charges for the account are held before being paid out.
   */
  delay_days?: number | 'minimum';

  /**
   * How frequently available funds are paid out.
   * Can be `daily`, `weekly`, `monthly`, or `manual`.
   */
  interval?: 'daily' | 'weekly' | 'monthly' | 'manual';

  /**
   * The day of the month funds are paid out.
   * Only shown if `interval` is monthly. Ranges from 1-31.
   */
  monthly_anchor?: number;

  /**
   * The day of the week funds are paid out.
   * Only shown if `interval` is weekly.
   */
  weekly_anchor?:
    | 'monday'
    | 'tuesday'
    | 'wednesday'
    | 'thursday'
    | 'friday'
    | 'saturday'
    | 'sunday';
}

// ─────────────────────────────────────────────────────────────────────────────
// External Accounts (Wallets)
// ─────────────────────────────────────────────────────────────────────────────

export interface AccountExternalAccounts {
  /** String representing the object's type. Always "list" */
  object: 'list';

  /** The list of external accounts (wallets) */
  data: ExternalWallet[];

  /** True if there are more external accounts than returned */
  has_more: boolean;

  /** The total count of external accounts */
  total_count: number;

  /** The URL where this list can be accessed */
  url: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Login Links
// ─────────────────────────────────────────────────────────────────────────────

export interface AccountLoginLinks {
  /** String representing the object's type. Always "list" */
  object: 'list';

  /** The list of login links */
  data: LoginLink[];

  /** True if there are more login links than returned */
  has_more: boolean;

  /** The total count of login links */
  total_count: number;

  /** The URL where this list can be accessed */
  url: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// TOS Acceptance
// ─────────────────────────────────────────────────────────────────────────────

export interface AccountTosAcceptance {
  /** Unix timestamp in seconds when TOS was accepted */
  date?: number | null;

  /** The IP address from which the TOS was accepted */
  ip?: string | null;

  /**
   * The user's service agreement type. Either `full` or `recipient`.
   * Express accounts must accept the full agreement.
   */
  service_agreement?: 'full' | 'recipient' | null;

  /** The user agent of the browser from which the TOS was accepted */
  user_agent?: string | null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Delete Response
// ─────────────────────────────────────────────────────────────────────────────

export interface AccountDeletedResponse {
  id: string;
  object: 'account';
  deleted: true;
}
