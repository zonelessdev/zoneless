/**
 * @fileOverview Application Infrastructure Configuration
 *
 * Static configuration from environment variables (.env).
 * These are deployment-specific settings that don't change at runtime.
 *
 * Secrets are managed via a single APP_SECRET which can be set via env var
 * or auto-generated and stored in the database. Purpose-specific keys
 * (JWT signing, encryption) are derived from this via the Encryption module.
 *
 * Usage:
 *   const { port, mongodbUri } = GetAppConfig();
 *
 * For derived keys:
 *   import { GetJwtSecret, GetEncryptionKey } from './AppConfig';
 *
 * For platform-specific configuration, use the Account and ExternalWallet modules.
 *
 * @module AppConfig
 */

import * as dotenv from 'dotenv';
import * as path from 'path';
import { randomBytes } from 'crypto';
import { AppConfig, AppSecrets } from '@zoneless/shared-types';
import { DeriveKey } from './Encryption';

// Load environment variables first
dotenv.config({ path: path.join(__dirname, '../../../../.env') });

// Re-export for convenience
export { AppConfig, AppSecrets };

// Singleton config instance
let config: AppConfig | null = null;

// Cached derived keys
let cachedJwtSecret: string | null = null;
let cachedEncryptionKey: string | null = null;

// Collection name for app secrets
const SECRETS_COLLECTION = 'AppSecrets';
const SECRETS_ID = 'app_secrets';

// Key derivation info parameters
const HKDF_JWT_INFO = 'jwt-signing-key';
const HKDF_ENCRYPTION_INFO = 'encryption-key';

/**
 * Generate a cryptographically secure random hex string.
 */
function GenerateSecureHex(bytes: number): string {
  return randomBytes(bytes).toString('hex');
}

/**
 * Build the base config from environment variables.
 * appSecret will be empty until InitializeAppConfig is called (if not in env).
 */
function BuildConfigFromEnv(): AppConfig {
  return {
    mongodbUri:
      process.env.MONGODB_URI ||
      'mongodb://localhost:27017/zoneless?replicaSet=rs0',
    dashboardUrl:
      process.env.DASHBOARD_URL ||
      `http://localhost:${process.env.DASHBOARD_PORT || '80'}`,
    appSecret: process.env.APP_SECRET || '',
    livemode: process.env.LIVEMODE === 'true',
  };
}

/**
 * Check if the instance is in single-tenant mode.
 * When SINGLE_TENANT=true, only one platform can be created.
 * This is useful for self-hosted deployments.
 */
export function IsSingleTenantMode(): boolean {
  return process.env.SINGLE_TENANT !== 'false';
}

/**
 * Get application infrastructure configuration.
 * Before InitializeAppConfig() is called, appSecret may be empty.
 * After InitializeAppConfig(), appSecret is guaranteed to be set.
 *
 * @example
 * const { port, mongodbUri } = GetAppConfig();
 */
export function GetAppConfig(): AppConfig {
  if (!config) {
    config = BuildConfigFromEnv();
  }
  return config;
}

/**
 * Get the JWT signing secret (derived from appSecret via HKDF).
 * Throws if app secret has not been initialized.
 */
export function GetJwtSecret(): string {
  if (!cachedJwtSecret) {
    const { appSecret } = GetAppConfig();
    if (!appSecret) {
      throw new Error(
        'App secret not initialized. Call InitializeAppConfig() first.'
      );
    }
    cachedJwtSecret = DeriveKey(appSecret, HKDF_JWT_INFO, 64); // 512 bits
  }
  return cachedJwtSecret;
}

/**
 * Get the encryption key (derived from appSecret via HKDF).
 * Throws if app secret has not been initialized.
 */
export function GetEncryptionKey(): string {
  if (!cachedEncryptionKey) {
    const { appSecret } = GetAppConfig();
    if (!appSecret) {
      throw new Error(
        'App secret not initialized. Call InitializeAppConfig() first.'
      );
    }
    cachedEncryptionKey = DeriveKey(appSecret, HKDF_ENCRYPTION_INFO, 32); // 256 bits
  }
  return cachedEncryptionKey;
}

/**
 * Initialize app secret from env or database.
 * Must be called once at startup after Database is connected.
 *
 * If APP_SECRET is not in env, loads from DB or auto-generates.
 *
 * @param db - Database instance with Get/Set methods
 */
export async function InitializeAppConfig(db: {
  Get: <T>(collection: string, id: string) => Promise<T | null>;
  Set: <T>(
    collection: string,
    id: string,
    doc: Partial<T>
  ) => Promise<T | null>;
}): Promise<AppConfig> {
  // Ensure config is initialized
  const currentConfig = GetAppConfig();

  // If already has appSecret (from env), we're done
  if (currentConfig.appSecret) {
    return currentConfig;
  }

  // Load or generate from database
  let secrets = await db.Get<AppSecrets>(SECRETS_COLLECTION, SECRETS_ID);

  if (!secrets) {
    // Generate new master secret (512 bits = 64 bytes)
    secrets = {
      id: SECRETS_ID,
      object: 'app_secrets',
      app_secret: GenerateSecureHex(64),
      created: Math.floor(Date.now() / 1000),
    };
    await db.Set<AppSecrets>(SECRETS_COLLECTION, SECRETS_ID, secrets);
  }

  currentConfig.appSecret = secrets.app_secret;
  return currentConfig;
}

/**
 * Check if app config has been initialized with a secret.
 */
export function IsAppConfigInitialized(): boolean {
  return config !== null && !!config.appSecret;
}
