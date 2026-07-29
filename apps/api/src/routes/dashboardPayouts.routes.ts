/**
 * Dashboard-only payout routes.
 *
 * These routes orchestrate server-side signing without changing the
 * Stripe-compatible payout API.
 */

import * as express from 'express';
import { CreatePayoutSchema } from '@zoneless/shared-schemas';
import {
  RequireConnectedAccountOwnership,
  RequirePlatform,
} from '../middleware/Authorization';
import { ValidateRequest } from '../middleware/ValidateRequest';
import { db } from '../modules/Database';
import { EventService } from '../modules/EventService';
import { PayoutModule } from '../modules/Payout';
import { AsyncHandler } from '../utils/AsyncHandler';
import { Logger } from '../utils/Logger';

const router = express.Router();
const eventService = new EventService(db);
const payoutModule = new PayoutModule(db, eventService);

/**
 * POST /v1/dashboard/payouts
 * Create, sign, simulate, and broadcast a connected-account payout.
 */
router.post(
  '/',
  RequirePlatform(),
  RequireConnectedAccountOwnership('zoneless-account', 'header'),
  ValidateRequest(CreatePayoutSchema),
  AsyncHandler(async (req: express.Request, res: express.Response) => {
    const platformAccountId = req.user.account;
    const connectedAccountId = req.connectedAccount!.id;

    Logger.info('Processing dashboard payout', {
      platformAccountId,
      connectedAccountId,
      amount: req.body.amount,
    });

    const result = await payoutModule.CreateAndProcessDashboardPayout(
      platformAccountId,
      connectedAccountId,
      req.body
    );

    Logger.info('Dashboard payout processing completed', {
      platformAccountId,
      connectedAccountId,
      status: result.status,
      signature: result.signature,
    });

    res.status(201).json(result);
  })
);

export default router;
