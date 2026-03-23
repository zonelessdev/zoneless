/**
 * Stripe-compatible AccountLink API response object for Zoneless Connect.
 *
 * Account Links are the means by which a Connect platform grants a connected
 * account permission to access Zoneless-hosted applications, such as Connect Onboarding.
 *
 * This represents the response returned from POST /v1/account_links.
 * The response is minimal - only the essential fields needed to redirect the user.
 *
 * @see https://docs.stripe.com/api/account_links/object
 */
export interface AccountLink {
  /** String representing the object's type. Always "account_link" */
  object: 'account_link';

  /** Unix timestamp in seconds when the link was created */
  created: number;

  /** Unix timestamp in seconds when the link expires */
  expires_at: number;

  /** The URL for the account link - redirect user here for onboarding */
  url: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Supporting Types
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The type of account link being created.
 */
export type AccountLinkType = 'account_onboarding' | 'account_update';

/**
 * Internal storage record for AccountLink.
 *
 * This extends the API response with additional fields needed for
 * internal processing (token validation, tracking consumption, etc.).
 * These fields are NOT returned in the API response.
 *
 * @internal
 */
export interface AccountLinkRecord extends AccountLink {
  /** Internal unique identifier for storage */
  id: string;

  /** Token used to authenticate the link (embedded in URL) */
  token: string;

  /** The account this link was created for */
  account: string;

  /** The type of account link */
  type: AccountLinkType;

  /** URL to redirect to if link is expired or invalid */
  refresh_url: string;

  /** URL to redirect to when user completes or leaves the flow */
  return_url: string;

  /** Whether this link has been used */
  consumed: boolean;

  /** Unix timestamp in seconds when the link was consumed */
  consumed_at?: number;
}
