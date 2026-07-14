import * as express from 'express';
import { AsyncHandler } from '../utils/AsyncHandler';
import { AppError } from '../utils/AppError';
import { ERRORS } from '../utils/Errors';
import { Logger } from '../utils/Logger';
import { ParseOptionalQueryBoolean } from '../utils/ListHelper';

import { db } from '../modules/Database';
import { EventService } from '../modules/EventService';
import { ProductModule } from '../modules/Product';
import { PriceModule } from '../modules/Price';
import { CustomerModule } from '../modules/Customer';
import { PaymentIntentModule } from '../modules/PaymentIntent';
import { CheckoutSessionModule } from '../modules/CheckoutSession';
import { PaymentLinkModule } from '../modules/PaymentLink';

import { ValidateRequest } from '../middleware/ValidateRequest';
import { RequirePlatform } from '../middleware/Authorization';

import {
  CreatePaymentLinkSchema,
  UpdatePaymentLinkSchema,
} from '@zoneless/shared-schemas';
import { ApplyExpand } from '../utils/Expand';

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
const paymentLinkModule = new PaymentLinkModule(
  db,
  eventService,
  priceModule,
  productModule,
  checkoutSessionModule
);

async function GetOwnedPaymentLink(id: string, platformAccountId: string) {
  const paymentLink = await paymentLinkModule.GetPaymentLink(id);
  if (!paymentLink || paymentLink.platform_account !== platformAccountId) {
    throw new AppError(
      ERRORS.PAYMENT_LINK_NOT_FOUND.message,
      ERRORS.PAYMENT_LINK_NOT_FOUND.status,
      ERRORS.PAYMENT_LINK_NOT_FOUND.type
    );
  }
  return paymentLink;
}

/**
 * POST /v1/payment_links
 * Create a payment link.
 */
router.post(
  '/',
  RequirePlatform(),
  ValidateRequest(CreatePaymentLinkSchema),
  AsyncHandler(async (req: express.Request, res: express.Response) => {
    const platformAccountId = req.user.account;

    Logger.info('Creating payment link', {
      platformAccountId,
      fields: Object.keys(req.body),
    });

    const paymentLink = await paymentLinkModule.CreatePaymentLink(
      platformAccountId,
      req.body
    );

    Logger.info('Payment link created successfully', {
      paymentLinkId: paymentLink.id,
    });

    res.status(201).json(await ApplyExpand(req, paymentLink));
  })
);

/**
 * GET /v1/payment_links/:id/line_items
 * List a payment link's line items.
 */
router.get(
  '/:id/line_items',
  RequirePlatform(),
  AsyncHandler(async (req: express.Request, res: express.Response) => {
    const platformAccountId = req.user.account;
    const paymentLink = await GetOwnedPaymentLink(
      req.params.id,
      platformAccountId
    );

    const limit = req.query.limit
      ? parseInt(req.query.limit as string, 10)
      : 10;
    const startingAfter = req.query.starting_after as string | undefined;
    const endingBefore = req.query.ending_before as string | undefined;

    const result = paymentLinkModule.ListLineItems(paymentLink, {
      limit,
      startingAfter,
      endingBefore,
    });

    res.json(await ApplyExpand(req, result));
  })
);

/**
 * POST /v1/payment_links/:id
 * Update a payment link.
 */
router.post(
  '/:id',
  RequirePlatform(),
  ValidateRequest(UpdatePaymentLinkSchema),
  AsyncHandler(async (req: express.Request, res: express.Response) => {
    const platformAccountId = req.user.account;
    const id = req.params.id;

    await GetOwnedPaymentLink(id, platformAccountId);

    Logger.info('Updating payment link', {
      paymentLinkId: id,
      fields: Object.keys(req.body),
    });

    const updated = await paymentLinkModule.UpdatePaymentLink(id, req.body);

    Logger.info('Payment link updated successfully', {
      paymentLinkId: updated.id,
    });

    res.json(await ApplyExpand(req, updated));
  })
);

/**
 * GET /v1/payment_links/:id
 * Retrieve a payment link.
 */
router.get(
  '/:id',
  RequirePlatform(),
  AsyncHandler(async (req: express.Request, res: express.Response) => {
    const platformAccountId = req.user.account;
    const paymentLink = await GetOwnedPaymentLink(
      req.params.id,
      platformAccountId
    );
    res.json(await ApplyExpand(req, paymentLink));
  })
);

/**
 * GET /v1/payment_links
 * List payment links.
 */
router.get(
  '/',
  RequirePlatform(),
  AsyncHandler(async (req: express.Request, res: express.Response) => {
    const platformAccountId = req.user.account;

    Logger.info('Listing payment links', { platformAccountId });

    const limit = req.query.limit
      ? parseInt(req.query.limit as string, 10)
      : 10;
    const startingAfter = req.query.starting_after as string | undefined;
    const endingBefore = req.query.ending_before as string | undefined;
    const active = ParseOptionalQueryBoolean(req.query.active);

    const result = await paymentLinkModule.ListPaymentLinks({
      account: platformAccountId,
      limit,
      startingAfter,
      endingBefore,
      active,
    });

    Logger.info('Payment links listed successfully', {
      platformAccountId,
      count: result.data.length,
      hasMore: result.has_more,
    });

    res.json(await ApplyExpand(req, result));
  })
);

export default router;
