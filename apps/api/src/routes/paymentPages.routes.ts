import * as express from 'express';
import { AsyncHandler } from '../utils/AsyncHandler';
import { AppError } from '../utils/AppError';
import { ERRORS } from '../utils/Errors';

import { db } from '../modules/Database';
import { EventService } from '../modules/EventService';
import { CheckoutSessionModule } from '../modules/CheckoutSession';
import { PriceModule } from '../modules/Price';
import { ProductModule } from '../modules/Product';
import { CustomerModule } from '../modules/Customer';

import { CheckoutSession } from '@zoneless/shared-types';

const router = express.Router();

const eventService = new EventService(db);
const productModule = new ProductModule(db, eventService);
const priceModule = new PriceModule(db, eventService, productModule);
const customerModule = new CustomerModule(db, eventService);
const checkoutSessionModule = new CheckoutSessionModule(
  db,
  eventService,
  priceModule,
  productModule,
  customerModule
);

/**
 * Strips platform-internal fields before serving a session to an
 * unauthenticated customer.
 */
function SanitizeCheckoutSession(session: CheckoutSession): CheckoutSession {
  return {
    ...session,
    metadata: null,
    line_items: session.line_items
      ? {
          ...session.line_items,
          data: session.line_items.data.map((item) => ({
            ...item,
            metadata: {},
          })),
        }
      : null,
  };
}

/**
 * GET /v1/payment_pages/:id
 * Public bootstrap endpoint for the hosted checkout page, mirroring Stripe's
 * payment_pages endpoint. No authentication is required: the unguessable
 * checkout session ID in the URL acts as the bearer credential, which is how
 * Stripe-hosted checkout links work.
 */
router.get(
  '/:id',
  AsyncHandler(async (req: express.Request, res: express.Response) => {
    const session = await checkoutSessionModule.GetCheckoutSession(
      req.params.id
    );

    if (!session) {
      throw new AppError(
        ERRORS.CHECKOUT_SESSION_NOT_FOUND.message,
        ERRORS.CHECKOUT_SESSION_NOT_FOUND.status,
        ERRORS.CHECKOUT_SESSION_NOT_FOUND.type
      );
    }

    res.json(SanitizeCheckoutSession(session));
  })
);

export default router;
