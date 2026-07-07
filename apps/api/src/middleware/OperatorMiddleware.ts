/**
 * @fileOverview Operator authentication middleware
 *
 * Validates the operator API key for the /v1/operator routes.
 * The operator key is a single instance-level secret (OPERATOR_API_KEY env var)
 * used by a managed-hosting operator to provision and manage platforms.
 *
 * @module OperatorMiddleware
 */

import { Request, Response, NextFunction } from 'express';
import { createHash, timingSafeEqual } from 'crypto';
import { IsOperatorMode, GetOperatorApiKey } from '../modules/AppConfig';
import { AppError } from '../utils/AppError';
import { ERRORS } from '../utils/Errors';
import { AsyncHandler } from '../utils/AsyncHandler';

/**
 * Constant-time comparison of two strings via their SHA-256 digests.
 * Hashing first normalizes lengths so timingSafeEqual can be used safely.
 */
function SecureCompare(a: string, b: string): boolean {
  const hashA = createHash('sha256').update(a).digest();
  const hashB = createHash('sha256').update(b).digest();
  return timingSafeEqual(hashA, hashB);
}

/**
 * Middleware that validates the x-operator-key header against
 * the configured OPERATOR_API_KEY.
 */
export const ValidateOperatorKey = AsyncHandler(
  async (req: Request, res: Response, next: NextFunction) => {
    if (!IsOperatorMode()) {
      throw new AppError(
        'Operator mode is not enabled on this instance',
        ERRORS.PERMISSION_DENIED.status,
        ERRORS.PERMISSION_DENIED.type
      );
    }

    const providedKey = req.headers['x-operator-key'];

    if (!providedKey || typeof providedKey !== 'string') {
      throw new AppError(
        ERRORS.UNAUTHORIZED.message,
        ERRORS.UNAUTHORIZED.status,
        ERRORS.UNAUTHORIZED.type
      );
    }

    if (!SecureCompare(providedKey, GetOperatorApiKey())) {
      throw new AppError(
        ERRORS.INVALID_API_KEY.message,
        ERRORS.INVALID_API_KEY.status,
        ERRORS.INVALID_API_KEY.type
      );
    }

    next();
  }
);
