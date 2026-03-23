import * as express from 'express';
import { AsyncHandler } from '../utils/AsyncHandler';
import { AppError } from '../utils/AppError';
import { ERRORS } from '../utils/Errors';
import { Now } from '../utils/Timestamp';
import { db } from '../modules/Database';
import { AccountModule } from '../modules/Account';
import { AccountLinkModule } from '../modules/AccountLink';
import { LoginLinkModule } from '../modules/LoginLink';
import { ApiKeyModule } from '../modules/ApiKey';
import { GetPlatformAccountId } from '../modules/PlatformAccess';
import { GetJwtSecret } from '../modules/AppConfig';
import { SignToken } from '../utils/Token';
import { RateLimiters } from '../middleware/RateLimiter';
import { AccountLinkRecord, LoginLinkRecord } from '@zoneless/shared-types';

const router = express.Router();
const accountModule = new AccountModule(db);
const accountLinkModule = new AccountLinkModule(db);
const loginLinkModule = new LoginLinkModule(db);
const apiKeyModule = new ApiKeyModule(db);

// Context returned to the frontend after token exchange
interface ExchangeContext {
  type: 'account_link' | 'login_link';
  link_type?: 'account_onboarding' | 'account_update';
  return_url?: string;
  refresh_url?: string;
  platform_name: string;
  account: string;
}

/**
 * Get the platform name for an account.
 * Looks up the platform account and gets its display name.
 */
async function GetPlatformName(accountId: string): Promise<string> {
  const account = await accountModule.GetAccount(accountId);
  if (!account) {
    return 'Platform';
  }

  // Get the platform account
  const platformId = GetPlatformAccountId(account);
  const platformAccount = await accountModule.GetAccount(platformId);

  return (
    platformAccount?.settings?.dashboard?.display_name ||
    platformAccount?.business_profile?.name ||
    'Platform'
  );
}

// POST /v1/auth/exchange
router.post(
  '/exchange',
  RateLimiters.auth, // Stricter rate limit for auth endpoints
  AsyncHandler(async (req: express.Request, res: express.Response) => {
    const { token } = req.body;

    if (!token || typeof token !== 'string') {
      throw new AppError(
        'Missing or invalid token',
        ERRORS.INVALID_REQUEST.status,
        ERRORS.INVALID_REQUEST.type
      );
    }

    let link: AccountLinkRecord | LoginLinkRecord | null = null;
    let linkType: 'account_link' | 'login_link';

    // Route based on token prefix
    if (token.startsWith('al_z_')) {
      link = await accountLinkModule.GetAccountLinkByToken(token);
      linkType = 'account_link';
    } else if (token.startsWith('ll_z_')) {
      link = await loginLinkModule.GetLoginLinkByToken(token);
      linkType = 'login_link';
    } else {
      throw new AppError(
        'Invalid token format',
        ERRORS.INVALID_TOKEN.status,
        ERRORS.INVALID_TOKEN.type
      );
    }

    if (!link) {
      throw new AppError(
        'Invalid token',
        ERRORS.INVALID_TOKEN.status,
        ERRORS.INVALID_TOKEN.type
      );
    }

    if (link.consumed) {
      throw new AppError(
        ERRORS.LINK_ALREADY_USED.message,
        ERRORS.LINK_ALREADY_USED.status,
        ERRORS.LINK_ALREADY_USED.type
      );
    }

    if (link.expires_at < Now()) {
      throw new AppError(
        'Token expired',
        ERRORS.INVALID_TOKEN.status,
        ERRORS.INVALID_TOKEN.type
      );
    }

    // Mark the link as consumed before issuing the JWT
    if (linkType === 'account_link') {
      await accountLinkModule.MarkAsConsumed((link as AccountLinkRecord).id);
    } else {
      await loginLinkModule.MarkAsConsumed(link.token);
    }

    // Create JWT using wrapper
    const sessionToken = SignToken(
      {
        account_id: link.account,
        type: 'account_session',
      },
      GetJwtSecret(),
      '7d'
    );

    // Build context object based on link type
    // Get platform name from the account's platform
    const platformName =
      linkType === 'login_link'
        ? (link as LoginLinkRecord).platform_name
        : await GetPlatformName(link.account);

    const context: ExchangeContext = {
      type: linkType,
      platform_name: platformName,
      account: link.account,
    };

    if (linkType === 'account_link') {
      const accountLink = link as AccountLinkRecord;
      context.link_type = accountLink.type;
      context.return_url = accountLink.return_url;
      context.refresh_url = accountLink.refresh_url;
    }

    res.json({ token: sessionToken, context });
  })
);

// POST /v1/auth/api-key
// Allows platform to log in using their API key
router.post(
  '/api-key',
  RateLimiters.auth,
  AsyncHandler(async (req: express.Request, res: express.Response) => {
    const { api_key } = req.body;

    if (!api_key || typeof api_key !== 'string') {
      throw new AppError(
        'Missing or invalid API key',
        ERRORS.INVALID_REQUEST.status,
        ERRORS.INVALID_REQUEST.type
      );
    }

    // First check if it's a valid API key in the database
    const apiKey = await apiKeyModule.GetApiKeyByToken(api_key);

    if (!apiKey) {
      throw new AppError(
        'Invalid API key',
        ERRORS.INVALID_API_KEY.status,
        ERRORS.INVALID_API_KEY.type
      );
    }

    if (apiKey.status !== 'active') {
      throw new AppError(
        'API key has been revoked',
        ERRORS.INVALID_API_KEY.status,
        ERRORS.INVALID_API_KEY.type
      );
    }

    // Create JWT session for the account
    const sessionToken = SignToken(
      {
        account_id: apiKey.account,
        type: 'account_session',
      },
      GetJwtSecret(),
      '7d'
    );

    res.json({
      token: sessionToken,
      account_id: apiKey.account,
    });
  })
);

export default router;
