/**
 * @fileOverview Didit identity verification provider adapter.
 *
 * Creates Didit hosted verification sessions and verifies inbound webhooks
 * using X-Signature-V2 (canonical JSON HMAC) with X-Signature-Simple fallback.
 *
 * @see https://docs.didit.me/sessions-api/create-session
 * @see https://docs.didit.me/integration/webhooks
 *
 * @module DiditProvider
 */

import { createHmac, timingSafeEqual } from 'crypto';
import {
  IdentityVerificationSessionStatus,
  IdentityVerificationSessionType,
} from '@zoneless/shared-types';
import { AppError } from '../../utils/AppError';
import { Logger } from '../../utils/Logger';
import {
  IdentityVerificationProvider,
  ProviderCreateSessionInput,
  ProviderDecision,
  ProviderSession,
  ProviderWebhookHeaders,
} from './IdentityVerificationProvider';

const DIDIT_API_BASE = 'https://verification.didit.me/v3';
const WEBHOOK_TOLERANCE_SECONDS = 300;

export class DiditProvider implements IdentityVerificationProvider {
  readonly name = 'didit' as const;

  DefaultSessionType(): IdentityVerificationSessionType {
    return 'document';
  }

  async CreateSession(
    apiKey: string,
    input: ProviderCreateSessionInput
  ): Promise<ProviderSession> {
    const body: Record<string, unknown> = {
      workflow_id: input.workflowId,
      vendor_data: input.vendorData,
    };

    if (input.callbackUrl) {
      body.callback = input.callbackUrl;
    }
    if (input.metadata && Object.keys(input.metadata).length > 0) {
      body.metadata = input.metadata;
    }

    const response = await fetch(`${DIDIT_API_BASE}/session/`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const text = await response.text();
      Logger.error('Didit CreateSession failed', undefined, {
        status: response.status,
        body: text.slice(0, 500),
      });
      throw new AppError(
        `Failed to create identity verification session with Didit (${
          response.status
        }): ${text.slice(0, 300) || response.statusText}`,
        502,
        'api_error'
      );
    }

    const data = (await response.json()) as {
      session_id?: string;
      session_token?: string;
      url?: string;
      status?: string;
    };

    if (!data.session_id || !data.url) {
      throw new AppError(
        'Didit returned an incomplete verification session',
        502,
        'api_error'
      );
    }

    return {
      providerSessionId: data.session_id,
      url: data.url,
      sessionToken: data.session_token ?? null,
      status: data.status ?? 'Not Started',
    };
  }

  async GetDecision(
    apiKey: string,
    providerSessionId: string
  ): Promise<ProviderDecision> {
    const response = await fetch(
      `${DIDIT_API_BASE}/session/${encodeURIComponent(
        providerSessionId
      )}/decision/`,
      {
        method: 'GET',
        headers: { 'x-api-key': apiKey },
      }
    );

    if (!response.ok) {
      const text = await response.text();
      Logger.error('Didit GetDecision failed', undefined, {
        status: response.status,
        body: text.slice(0, 500),
      });
      throw new AppError(
        `Failed to retrieve identity verification decision from Didit (${
          response.status
        }): ${text.slice(0, 300) || response.statusText}`,
        502,
        'api_error'
      );
    }

    const data = (await response.json()) as {
      session_id?: string;
      status?: string;
      decision?: string;
    };

    return {
      providerSessionId: data.session_id ?? providerSessionId,
      status: data.status ?? 'Not Started',
      reason: null,
    };
  }

  VerifyWebhook(
    webhookSecret: string,
    body: Record<string, unknown>,
    headers: ProviderWebhookHeaders
  ): boolean {
    const timestamp = headers.timestamp;
    if (!timestamp) return false;

    const now = Math.floor(Date.now() / 1000);
    const ts = parseInt(timestamp, 10);
    if (
      !Number.isFinite(ts) ||
      Math.abs(now - ts) > WEBHOOK_TOLERANCE_SECONDS
    ) {
      return false;
    }

    if (
      headers.signatureV2 &&
      this.VerifySignatureV2(body, headers.signatureV2, webhookSecret)
    ) {
      return true;
    }

    if (
      headers.signatureSimple &&
      this.VerifySignatureSimple(body, headers.signatureSimple, webhookSecret)
    ) {
      return true;
    }

    return false;
  }

  MapStatus(providerStatus: string): IdentityVerificationSessionStatus {
    const normalized = providerStatus.trim().toLowerCase();
    switch (normalized) {
      case 'approved':
        return 'verified';
      case 'declined':
      case 'abandoned':
      case 'expired':
      case 'kyc expired':
        return 'requires_input';
      case 'in progress':
      case 'in review':
      case 'resubmitted':
      case 'awaiting user':
        return 'processing';
      case 'not started':
      default:
        return 'requires_input';
    }
  }

  private VerifySignatureV2(
    body: Record<string, unknown>,
    signatureHeader: string,
    secret: string
  ): boolean {
    const canonical = JSON.stringify(SortKeys(ShortenFloats(body)));
    const expected = createHmac('sha256', secret)
      .update(canonical, 'utf8')
      .digest('hex');
    return TimingSafeEqualHex(expected, signatureHeader);
  }

  private VerifySignatureSimple(
    body: Record<string, unknown>,
    signatureHeader: string,
    secret: string
  ): boolean {
    const canonical = [
      body.timestamp ?? '',
      body.session_id ?? '',
      body.status ?? '',
      body.webhook_type ?? '',
    ].join(':');
    const expected = createHmac('sha256', secret)
      .update(canonical)
      .digest('hex');
    return TimingSafeEqualHex(expected, signatureHeader);
  }
}

function TimingSafeEqualHex(expected: string, actual: string): boolean {
  const a = Buffer.from(expected, 'utf8');
  const b = Buffer.from(actual, 'utf8');
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/** Didit canonical JSON: recursively sort object keys. */
function SortKeys(obj: unknown): unknown {
  if (Array.isArray(obj)) {
    return obj.map(SortKeys);
  }
  if (obj !== null && typeof obj === 'object') {
    return Object.keys(obj as Record<string, unknown>)
      .sort()
      .reduce<Record<string, unknown>>((acc, key) => {
        acc[key] = SortKeys((obj as Record<string, unknown>)[key]);
        return acc;
      }, {});
  }
  return obj;
}

/**
 * Didit shortens floats that are whole numbers before signing.
 * Reproduce that so X-Signature-V2 verifies after JSON.parse.
 */
function ShortenFloats(obj: unknown): unknown {
  if (Array.isArray(obj)) {
    return obj.map(ShortenFloats);
  }
  if (obj !== null && typeof obj === 'object') {
    return Object.keys(obj as Record<string, unknown>).reduce<
      Record<string, unknown>
    >((acc, key) => {
      acc[key] = ShortenFloats((obj as Record<string, unknown>)[key]);
      return acc;
    }, {});
  }
  if (
    typeof obj === 'number' &&
    Number.isFinite(obj) &&
    Math.floor(obj) === obj
  ) {
    return obj;
  }
  return obj;
}

export const diditProvider = new DiditProvider();
