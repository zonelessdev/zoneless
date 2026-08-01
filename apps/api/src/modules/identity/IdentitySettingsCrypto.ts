/**
 * @fileOverview Encrypt / redact helpers for platform identity provider secrets.
 *
 * Didit api_key and webhook_secret are write-only: encrypted at rest with
 * AES-256 (Encryption + GetEncryptionKey) and redacted on Account retrieve.
 *
 * @module IdentitySettingsCrypto
 */

import {
  AccountIdentityDiditSettings,
  AccountIdentitySettings,
  AccountSettings,
  Account as AccountType,
} from '@zoneless/shared-types';
import { Encryption } from '../Encryption';
import { GetEncryptionKey } from '../AppConfig';

const SECRET_KEYS = ['api_key', 'webhook_secret'] as const;

function GetEncryptor(): Encryption {
  const encryption = new Encryption();
  encryption.secretKey = GetEncryptionKey();
  return encryption;
}

/**
 * True when a stored value looks like `iv:ciphertext` hex pairs from EncryptString.
 */
export function IsEncryptedSecret(value: string | null | undefined): boolean {
  if (!value || typeof value !== 'string') return false;
  const parts = value.split(':');
  if (parts.length !== 2) return false;
  return /^[0-9a-f]+$/i.test(parts[0]) && /^[0-9a-f]+$/i.test(parts[1]);
}

/**
 * Encrypt plaintext Didit secrets in identity settings before persistence.
 * Leaves already-encrypted values and non-secret fields untouched.
 */
export function EncryptIdentitySettings(
  identity: AccountIdentitySettings | null | undefined
): AccountIdentitySettings | null | undefined {
  if (!identity?.didit) {
    return identity;
  }

  const encryption = GetEncryptor();
  const didit: AccountIdentityDiditSettings = { ...identity.didit };

  for (const key of SECRET_KEYS) {
    const value = didit[key];
    if (
      typeof value === 'string' &&
      value.length > 0 &&
      !IsEncryptedSecret(value)
    ) {
      didit[key] = encryption.EncryptString(value);
    }
  }

  // Response-only flags must not be persisted
  delete didit.api_key_set;
  delete didit.webhook_secret_set;

  return { ...identity, didit };
}

/**
 * Decrypt a Didit secret for provider use. Returns null when unset.
 */
export function DecryptIdentitySecret(
  value: string | null | undefined
): string | null {
  if (!value) return null;
  if (!IsEncryptedSecret(value)) {
    // Allow plaintext during tests / migration
    return value;
  }
  return GetEncryptor().DecryptString(value);
}

/**
 * Redact write-only Didit secrets on Account API responses.
 * Replaces stored (encrypted) secrets with null and sets *_set flags.
 */
export function RedactIdentitySettings(
  settings: AccountSettings | null | undefined
): AccountSettings | null | undefined {
  if (!settings?.identity?.didit) {
    return settings;
  }

  const didit = { ...settings.identity.didit };
  const apiKeySet = !!(didit.api_key && didit.api_key.length > 0);
  const webhookSecretSet = !!(
    didit.webhook_secret && didit.webhook_secret.length > 0
  );

  didit.api_key = null;
  didit.webhook_secret = null;
  didit.api_key_set = apiKeySet;
  didit.webhook_secret_set = webhookSecretSet;

  return {
    ...settings,
    identity: {
      ...settings.identity,
      didit,
    },
  };
}

/**
 * Return a shallow-cloned account with identity secrets redacted for API output.
 */
export function RedactAccountIdentitySecrets(
  account: AccountType
): AccountType {
  if (!account.settings?.identity?.didit) {
    return account;
  }

  return {
    ...account,
    settings: RedactIdentitySettings(account.settings) ?? account.settings,
  };
}
