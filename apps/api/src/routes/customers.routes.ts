import * as express from 'express';
import { AsyncHandler } from '../utils/AsyncHandler';
import { AppError } from '../utils/AppError';
import { ERRORS } from '../utils/Errors';
import { Logger } from '../utils/Logger';
import { ParseCreatedFilter } from '../utils/ListHelper';

import { db } from '../modules/Database';
import { EventService } from '../modules/EventService';
import { CustomerModule } from '../modules/Customer';

import { ValidateRequest } from '../middleware/ValidateRequest';
import { RequirePlatform } from '../middleware/Authorization';

import {
  CreateCustomerSchema,
  UpdateCustomerSchema,
} from '@zoneless/shared-schemas';
import { ApplyExpand } from '../utils/Expand';

const router = express.Router();

const eventService = new EventService(db);
const customerModule = new CustomerModule(db, eventService);

/**
 * POST /v1/customers
 * Create a new customer.
 */
router.post(
  '/',
  RequirePlatform(),
  ValidateRequest(CreateCustomerSchema),
  AsyncHandler(async (req: express.Request, res: express.Response) => {
    const platformAccountId = req.user.account;

    Logger.info('Creating customer', {
      platformAccountId,
      fields: Object.keys(req.body),
    });

    const customer = await customerModule.CreateCustomer(
      platformAccountId,
      req.body
    );

    Logger.info('Customer created successfully', {
      customerId: customer.id,
    });

    res.status(201).json(await ApplyExpand(req, customer));
  })
);

/**
 * POST /v1/customers/:id
 * Update a customer.
 */
router.post(
  '/:id',
  RequirePlatform(),
  ValidateRequest(UpdateCustomerSchema),
  AsyncHandler(async (req: express.Request, res: express.Response) => {
    const platformAccountId = req.user.account;
    const id = req.params.id;

    // Verify the API key exists and belongs to this platform
    const existingCustomer = await customerModule.GetCustomer(id);

    // Customer exists
    if (!existingCustomer) {
      throw new AppError(
        ERRORS.CUSTOMER_NOT_FOUND.message,
        ERRORS.CUSTOMER_NOT_FOUND.status,
        ERRORS.CUSTOMER_NOT_FOUND.type
      );
    }

    // Customer belongs to this platform
    if (existingCustomer.platform_account !== platformAccountId) {
      throw new AppError(
        ERRORS.CUSTOMER_NOT_FOUND.message,
        ERRORS.CUSTOMER_NOT_FOUND.status,
        ERRORS.CUSTOMER_NOT_FOUND.type
      );
    }

    Logger.info('Updating Customer', {
      customerId: id,
      fields: Object.keys(req.body),
    });

    const updatedCustomer = await customerModule.UpdateCustomer(id, req.body);

    Logger.info('Customer updated successfully', {
      customerId: updatedCustomer.id,
    });

    res.json(await ApplyExpand(req, updatedCustomer));
  })
);

/**
 * GET /v1/customers/:id
 * Retrieve a customer.
 */
router.get(
  '/:id',
  RequirePlatform(),
  AsyncHandler(async (req: express.Request, res: express.Response) => {
    const platformAccountId = req.user.account;
    const id = req.params.id;

    const customer = await customerModule.GetCustomer(id);

    if (!customer) {
      throw new AppError(
        ERRORS.CUSTOMER_NOT_FOUND.message,
        ERRORS.CUSTOMER_NOT_FOUND.status,
        ERRORS.CUSTOMER_NOT_FOUND.type
      );
    }

    // Verify the API key belongs to this platform
    if (customer.platform_account !== platformAccountId) {
      throw new AppError(
        ERRORS.CUSTOMER_NOT_FOUND.message,
        ERRORS.CUSTOMER_NOT_FOUND.status,
        ERRORS.CUSTOMER_NOT_FOUND.type
      );
    }

    res.json(await ApplyExpand(req, customer));
  })
);

/**
 * DELETE /v1/customers/:id
 * Delete a customer.
 */
router.delete(
  '/:id',
  RequirePlatform(),
  AsyncHandler(async (req: express.Request, res: express.Response) => {
    const platformAccountId = req.user.account;
    const id = req.params.id;

    // Verify the API key exists and belongs to this platform
    const existingCustomer = await customerModule.GetCustomer(id);

    if (!existingCustomer) {
      throw new AppError(
        ERRORS.CUSTOMER_NOT_FOUND.message,
        ERRORS.CUSTOMER_NOT_FOUND.status,
        ERRORS.CUSTOMER_NOT_FOUND.type
      );
    }

    if (existingCustomer.platform_account !== platformAccountId) {
      throw new AppError(
        ERRORS.CUSTOMER_NOT_FOUND.message,
        ERRORS.CUSTOMER_NOT_FOUND.status,
        ERRORS.CUSTOMER_NOT_FOUND.type
      );
    }

    Logger.info('Deleting Customer', { customerId: id });

    const result = await customerModule.DeleteCustomer(id);

    Logger.info('Customer deleted successfully', { customerId: id });

    res.json(result);
  })
);

/**
 * GET /v1/customers
 * Returns a list of customers
 */
router.get(
  '/',
  RequirePlatform(),
  AsyncHandler(async (req: express.Request, res: express.Response) => {
    const platformAccountId = req.user.account;

    Logger.info('Listing customers', { platformAccountId });

    //Parse query parameters
    const limit = req.query.limit
      ? parseInt(req.query.limit as string, 10)
      : 10;
    const startingAfter = req.query.starting_after as string | undefined;
    const endingBefore = req.query.ending_before as string | undefined;
    const created = ParseCreatedFilter(req.query as Record<string, unknown>);

    const email = req.query.email as string | undefined;
    const testClock = req.query.test_clock as string | undefined;

    const result = await customerModule.ListCustomers({
      account: platformAccountId,
      limit,
      startingAfter,
      endingBefore,
      created,
      email,
      test_clock: testClock,
    });

    Logger.info('Customers listed successfully', {
      platformAccountId,
      count: result.data.length,
      hasMore: result.has_more,
    });

    res.json(await ApplyExpand(req, result));
  })
);

export default router;
