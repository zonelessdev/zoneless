/**
 * @fileOverview Pluggable identity verification provider interface.
 *
 * Self-hosters and managed platforms BYO credentials; Zoneless maps provider
 * sessions onto Stripe-shaped VerificationSessions. Didit is the first adapter.
 *
 * @module IdentityVerificationProvider
 */

import {
  IdentityVerificationSessionStatus,
  IdentityVerificationSessionType,
} from '@zoneless/shared-types';

export interface ProviderCreateSessionInput {
  /** Provider workflow / flow ID */
  workflowId: string;
  /** Opaque vendor data echoed by the provider (our vs_z id or related ids) */
  vendorData: string;
  /** Redirect URL after the user finishes */
  callbackUrl?: string;
  /** Optional pre-filled details */
  email?: string | null;
  phone?: string | null;
  metadata?: Record<string, string>;
}

export interface ProviderSession {
  providerSessionId: string;
  url: string;
  /** Provider session token, mapped to client_secret when available */
  sessionToken?: string | null;
  status: string;
}

export interface ProviderDecision {
  providerSessionId: string;
  status: string;
  /** Optional human-readable decline / error reason */
  reason?: string | null;
}

export interface ProviderWebhookHeaders {
  signatureV2?: string | null;
  signatureSimple?: string | null;
  timestamp?: string | null;
}

export interface IdentityVerificationProvider {
  readonly name: 'didit';

  CreateSession(
    apiKey: string,
    input: ProviderCreateSessionInput
  ): Promise<ProviderSession>;

  GetDecision(apiKey: string, providerSessionId: string): Promise<ProviderDecision>;

  /**
   * Verify an inbound webhook. Returns false when the signature is invalid.
   */
  VerifyWebhook(
    webhookSecret: string,
    body: Record<string, unknown>,
    headers: ProviderWebhookHeaders
  ): boolean;

  MapStatus(providerStatus: string): IdentityVerificationSessionStatus;

  /** Default session type for this provider */
  DefaultSessionType(): IdentityVerificationSessionType;
}
