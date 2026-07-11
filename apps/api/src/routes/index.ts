import * as express from 'express';
import { ValidateApiKey } from '../middleware/AuthMiddleware';
import { IdempotencyMiddleware } from '../middleware/IdempotencyMiddleware';
import { UsageMiddleware } from '../middleware/UsageMiddleware';

import accountsRouter from './accounts.routes';
import personsRouter from './persons.routes';
import externalAccountsRouter from './externalAccounts.routes';
import accountLinksRouter from './accountLinks.routes';
import loginLinksRouter from './loginLinks.routes';
import transfersRouter from './transfers.routes';
import payoutsRouter from './payouts.routes';
import balanceRouter from './balance.routes';
import balanceTransactionsRouter from './balanceTransactions.routes';
import topupsRouter from './topups.routes';
import webhookEndpointsRouter from './webhookEndpoints.routes';
import apiKeysRouter from './apiKeys.routes';
import eventsRouter from './events.routes';
import authExchangeRouter from './exchange.routes';
import configRouter from './config.routes';
import setupRouter from './setup.routes';
import operatorRouter from './operator.routes';
import subscriptionsRouter from './subscriptions.routes';
import productsRouter from './products.routes';
import pricesRouter from './prices.routes';
import customersRouter from './customers.routes';
import checkoutSessionsRouter from './checkoutSessions.routes';
import paymentPagesRouter from './paymentPages.routes';
import paymentIntentsRouter from './paymentIntents.routes';
import chargesRouter from './charges.routes';
import reportingRouter from './reporting.routes';

const router = express.Router();

// --- Public Routes ---
router.use('/auth', authExchangeRouter);
router.use('/config', configRouter);
router.use('/setup', setupRouter);
// Hosted checkout page bootstrap - the unguessable session ID is the credential
router.use('/payment_pages', paymentPagesRouter);

// --- Operator Routes ---
// Guarded by the operator API key (managed hosting only)
router.use('/operator', operatorRouter);

// --- Authenticated Routes ---
// All routes below this line require an API Key
router.use(ValidateApiKey);

// Record per-platform API usage (operator mode only)
router.use(UsageMiddleware);

// Apply Idempotency to all authenticated routes
router.use(IdempotencyMiddleware);

// Account routes (core account operations)
router.use('/accounts', accountsRouter);
// Sub-resources mounted under /accounts
router.use('/accounts', personsRouter);
router.use('/accounts', externalAccountsRouter);
router.use('/accounts', loginLinksRouter);

router.use('/account_links', accountLinksRouter);
router.use('/transfers', transfersRouter);
router.use('/payouts', payoutsRouter);
router.use('/balance', balanceRouter);
router.use('/balance_transactions', balanceTransactionsRouter);
router.use('/topups', topupsRouter);
router.use('/webhook_endpoints', webhookEndpointsRouter);
router.use('/api_keys', apiKeysRouter);
router.use('/events', eventsRouter);
router.use('/subscriptions', subscriptionsRouter);
router.use('/products', productsRouter);
router.use('/prices', pricesRouter);
router.use('/customers', customersRouter);
router.use('/checkout/sessions', checkoutSessionsRouter);
router.use('/payment_intents', paymentIntentsRouter);
router.use('/charges', chargesRouter);
router.use('/reporting', reportingRouter);
export default router;
