/**
 * Stripe-compatible LoginLink API response object for Zoneless Connect.
 *
 * Login Links are single-use URLs that take an Express account to the login page
 * for their Zoneless dashboard. A Login Link differs from an Account Link in that
 * it takes the user directly to their Express dashboard for the specified account.
 *
 * This represents the response returned from POST /v1/accounts/:id/login_links.
 * The response is minimal - only the essential fields needed to redirect the user.
 *
 * @see https://docs.stripe.com/api/accounts/login_link
 */
export interface LoginLink {
  /** String representing the object's type. Always "login_link" */
  object: 'login_link';

  /** Time at which the object was created. Measured in seconds since the Unix epoch */
  created: number;

  /** The URL for the login link - redirect user here for dashboard access */
  url: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Supporting Types
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Internal storage record for LoginLink.
 *
 * This extends the API response with additional fields needed for
 * internal processing (token validation, tracking consumption, expiration, etc.).
 * These fields are NOT returned in the API response.
 *
 * @internal
 */
export interface LoginLinkRecord extends LoginLink {
  /** Token used to authenticate the link (embedded in URL) */
  token: string;

  /** The account this link was created for */
  account: string;

  /** The platform name for display purposes */
  platform_name: string;

  /** Unix timestamp in seconds when the link expires */
  expires_at: number;

  /** Whether this link has been used */
  consumed: boolean;

  /** Unix timestamp in seconds when the link was consumed */
  consumed_at?: number;
}
