/**
 * @fileOverview Billing run routes
 *
 * Triggers subscription cycle collection. Intended for Cloud Scheduler /
 * host cron. Auth: operator key (all platforms) or platform API key (scoped).
 */

import * as express from 'express';
import { AsyncHandler } from '../utils/AsyncHandler';
import { Logger } from '../utils/Logger';
import { db } from '../modules/Database';
import { CreateSubscriptionBilling } from '../modules/SubscriptionBilling';
import { GetBillingMonitor, BillingMonitor } from '../modules/BillingMonitor';
import { ValidateOperatorKey } from '../middleware/OperatorMiddleware';
import { ValidateApiKey } from '../middleware/AuthMiddleware';
import { RequirePlatform } from '../middleware/Authorization';

const router = express.Router();
const billingModule = CreateSubscriptionBilling(db);

function ParseBatchSize(body: unknown): number | undefined {
  return typeof (body as { batch_size?: unknown })?.batch_size === 'number'
    ? (body as { batch_size: number }).batch_size
    : undefined;
}

/**
 * POST /v1/billing/run — operator key (all platforms / optional filter).
 */
router.post(
  '/run',
  ValidateOperatorKey,
  AsyncHandler(async (req: express.Request, res: express.Response) => {
    Logger.info('Subscription billing run triggered (operator)');
    const result = await billingModule.Run({
      platformAccountId:
        typeof req.body?.platform_account === 'string'
          ? req.body.platform_account
          : undefined,
      batchSize: ParseBatchSize(req.body),
    });
    res.json({ object: 'billing.run', ...result });
  })
);

/**
 * POST /v1/billing/run_for_platform — platform API key (scoped).
 */
router.post(
  '/run_for_platform',
  ValidateApiKey,
  RequirePlatform(),
  AsyncHandler(async (req: express.Request, res: express.Response) => {
    const platformAccountId = req.user.account;
    Logger.info('Subscription billing run triggered (platform)', {
      platformAccountId,
    });
    const result = await billingModule.Run({
      platformAccountId,
      batchSize: ParseBatchSize(req.body),
    });
    res.json({ object: 'billing.run', ...result });
  })
);

/**
 * GET /v1/billing/monitor/status
 */
router.get(
  '/monitor/status',
  ValidateApiKey,
  RequirePlatform(),
  AsyncHandler(async (req: express.Request, res: express.Response) => {
    const monitor = GetBillingMonitor(db);
    res.json({
      running: monitor.IsRunning(),
      enabled: BillingMonitor.IsEnabled(),
      poll_interval_ms: BillingMonitor.GetPollInterval(),
      platform_account: req.user.account,
    });
  })
);

export default router;
