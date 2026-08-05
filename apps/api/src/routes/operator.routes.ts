/**
 * @fileOverview Operator routes for managed hosting
 *
 * A narrow, operator-only API surface for provisioning and managing
 * platform accounts on a shared multi-tenant instance. All routes require
 * the x-operator-key header (see OperatorMiddleware) and are only available
 * when the instance runs in operator mode (OPERATOR_API_KEY set).
 *
 * Routes:
 * - GET  /v1/operator/summary                Instance-wide volume/usage KPIs
 * - GET  /v1/operator/events                 Recent cross-platform events
 * - POST /v1/operator/platforms              Provision a new platform
 * - GET  /v1/operator/platforms              List platforms (optional stats)
 * - GET  /v1/operator/platforms/:id          Get a platform
 * - POST /v1/operator/platforms/:id/enable   Re-enable a disabled platform
 * - POST /v1/operator/platforms/:id/disable  Disable a platform
 * - POST /v1/operator/platforms/:id/login_link  Mint a dashboard login link
 * - POST /v1/operator/platforms/:id/agent_key  Rotate an agent API key
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
import { ApiKeyModule } from '../modules/ApiKey';
import { EventService } from '../modules/EventService';
import { UsageModule } from '../modules/Usage';
import { OperatorStatsModule } from '../modules/OperatorStats';
import { IsPlatformAccount } from '../modules/PlatformAccess';
import { GetAppConfig, GetJwtSecret } from '../modules/AppConfig';
import { ValidateOperatorKey } from '../middleware/OperatorMiddleware';

const router = express.Router();
const setupModule = new SetupModule(db);
const accountModule = new AccountModule(db);
const usageModule = new UsageModule(db);
const operatorStatsModule = new OperatorStatsModule(db);
const apiKeyModule = new ApiKeyModule(db, new EventService(db));

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

function ParseDays(raw: unknown, fallback = 30): number {
  return Math.min(
    Math.max(parseInt(String(raw ?? ''), 10) || fallback, 1),
    365
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /v1/operator/summary - Instance-wide volume / usage KPIs
// ─────────────────────────────────────────────────────────────────────────────
router.get(
  '/summary',
  AsyncHandler(async (req: express.Request, res: express.Response) => {
    const days = ParseDays(req.query.days);
    const summary = await operatorStatsModule.GetSummary(days);
    res.json(summary);
  })
);

// ─────────────────────────────────────────────────────────────────────────────
// GET /v1/operator/events - Recent cross-platform events
// ─────────────────────────────────────────────────────────────────────────────
router.get(
  '/events',
  AsyncHandler(async (req: express.Request, res: express.Response) => {
    const limit = Math.min(
      Math.max(parseInt(String(req.query.limit ?? ''), 10) || 50, 1),
      100
    );
    const startingAfter = req.query.starting_after as string | undefined;
    const endingBefore = req.query.ending_before as string | undefined;
    if (startingAfter && endingBefore) {
      throw new AppError(
        'You cannot parameterize both starting_after and ending_before.',
        400,
        'invalid_request_error'
      );
    }
    const types = req.query.types
      ? Array.isArray(req.query.types)
        ? (req.query.types as string[])
        : String(req.query.types)
            .split(',')
            .map((type) => type.trim())
            .filter(Boolean)
      : undefined;

    try {
      const result = await operatorStatsModule.ListRecentEvents({
        limit,
        types,
        startingAfter,
        endingBefore,
      });
      res.json({
        object: 'list',
        data: result.data,
        has_more: result.has_more,
      });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      if (
        message === 'Invalid starting_after ID' ||
        message === 'Invalid ending_before ID'
      ) {
        throw new AppError(message, 400, 'invalid_request_error');
      }
      throw error;
    }
  })
);

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
// Optional: include=stats&days=30 for per-platform volume/usage/activity
// ─────────────────────────────────────────────────────────────────────────────
router.get(
  '/platforms',
  AsyncHandler(async (req: express.Request, res: express.Response) => {
    const platforms = await accountModule.GetPlatformAccounts();
    const includeStats = String(req.query.include || '')
      .split(',')
      .map((part) => part.trim())
      .includes('stats');

    if (!includeStats) {
      res.json({
        object: 'list',
        data: platforms.map(ToOperatorPlatform),
      });
      return;
    }

    const days = ParseDays(req.query.days);
    const statsMap = await operatorStatsModule.GetPlatformStatsMap(days);
    const emptyStats = {
      connected_accounts: 0,
      payment_volume: 0,
      payout_volume: 0,
      payment_count: 0,
      api_requests: 0,
      last_activity: null as number | null,
    };

    res.json({
      object: 'list',
      data: platforms.map((platform) => ({
        ...ToOperatorPlatform(platform),
        stats: statsMap.get(platform.id) ?? emptyStats,
      })),
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
// POST /v1/operator/platforms/:id/agent_key - Rotate an agent key
// ─────────────────────────────────────────────────────────────────────────────
router.post(
  '/platforms/:id/agent_key',
  AsyncHandler(async (req: express.Request, res: express.Response) => {
    const platform = await GetPlatformOrThrow(req.params.id);
    const slot = typeof req.body.slot === 'string' ? req.body.slot.trim() : '';
    if (!/^[a-f0-9]{64}$/.test(slot)) {
      throw new AppError(
        'A valid agent key slot is required.',
        400,
        'invalid_request_error'
      );
    }

    const existingKeys = await apiKeyModule.ListApiKeys({
      account: platform.id,
      limit: 100,
    });
    const previousAgentKeys = existingKeys.data.filter(
      (apiKey) =>
        apiKey.status === 'active' && apiKey.metadata?.['agent_slot'] === slot
    );
    for (const apiKey of previousAgentKeys) {
      await apiKeyModule.RevokeApiKey(apiKey.id);
    }

    const result = await apiKeyModule.CreateApiKey(
      platform.id,
      'Zoneless Agent Store',
      {
        agent_slot: slot,
        credential_type: 'agent_store',
      },
      GetAppConfig().livemode
    );

    Logger.info('Operator rotated agent key', {
      platformAccountId: platform.id,
      revokedKeyCount: previousAgentKeys.length,
    });
    res.status(201).json({
      ...result.api_key,
      plaintext_token: result.plaintext_token,
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
