/**
 * Setup routes for platform account creation and management.
 *
 * In multi-tenant mode, multiple platforms can be created independently.
 * The /v1/setup endpoint creates a new platform account with wallet.
 */

import * as express from 'express';
import { SetupRequest, SetupResponse } from '@zoneless/shared-types';
import { AsyncHandler } from '../utils/AsyncHandler';
import { AppError } from '../utils/AppError';
import { ERRORS } from '../utils/Errors';
import { Logger } from '../utils/Logger';
import { db } from '../modules/Database';
import { SetupModule } from '../modules/Setup';
import { AccountModule } from '../modules/Account';
import { IsSingleTenantMode } from '../modules/AppConfig';

const router = express.Router();
const setupModule = new SetupModule(db);
const accountModule = new AccountModule(db);

/**
 * GET /v1/setup/status
 * Check the setup status.
 *
 * Behavior depends on tenant mode and authentication:
 * - Single-tenant with existing platform: needs_setup: false
 * - Single-tenant without platform: needs_setup: true
 * - Multi-tenant without auth: needs_setup: true
 * - Multi-tenant with platform auth: needs_setup: false
 * - Multi-tenant with connected account auth: is_connected_account: true
 *
 * This endpoint is public to allow the setup page to load.
 */
router.get(
  '/status',
  AsyncHandler(async (req: express.Request, res: express.Response) => {
    const singleTenant = IsSingleTenantMode();

    // In single-tenant mode, check if a platform already exists
    if (singleTenant) {
      const platformAccounts = await accountModule.GetPlatformAccounts();
      if (platformAccounts.length > 0) {
        // Platform already exists - no more setup allowed
        res.json({
          object: 'setup_status',
          needs_setup: false,
          has_wallet: true,
        });
        return;
      }
      // No platform yet - setup is available
      res.json({
        object: 'setup_status',
        needs_setup: true,
        has_wallet: false,
      });
      return;
    }

    // Multi-tenant mode: check auth to determine response
    const authHeader =
      (req.headers['x-api-key'] as string) ||
      (req.headers['authorization'] as string);

    if (!authHeader) {
      // No auth - setup is available for creating new platforms
      res.json({
        object: 'setup_status',
        needs_setup: true,
        has_wallet: false,
      });
      return;
    }

    // Try to validate the auth and get account info
    try {
      const { ApiKeyModule } = await import('../modules/ApiKey');
      const { VerifyToken } = await import('../utils/Token');
      const { GetJwtSecret } = await import('../modules/AppConfig');

      const apiKeyModule = new ApiKeyModule(db);
      let accountId: string | null = null;

      if (authHeader.startsWith('Bearer ')) {
        const decoded = VerifyToken(authHeader.slice(7), GetJwtSecret()) as {
          account_id: string;
        };
        accountId = decoded.account_id;
      } else {
        const apiKey = await apiKeyModule.GetApiKeyByToken(authHeader);
        if (apiKey?.status === 'active') {
          accountId = apiKey.account;
        }
      }

      if (accountId) {
        const status = await setupModule.GetSetupStatus(accountId);

        // Connected accounts should not access setup - they're already onboarded
        if (!status.is_platform) {
          res.json({
            object: 'setup_status',
            needs_setup: false,
            has_wallet: false,
            is_connected_account: true,
          });
          return;
        }

        // Platform accounts - setup not needed, they're already platforms
        res.json({
          object: 'setup_status',
          needs_setup: false,
          has_wallet: status.has_wallet,
          is_connected_account: false,
        });
        return;
      }
    } catch {
      // Auth failed, return default status
    }

    // Auth failed or invalid - setup is available
    res.json({
      object: 'setup_status',
      needs_setup: true,
      has_wallet: false,
    });
  })
);

/**
 * POST /v1/setup
 * Create a new platform account.
 * This creates a complete platform with:
 * - Account with standard type (full dashboard access)
 * - Person record
 * - Balance
 * - ExternalWallet for Solana operations (public key only)
 * - API key
 *
 * No authentication required - this is the entry point for new platforms.
 * Wallet generation happens in the browser - only the public key is sent.
 *
 * In single-tenant mode (SINGLE_TENANT=true), only one platform can be created.
 */
router.post(
  '/',
  AsyncHandler(async (req: express.Request, res: express.Response) => {
    // In single-tenant mode, check if a platform already exists
    if (IsSingleTenantMode()) {
      const platformAccounts = await accountModule.GetPlatformAccounts();
      if (platformAccounts.length > 0) {
        throw new AppError(
          'This instance is configured for single-tenant mode and a platform already exists.',
          403,
          'single_tenant_limit'
        );
      }
    }

    // Validate request body
    const body = req.body as SetupRequest;

    if (!body.platform_name || body.platform_name.trim().length === 0) {
      throw new AppError(
        'platform_name is required',
        ERRORS.VALIDATION_ERROR.status,
        ERRORS.VALIDATION_ERROR.type
      );
    }

    // Validate wallet public key format (base58 Solana address)
    const walletKey = body.solana_public_key?.trim();
    const solanaBase58Regex = /^[1-9A-HJ-NP-Za-km-z]+$/;
    if (
      !walletKey ||
      walletKey.length < 32 ||
      walletKey.length > 44 ||
      !solanaBase58Regex.test(walletKey)
    ) {
      throw new AppError(
        'solana_public_key must be a valid Solana address (32-44 base58 characters)',
        ERRORS.VALIDATION_ERROR.status,
        ERRORS.VALIDATION_ERROR.type
      );
    }

    Logger.info('Creating new platform account', {
      platformName: body.platform_name,
      singleTenant: IsSingleTenantMode(),
    });

    // Create the platform account
    const response: SetupResponse = await setupModule.CreatePlatformAccount(
      body
    );

    // Log important info (API key is only shown once)
    console.log('');
    console.log(
      '╔════════════════════════════════════════════════════════════════╗'
    );
    console.log(
      '║             🚀 ZONELESS PLATFORM CREATED 🚀                    ║'
    );
    console.log(
      '╠════════════════════════════════════════════════════════════════╣'
    );
    console.log(`║  Platform Name: ${body.platform_name.padEnd(45)}║`);
    console.log(`║  Account ID: ${response.platform_account_id.padEnd(48)}║`);
    console.log(
      `║  Solana Wallet: ${response.solana_public_key
        .substring(0, 44)
        .padEnd(45)}║`
    );
    console.log(
      '╠════════════════════════════════════════════════════════════════╣'
    );
    console.log(
      '║  ⚠️  API Key shown in response - save it securely!             ║'
    );
    console.log(
      '╚════════════════════════════════════════════════════════════════╝'
    );
    console.log('');

    Logger.info('Platform account created successfully', {
      platformAccountId: response.platform_account_id,
    });

    res.status(201).json(response);
  })
);

export default router;
