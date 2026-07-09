import * as express from 'express';
import { AsyncHandler } from '../utils/AsyncHandler';
import { AppError } from '../utils/AppError';
import { ERRORS } from '../utils/Errors';
import { Logger } from '../utils/Logger';
import { ParseCreatedFilter } from '../utils/ListHelper';

import { db } from '../modules/Database';
import { EventService } from '../modules/EventService';
import { CheckoutSessionModule } from '../modules/CheckoutSession';
import { PriceModule } from '../modules/Price';
import { ProductModule } from '../modules/Product';
import { CustomerModule } from '../modules/Customer';
import { PaymentIntentModule } from '../modules/PaymentIntent';

import { ValidateRequest } from '../middleware/ValidateRequest';
import { RequirePlatform } from '../middleware/Authorization';

import {
  CreateCheckoutSessionSchema,
  UpdateCheckoutSessionSchema,
  ExpireCheckoutSessionSchema,
} from '@zoneless/shared-schemas';
import { CheckoutSession } from '@zoneless/shared-types';
import { ApplyExpand, RegisterExpansions } from '../utils/Expand';

const router = express.Router();

const eventService = new EventService(db);
const productModule = new ProductModule(db, eventService);
const priceModule = new PriceModule(db, eventService, productModule);
const customerModule = new CustomerModule(db, eventService);
const paymentIntentModule = new PaymentIntentModule(
  db,
  eventService,
  customerModule
);
const checkoutSessionModule = new CheckoutSessionModule(
  db,
  eventService,
  priceModule,
  productModule,
  customerModule,
  paymentIntentModule
);

RegisterExpansions('checkout.session', {
  customer: {
    sourcePath: 'customer',
    targetObject: 'customer',
    BatchLoad: (ids, ctx) => customerModule.BatchGet(ids, ctx.platformAccount),
  },
  payment_intent: {
    sourcePath: 'payment_intent',
    targetObject: 'payment_intent',
    BatchLoad: (ids, ctx) =>
      paymentIntentModule.BatchGet(ids, ctx.platformAccount),
  },
});

/**
 * Fetch a checkout session and verify it belongs to the requesting platform.
 */
async function GetOwnedCheckoutSession(
  id: string,
  platformAccountId: string
): Promise<CheckoutSession> {
  const session = await checkoutSessionModule.GetCheckoutSession(id);

  if (!session || session.platform_account !== platformAccountId) {
    throw new AppError(
      ERRORS.CHECKOUT_SESSION_NOT_FOUND.message,
      ERRORS.CHECKOUT_SESSION_NOT_FOUND.status,
      ERRORS.CHECKOUT_SESSION_NOT_FOUND.type
    );
  }

  return session;
}

/**
 * POST /v1/checkout/sessions
 * Create a new checkout session.
 */
router.post(
  '/',
  RequirePlatform(),
  ValidateRequest(CreateCheckoutSessionSchema),
  AsyncHandler(async (req: express.Request, res: express.Response) => {
    const platformAccountId = req.user.account;

    Logger.info('Creating checkout session', {
      platformAccountId,
      fields: Object.keys(req.body),
    });

    const session = await checkoutSessionModule.CreateCheckoutSession(
      platformAccountId,
      req.body
    );

    Logger.info('Checkout session created successfully', {
      checkoutSessionId: session.id,
    });

    res.status(201).json(await ApplyExpand(req, session));
  })
);

/**
 * POST /v1/checkout/sessions/:id
 * Update a checkout session.
 */
router.post(
  '/:id',
  RequirePlatform(),
  ValidateRequest(UpdateCheckoutSessionSchema),
  AsyncHandler(async (req: express.Request, res: express.Response) => {
    const platformAccountId = req.user.account;
    const id = req.params.id;

    await GetOwnedCheckoutSession(id, platformAccountId);

    Logger.info('Updating checkout session', {
      checkoutSessionId: id,
      fields: Object.keys(req.body),
    });

    const updatedSession = await checkoutSessionModule.UpdateCheckoutSession(
      id,
      req.body
    );

    Logger.info('Checkout session updated successfully', {
      checkoutSessionId: updatedSession.id,
    });

    res.json(await ApplyExpand(req, updatedSession));
  })
);

/**
 * GET /v1/checkout/sessions/:id
 * Retrieve a checkout session.
 */
router.get(
  '/:id',
  RequirePlatform(),
  AsyncHandler(async (req: express.Request, res: express.Response) => {
    const platformAccountId = req.user.account;
    const id = req.params.id;

    const session = await GetOwnedCheckoutSession(id, platformAccountId);

    res.json(await ApplyExpand(req, session));
  })
);

/**
 * POST /v1/checkout/sessions/:id/expire
 * Expire a checkout session.
 */
router.post(
  '/:id/expire',
  RequirePlatform(),
  ValidateRequest(ExpireCheckoutSessionSchema),
  AsyncHandler(async (req: express.Request, res: express.Response) => {
    const platformAccountId = req.user.account;
    const id = req.params.id;

    await GetOwnedCheckoutSession(id, platformAccountId);

    Logger.info('Expiring checkout session', { checkoutSessionId: id });

    const expiredSession = await checkoutSessionModule.ExpireCheckoutSession(
      id
    );

    Logger.info('Checkout session expired successfully', {
      checkoutSessionId: id,
    });

    res.json(await ApplyExpand(req, expiredSession));
  })
);

/**
 * GET /v1/checkout/sessions/:id/line_items
 * Returns a list of the checkout session's line items.
 */
router.get(
  '/:id/line_items',
  RequirePlatform(),
  AsyncHandler(async (req: express.Request, res: express.Response) => {
    const platformAccountId = req.user.account;
    const id = req.params.id;

    const session = await GetOwnedCheckoutSession(id, platformAccountId);

    const limit = req.query.limit
      ? parseInt(req.query.limit as string, 10)
      : 10;
    const startingAfter = req.query.starting_after as string | undefined;
    const endingBefore = req.query.ending_before as string | undefined;

    const result = checkoutSessionModule.ListLineItems(session, {
      limit,
      startingAfter,
      endingBefore,
    });

    res.json(await ApplyExpand(req, result));
  })
);

/**
 * GET /v1/checkout/sessions
 * Returns a list of checkout sessions
 */
router.get(
  '/',
  RequirePlatform(),
  AsyncHandler(async (req: express.Request, res: express.Response) => {
    const platformAccountId = req.user.account;

    Logger.info('Listing checkout sessions', { platformAccountId });

    //Parse query parameters
    const limit = req.query.limit
      ? parseInt(req.query.limit as string, 10)
      : 10;
    const startingAfter = req.query.starting_after as string | undefined;
    const endingBefore = req.query.ending_before as string | undefined;
    const created = ParseCreatedFilter(req.query as Record<string, unknown>);

    const customer = req.query.customer as string | undefined;
    const customerAccount = req.query.customer_account as string | undefined;
    const customerDetailsEmail = (
      req.query.customer_details as { email?: string } | undefined
    )?.email;
    const paymentIntent = req.query.payment_intent as string | undefined;
    const paymentLink = req.query.payment_link as string | undefined;
    const status = req.query.status as
      | 'complete'
      | 'expired'
      | 'open'
      | undefined;
    const subscription = req.query.subscription as string | undefined;

    const result = await checkoutSessionModule.ListCheckoutSessions({
      account: platformAccountId,
      limit,
      startingAfter,
      endingBefore,
      created,
      customer,
      customer_account: customerAccount,
      customer_details: customerDetailsEmail
        ? { email: customerDetailsEmail }
        : undefined,
      payment_intent: paymentIntent,
      payment_link: paymentLink,
      status,
      subscription,
    });

    Logger.info('Checkout sessions listed successfully', {
      platformAccountId,
      count: result.data.length,
      hasMore: result.has_more,
    });

    res.json(await ApplyExpand(req, result));
  })
);

export default router;
