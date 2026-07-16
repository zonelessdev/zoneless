/**
 * @fileOverview Subscription routes
 *
 * Handles creating, retrieving, updating, listing, canceling, migrating, and
 * resuming subscriptions.
 *
 * @see https://docs.stripe.com/api/subscriptions
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
import { PriceModule } from '../modules/Price';
import { ProductModule } from '../modules/Product';
import { InvoiceItemModule } from '../modules/InvoiceItem';
import { InvoiceModule } from '../modules/Invoice';
import { SubscriptionModule } from '../modules/Subscription';

import { ValidateRequest } from '../middleware/ValidateRequest';
import { RequirePlatform } from '../middleware/Authorization';

import {
  CreateSubscriptionSchema,
  MigrateSubscriptionSchema,
  ResumeSubscriptionSchema,
  UpdateSubscriptionSchema,
} from '@zoneless/shared-schemas';
import { Subscription } from '@zoneless/shared-types';
import { ApplyExpand, RegisterExpansions } from '../utils/Expand';

const router = express.Router();

const eventService = new EventService(db);
const customerModule = new CustomerModule(db, eventService);
const productModule = new ProductModule(db, eventService);
const priceModule = new PriceModule(db, eventService, productModule);
const invoiceItemModule = new InvoiceItemModule(
  db,
  eventService,
  customerModule,
  priceModule
);
const invoiceModule = new InvoiceModule(
  db,
  eventService,
  customerModule,
  invoiceItemModule
);
const subscriptionModule = new SubscriptionModule(
  db,
  eventService,
  customerModule,
  priceModule,
  invoiceModule
);

RegisterExpansions('subscription', {
  customer: {
    sourcePath: 'customer',
    targetObject: 'customer',
    BatchLoad: (ids, ctx) => customerModule.BatchGet(ids, ctx.platformAccount),
  },
  latest_invoice: {
    sourcePath: 'latest_invoice',
    targetObject: 'invoice',
    BatchLoad: (ids, ctx) => invoiceModule.BatchGet(ids, ctx.platformAccount),
  },
});

/**
 * Fetch a Subscription and verify it belongs to the requesting platform.
 */
async function GetOwnedSubscription(
  id: string,
  platformAccountId: string
): Promise<Subscription> {
  const subscription = await subscriptionModule.GetSubscription(id);

  if (!subscription || subscription.platform_account !== platformAccountId) {
    throw new AppError(
      ERRORS.SUBSCRIPTION_NOT_FOUND.message,
      ERRORS.SUBSCRIPTION_NOT_FOUND.status,
      ERRORS.SUBSCRIPTION_NOT_FOUND.type
    );
  }

  return subscription;
}

/**
 * POST /v1/subscriptions
 * Create a new subscription.
 */
router.post(
  '/',
  RequirePlatform(),
  ValidateRequest(CreateSubscriptionSchema),
  AsyncHandler(async (req: express.Request, res: express.Response) => {
    const platformAccountId = req.user.account;

    Logger.info('Creating Subscription', {
      platformAccountId,
      fields: Object.keys(req.body),
    });

    const subscription = await subscriptionModule.CreateSubscription(
      platformAccountId,
      req.body
    );

    Logger.info('Subscription created successfully', {
      subscriptionId: subscription.id,
    });

    res.status(201).json(await ApplyExpand(req, subscription));
  })
);

/**
 * POST /v1/subscriptions/:id/migrate
 * Upgrade billing_mode to flexible.
 */
router.post(
  '/:id/migrate',
  RequirePlatform(),
  ValidateRequest(MigrateSubscriptionSchema),
  AsyncHandler(async (req: express.Request, res: express.Response) => {
    const platformAccountId = req.user.account;
    const id = req.params.id;

    await GetOwnedSubscription(id, platformAccountId);

    Logger.info('Migrating Subscription', { subscriptionId: id });

    const subscription = await subscriptionModule.MigrateSubscription(
      id,
      req.body
    );

    Logger.info('Subscription migrated successfully', { subscriptionId: id });

    res.json(await ApplyExpand(req, subscription));
  })
);

/**
 * POST /v1/subscriptions/:id/resume
 * Resume a paused subscription.
 */
router.post(
  '/:id/resume',
  RequirePlatform(),
  ValidateRequest(ResumeSubscriptionSchema),
  AsyncHandler(async (req: express.Request, res: express.Response) => {
    const platformAccountId = req.user.account;
    const id = req.params.id;

    await GetOwnedSubscription(id, platformAccountId);

    Logger.info('Resuming Subscription', { subscriptionId: id });

    const subscription = await subscriptionModule.ResumeSubscription(
      id,
      req.body
    );

    Logger.info('Subscription resumed successfully', { subscriptionId: id });

    res.json(await ApplyExpand(req, subscription));
  })
);

/**
 * GET /v1/subscriptions/:id
 * Retrieve a subscription.
 */
router.get(
  '/:id',
  RequirePlatform(),
  AsyncHandler(async (req: express.Request, res: express.Response) => {
    const platformAccountId = req.user.account;
    const id = req.params.id;

    Logger.info('Retrieving Subscription', { subscriptionId: id });

    const subscription = await GetOwnedSubscription(id, platformAccountId);

    res.json(await ApplyExpand(req, subscription));
  })
);

/**
 * POST /v1/subscriptions/:id
 * Update a subscription.
 */
router.post(
  '/:id',
  RequirePlatform(),
  ValidateRequest(UpdateSubscriptionSchema),
  AsyncHandler(async (req: express.Request, res: express.Response) => {
    const platformAccountId = req.user.account;
    const id = req.params.id;

    await GetOwnedSubscription(id, platformAccountId);

    Logger.info('Updating Subscription', {
      subscriptionId: id,
      fields: Object.keys(req.body),
    });

    const subscription = await subscriptionModule.UpdateSubscription(
      id,
      req.body
    );

    Logger.info('Subscription updated successfully', { subscriptionId: id });

    res.json(await ApplyExpand(req, subscription));
  })
);

/**
 * DELETE /v1/subscriptions/:id
 * Cancel a subscription immediately.
 */
router.delete(
  '/:id',
  RequirePlatform(),
  AsyncHandler(async (req: express.Request, res: express.Response) => {
    const platformAccountId = req.user.account;
    const id = req.params.id;

    await GetOwnedSubscription(id, platformAccountId);

    Logger.info('Canceling Subscription', { subscriptionId: id });

    const subscription = await subscriptionModule.CancelSubscription(
      id,
      req.body ?? {}
    );

    Logger.info('Subscription canceled successfully', { subscriptionId: id });

    res.json(await ApplyExpand(req, subscription));
  })
);

/**
 * GET /v1/subscriptions
 * Returns a list of subscriptions.
 */
router.get(
  '/',
  RequirePlatform(),
  AsyncHandler(async (req: express.Request, res: express.Response) => {
    const platformAccountId = req.user.account;

    Logger.info('Listing Subscriptions', { platformAccountId });

    const limit = req.query.limit
      ? parseInt(req.query.limit as string, 10)
      : 10;
    const startingAfter = req.query.starting_after as string | undefined;
    const endingBefore = req.query.ending_before as string | undefined;
    const created = ParseCreatedFilter(req.query as Record<string, unknown>);

    const collectionMethod = req.query.collection_method as
      | 'charge_automatically'
      | 'send_invoice'
      | undefined;
    const customer = req.query.customer as string | undefined;
    const customerAccount = req.query.customer_account as string | undefined;
    const price = req.query.price as string | undefined;
    const status = req.query.status as
      | 'active'
      | 'all'
      | 'canceled'
      | 'ended'
      | 'incomplete'
      | 'incomplete_expired'
      | 'past_due'
      | 'paused'
      | 'trialing'
      | 'unpaid'
      | undefined;
    const testClock = req.query.test_clock as string | undefined;

    let automaticTax: { enabled: boolean } | undefined;
    const automaticTaxEnabled = req.query['automatic_tax[enabled]'];
    if (automaticTaxEnabled !== undefined) {
      automaticTax = {
        enabled: automaticTaxEnabled === 'true' || automaticTaxEnabled === '1',
      };
    }

    const result = await subscriptionModule.ListSubscriptions({
      account: platformAccountId,
      limit,
      startingAfter,
      endingBefore,
      created,
      automatic_tax: automaticTax,
      collection_method: collectionMethod,
      customer,
      customer_account: customerAccount,
      price,
      status,
      test_clock: testClock,
    });

    Logger.info('Subscriptions listed successfully', {
      platformAccountId,
      count: result.data.length,
      hasMore: result.has_more,
    });

    res.json(await ApplyExpand(req, result));
  })
);

export default router;
