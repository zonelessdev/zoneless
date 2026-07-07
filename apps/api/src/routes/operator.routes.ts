/**
 * @fileOverview Operator routes for managed hosting
 *
 * A narrow, operator-only API surface for provisioning and managing
 * platform accounts on a shared multi-tenant instance. All routes require
 * the x-operator-key header (see OperatorMiddleware) and are only available
 * when the instance runs in operator mode (OPERATOR_API_KEY set).
 *
 * Routes:
 * - POST /v1/operator/platforms              Provision a new platform
 * - GET  /v1/operator/platforms              List platforms
 * - GET  /v1/operator/platforms/:id          Get a platform
 * - POST /v1/operator/platforms/:id/enable   Re-enable a disabled platform
 * - POST /v1/operator/platforms/:id/disable  Disable a platform
 * - POST /v1/operator/platforms/:id/login_link  Mint a dashboard login link
 * - GET  /v1/operator/platforms/:id/usage    Daily API usage counters
 *
 * @module operator.routes
 */

import * as express from 'express';
import {
  Account as AccountType,
  OperatorPlatform,
  SetupRequest,
  SetupResponse,
} from '@zoneless/shared-types';
import { AsyncHandler } from '../utils/AsyncHandler';
import { AppError } from '../utils/AppError';
import { ERRORS } from '../utils/Errors';
import { Logger } from '../utils/Logger';
import { SignToken } from '../utils/Token';
import { db } from '../modules/Database';
import { SetupModule, ValidateSetupRequest } from '../modules/Setup';
import { AccountModule } from '../modules/Account';
import { UsageModule } from '../modules/Usage';
import { IsPlatformAccount } from '../modules/PlatformAccess';
import { GetAppConfig, GetJwtSecret } from '../modules/AppConfig';
import { ValidateOperatorKey } from '../middleware/OperatorMiddleware';

const router = express.Router();
const setupModule = new SetupModule(db);
const accountModule = new AccountModule(db);
const usageModule = new UsageModule(db);

// Login links minted by the operator use the same session lifetime as setup
const LOGIN_TOKEN_DURATION = '7d';
const LOGIN_TOKEN_DURATION_SECONDS = 7 * 24 * 60 * 60;

// All operator routes require the operator API key
router.use(ValidateOperatorKey);

/**
 * Maps a platform Account to the operator API summary shape.
 */
function ToOperatorPlatform(account: AccountType): OperatorPlatform {
  return {
    object: 'operator_platform',
    id: account.id,
    name:
      account.settings?.dashboard?.display_name ||
      account.business_profile?.name ||
      'Platform',
    created: account.created,
    disabled: account.managed?.disabled === true,
  };
}

/**
 * Loads a platform account by ID, throwing 404 if it doesn't exist
 * or isn't a platform (root) account.
 */
async function GetPlatformOrThrow(accountId: string): Promise<AccountType> {
  const account = await accountModule.GetAccount(accountId);

  if (!account || !IsPlatformAccount(account)) {
    throw new AppError(
      ERRORS.ACCOUNT_NOT_FOUND.message,
      ERRORS.ACCOUNT_NOT_FOUND.status,
      ERRORS.ACCOUNT_NOT_FOUND.type
    );
  }

  return account;
}

// ─────────────────────────────────────────────────────────────────────────────
// POST /v1/operator/platforms - Provision a new platform account
// ─────────────────────────────────────────────────────────────────────────────
router.post(
  '/platforms',
  AsyncHandler(async (req: express.Request, res: express.Response) => {
    const body = req.body as SetupRequest;
    ValidateSetupRequest(body);

    Logger.info('Operator provisioning new platform account', {
      platformName: body.platform_name,
    });

    const response: SetupResponse = await setupModule.CreatePlatformAccount(
      body
    );

    Logger.info('Operator provisioned platform account', {
      platformAccountId: response.platform_account_id,
    });

    res.status(201).json(response);
  })
);

// ─────────────────────────────────────────────────────────────────────────────
// GET /v1/operator/platforms - List all platform accounts
// ─────────────────────────────────────────────────────────────────────────────
router.get(
  '/platforms',
  AsyncHandler(async (req: express.Request, res: express.Response) => {
    const platforms = await accountModule.GetPlatformAccounts();

    res.json({
      object: 'list',
      data: platforms.map(ToOperatorPlatform),
    });
  })
);

// ─────────────────────────────────────────────────────────────────────────────
// GET /v1/operator/platforms/:id - Get a single platform account
// ─────────────────────────────────────────────────────────────────────────────
router.get(
  '/platforms/:id',
  AsyncHandler(async (req: express.Request, res: express.Response) => {
    const platform = await GetPlatformOrThrow(req.params.id);
    res.json(ToOperatorPlatform(platform));
  })
);

// ─────────────────────────────────────────────────────────────────────────────
// POST /v1/operator/platforms/:id/enable - Re-enable a disabled platform
// ─────────────────────────────────────────────────────────────────────────────
router.post(
  '/platforms/:id/enable',
  AsyncHandler(async (req: express.Request, res: express.Response) => {
    const platform = await GetPlatformOrThrow(req.params.id);

    await db.Update<AccountType>('Accounts', platform.id, {
      managed: { disabled: false },
    });

    Logger.info('Operator enabled platform', {
      platformAccountId: platform.id,
    });

    res.json({ ...ToOperatorPlatform(platform), disabled: false });
  })
);

// ─────────────────────────────────────────────────────────────────────────────
// POST /v1/operator/platforms/:id/disable - Disable a platform
// ─────────────────────────────────────────────────────────────────────────────
router.post(
  '/platforms/:id/disable',
  AsyncHandler(async (req: express.Request, res: express.Response) => {
    const platform = await GetPlatformOrThrow(req.params.id);

    await db.Update<AccountType>('Accounts', platform.id, {
      managed: { disabled: true },
    });

    Logger.info('Operator disabled platform', {
      platformAccountId: platform.id,
    });

    res.json({ ...ToOperatorPlatform(platform), disabled: true });
  })
);

// ─────────────────────────────────────────────────────────────────────────────
// POST /v1/operator/platforms/:id/login_link - Mint a dashboard login link
// ─────────────────────────────────────────────────────────────────────────────
router.post(
  '/platforms/:id/login_link',
  AsyncHandler(async (req: express.Request, res: express.Response) => {
    const platform = await GetPlatformOrThrow(req.params.id);

    if (platform.managed?.disabled === true) {
      throw new AppError(
        'This platform has been disabled by the operator',
        ERRORS.PERMISSION_DENIED.status,
        'account_disabled'
      );
    }

    const loginToken = SignToken(
      { account_id: platform.id, type: 'account_session' },
      GetJwtSecret(),
      LOGIN_TOKEN_DURATION
    );

    const { dashboardUrl } = GetAppConfig();

    res.json({
      object: 'operator_login_link',
      url: `${dashboardUrl}/platform-login?token=${loginToken}`,
      expires_at: Math.floor(Date.now() / 1000) + LOGIN_TOKEN_DURATION_SECONDS,
    });
  })
);

// ─────────────────────────────────────────────────────────────────────────────
// GET /v1/operator/platforms/:id/usage - Daily API usage counters
// ─────────────────────────────────────────────────────────────────────────────
router.get(
  '/platforms/:id/usage',
  AsyncHandler(async (req: express.Request, res: express.Response) => {
    const platform = await GetPlatformOrThrow(req.params.id);

    const days = Math.min(
      Math.max(parseInt(req.query.days as string, 10) || 30, 1),
      365
    );

    const usage = await usageModule.GetUsage(platform.id, days);
    res.json(usage);
  })
);

export default router;
