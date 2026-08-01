import * as express from 'express';
import { AsyncHandler } from '../utils/AsyncHandler';
import { Logger } from '../utils/Logger';

import { db } from '../modules/Database';
import { EventService } from '../modules/EventService';
import { IdentityVerificationSessionModule } from '../modules/IdentityVerificationSession';

const router = express.Router();

const eventService = new EventService(db);
const sessionModule = new IdentityVerificationSessionModule(db, eventService);

/**
 * POST /v1/identity/webhooks/didit
 * Public inbound webhook from Didit. Signature verified with the platform's
 * BYO webhook_secret stored on settings.identity.didit.
 */
router.post(
  '/didit',
  AsyncHandler(async (req: express.Request, res: express.Response) => {
    const body = (req.body ?? {}) as Record<string, unknown>;

    Logger.info('Received Didit identity webhook', {
      sessionId: body.session_id,
      status: body.status,
      webhookType: body.webhook_type,
    });

    await sessionModule.HandleDiditWebhook(body, {
      signatureV2:
        (req.get('X-Signature-V2') as string | undefined) ??
        (req.get('x-signature-v2') as string | undefined) ??
        null,
      signatureSimple:
        (req.get('X-Signature-Simple') as string | undefined) ??
        (req.get('x-signature-simple') as string | undefined) ??
        null,
      timestamp:
        (req.get('X-Timestamp') as string | undefined) ??
        (req.get('x-timestamp') as string | undefined) ??
        null,
    });

    res.status(200).json({ received: true });
  })
);

export default router;
