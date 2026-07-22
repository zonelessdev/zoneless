/**
 * @fileOverview Invoice routes
 *
 * Handles creating, retrieving, updating, listing, deleting, finalizing,
 * marking uncollectible, paying, and voiding invoices.
 *
 * @see https://docs.stripe.com/api/invoices
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
import { PaymentIntentModule } from '../modules/PaymentIntent';
import { ChargeModule } from '../modules/Charge';

import { ValidateRequest } from '../middleware/ValidateRequest';
import { RequirePlatform } from '../middleware/Authorization';

import {
  CreateInvoiceSchema,
  UpdateInvoiceSchema,
  FinalizeInvoiceSchema,
  PayInvoiceSchema,
} from '@zoneless/shared-schemas';
import { Invoice } from '@zoneless/shared-types';
import { ApplyExpand, RegisterExpansions } from '../utils/Expand';

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

RegisterExpansions('invoice', {
  customer: {
    sourcePath: 'customer',
    targetObject: 'customer',
    BatchLoad: (ids, ctx) => customerModule.BatchGet(ids, ctx.platformAccount),
  },
  subscription: {
    sourcePath: 'parent.subscription_details.subscription',
    targetObject: 'subscription',
    BatchLoad: (ids, ctx) =>
      subscriptionModule.BatchGet(ids, ctx.platformAccount),
  },
});

/**
 * Fetch an Invoice and verify it belongs to the requesting platform.
 */
async function GetOwnedInvoice(
  id: string,
  platformAccountId: string
): Promise<Invoice> {
  const invoice = await invoiceModule.GetInvoice(id);

  if (!invoice || invoice.platform_account !== platformAccountId) {
    throw new AppError(
      ERRORS.INVOICE_NOT_FOUND.message,
      ERRORS.INVOICE_NOT_FOUND.status,
      ERRORS.INVOICE_NOT_FOUND.type
    );
  }

  return invoice;
}

/**
 * POST /v1/invoices
 * Create a new draft invoice.
 */
router.post(
  '/',
  RequirePlatform(),
  ValidateRequest(CreateInvoiceSchema),
  AsyncHandler(async (req: express.Request, res: express.Response) => {
    const platformAccountId = req.user.account;

    Logger.info('Creating Invoice', {
      platformAccountId,
      fields: Object.keys(req.body),
    });

    const invoice = await invoiceModule.CreateInvoice(
      platformAccountId,
      req.body
    );

    Logger.info('Invoice created successfully', { invoiceId: invoice.id });

    res.status(201).json(await ApplyExpand(req, invoice));
  })
);

/**
 * POST /v1/invoices/:id/finalize
 * Finalize a draft invoice.
 */
router.post(
  '/:id/finalize',
  RequirePlatform(),
  ValidateRequest(FinalizeInvoiceSchema),
  AsyncHandler(async (req: express.Request, res: express.Response) => {
    const platformAccountId = req.user.account;
    const id = req.params.id;

    await GetOwnedInvoice(id, platformAccountId);

    Logger.info('Finalizing Invoice', { invoiceId: id });

    const invoice = await invoiceModule.FinalizeInvoice(id, req.body);

    Logger.info('Invoice finalized successfully', { invoiceId: invoice.id });

    res.json(await ApplyExpand(req, invoice));
  })
);

/**
 * POST /v1/invoices/:id/mark_uncollectible
 * Mark an invoice as uncollectible.
 */
router.post(
  '/:id/mark_uncollectible',
  RequirePlatform(),
  AsyncHandler(async (req: express.Request, res: express.Response) => {
    const platformAccountId = req.user.account;
    const id = req.params.id;

    await GetOwnedInvoice(id, platformAccountId);

    Logger.info('Marking Invoice uncollectible', { invoiceId: id });

    const invoice = await invoiceModule.MarkInvoiceUncollectible(id);

    Logger.info('Invoice marked uncollectible', { invoiceId: invoice.id });

    res.json(await ApplyExpand(req, invoice));
  })
);

/**
 * POST /v1/invoices/:id/pay
 * Attempt to pay an invoice (v1: paid_out_of_band only).
 */
router.post(
  '/:id/pay',
  RequirePlatform(),
  ValidateRequest(PayInvoiceSchema),
  AsyncHandler(async (req: express.Request, res: express.Response) => {
    const platformAccountId = req.user.account;
    const id = req.params.id;

    await GetOwnedInvoice(id, platformAccountId);

    Logger.info('Paying Invoice', { invoiceId: id });

    const invoice = await invoiceModule.PayInvoice(id, req.body);

    Logger.info('Invoice paid successfully', { invoiceId: invoice.id });

    res.json(await ApplyExpand(req, invoice));
  })
);

/**
 * POST /v1/invoices/:id/void
 * Void a finalized invoice.
 */
router.post(
  '/:id/void',
  RequirePlatform(),
  AsyncHandler(async (req: express.Request, res: express.Response) => {
    const platformAccountId = req.user.account;
    const id = req.params.id;

    await GetOwnedInvoice(id, platformAccountId);

    Logger.info('Voiding Invoice', { invoiceId: id });

    const invoice = await invoiceModule.VoidInvoice(id);

    Logger.info('Invoice voided successfully', { invoiceId: invoice.id });

    res.json(await ApplyExpand(req, invoice));
  })
);

/**
 * POST /v1/invoices/:id
 * Update an invoice.
 */
router.post(
  '/:id',
  RequirePlatform(),
  ValidateRequest(UpdateInvoiceSchema),
  AsyncHandler(async (req: express.Request, res: express.Response) => {
    const platformAccountId = req.user.account;
    const id = req.params.id;

    await GetOwnedInvoice(id, platformAccountId);

    Logger.info('Updating Invoice', {
      invoiceId: id,
      fields: Object.keys(req.body),
    });

    const updated = await invoiceModule.UpdateInvoice(id, req.body);

    Logger.info('Invoice updated successfully', { invoiceId: updated.id });

    res.json(await ApplyExpand(req, updated));
  })
);

/**
 * GET /v1/invoices/:id
 * Retrieve an invoice.
 */
router.get(
  '/:id',
  RequirePlatform(),
  AsyncHandler(async (req: express.Request, res: express.Response) => {
    const platformAccountId = req.user.account;
    const id = req.params.id;

    const invoice = await GetOwnedInvoice(id, platformAccountId);

    res.json(await ApplyExpand(req, invoice));
  })
);

/**
 * DELETE /v1/invoices/:id
 * Delete a draft invoice.
 */
router.delete(
  '/:id',
  RequirePlatform(),
  AsyncHandler(async (req: express.Request, res: express.Response) => {
    const platformAccountId = req.user.account;
    const id = req.params.id;

    await GetOwnedInvoice(id, platformAccountId);

    Logger.info('Deleting Invoice', { invoiceId: id });

    const result = await invoiceModule.DeleteInvoice(id);

    Logger.info('Invoice deleted successfully', { invoiceId: id });

    res.json(result);
  })
);

/**
 * GET /v1/invoices
 * Returns a list of invoices.
 */
router.get(
  '/',
  RequirePlatform(),
  AsyncHandler(async (req: express.Request, res: express.Response) => {
    const platformAccountId = req.user.account;

    Logger.info('Listing Invoices', { platformAccountId });

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
    const status = req.query.status as
      | 'draft'
      | 'open'
      | 'paid'
      | 'uncollectible'
      | 'void'
      | undefined;
    const subscription = req.query.subscription as string | undefined;

    const result = await invoiceModule.ListInvoices({
      account: platformAccountId,
      limit,
      startingAfter,
      endingBefore,
      created,
      collection_method: collectionMethod,
      customer,
      customer_account: customerAccount,
      status,
      subscription,
    });

    Logger.info('Invoices listed successfully', {
      platformAccountId,
      count: result.data.length,
      hasMore: result.has_more,
    });

    res.json(await ApplyExpand(req, result));
  })
);

export default router;
