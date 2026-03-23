/**
 * @fileOverview TopUp API routes
 *
 * Top-ups represent incoming deposits to a platform's balance.
 * These endpoints match Stripe's TopUp API structure.
 *
 * @see https://docs.stripe.com/api/topups
 */

import * as express from 'express';
import { AsyncHandler } from '../utils/AsyncHandler';
import { AppError } from '../utils/AppError';
import { ERRORS } from '../utils/Errors';
import { Logger } from '../utils/Logger';
import { ParseCreatedFilter, ParseTimestampFilter } from '../utils/ListHelper';
import { db } from '../modules/Database';
import { TopUpModule } from '../modules/TopUp';
import { EventService } from '../modules/EventService';
import { GetTopUpMonitor, TopUpMonitor } from '../modules/TopUpMonitor';
import { RequirePlatform } from '../middleware/Authorization';
import { ValidateRequest } from '../middleware/ValidateRequest';
import { CreateTopUpSchema, UpdateTopUpSchema } from '../schemas/TopUpSchema';
import { TopUp as TopUpType } from '@zoneless/shared-types';

const router = express.Router();

const eventService = new EventService(db);
const topUpModule = new TopUpModule(db, eventService);

// ─────────────────────────────────────────────────────────────────────────────
// Platform-only utility endpoints (must be defined before :id routes)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * POST /v1/topups/check-deposits
 * Check the blockchain for new incoming USDC deposits.
 * Platform-only endpoint. This is the recommended way to detect deposits
 * after a user sends funds, as it works reliably in multi-instance deployments.
 *
 * The endpoint checks the Solana blockchain for new USDC transfers to the
 * platform wallet and creates TopUp records for any new deposits found.
 */
router.post(
  '/check-deposits',
  RequirePlatform(),
  AsyncHandler(async (req: express.Request, res: express.Response) => {
    const platformAccountId = req.user.account;

    Logger.info('Checking for new deposits', { platformAccountId });

    const monitor = new TopUpMonitor(db);
    const response = await monitor.CheckDepositsForAccount(
      platformAccountId,
      1 // Check only the most recent signature to minimize RPC calls
    );

    Logger.info('Deposit check completed', {
      platformAccountId,
      processed: response.processed,
      errors: response.errors,
      topUpIds: response.topups.map((t) => t.id),
    });

    res.json(response);
  })
);

/**
 * POST /v1/topups/poll
 * Manually trigger the TopUp monitor to poll for new deposits across all wallets.
 * Platform-only endpoint. Useful for testing or forcing an immediate check.
 * @deprecated Use POST /v1/topups/check-deposits instead for single-account checking.
 */
router.post(
  '/poll',
  RequirePlatform(),
  AsyncHandler(async (req: express.Request, res: express.Response) => {
    Logger.info('Manual top-up poll triggered', {
      platformAccountId: req.user.account,
    });

    const monitor = GetTopUpMonitor(db);
    const result = await monitor.ManualPoll();

    Logger.info('Manual top-up poll completed', result);

    res.json({
      message: 'Poll completed',
      processed: result.processed,
      errors: result.errors,
    });
  })
);

/**
 * GET /v1/topups/monitor/status
 * Get the current status of the TopUp monitor.
 * Platform-only endpoint.
 */
router.get(
  '/monitor/status',
  RequirePlatform(),
  AsyncHandler(async (req: express.Request, res: express.Response) => {
    const monitor = GetTopUpMonitor(db);

    res.json({
      running: monitor.IsRunning(),
      enabled: TopUpMonitor.IsEnabled(),
      poll_interval_ms: TopUpMonitor.GetPollInterval(),
      platform_account: req.user.account,
    });
  })
);

// ─────────────────────────────────────────────────────────────────────────────
// POST /v1/topups - Create a top-up
// @see https://docs.stripe.com/api/topups/create
// ─────────────────────────────────────────────────────────────────────────────
router.post(
  '/',
  RequirePlatform(),
  ValidateRequest(CreateTopUpSchema),
  AsyncHandler(async (req: express.Request, res: express.Response) => {
    const platformAccountId = req.user.account;

    Logger.info('Creating top-up', {
      amount: req.body.amount,
      currency: req.body.currency,
      platformAccountId,
    });

    const topUp = await topUpModule.Create(req.body, platformAccountId);

    Logger.info('Top-up created', { topUpId: topUp.id });

    res.status(201).json(topUp);
  })
);

// ─────────────────────────────────────────────────────────────────────────────
// GET /v1/topups - List all top-ups
// @see https://docs.stripe.com/api/topups/list
// ─────────────────────────────────────────────────────────────────────────────
router.get(
  '/',
  RequirePlatform(),
  AsyncHandler(async (req: express.Request, res: express.Response) => {
    const account = req.user.account;

    const limit = req.query.limit
      ? parseInt(req.query.limit as string, 10)
      : 10;
    const startingAfter = req.query.starting_after as string | undefined;
    const endingBefore = req.query.ending_before as string | undefined;
    const status = req.query.status as TopUpType['status'] | undefined;
    const created = ParseCreatedFilter(req.query as Record<string, unknown>);
    const amount = ParseTimestampFilter(
      req.query as Record<string, unknown>,
      'amount'
    );

    try {
      const result = await topUpModule.ListTopUps({
        account,
        limit,
        startingAfter,
        endingBefore,
        created,
        status,
        filters: amount ? { amount } : undefined,
      });

      res.json(result);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unknown error';

      if (
        message ===
          'You cannot parameterize both starting_after and ending_before.' ||
        message === 'Invalid starting_after ID' ||
        message === 'Invalid ending_before ID'
      ) {
        throw new AppError(
          message,
          ERRORS.INVALID_REQUEST.status,
          ERRORS.INVALID_REQUEST.type
        );
      }
      throw error;
    }
  })
);

// ─────────────────────────────────────────────────────────────────────────────
// GET /v1/topups/:id - Retrieve a top-up
// @see https://docs.stripe.com/api/topups/retrieve
// ─────────────────────────────────────────────────────────────────────────────
router.get(
  '/:id',
  RequirePlatform(),
  AsyncHandler(async (req: express.Request, res: express.Response) => {
    const topUpId = req.params.id;
    const platformAccountId = req.user.account;

    const topUp = await topUpModule.GetTopUp(topUpId);

    if (!topUp) {
      throw new AppError(
        ERRORS.TOPUP_NOT_FOUND.message,
        ERRORS.TOPUP_NOT_FOUND.status,
        ERRORS.TOPUP_NOT_FOUND.type
      );
    }

    // Verify the top-up belongs to this platform
    if (topUp.account !== platformAccountId) {
      throw new AppError(
        ERRORS.TOPUP_NOT_FOUND.message,
        ERRORS.TOPUP_NOT_FOUND.status,
        ERRORS.TOPUP_NOT_FOUND.type
      );
    }

    res.json(topUp);
  })
);

// ─────────────────────────────────────────────────────────────────────────────
// POST /v1/topups/:id - Update a top-up
// @see https://docs.stripe.com/api/topups/update
// ─────────────────────────────────────────────────────────────────────────────
router.post(
  '/:id',
  RequirePlatform(),
  ValidateRequest(UpdateTopUpSchema),
  AsyncHandler(async (req: express.Request, res: express.Response) => {
    const topUpId = req.params.id;
    const platformAccountId = req.user.account;

    // Verify the top-up exists and belongs to this platform
    const existingTopUp = await topUpModule.GetTopUp(topUpId);

    if (!existingTopUp) {
      throw new AppError(
        ERRORS.TOPUP_NOT_FOUND.message,
        ERRORS.TOPUP_NOT_FOUND.status,
        ERRORS.TOPUP_NOT_FOUND.type
      );
    }

    if (existingTopUp.account !== platformAccountId) {
      throw new AppError(
        ERRORS.TOPUP_NOT_FOUND.message,
        ERRORS.TOPUP_NOT_FOUND.status,
        ERRORS.TOPUP_NOT_FOUND.type
      );
    }

    Logger.info('Updating top-up', { topUpId });

    const topUp = await topUpModule.UpdateTopUp(topUpId, req.body);

    if (!topUp) {
      throw new AppError(
        ERRORS.TOPUP_NOT_FOUND.message,
        ERRORS.TOPUP_NOT_FOUND.status,
        ERRORS.TOPUP_NOT_FOUND.type
      );
    }

    Logger.info('Top-up updated', { topUpId });

    res.json(topUp);
  })
);

// ─────────────────────────────────────────────────────────────────────────────
// POST /v1/topups/:id/cancel - Cancel a top-up
// @see https://docs.stripe.com/api/topups/cancel
// ─────────────────────────────────────────────────────────────────────────────
router.post(
  '/:id/cancel',
  RequirePlatform(),
  AsyncHandler(async (req: express.Request, res: express.Response) => {
    const topUpId = req.params.id;
    const platformAccountId = req.user.account;

    // Verify the top-up exists and belongs to this platform
    const existingTopUp = await topUpModule.GetTopUp(topUpId);

    if (!existingTopUp) {
      throw new AppError(
        ERRORS.TOPUP_NOT_FOUND.message,
        ERRORS.TOPUP_NOT_FOUND.status,
        ERRORS.TOPUP_NOT_FOUND.type
      );
    }

    if (existingTopUp.account !== platformAccountId) {
      throw new AppError(
        ERRORS.TOPUP_NOT_FOUND.message,
        ERRORS.TOPUP_NOT_FOUND.status,
        ERRORS.TOPUP_NOT_FOUND.type
      );
    }

    Logger.info('Canceling top-up', { topUpId });

    const topUp = await topUpModule.Cancel(topUpId);

    Logger.info('Top-up canceled', { topUpId });

    res.json(topUp);
  })
);

export default router;
