import * as express from 'express';
import { AsyncHandler } from '../utils/AsyncHandler';
import { Logger } from '../utils/Logger';

import { db } from '../modules/Database';
import { EventService } from '../modules/EventService';
import { CustomerModule } from '../modules/Customer';

import { ValidateRequest } from '../middleware/ValidateRequest';
import { RequirePlatform } from '../middleware/Authorization';

import { CreateCustomerSchema } from '@zoneless/shared-schemas';
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

export default router;
