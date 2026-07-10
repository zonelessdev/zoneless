/**
 * @fileOverview Charge routes
 *
 * Handles creating, retrieving, updating, listing, and capturing charges.
 *
 * @see https://docs.stripe.com/api/charges
 */

import * as express from 'express';
import { AsyncHandler } from '../utils/AsyncHandler';
import { AppError } from '../utils/AppError';
import { ERRORS } from '../utils/Errors';
import { Logger } from '../utils/Logger';
import { ParseCreatedFilter } from '../utils/ListHelper';

import { db } from '../modules/Database';
import { EventService } from '../modules/EventService';
import { CustomerModule } from '../modules/Customer';
import { ChargeModule } from '../modules/Charge';

import { ValidateRequest } from '../middleware/ValidateRequest';
import { RequirePlatform } from '../middleware/Authorization';

import {
  CreateChargeSchema,
  UpdateChargeSchema,
  CaptureChargeSchema,
} from '@zoneless/shared-schemas';
import { Charge } from '@zoneless/shared-types';
import { ApplyExpand, RegisterExpansions } from '../utils/Expand';

const router = express.Router();

const eventService = new EventService(db);
const customerModule = new CustomerModule(db, eventService);
const chargeModule = new ChargeModule(db, eventService, customerModule);

RegisterExpansions('charge', {
  customer: {
    sourcePath: 'customer',
    targetObject: 'customer',
    BatchLoad: (ids, ctx) => customerModule.BatchGet(ids, ctx.platformAccount),
  },
});

/**
 * Fetch a Charge and verify it belongs to the requesting platform.
 */
async function GetOwnedCharge(
  id: string,
  platformAccountId: string
): Promise<Charge> {
  const charge = await chargeModule.GetCharge(id);

  if (!charge || charge.platform_account !== platformAccountId) {
    throw new AppError(
      ERRORS.CHARGE_NOT_FOUND.message,
      ERRORS.CHARGE_NOT_FOUND.status,
      ERRORS.CHARGE_NOT_FOUND.type
    );
  }

  return charge;
}

/**
 * POST /v1/charges
 * Create a new Charge.
 */
router.post(
  '/',
  RequirePlatform(),
  ValidateRequest(CreateChargeSchema),
  AsyncHandler(async (req: express.Request, res: express.Response) => {
    const platformAccountId = req.user.account;

    Logger.info('Creating Charge', {
      platformAccountId,
      fields: Object.keys(req.body),
    });

    const charge = await chargeModule.CreateCharge(platformAccountId, req.body);

    Logger.info('Charge created successfully', {
      chargeId: charge.id,
      status: charge.status,
      captured: charge.captured,
    });

    res.status(201).json(await ApplyExpand(req, charge));
  })
);

/**
 * POST /v1/charges/:id/capture
 * Capture an uncaptured Charge.
 * Registered before `/:id` so the path is not swallowed by the update route.
 */
router.post(
  '/:id/capture',
  RequirePlatform(),
  ValidateRequest(CaptureChargeSchema),
  AsyncHandler(async (req: express.Request, res: express.Response) => {
    const platformAccountId = req.user.account;
    const id = req.params.id;

    await GetOwnedCharge(id, platformAccountId);

    Logger.info('Capturing Charge', {
      chargeId: id,
      fields: Object.keys(req.body),
    });

    const capturedCharge = await chargeModule.CaptureCharge(id, req.body);

    Logger.info('Charge captured successfully', {
      chargeId: capturedCharge.id,
      amountCaptured: capturedCharge.amount_captured,
    });

    res.json(await ApplyExpand(req, capturedCharge));
  })
);

/**
 * POST /v1/charges/:id
 * Update a Charge.
 */
router.post(
  '/:id',
  RequirePlatform(),
  ValidateRequest(UpdateChargeSchema),
  AsyncHandler(async (req: express.Request, res: express.Response) => {
    const platformAccountId = req.user.account;
    const id = req.params.id;

    await GetOwnedCharge(id, platformAccountId);

    Logger.info('Updating Charge', {
      chargeId: id,
      fields: Object.keys(req.body),
    });

    const updatedCharge = await chargeModule.UpdateCharge(id, req.body);

    Logger.info('Charge updated successfully', {
      chargeId: updatedCharge.id,
    });

    res.json(await ApplyExpand(req, updatedCharge));
  })
);

/**
 * GET /v1/charges/:id
 * Retrieve a Charge.
 */
router.get(
  '/:id',
  RequirePlatform(),
  AsyncHandler(async (req: express.Request, res: express.Response) => {
    const platformAccountId = req.user.account;
    const id = req.params.id;

    await GetOwnedCharge(id, platformAccountId);

    const charge = await chargeModule.RetrieveCharge(id);

    res.json(await ApplyExpand(req, charge));
  })
);

/**
 * GET /v1/charges
 * Returns a list of Charges.
 */
router.get(
  '/',
  RequirePlatform(),
  AsyncHandler(async (req: express.Request, res: express.Response) => {
    const platformAccountId = req.user.account;

    Logger.info('Listing Charges', { platformAccountId });

    const limit = req.query.limit
      ? parseInt(req.query.limit as string, 10)
      : 10;
    const startingAfter = req.query.starting_after as string | undefined;
    const endingBefore = req.query.ending_before as string | undefined;
    const created = ParseCreatedFilter(req.query as Record<string, unknown>);

    const customer = req.query.customer as string | undefined;
    const paymentIntent = req.query.payment_intent as string | undefined;
    const transferGroup = req.query.transfer_group as string | undefined;

    const result = await chargeModule.ListCharges({
      account: platformAccountId,
      limit,
      startingAfter,
      endingBefore,
      created,
      customer,
      payment_intent: paymentIntent,
      transfer_group: transferGroup,
    });

    Logger.info('Charges listed successfully', {
      platformAccountId,
      count: result.data.length,
      hasMore: result.has_more,
    });

    res.json(await ApplyExpand(req, result));
  })
);

export default router;
