import * as express from 'express';
import { AsyncHandler } from '../utils/AsyncHandler';
import { AppError } from '../utils/AppError';
import { ERRORS } from '../utils/Errors';
import { Logger } from '../utils/Logger';
import { ParseCreatedFilter } from '../utils/ListHelper';

import { db } from '../modules/Database';
import { EventService } from '../modules/EventService';
import { CustomerModule } from '../modules/Customer';
import { PaymentIntentModule } from '../modules/PaymentIntent';

import { ValidateRequest } from '../middleware/ValidateRequest';
import { RequirePlatform } from '../middleware/Authorization';

import {
  CreatePaymentIntentSchema,
  UpdatePaymentIntentSchema,
  CancelPaymentIntentSchema,
} from '@zoneless/shared-schemas';
import { PaymentIntent } from '@zoneless/shared-types';
import { ApplyExpand, RegisterExpansions } from '../utils/Expand';

const router = express.Router();

const eventService = new EventService(db);
const customerModule = new CustomerModule(db, eventService);
const paymentIntentModule = new PaymentIntentModule(
  db,
  eventService,
  customerModule
);

RegisterExpansions('payment_intent', {
  customer: {
    sourcePath: 'customer',
    targetObject: 'customer',
    BatchLoad: (ids, ctx) => customerModule.BatchGet(ids, ctx.platformAccount),
  },
});

/**
 * Fetch a PaymentIntent and verify it belongs to the requesting platform.
 */
async function GetOwnedPaymentIntent(
  id: string,
  platformAccountId: string
): Promise<PaymentIntent> {
  const paymentIntent = await paymentIntentModule.GetPaymentIntent(id);

  if (!paymentIntent || paymentIntent.platform_account !== platformAccountId) {
    throw new AppError(
      ERRORS.PAYMENT_INTENT_NOT_FOUND.message,
      ERRORS.PAYMENT_INTENT_NOT_FOUND.status,
      ERRORS.PAYMENT_INTENT_NOT_FOUND.type
    );
  }

  return paymentIntent;
}

/**
 * POST /v1/payment_intents
 * Create a new PaymentIntent.
 */
router.post(
  '/',
  RequirePlatform(),
  ValidateRequest(CreatePaymentIntentSchema),
  AsyncHandler(async (req: express.Request, res: express.Response) => {
    const platformAccountId = req.user.account;

    Logger.info('Creating PaymentIntent', {
      platformAccountId,
      fields: Object.keys(req.body),
    });

    const paymentIntent = await paymentIntentModule.CreatePaymentIntent(
      platformAccountId,
      req.body
    );

    Logger.info('PaymentIntent created successfully', {
      paymentIntentId: paymentIntent.id,
    });

    res.status(201).json(await ApplyExpand(req, paymentIntent));
  })
);

/**
 * POST /v1/payment_intents/:id
 * Update a PaymentIntent.
 */
router.post(
  '/:id',
  RequirePlatform(),
  ValidateRequest(UpdatePaymentIntentSchema),
  AsyncHandler(async (req: express.Request, res: express.Response) => {
    const platformAccountId = req.user.account;
    const id = req.params.id;

    await GetOwnedPaymentIntent(id, platformAccountId);

    Logger.info('Updating PaymentIntent', {
      paymentIntentId: id,
      fields: Object.keys(req.body),
    });

    const updatedPaymentIntent = await paymentIntentModule.UpdatePaymentIntent(
      id,
      req.body
    );

    Logger.info('PaymentIntent updated successfully', {
      paymentIntentId: updatedPaymentIntent.id,
    });

    res.json(await ApplyExpand(req, updatedPaymentIntent));
  })
);

/**
 * POST /v1/payment_intents/:id/cancel
 * Cancel a PaymentIntent.
 */
router.post(
  '/:id/cancel',
  RequirePlatform(),
  ValidateRequest(CancelPaymentIntentSchema),
  AsyncHandler(async (req: express.Request, res: express.Response) => {
    const platformAccountId = req.user.account;
    const id = req.params.id;

    await GetOwnedPaymentIntent(id, platformAccountId);

    Logger.info('Canceling PaymentIntent', {
      paymentIntentId: id,
      cancellationReason: req.body.cancellation_reason,
    });

    const canceledPaymentIntent = await paymentIntentModule.CancelPaymentIntent(
      id,
      req.body
    );

    Logger.info('PaymentIntent canceled successfully', {
      paymentIntentId: canceledPaymentIntent.id,
      status: canceledPaymentIntent.status,
    });

    res.json(await ApplyExpand(req, canceledPaymentIntent));
  })
);

/**
 * GET /v1/payment_intents/:id/amount_details_line_items
 * Returns a list of the PaymentIntent's amount_details line items.
 */
router.get(
  '/:id/amount_details_line_items',
  RequirePlatform(),
  AsyncHandler(async (req: express.Request, res: express.Response) => {
    const platformAccountId = req.user.account;
    const id = req.params.id;

    const paymentIntent = await GetOwnedPaymentIntent(id, platformAccountId);

    const limit = req.query.limit
      ? parseInt(req.query.limit as string, 10)
      : 10;
    const startingAfter = req.query.starting_after as string | undefined;
    const endingBefore = req.query.ending_before as string | undefined;

    const result = paymentIntentModule.ListAmountDetailsLineItems(
      paymentIntent,
      {
        limit,
        startingAfter,
        endingBefore,
      }
    );

    res.json(await ApplyExpand(req, result));
  })
);

/**
 * GET /v1/payment_intents/:id
 * Retrieve a PaymentIntent.
 * Optional `client_secret` query param is verified when provided.
 */
router.get(
  '/:id',
  RequirePlatform(),
  AsyncHandler(async (req: express.Request, res: express.Response) => {
    const platformAccountId = req.user.account;
    const id = req.params.id;
    const clientSecret = req.query.client_secret as string | undefined;

    // Ownership check first (secret-key path); then optional client_secret verify.
    await GetOwnedPaymentIntent(id, platformAccountId);

    const paymentIntent = await paymentIntentModule.RetrievePaymentIntent(
      id,
      clientSecret
    );

    res.json(await ApplyExpand(req, paymentIntent));
  })
);

/**
 * GET /v1/payment_intents
 * Returns a list of PaymentIntents.
 */
router.get(
  '/',
  RequirePlatform(),
  AsyncHandler(async (req: express.Request, res: express.Response) => {
    const platformAccountId = req.user.account;

    Logger.info('Listing PaymentIntents', { platformAccountId });

    const limit = req.query.limit
      ? parseInt(req.query.limit as string, 10)
      : 10;
    const startingAfter = req.query.starting_after as string | undefined;
    const endingBefore = req.query.ending_before as string | undefined;
    const created = ParseCreatedFilter(req.query as Record<string, unknown>);

    const customer = req.query.customer as string | undefined;
    const customerAccount = req.query.customer_account as string | undefined;

    const result = await paymentIntentModule.ListPaymentIntents({
      account: platformAccountId,
      limit,
      startingAfter,
      endingBefore,
      created,
      customer,
      customer_account: customerAccount,
    });

    Logger.info('PaymentIntents listed successfully', {
      platformAccountId,
      count: result.data.length,
      hasMore: result.has_more,
    });

    res.json(await ApplyExpand(req, result));
  })
);

export default router;
