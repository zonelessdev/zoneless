/**
 * @fileOverview Reporting routes
 *
 * Dashboard metrics for Stripe-style overview charts.
 *
 * GET /v1/reporting/metrics
 */

import * as express from 'express';
import { AsyncHandler } from '../utils/AsyncHandler';
import { AppError } from '../utils/AppError';
import { ERRORS } from '../utils/Errors';
import { Logger } from '../utils/Logger';
import { RequirePlatform } from '../middleware/Authorization';
import { db } from '../modules/Database';
import {
  ParseCompare,
  ParseInterval,
  ParseMetricIds,
  ParseTimezone,
  ReportingModule,
  ResolveTodayPreset,
} from '../modules/Reporting';

const router = express.Router();
const reportingModule = new ReportingModule(db);

/**
 * GET /v1/reporting/metrics
 *
 * Query params:
 * - start, end: unix seconds (required unless preset=today)
 * - preset: "today" — sets start/end to the current UTC day
 * - interval: hour | day | week | month (default day)
 * - compare: previous_period | none (default previous_period)
 * - metrics: comma-separated MetricIds (default all)
 * - timezone: IANA timezone for bucket boundaries (default UTC)
 */
router.get(
  '/metrics',
  RequirePlatform(),
  AsyncHandler(async (req: express.Request, res: express.Response) => {
    const platformAccountId = req.user.account;
    const preset = typeof req.query.preset === 'string' ? req.query.preset : '';

    let start: number;
    let end: number;

    if (preset === 'today') {
      const today = ResolveTodayPreset();
      start = today.start;
      end = today.end;
    } else {
      start = Number(req.query.start);
      end = Number(req.query.end);

      if (!Number.isFinite(start) || !Number.isFinite(end)) {
        throw new AppError(
          'start and end are required unix timestamps (or use preset=today)',
          ERRORS.INVALID_REQUEST.status,
          ERRORS.INVALID_REQUEST.type
        );
      }

      if (start >= end) {
        throw new AppError(
          'start must be less than end',
          ERRORS.INVALID_REQUEST.status,
          ERRORS.INVALID_REQUEST.type
        );
      }
    }

    const interval = ParseInterval(
      typeof req.query.interval === 'string' ? req.query.interval : undefined
    );
    const compare = ParseCompare(
      typeof req.query.compare === 'string' ? req.query.compare : undefined
    );
    const metrics = ParseMetricIds(
      typeof req.query.metrics === 'string' ? req.query.metrics : undefined
    );
    const timezone = ParseTimezone(
      typeof req.query.timezone === 'string' ? req.query.timezone : undefined
    );

    Logger.info('Retrieving reporting metrics', {
      platformAccountId,
      start,
      end,
      interval,
      compare,
      metrics,
      timezone,
    });

    const result = await reportingModule.GetMetrics({
      platformAccountId,
      start,
      end,
      interval,
      compare,
      metrics,
      timezone,
    });

    res.json(result);
  })
);

export default router;
