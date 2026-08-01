/**
 * @fileOverview Resolve a configured identity verification provider from platform settings.
 *
 * @module ResolveIdentityProvider
 */

import { Account as AccountType } from '@zoneless/shared-types';
import { AppError } from '../../utils/AppError';
import { DecryptIdentitySecret } from './IdentitySettingsCrypto';
import { diditProvider } from './DiditProvider';
import { IdentityVerificationProvider } from './IdentityVerificationProvider';

export interface ResolvedIdentityProvider {
  provider: IdentityVerificationProvider;
  apiKey: string;
  workflowId: string;
  webhookSecret: string | null;
}

/**
 * Resolve BYO Didit credentials from a platform account's settings.identity.
 */
export function ResolveIdentityProvider(
  platformAccount: AccountType
): ResolvedIdentityProvider {
  const identity = platformAccount.settings?.identity;
  const providerName = identity?.provider ?? 'didit';

  if (providerName !== 'didit') {
    throw new AppError(
      `Unsupported identity provider: ${providerName}`,
      400,
      'invalid_request_error'
    );
  }

  const apiKey = DecryptIdentitySecret(identity?.didit?.api_key);
  const workflowId = identity?.didit?.workflow_id?.trim() || null;
  const webhookSecret = DecryptIdentitySecret(identity?.didit?.webhook_secret);

  if (!apiKey || !workflowId) {
    throw new AppError(
      'Identity verification is not configured. Set settings.identity.didit.api_key and workflow_id on the platform account.',
      400,
      'invalid_request_error'
    );
  }

  return {
    provider: diditProvider,
    apiKey,
    workflowId,
    webhookSecret,
  };
}
