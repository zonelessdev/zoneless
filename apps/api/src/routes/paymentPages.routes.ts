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
import { PaymentIntentModule } from '../modules/PaymentIntent';
import { ChargeModule } from '../modules/Charge';
import { PaymentLinkModule } from '../modules/PaymentLink';

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
const chargeModule = new ChargeModule(db, eventService, customerModule);
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
const externalWalletModule = new ExternalWalletModule(db, eventService);
const checkoutPaymentModule = new CheckoutPaymentModule(
  db,
  checkoutSessionModule,
  externalWalletModule,
  productModule,
  paymentIntentModule,
  chargeModule,
  paymentLinkModule
);

/**
 * POST /v1/payment_pages/from_payment_link/:urlSlug
 * Public endpoint: create a Checkout Session from a Payment Link template.
 * `urlSlug` is the opaque slug from `/b/{url_slug}`.
 * Returns the new session; the hosted opener navigates to `/c/{session.url_slug}`.
 */
router.post(
  '/from_payment_link/:urlSlug',
  AsyncHandler(async (req: express.Request, res: express.Response) => {
    const session = await paymentLinkModule.OpenPaymentLink(req.params.urlSlug);
    res.status(201).json(session);
  })
);

/**
 * GET /v1/payment_pages/:urlSlug
 * Public bootstrap endpoint for the hosted checkout page, mirroring Stripe's
 * payment_pages endpoint. No authentication is required: the unguessable
 * url_slug in the URL acts as the bearer credential.
 *
 * The response is enriched with the merchant's receiving wallet so the
 * checkout page can display it and build the payment transaction.
 */
router.get(
  '/:urlSlug',
  AsyncHandler(async (req: express.Request, res: express.Response) => {
    const session = await checkoutPaymentModule.GetPaymentPageSession(
      req.params.urlSlug
    );
    res.json(session);
  })
);

/**
 * POST /v1/payment_pages/:urlSlug/prepare
 * Build an unsigned USDC payment transaction for the checkout session,
 * transferring the session total from the customer's wallet to the
 * merchant's wallet. The customer signs and broadcasts it via their wallet.
 */
router.post(
  '/:urlSlug/prepare',
  AsyncHandler(async (req: express.Request, res: express.Response) => {
    const { payer_wallet: payerWallet, email } = req.body as {
      payer_wallet?: string;
      email?: string;
    };

    const prepared = await checkoutPaymentModule.PreparePayment(
      req.params.urlSlug,
      payerWallet,
      email
    );
    res.json(prepared);
  })
);

/**
 * POST /v1/payment_pages/:urlSlug/confirm
 * Verify a broadcast payment transaction on-chain and complete the checkout
 * session. Emits 'checkout.session.completed' on success. Idempotent: if the
 * session was already completed with the same signature, it is returned as-is.
 */
router.post(
  '/:urlSlug/confirm',
  AsyncHandler(async (req: express.Request, res: express.Response) => {
    const { signature } = req.body as { signature?: string };

    const session = await checkoutPaymentModule.ConfirmPayment(
      req.params.urlSlug,
      signature
    );
    res.json(session);
  })
);

export default router;
