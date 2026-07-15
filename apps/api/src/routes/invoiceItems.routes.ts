/**
 * @fileOverview Invoice Item routes
 *
 * Handles creating, retrieving, updating, listing, and deleting invoice items.
 *
 * @see https://docs.stripe.com/api/invoiceitems
 */

import * as express from 'express';
import { AsyncHandler } from '../utils/AsyncHandler';
import { AppError } from '../utils/AppError';
import { ERRORS } from '../utils/Errors';
import { Logger } from '../utils/Logger';
import {
  ParseCreatedFilter,
  ParseOptionalQueryBoolean,
} from '../utils/ListHelper';

import { db } from '../modules/Database';
import { EventService } from '../modules/EventService';
import { CustomerModule } from '../modules/Customer';
import { PriceModule } from '../modules/Price';
import { ProductModule } from '../modules/Product';
import { InvoiceItemModule } from '../modules/InvoiceItem';

import { ValidateRequest } from '../middleware/ValidateRequest';
import { RequirePlatform } from '../middleware/Authorization';

import {
  CreateInvoiceItemSchema,
  UpdateInvoiceItemSchema,
} from '@zoneless/shared-schemas';
import { InvoiceItem } from '@zoneless/shared-types';
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

RegisterExpansions('invoiceitem', {
  customer: {
    sourcePath: 'customer',
    targetObject: 'customer',
    BatchLoad: (ids, ctx) => customerModule.BatchGet(ids, ctx.platformAccount),
  },
});

/**
 * Fetch an Invoice Item and verify it belongs to the requesting platform.
 */
async function GetOwnedInvoiceItem(
  id: string,
  platformAccountId: string
): Promise<InvoiceItem> {
  const invoiceItem = await invoiceItemModule.GetInvoiceItem(id);

  if (!invoiceItem || invoiceItem.platform_account !== platformAccountId) {
    throw new AppError(
      ERRORS.INVOICE_ITEM_NOT_FOUND.message,
      ERRORS.INVOICE_ITEM_NOT_FOUND.status,
      ERRORS.INVOICE_ITEM_NOT_FOUND.type
    );
  }

  return invoiceItem;
}

/**
 * POST /v1/invoiceitems
 * Create a new invoice item.
 */
router.post(
  '/',
  RequirePlatform(),
  ValidateRequest(CreateInvoiceItemSchema),
  AsyncHandler(async (req: express.Request, res: express.Response) => {
    const platformAccountId = req.user.account;

    Logger.info('Creating Invoice Item', {
      platformAccountId,
      fields: Object.keys(req.body),
    });

    const invoiceItem = await invoiceItemModule.CreateInvoiceItem(
      platformAccountId,
      req.body
    );

    Logger.info('Invoice Item created successfully', {
      invoiceItemId: invoiceItem.id,
    });

    res.status(201).json(await ApplyExpand(req, invoiceItem));
  })
);

/**
 * POST /v1/invoiceitems/:id
 * Update an invoice item.
 */
router.post(
  '/:id',
  RequirePlatform(),
  ValidateRequest(UpdateInvoiceItemSchema),
  AsyncHandler(async (req: express.Request, res: express.Response) => {
    const platformAccountId = req.user.account;
    const id = req.params.id;

    await GetOwnedInvoiceItem(id, platformAccountId);

    Logger.info('Updating Invoice Item', {
      invoiceItemId: id,
      fields: Object.keys(req.body),
    });

    const updated = await invoiceItemModule.UpdateInvoiceItem(id, req.body);

    Logger.info('Invoice Item updated successfully', {
      invoiceItemId: updated.id,
    });

    res.json(await ApplyExpand(req, updated));
  })
);

/**
 * GET /v1/invoiceitems/:id
 * Retrieve an invoice item.
 */
router.get(
  '/:id',
  RequirePlatform(),
  AsyncHandler(async (req: express.Request, res: express.Response) => {
    const platformAccountId = req.user.account;
    const id = req.params.id;

    const invoiceItem = await GetOwnedInvoiceItem(id, platformAccountId);

    res.json(await ApplyExpand(req, invoiceItem));
  })
);

/**
 * DELETE /v1/invoiceitems/:id
 * Delete an invoice item.
 */
router.delete(
  '/:id',
  RequirePlatform(),
  AsyncHandler(async (req: express.Request, res: express.Response) => {
    const platformAccountId = req.user.account;
    const id = req.params.id;

    await GetOwnedInvoiceItem(id, platformAccountId);

    Logger.info('Deleting Invoice Item', { invoiceItemId: id });

    const result = await invoiceItemModule.DeleteInvoiceItem(id);

    Logger.info('Invoice Item deleted successfully', { invoiceItemId: id });

    res.json(result);
  })
);

/**
 * GET /v1/invoiceitems
 * Returns a list of invoice items.
 */
router.get(
  '/',
  RequirePlatform(),
  AsyncHandler(async (req: express.Request, res: express.Response) => {
    const platformAccountId = req.user.account;

    Logger.info('Listing Invoice Items', { platformAccountId });

    const limit = req.query.limit
      ? parseInt(req.query.limit as string, 10)
      : 10;
    const startingAfter = req.query.starting_after as string | undefined;
    const endingBefore = req.query.ending_before as string | undefined;
    const created = ParseCreatedFilter(req.query as Record<string, unknown>);

    const customer = req.query.customer as string | undefined;
    const customerAccount = req.query.customer_account as string | undefined;
    const invoice = req.query.invoice as string | undefined;
    const pending = ParseOptionalQueryBoolean(req.query.pending);

    const result = await invoiceItemModule.ListInvoiceItems({
      account: platformAccountId,
      limit,
      startingAfter,
      endingBefore,
      created,
      customer,
      customer_account: customerAccount,
      invoice,
      pending,
    });

    Logger.info('Invoice Items listed successfully', {
      platformAccountId,
      count: result.data.length,
      hasMore: result.has_more,
    });

    res.json(await ApplyExpand(req, result));
  })
);

export default router;
