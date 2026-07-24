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
import { InvoiceItemModule } from '../modules/InvoiceItem';
import { InvoiceModule } from '../modules/Invoice';
import { SubscriptionModule } from '../modules/Subscription';

import { ValidateRequest } from '../middleware/ValidateRequest';
import { PrepareCheckoutPaymentSchema } from '@zoneless/shared-schemas';

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
const checkoutPaymentModule = new CheckoutPaymentModule(
  db,
  checkoutSessionModule,
  externalWalletModule,
  productModule,
  paymentIntentModule,
  chargeModule,
  paymentLinkModule,
  undefined,
  customerModule,
  subscriptionModule
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
 * Build an unsigned Solana transaction for the checkout session. Payment
 * mode returns a USDC transfer; subscription mode returns either
 * initSubscriptionAuthority (first-time wallet) or subscribe.
 */
router.post(
  '/:urlSlug/prepare',
  ValidateRequest(PrepareCheckoutPaymentSchema),
  AsyncHandler(async (req: express.Request, res: express.Response) => {
    const {
      payer_wallet: payerWallet,
      email,
      name,
      business_name: businessName,
      phone,
      address,
      shipping_address: shippingAddress,
      tax_id: taxId,
      custom_fields: customFields,
      terms_of_service_accepted: termsOfServiceAccepted,
    } = req.body;

    const prepared = await checkoutPaymentModule.PreparePayment(
      req.params.urlSlug,
      payerWallet,
      {
        email,
        name,
        business_name: businessName,
        phone,
        address,
        shipping_address: shippingAddress,
        tax_id: taxId,
        custom_fields: customFields,
        terms_of_service_accepted: termsOfServiceAccepted,
      }
    );
    res.json(prepared);
  })
);

/**
 * POST /v1/payment_pages/:urlSlug/confirm
 * Verify a broadcast transaction on-chain and complete the checkout
 * session. Subscription mode creates the off-chain Subscription and
 * collects the first period (unless trialing). Idempotent on signature.
 */
router.post(
  '/:urlSlug/confirm',
  AsyncHandler(async (req: express.Request, res: express.Response) => {
    const {
      signature,
      signed_transaction: signedTransaction,
      already_subscribed: alreadySubscribed,
      subscription_delegation_pda: subscriptionDelegationPda,
      subscription_step: subscriptionStep,
    } = req.body as {
      signature?: string;
      signed_transaction?: string;
      already_subscribed?: boolean;
      subscription_delegation_pda?: string;
      subscription_step?: 'init_authority' | 'subscribe';
    };

    const session = await checkoutPaymentModule.ConfirmPayment(
      req.params.urlSlug,
      signature,
      {
        signed_transaction: signedTransaction,
        already_subscribed: alreadySubscribed,
        subscription_delegation_pda: subscriptionDelegationPda,
        subscription_step: subscriptionStep,
      }
    );
    res.json(session);
  })
);

export default router;
