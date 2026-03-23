import * as express from 'express';
import { ValidateApiKey } from '../middleware/AuthMiddleware';
import { IdempotencyMiddleware } from '../middleware/IdempotencyMiddleware';

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

const router = express.Router();

// --- Public Routes ---
router.use('/auth', authExchangeRouter);
router.use('/config', configRouter);
router.use('/setup', setupRouter);

// --- Authenticated Routes ---
// All routes below this line require an API Key
router.use(ValidateApiKey);

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

export default router;
