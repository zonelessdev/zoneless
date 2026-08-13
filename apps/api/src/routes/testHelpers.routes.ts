/**
 * Stripe-shaped test helpers. Simulated settlement only.
 */

import * as express from 'express';
import { AsyncHandler } from '../utils/AsyncHandler';
import { AppError } from '../utils/AppError';
import { ERRORS } from '../utils/Errors';
import { RequirePlatform } from '../middleware/Authorization';
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
import { TopUpModule } from '../modules/TopUp';
import {
  IsSimulatedSettlement,
  SIMULATED_TEST_WALLET,
} from '../modules/chains/Settlement';

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
const topUpModule = new TopUpModule(db, eventService);

function AssertSimulatedSettlement(): void {
  if (!IsSimulatedSettlement()) {
    throw new AppError(
      'Test helpers are only available in simulated test mode',
      400,
      'invalid_request_error'
    );
  }
}

/**
 * POST /v1/test_helpers/checkout/sessions/:id/complete
 * Completes a checkout session as if the simulated wallet approved.
 */
router.post(
  '/checkout/sessions/:id/complete',
  RequirePlatform(),
  AsyncHandler(async (req: express.Request, res: express.Response) => {
    AssertSimulatedSettlement();

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
    if (session.platform_account !== req.user.account) {
      throw new AppError(
        ERRORS.CHECKOUT_SESSION_NOT_FOUND.message,
        ERRORS.CHECKOUT_SESSION_NOT_FOUND.status,
        ERRORS.CHECKOUT_SESSION_NOT_FOUND.type
      );
    }

    const payerWallet =
      (typeof req.body?.payer_wallet === 'string' && req.body.payer_wallet) ||
      SIMULATED_TEST_WALLET;

    const completed = await checkoutPaymentModule.CompleteSimulatedCheckout(
      session.url_slug,
      payerWallet
    );
    res.json(completed);
  })
);

/**
 * POST /v1/test_helpers/treasury/topups
 * Credits the platform ledger with fake USDC.
 */
router.post(
  '/treasury/topups',
  RequirePlatform(),
  AsyncHandler(async (req: express.Request, res: express.Response) => {
    AssertSimulatedSettlement();

    const amount = Number(req.body?.amount);
    const topUp = await topUpModule.CreateSimulatedDeposit(
      amount,
      req.user.account
    );
    res.status(201).json(topUp);
  })
);

export default router;
