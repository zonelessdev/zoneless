/**
 * Telemetry consent routes (platform-only).
 * GET/POST /v1/telemetry
 */

import * as express from 'express';
import { UpdateTelemetryRequest } from '@zoneless/shared-types';
import { AsyncHandler } from '../utils/AsyncHandler';
import { AppError } from '../utils/AppError';
import { ERRORS } from '../utils/Errors';
import { db } from '../modules/Database';
import { GetTelemetryModule } from '../modules/Telemetry';
import { RequirePlatform } from '../middleware/Authorization';

const router = express.Router();
const telemetry = GetTelemetryModule(db);

/**
 * GET /v1/telemetry
 * Current consent + effective enabled state.
 */
router.get(
  '/',
  RequirePlatform(),
  AsyncHandler(async (_req: express.Request, res: express.Response) => {
    const status = await telemetry.GetStatus();
    res.json(status);
  })
);

/**
 * POST /v1/telemetry
 * Body: { enabled: boolean }
 */
router.post(
  '/',
  RequirePlatform(),
  AsyncHandler(async (req: express.Request, res: express.Response) => {
    const body = req.body as UpdateTelemetryRequest;
    if (typeof body?.enabled !== 'boolean') {
      throw new AppError(
        'enabled must be a boolean',
        ERRORS.VALIDATION_ERROR.status,
        ERRORS.VALIDATION_ERROR.type
      );
    }

    const status = await telemetry.SetEnabled(body.enabled);
    res.json(status);
  })
);

export default router;
