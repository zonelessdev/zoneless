/**
 * Config routes for platform configuration and deposit information.
 *
 * In multi-tenant mode:
 * - /v1/config returns platform info based on context (token or auth)
 * - /v1/config/deposit-info returns the authenticated platform's wallet
 */

import * as express from 'express';
import { PublicConfig, DepositInfo, Account } from '@zoneless/shared-types';
import { db } from '../modules/Database';
import { AccountModule } from '../modules/Account';
import { AccountLinkModule } from '../modules/AccountLink';
import { ExternalWalletModule } from '../modules/ExternalWallet';
import { ApiKeyModule } from '../modules/ApiKey';
import { GetPlatformAccountId } from '../modules/PlatformAccess';
import { ValidateApiKey } from '../middleware/AuthMiddleware';
import { RequirePlatform } from '../middleware/Authorization';
import { AsyncHandler } from '../utils/AsyncHandler';
import { AppError } from '../utils/AppError';
import { ERRORS } from '../utils/Errors';
import { VerifyToken } from '../utils/Token';
import { GetJwtSecret } from '../modules/AppConfig';
import { SolanaExplorerUrl } from '../modules/chains/Solana';
import { GetAppConfig } from '../modules/AppConfig';

const router = express.Router();

const accountModule = new AccountModule(db);
const accountLinkModule = new AccountLinkModule(db);
const externalWalletModule = new ExternalWalletModule(db);
const apiKeyModule = new ApiKeyModule(db);

/**
 * Helper to build PublicConfig from a platform account.
 */
function BuildPublicConfig(platformAccount: Account | null): PublicConfig {
  const { livemode } = GetAppConfig();

  if (!platformAccount) {
    return {
      object: 'config',
      platform_name: 'Zoneless',
      platform_logo_url: '',
      terms_url: '',
      privacy_url: '',
      livemode,
    };
  }

  return {
    object: 'config',
    platform_name:
      platformAccount.settings?.dashboard?.display_name ||
      platformAccount.business_profile?.name ||
      'Platform',
    platform_logo_url: platformAccount.settings?.branding?.logo || '',
    terms_url: platformAccount.settings?.terms_url || '',
    privacy_url: platformAccount.settings?.privacy_url || '',
    livemode,
  };
}

/**
 * Helper to get platform account from an account ID.
 * Returns the platform that owns this account (or the account itself if it's a platform).
 */
async function GetPlatformAccount(accountId: string): Promise<Account | null> {
  const account = await accountModule.GetAccount(accountId);
  if (!account) return null;

  const platformId = GetPlatformAccountId(account);
  if (platformId === accountId) {
    return account; // This account IS the platform
  }

  return accountModule.GetAccount(platformId);
}

/**
 * GET /v1/config
 * Returns platform configuration for branding the onboarding/dashboard.
 *
 * Determines the platform from context:
 * 1. ?token= query param (AccountLink token for onboarding)
 * 2. Authorization header (JWT or API key)
 * 3. Default config if neither present
 *
 * This endpoint is public to support onboarding flows.
 */
router.get(
  '/',
  AsyncHandler(async (req: express.Request, res: express.Response) => {
    let platformAccount: Account | null = null;

    // Priority 1: AccountLink token (for onboarding pages)
    const token = req.query.token as string;
    if (token) {
      // Look up the AccountLink (works even if consumed)
      const accountLink = await accountLinkModule.GetAccountLinkByToken(token);
      if (accountLink) {
        platformAccount = await GetPlatformAccount(accountLink.account);
      }
    }

    // Priority 2: Auth header (for authenticated dashboard)
    if (!platformAccount) {
      const authHeader =
        (req.headers['x-api-key'] as string) ||
        (req.headers['authorization'] as string);

      if (authHeader) {
        try {
          let accountId: string | null = null;

          if (authHeader.startsWith('Bearer ')) {
            const decoded = VerifyToken(
              authHeader.slice(7),
              GetJwtSecret()
            ) as {
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
            platformAccount = await GetPlatformAccount(accountId);
          }
        } catch {
          // Auth failed - return default config
        }
      }
    }

    res.json(BuildPublicConfig(platformAccount));
  })
);

/**
 * GET /v1/config/deposit-info
 * Returns deposit information for the authenticated platform's wallet.
 * Platform-only endpoint - used by the dashboard "Add Funds" feature.
 */
router.get(
  '/deposit-info',
  ValidateApiKey,
  RequirePlatform(),
  AsyncHandler(async (req: express.Request, res: express.Response) => {
    const wallets = await externalWalletModule.GetExternalWalletsByAccount(
      req.user.account
    );

    // Get the default wallet (or first one)
    const platformWallet =
      wallets.find((w) => w.default_for_currency) || wallets[0];

    if (!platformWallet) {
      throw new AppError(
        'No wallet configured for this platform. Please complete setup first.',
        ERRORS.VALIDATION_ERROR.status,
        'no_wallet_configured'
      );
    }

    const depositInfo: DepositInfo = {
      object: 'deposit_info',
      wallet_address: platformWallet.wallet_address,
      network: 'solana',
      currency: 'usdc',
      explorer_url: SolanaExplorerUrl('address', platformWallet.wallet_address),
    };

    res.json(depositInfo);
  })
);

export default router;
