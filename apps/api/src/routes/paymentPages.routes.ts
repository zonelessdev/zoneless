import * as express from 'express';
import { AsyncHandler } from '../utils/AsyncHandler';

import { db } from '../modules/Database';
import { EventService } from '../modules/EventService';
import { CheckoutSessionModule } from '../modules/CheckoutSession';
import { CheckoutPaymentModule } from '../modules/CheckoutPayment';
import { PriceModule } from '../modules/Price';
import { ProductModule } from '../modules/Product';
import { CustomerModule } from '../modules/Customer';
import { ExternalWalletModule } from '../modules/ExternalWallet';

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
const externalWalletModule = new ExternalWalletModule(db, eventService);
const checkoutPaymentModule = new CheckoutPaymentModule(
  db,
  checkoutSessionModule,
  externalWalletModule
);

/**
 * GET /v1/payment_pages/:id
 * Public bootstrap endpoint for the hosted checkout page, mirroring Stripe's
 * payment_pages endpoint. No authentication is required: the unguessable
 * checkout session ID in the URL acts as the bearer credential, which is how
 * Stripe-hosted checkout links work.
 *
 * The response is enriched with the merchant's receiving wallet so the
 * checkout page can display it and build the payment transaction.
 */
router.get(
  '/:id',
  AsyncHandler(async (req: express.Request, res: express.Response) => {
    const session = await checkoutPaymentModule.GetPaymentPageSession(
      req.params.id
    );
    res.json(session);
  })
);

/**
 * POST /v1/payment_pages/:id/prepare
 * Build an unsigned USDC payment transaction for the checkout session,
 * transferring the session total from the customer's wallet to the
 * merchant's wallet. The customer signs and broadcasts it via their wallet.
 */
router.post(
  '/:id/prepare',
  AsyncHandler(async (req: express.Request, res: express.Response) => {
    const { payer_wallet: payerWallet, email } = req.body as {
      payer_wallet?: string;
      email?: string;
    };

    const prepared = await checkoutPaymentModule.PreparePayment(
      req.params.id,
      payerWallet,
      email
    );
    res.json(prepared);
  })
);

/**
 * POST /v1/payment_pages/:id/confirm
 * Verify a broadcast payment transaction on-chain and complete the checkout
 * session. Emits 'checkout.session.completed' on success. Idempotent: if the
 * session was already completed with the same signature, it is returned as-is.
 */
router.post(
  '/:id/confirm',
  AsyncHandler(async (req: express.Request, res: express.Response) => {
    const { signature } = req.body as { signature?: string };

    const session = await checkoutPaymentModule.ConfirmPayment(
      req.params.id,
      signature
    );
    res.json(session);
  })
);

export default router;
