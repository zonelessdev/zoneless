/**
 * @fileOverview Request context using AsyncLocalStorage
 *
 * Provides request-scoped storage accessible from anywhere in the call stack
 * without explicitly passing context through function parameters.
 *
 *
 * @module RequestContext
 */

import { AsyncLocalStorage } from 'async_hooks';
import { Request, Response, NextFunction } from 'express';
import { GenerateId } from '../utils/IdGenerator';

export interface RequestContextData {
  requestId: string;
  idempotencyKey?: string;
}

/**
 * AsyncLocalStorage instance for request-scoped data.
 * Access from anywhere using: requestContext.getStore()
 */
export const requestContext = new AsyncLocalStorage<RequestContextData>();

/**
 * Helper to get the current request context.
 * Returns undefined if called outside of a request context.
 */
export function GetRequestContext(): RequestContextData | undefined {
  return requestContext.getStore();
}

/**
 * Middleware that wraps each request in an AsyncLocalStorage context.
 * Extracts idempotency key and generates a request ID.
 */
export function RequestContextMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const idempotencyKey = req.headers['idempotency-key'] as string | undefined;
  const requestId =
    (req.headers['x-request-id'] as string) || GenerateId('req');

  // Set request ID header for tracing
  res.setHeader('X-Request-Id', requestId);

  const context: RequestContextData = {
    requestId,
    idempotencyKey,
  };

  requestContext.run(context, () => {
    next();
  });
}
