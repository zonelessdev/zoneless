import { Request, Response, NextFunction } from 'express';
import mongoose from 'mongoose';
import { AsyncHandler } from '../utils/AsyncHandler';
import { AppError } from '../utils/AppError';
import { Logger } from '../utils/Logger';
import { Now } from '../utils/Timestamp';
import { Database } from '../modules/Database';
import { IdempotencyKey } from '@zoneless/shared-types';

const db = new Database();
const IDEMPOTENCY_COLLECTION = 'IdempotencyKeys';

/**
 * Atomically tries to acquire an idempotency lock.
 * Uses findOneAndUpdate with upsert to handle race conditions.
 *
 * @returns The existing key if found, or null if we just created a new one
 */
async function AcquireIdempotencyLock(
  key: string,
  req: Request
): Promise<IdempotencyKey | null> {
  const model =
    mongoose.models[IDEMPOTENCY_COLLECTION] ||
    mongoose.model(
      IDEMPOTENCY_COLLECTION,
      new mongoose.Schema(
        {},
        { strict: false, collection: IDEMPOTENCY_COLLECTION.toLowerCase() }
      )
    );

  // Try to find existing OR create new atomically
  // $setOnInsert only applies if this is an insert (new document)
  const result = await model
    .findOneAndUpdate(
      { id: key },
      {
        $setOnInsert: {
          id: key,
          status: 'processing',
          createdAt: Now(),
          path: req.path,
          method: req.method,
          account: (req as any).user?.account,
        },
      },
      {
        upsert: true,
        new: false, // Return the OLD document (null if just inserted)
      }
    )
    .lean();

  return result as IdempotencyKey | null;
}

export const IdempotencyMiddleware = AsyncHandler(
  async (req: Request, res: Response, next: NextFunction) => {
    const key = req.headers['idempotency-key'];

    // If no key provided, skip idempotency logic
    if (!key) {
      return next();
    }

    if (typeof key !== 'string') {
      throw new AppError(
        'Invalid Idempotency-Key header',
        400,
        'invalid_request_error'
      );
    }

    // Atomically check/create the idempotency key
    const existingKey = await AcquireIdempotencyLock(key, req);

    if (existingKey) {
      // Case 1: Request is already completed - return cached response
      if (existingKey.status === 'completed') {
        Logger.info('Idempotency Hit: Returning saved response', { key });
        res
          .status(existingKey.statusCode || 200)
          .set(existingKey.headers)
          .json(existingKey.responseBody);
        return;
      }

      // Case 2: Request is currently processing (concurrent retry)
      if (existingKey.status === 'processing') {
        throw new AppError(
          'Request is currently processing. Please try again later.',
          409,
          'conflict'
        );
      }
    }

    // Case 3: New key was just created, proceed with request

    // --- Response Interception ---
    const originalJson = res.json;

    res.json = function (body: any): Response {
      res.json = originalJson;

      const updateData: Partial<IdempotencyKey> = {
        status: 'completed',
        statusCode: res.statusCode,
        headers: res.getHeaders() as Record<string, any>,
        responseBody: body,
        completedAt: Now(),
      };

      db.Update(IDEMPOTENCY_COLLECTION, key, updateData).catch((err) =>
        Logger.error('Failed to save idempotency result', err)
      );

      return originalJson.call(this, body);
    };

    next();
  }
);
