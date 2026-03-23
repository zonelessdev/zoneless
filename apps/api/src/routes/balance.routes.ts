/**
 * @fileOverview Balance routes
 *
 * Handles retrieving balance information for accounts.
 * Supports both direct balance retrieval and on behalf of connected accounts.
 *
 * @see https://docs.stripe.com/api/balance
 */

import * as express from 'express';
import { AsyncHandler } from '../utils/AsyncHandler';
import { AppError } from '../utils/AppError';
import { ERRORS } from '../utils/Errors';
import { Logger } from '../utils/Logger';

import { db } from '../modules/Database';
import { BalanceModule } from '../modules/Balance';
import { EventService } from '../modules/EventService';
import {
  OptionalConnectedAccount,
  RequirePlatform,
} from '../middleware/Authorization';

const router = express.Router();

const eventService = new EventService(db);
const balanceModule = new BalanceModule(db, eventService);

/**
 * GET /v1/balance
 *
 * Retrieves the current account balance, based on the authentication
 * that was used to make the request.
 *
 * For platforms: Optionally pass the Zoneless-Account header to retrieve
 * the balance of a connected account on their behalf.
 *
 * This matches Stripe's GET /v1/balance endpoint.
 * @see https://docs.stripe.com/api/balance/balance_retrieve
 *
 * Headers:
 * - Zoneless-Account (optional): Connected account ID to retrieve balance for.
 *   Only platforms can use this header to access connected account balances.
 *
 * Returns the balance object for the authenticated account or specified connected account.
 */
router.get(
  '/',
  OptionalConnectedAccount('zoneless-account'),
  AsyncHandler(async (req: express.Request, res: express.Response) => {
    // Use connected account if specified (platform acting on behalf of connected account)
    // Otherwise use the authenticated user's account
    const accountId = req.connectedAccount?.id ?? req.user.account;
    const isOnBehalf = !!req.connectedAccount;

    Logger.info('Retrieving balance', {
      accountId,
      onBehalf: isOnBehalf,
      requestingAccount: req.user.account,
    });

    const balance = await balanceModule.GetBalance(accountId);

    if (!balance) {
      throw new AppError(
        ERRORS.BALANCE_NOT_FOUND.message,
        ERRORS.BALANCE_NOT_FOUND.status,
        ERRORS.BALANCE_NOT_FOUND.type
      );
    }

    Logger.info('Balance retrieved successfully', {
      accountId,
      onBehalf: isOnBehalf,
    });

    res.json(balance);
  })
);

/**
 * GET /v1/balance/details
 *
 * Returns an extended balance view for a platform account, combining
 * on-chain wallet balances (USDC + SOL) with internal ledger data
 * and the total owed to connected accounts.
 *
 * Platform-only endpoint.
 * @zoneless_extension - Not in Stripe API.
 */
router.get(
  '/details',
  RequirePlatform(),
  AsyncHandler(async (req: express.Request, res: express.Response) => {
    const accountId = req.user.account;

    Logger.info('Retrieving balance details', { accountId });

    const details = await balanceModule.GetBalanceDetails(accountId);

    if (!details) {
      throw new AppError(
        'No wallet configured. Please complete setup first.',
        400,
        'invalid_request_error'
      );
    }

    Logger.info('Balance details retrieved', { accountId });

    res.json(details);
  })
);

/**
 * POST /v1/balance/sync
 *
 * Synchronises the platform's internal balance with the on-chain
 * USDC wallet. Adjusts the available balance so that:
 *   platform_available = wallet_usdc_cents - connected_accounts_owed
 *
 * Platform-only endpoint.
 * @zoneless_extension - Not in Stripe API.
 */
router.post(
  '/sync',
  RequirePlatform(),
  AsyncHandler(async (req: express.Request, res: express.Response) => {
    const accountId = req.user.account;

    Logger.info('Syncing balance', { accountId });

    const details = await balanceModule.SyncBalance(accountId);

    if (!details) {
      throw new AppError(
        'No wallet configured. Please complete setup first.',
        400,
        'invalid_request_error'
      );
    }

    Logger.info('Balance synced', { accountId });

    res.json(details);
  })
);

export default router;
