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
import { ProductModule } from '../modules/Product';
import { PriceModule } from '../modules/Price';

import { ValidateRequest } from '../middleware/ValidateRequest';
import { RequirePlatform } from '../middleware/Authorization';

import {
  CreateProductSchema,
  UpdateProductSchema,
} from '@zoneless/shared-schemas';
import { ApplyExpand, RegisterExpansions } from '../utils/Expand';

const router = express.Router();

const eventService = new EventService(db);
const priceModule = new PriceModule(db, eventService); //Pass into product module to enable creating prices.
const productModule = new ProductModule(db, eventService, priceModule);

RegisterExpansions('product', {
  default_price: {
    sourcePath: 'default_price',
    targetObject: 'price',
    BatchLoad: (ids, ctx) => priceModule.BatchGet(ids, ctx.platformAccount),
  },
});

/**
 * POST /v1/products
 * Create a new product.
 */
router.post(
  '/',
  RequirePlatform(),
  ValidateRequest(CreateProductSchema),
  AsyncHandler(async (req: express.Request, res: express.Response) => {
    const platformAccountId = req.user.account;

    Logger.info('Creating product', {
      platformAccountId,
      fields: Object.keys(req.body),
    });

    const product = await productModule.CreateProduct(
      platformAccountId,
      req.body
    );

    Logger.info('Product created successfully', {
      productId: product.id,
    });

    res.status(201).json(await ApplyExpand(req, product));
  })
);

/**
 * POST /v1/products/:id
 * Update a product.
 */
router.post(
  '/:id',
  RequirePlatform(),
  ValidateRequest(UpdateProductSchema),
  AsyncHandler(async (req: express.Request, res: express.Response) => {
    const platformAccountId = req.user.account;
    const id = req.params.id;

    // Verify the API key exists and belongs to this platform
    const existingProduct = await productModule.GetProduct(id);

    // Product exists
    if (!existingProduct) {
      throw new AppError(
        ERRORS.PRODUCT_NOT_FOUND.message,
        ERRORS.PRODUCT_NOT_FOUND.status,
        ERRORS.PRODUCT_NOT_FOUND.type
      );
    }

    // Product belongs to this platform
    if (existingProduct.platform_account !== platformAccountId) {
      throw new AppError(
        ERRORS.PRODUCT_NOT_FOUND.message,
        ERRORS.PRODUCT_NOT_FOUND.status,
        ERRORS.PRODUCT_NOT_FOUND.type
      );
    }

    Logger.info('Updating Product', {
      productId: id,
      fields: Object.keys(req.body),
    });

    const updatedProduct = await productModule.UpdateProduct(id, req.body);

    Logger.info('Product updated successfully', {
      productId: updatedProduct.id,
    });

    res.json(await ApplyExpand(req, updatedProduct));
  })
);

/**
 * GET /v1/products/:id
 * Retrieve a product.
 */
router.get(
  '/:id',
  RequirePlatform(),
  AsyncHandler(async (req: express.Request, res: express.Response) => {
    const platformAccountId = req.user.account;
    const id = req.params.id;

    const product = await productModule.GetProduct(id);

    if (!product) {
      throw new AppError(
        ERRORS.PRODUCT_NOT_FOUND.message,
        ERRORS.PRODUCT_NOT_FOUND.status,
        ERRORS.PRODUCT_NOT_FOUND.type
      );
    }

    // Verify the API key belongs to this platform
    if (product.platform_account !== platformAccountId) {
      throw new AppError(
        ERRORS.PRODUCT_NOT_FOUND.message,
        ERRORS.PRODUCT_NOT_FOUND.status,
        ERRORS.PRODUCT_NOT_FOUND.type
      );
    }

    res.json(await ApplyExpand(req, product));
  })
);

/**
 * DELETE /v1/products/:id
 * Delete a product.
 */
router.delete(
  '/:id',
  RequirePlatform(),
  AsyncHandler(async (req: express.Request, res: express.Response) => {
    const platformAccountId = req.user.account;
    const id = req.params.id;

    // Verify the API key exists and belongs to this platform
    const existingProduct = await productModule.GetProduct(id);

    if (!existingProduct) {
      throw new AppError(
        ERRORS.PRODUCT_NOT_FOUND.message,
        ERRORS.PRODUCT_NOT_FOUND.status,
        ERRORS.PRODUCT_NOT_FOUND.type
      );
    }

    if (existingProduct.platform_account !== platformAccountId) {
      throw new AppError(
        ERRORS.PRODUCT_NOT_FOUND.message,
        ERRORS.PRODUCT_NOT_FOUND.status,
        ERRORS.PRODUCT_NOT_FOUND.type
      );
    }

    Logger.info('Deleting Product', { productId: id });

    const result = await productModule.DeleteProduct(id);

    Logger.info('Product deleted successfully', { productId: id });

    res.json(result);
  })
);

/**
 * GET /v1/products
 * Returns a list of products
 */
router.get(
  '/',
  RequirePlatform(),
  AsyncHandler(async (req: express.Request, res: express.Response) => {
    const platformAccountId = req.user.account;

    Logger.info('Listing products', { platformAccountId });

    //Parse query parameters
    const limit = req.query.limit
      ? parseInt(req.query.limit as string, 10)
      : 10;
    const startingAfter = req.query.starting_after as string | undefined;
    const endingBefore = req.query.ending_before as string | undefined;
    const created = ParseCreatedFilter(req.query as Record<string, unknown>);

    const active = ParseOptionalQueryBoolean(req.query.active);
    const shippable = ParseOptionalQueryBoolean(req.query.shippable);
    const url = req.query.url as string | undefined;
    let ids: string[] | undefined = undefined;
    if (req.query.ids) {
      ids = (req.query.ids as string).split(',');
    }

    const result = await productModule.ListProducts({
      account: platformAccountId,
      limit,
      startingAfter,
      endingBefore,
      created,
      active,
      shippable,
      ids,
      url,
    });

    Logger.info('Products listed successfully', {
      platformAccountId,
      count: result.data.length,
      hasMore: result.has_more,
    });

    res.json(await ApplyExpand(req, result));
  })
);

export default router;
