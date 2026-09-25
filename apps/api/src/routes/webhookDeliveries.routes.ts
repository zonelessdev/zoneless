import * as express from 'express';
import { AsyncHandler } from '../utils/AsyncHandler';
import { Logger } from '../utils/Logger';
import { db } from '../modules/Database';
import { WebhookDeliveryWorker } from '../modules/WebhookDeliveryWorker';
import { ValidateOperatorKey } from '../middleware/OperatorMiddleware';
import { ValidateApiKey } from '../middleware/AuthMiddleware';
import { RequirePlatform } from '../middleware/Authorization';

const router = express.Router();
const worker = new WebhookDeliveryWorker(db);

function ParseBatchSize(body: unknown): number | undefined {
  return typeof (body as { batch_size?: unknown })?.batch_size === 'number'
    ? (body as { batch_size: number }).batch_size
    : undefined;
}

async function RunRetryBatch(
  req: express.Request,
  res: express.Response,
  platformAccountId?: string
): Promise<void> {
  const result = await worker.ProcessBatch({
    limit: ParseBatchSize(req.body),
    platformAccountId,
  });

  Logger.info('Webhook delivery retry run completed', {
    scope: platformAccountId ?? 'operator',
    ...result,
  });

  res.json({ object: 'webhook_delivery.batch', ...result });
}

router.post(
  '/process',
  ValidateOperatorKey,
  AsyncHandler(async (req: express.Request, res: express.Response) =>
    RunRetryBatch(req, res)
  )
);

router.post(
  '/process_for_platform',
  ValidateApiKey,
  RequirePlatform(),
  AsyncHandler(async (req: express.Request, res: express.Response) =>
    RunRetryBatch(req, res, req.user.account)
  )
);

export default router;
