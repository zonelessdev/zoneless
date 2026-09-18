/**
 * @fileOverview Subscription Item routes
 *
 * Handles creating, retrieving, updating, listing, and deleting subscription items.
 *
 * @see https://docs.stripe.com/api/subscription_items
 */

import * as express from 'express';
import { AsyncHandler } from '../utils/AsyncHandler';
import { AppError } from '../utils/AppError';
import { ERRORS } from '../utils/Errors';
import { Logger } from '../utils/Logger';

import { db } from '../modules/Database';
import { EventService } from '../modules/EventService';
import { CustomerModule } from '../modules/Customer';
import { PriceModule } from '../modules/Price';
import { ProductModule } from '../modules/Product';
import { InvoiceItemModule } from '../modules/InvoiceItem';
import { InvoiceModule } from '../modules/Invoice';
import { SubscriptionModule } from '../modules/Subscription';
import { PaymentIntentModule } from '../modules/PaymentIntent';
import { ChargeModule } from '../modules/Charge';

import { ValidateRequest } from '../middleware/ValidateRequest';
import { RequirePlatform } from '../middleware/Authorization';

import {
  CreateSubscriptionItemSchema,
  UpdateSubscriptionItemSchema,
  DeleteSubscriptionItemSchema,
} from '@zoneless/shared-schemas';
import { SubscriptionItem } from '@zoneless/shared-types';
import { ApplyExpand } from '../utils/Expand';

const router = express.Router();

const eventService = new EventService(db);
const customerModule = new CustomerModule(db, eventService);
const productModule = new ProductModule(db, eventService);
const priceModule = new PriceModule(db, eventService, productModule);
const paymentIntentModule = new PaymentIntentModule(
  db,
  eventService,
  customerModule
);
const chargeModule = new ChargeModule(db, eventService, customerModule);
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
  invoiceItemModule,
  paymentIntentModule,
  chargeModule,
  priceModule
);
const subscriptionModule = new SubscriptionModule(
  db,
  eventService,
  customerModule,
  priceModule,
  invoiceModule
);

/**
 * Fetch a Subscription Item and verify it belongs to the requesting platform.
 */
async function GetOwnedSubscriptionItem(
  id: string,
  platformAccountId: string
): Promise<SubscriptionItem> {
  const subscriptionItem = await subscriptionModule.GetItem(
    id,
    platformAccountId
  );

  if (!subscriptionItem) {
    throw new AppError(
      'Subscription item not found',
      ERRORS.INVALID_REQUEST.status,
      ERRORS.INVALID_REQUEST.type
    );
  }

  return subscriptionItem;
}

/**
 * POST /v1/subscription_items
 * Create a new subscription item.
 */
router.post(
  '/',
  RequirePlatform(),
  ValidateRequest(CreateSubscriptionItemSchema),
  AsyncHandler(async (req: express.Request, res: express.Response) => {
    const platformAccountId = req.user.account;

    Logger.info('Creating Subscription Item', {
      platformAccountId,
      fields: Object.keys(req.body),
    });

    const subscriptionItem = await subscriptionModule.CreateItem(
      platformAccountId,
      req.body
    );

    Logger.info('Subscription Item created successfully', {
      subscriptionItemId: subscriptionItem.id,
    });

    res.status(201).json(await ApplyExpand(req, subscriptionItem));
  })
);

/**
 * POST /v1/subscription_items/:id
 * Update a subscription item.
 */
router.post(
  '/:id',
  RequirePlatform(),
  ValidateRequest(UpdateSubscriptionItemSchema),
  AsyncHandler(async (req: express.Request, res: express.Response) => {
    const platformAccountId = req.user.account;
    const id = req.params.id;

    Logger.info('Updating Subscription Item', {
      subscriptionItemId: id,
      fields: Object.keys(req.body),
    });

    const updated = await subscriptionModule.UpdateItem(
      id,
      req.body,
      platformAccountId
    );

    Logger.info('Subscription Item updated successfully', {
      subscriptionItemId: updated.id,
    });

    res.json(await ApplyExpand(req, updated));
  })
);

/**
 * GET /v1/subscription_items/:id
 * Retrieve a subscription item.
 */
router.get(
  '/:id',
  RequirePlatform(),
  AsyncHandler(async (req: express.Request, res: express.Response) => {
    const platformAccountId = req.user.account;
    const id = req.params.id;

    const subscriptionItem = await GetOwnedSubscriptionItem(
      id,
      platformAccountId
    );

    res.json(await ApplyExpand(req, subscriptionItem));
  })
);

/**
 * DELETE /v1/subscription_items/:id
 * Delete a subscription item.
 */
router.delete(
  '/:id',
  RequirePlatform(),
  ValidateRequest(DeleteSubscriptionItemSchema),
  AsyncHandler(async (req: express.Request, res: express.Response) => {
    const platformAccountId = req.user.account;
    const id = req.params.id;

    Logger.info('Deleting Subscription Item', { subscriptionItemId: id });

    const result = await subscriptionModule.DeleteItem(
      id,
      req.body,
      platformAccountId
    );

    Logger.info('Subscription Item deleted successfully', {
      subscriptionItemId: id,
    });

    res.json(result);
  })
);

/**
 * GET /v1/subscription_items
 * Returns a list of subscription items.
 */
router.get(
  '/',
  RequirePlatform(),
  AsyncHandler(async (req: express.Request, res: express.Response) => {
    const platformAccountId = req.user.account;

    Logger.info('Listing Subscription Items', { platformAccountId });

    const limit = req.query.limit
      ? parseInt(req.query.limit as string, 10)
      : 10;
    const startingAfter = req.query.starting_after as string | undefined;
    const endingBefore = req.query.ending_before as string | undefined;

    const subscription = req.query.subscription as string | undefined;

    if (!subscription) {
      throw new AppError(
        'Missing required parameter: subscription',
        ERRORS.VALIDATION_ERROR.status,
        ERRORS.VALIDATION_ERROR.type
      );
    }

    const result = await subscriptionModule.ListItems({
      account: platformAccountId,
      limit,
      startingAfter,
      endingBefore,
      subscription,
    });

    Logger.info('Subscription Items listed successfully', {
      platformAccountId,
      count: result.data.length,
      hasMore: result.has_more,
    });

    res.json(await ApplyExpand(req, result));
  })
);

export default router;
