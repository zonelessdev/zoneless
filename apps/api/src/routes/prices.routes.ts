import * as express from 'express';
import { AsyncHandler } from '../utils/AsyncHandler';
import { AppError } from '../utils/AppError';
import { ERRORS } from '../utils/Errors';
import { Logger } from '../utils/Logger';

import { db } from '../modules/Database';
import { EventService } from '../modules/EventService';
import { PriceModule } from '../modules/Price';
import { ProductModule } from '../modules/Product';

import { ValidateRequest } from '../middleware/ValidateRequest';
import { RequirePlatform } from '../middleware/Authorization';

import { CreatePriceSchema, UpdatePriceSchema } from '@zoneless/shared-schemas';
import {
  ParseCreatedFilter,
  ParseOptionalQueryBoolean,
} from '../utils/ListHelper';
import { ApplyExpand, RegisterExpansions } from '../utils/Expand';
import type { RecurringInterval } from '@zoneless/shared-types';

const router = express.Router();

const eventService = new EventService(db);
const productModule = new ProductModule(db, eventService); //Pass into price module to enable creating products.
const priceModule = new PriceModule(db, eventService, productModule);

RegisterExpansions('price', {
  product: {
    sourcePath: 'product',
    targetObject: 'product',
    BatchLoad: (ids, ctx) => productModule.BatchGet(ids, ctx.platformAccount),
  },
});

/**
 * POST /v1/prices
 * Create a new price.
 */
router.post(
  '/',
  RequirePlatform(),
  ValidateRequest(CreatePriceSchema),
  AsyncHandler(async (req: express.Request, res: express.Response) => {
    const platformAccountId = req.user.account;

    Logger.info('Creating price', {
      platformAccountId,
      fields: Object.keys(req.body),
    });

    const price = await priceModule.CreatePrice(platformAccountId, req.body);

    Logger.info('Price created successfully', {
      priceId: price.id,
    });

    res.status(201).json(await ApplyExpand(req, price));
  })
);
export default router;

/**
 * POST /v1/prices/:id
 * Update a price.
 */
router.post(
  '/:id',
  RequirePlatform(),
  ValidateRequest(UpdatePriceSchema),
  AsyncHandler(async (req: express.Request, res: express.Response) => {
    const platformAccountId = req.user.account;
    const id = req.params.id;

    // Verify the API key exists and belongs to this platform
    const existingPrice = await priceModule.GetPrice(id);

    // Price exists
    if (!existingPrice) {
      throw new AppError(
        ERRORS.PRICE_NOT_FOUND.message,
        ERRORS.PRICE_NOT_FOUND.status,
        ERRORS.PRICE_NOT_FOUND.type
      );
    }

    // Price belongs to this platform
    if (existingPrice.platform_account !== platformAccountId) {
      throw new AppError(
        ERRORS.PRICE_NOT_FOUND.message,
        ERRORS.PRICE_NOT_FOUND.status,
        ERRORS.PRICE_NOT_FOUND.type
      );
    }

    Logger.info('Updating Price', {
      priceId: id,
      fields: Object.keys(req.body),
    });

    const updatedPrice = await priceModule.UpdatePrice(id, req.body);

    Logger.info('Price updated successfully', {
      priceId: updatedPrice.id,
    });

    res.json(await ApplyExpand(req, updatedPrice));
  })
);

/**
 * GET /v1/prices/:id
 * Retrieve a price.
 */
router.get(
  '/:id',
  RequirePlatform(),
  AsyncHandler(async (req: express.Request, res: express.Response) => {
    const platformAccountId = req.user.account;
    const id = req.params.id;

    const price = await priceModule.GetPrice(id);

    if (!price) {
      throw new AppError(
        ERRORS.PRICE_NOT_FOUND.message,
        ERRORS.PRICE_NOT_FOUND.status,
        ERRORS.PRICE_NOT_FOUND.type
      );
    }

    // Verify the API key belongs to this platform
    if (price.platform_account !== platformAccountId) {
      throw new AppError(
        ERRORS.PRICE_NOT_FOUND.message,
        ERRORS.PRICE_NOT_FOUND.status,
        ERRORS.PRICE_NOT_FOUND.type
      );
    }

    res.json(await ApplyExpand(req, price));
  })
);

/**
 * GET /v1/prices
 * Returns a list of prices
 */
router.get(
  '/',
  RequirePlatform(),
  AsyncHandler(async (req: express.Request, res: express.Response) => {
    const platformAccountId = req.user.account;

    Logger.info('Listing prices', { platformAccountId });

    //Parse query parameters
    const limit = req.query.limit
      ? parseInt(req.query.limit as string, 10)
      : 10;
    const startingAfter = req.query.starting_after as string | undefined;
    const endingBefore = req.query.ending_before as string | undefined;
    const created = ParseCreatedFilter(req.query as Record<string, unknown>);

    const active = ParseOptionalQueryBoolean(req.query.active);
    const currency = req.query.currency as string | undefined;
    const product = req.query.product as string | undefined;
    const type = req.query.type as 'recurring' | 'one_time' | undefined;
    let lookup_keys: string[] | undefined = undefined;
    if (req.query.lookup_keys) {
      lookup_keys = (req.query.lookup_keys as string).split(',');
    }
    const recurring = req.query.recurring as
      | {
          interval: RecurringInterval;
          meter: string | undefined;
          usage_type: 'metered' | 'licensed';
        }
      | undefined;

    const result = await priceModule.ListPrices({
      account: platformAccountId,
      limit,
      startingAfter,
      endingBefore,
      created,
      active,
      currency,
      product,
      type,
      lookup_keys,
      recurring,
    });

    Logger.info('Prices listed successfully', {
      platformAccountId,
      count: result.data.length,
      hasMore: result.has_more,
    });

    res.json(await ApplyExpand(req, result));
  })
);
