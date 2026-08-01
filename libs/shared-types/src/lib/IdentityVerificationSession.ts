/**
 * Stripe-compatible Identity VerificationSession object.
 * @see https://docs.stripe.com/api/identity/verification_sessions/object
 */

export type IdentityVerificationSessionType =
  | 'document'
  | 'id_number'
  | 'address'
  | 'verification_flow';

export type IdentityVerificationSessionStatus =
  | 'requires_input'
  | 'processing'
  | 'verified'
  | 'canceled'
  | 'requires_action';

export interface IdentityVerificationSessionLastError {
  /** A short machine-readable code */
  code: string | null;
  /** A human-readable message */
  reason: string | null;
}

export interface IdentityVerificationSessionProvidedDetails {
  email?: string | null;
  phone?: string | null;
}

export interface IdentityVerificationSessionOptions {
  document?: {
    require_live_capture?: boolean;
    require_matching_selfie?: boolean;
    allowed_types?: Array<'driving_license' | 'id_card' | 'passport'>;
  };
}

export interface IdentityVerificationSessionRedaction {
  status: 'processing' | 'redacted';
}

/**
 * Identity VerificationSession — tracks a KYC check from create through result.
 * The `url` field is the provider-hosted verification link (e.g. Didit).
 */
export interface IdentityVerificationSession {
  /** Unique identifier (e.g. "vs_z...") */
  id: string;

  /** Always "identity.verification_session" */
  object: 'identity.verification_session';

  /** Client secret for modal/SDK flows; may be null for redirect-only */
  client_secret: string | null;

  /** Unix timestamp when the session was created */
  created: number;

  /** Most recent error, if any */
  last_error: IdentityVerificationSessionLastError | null;

  /** ID of the last verification report, if any */
  last_verification_report: string | null;

  /** Whether the object exists in live mode */
  livemode: boolean;

  /** Key-value pairs for storing additional information */
  metadata: Record<string, string>;

  /** Verification options */
  options: IdentityVerificationSessionOptions | null;

  /** Details collected before verification starts */
  provided_details: IdentityVerificationSessionProvidedDetails | null;

  /** Redaction status, if redacted */
  redaction: IdentityVerificationSessionRedaction | null;

  /** Current status of the verification */
  status: IdentityVerificationSessionStatus;

  /** Type of verification check */
  type: IdentityVerificationSessionType;

  /**
   * Short-lived URL to redirect the user to the hosted verification flow.
   * For Didit this is the Didit session URL.
   */
  url: string | null;

  /**
   * Connected account this session verifies.
   * @zoneless_extension
   */
  related_account: string;

  /**
   * Person on the connected account this session verifies.
   * @zoneless_extension
   */
  related_person: string;

  /**
   * Platform that owns this session.
   * @zoneless_extension
   */
  platform_account: string;

  /**
   * Identity provider that fulfills this session.
   * @zoneless_extension
   */
  provider: 'didit';

  /**
   * Provider's session ID (e.g. Didit session_id).
   * Used for webhook correlation; not part of Stripe's public shape.
   * @zoneless_extension
   */
  provider_session_id: string;
}
