/**
 * @fileOverview Per-platform usage metering middleware
 *
 * Records one usage counter increment per API-key-authenticated request,
 * attributed to the request's platform account. Dashboard sessions (JWT)
 * are not metered - only server-to-server API traffic counts, matching
 * how Stripe reports API usage. Only active in operator mode (managed
 * hosting) - self-hosted instances skip metering entirely.
 *
 * Must be mounted after ValidateApiKey so req.user is populated.
 *
 * @module UsageMiddleware
 */

import { Request, Response, NextFunction } from 'express';
import { db } from '../modules/Database';
import { UsageModule } from '../modules/Usage';
import { IsOperatorMode } from '../modules/AppConfig';

const usageModule = new UsageModule(db);

export function UsageMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  if (
    IsOperatorMode() &&
    req.user?.auth_type === 'api_key' &&
    req.user?.platform_account
  ) {
    // Fire and forget - metering must never block or fail a request
    usageModule.RecordRequest(req.user.platform_account);
  }
  next();
}
