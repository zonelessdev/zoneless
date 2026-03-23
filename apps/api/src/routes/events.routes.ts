import * as express from 'express';
import { AsyncHandler } from '../utils/AsyncHandler';
import { AppError } from '../utils/AppError';
import { ERRORS } from '../utils/Errors';
import { Logger } from '../utils/Logger';
import { ParseCreatedFilter } from '../utils/ListHelper';
import { RequirePlatform } from '../middleware/Authorization';

import { db } from '../modules/Database';
import { EventModule } from '../modules/Event';

const router = express.Router();

const eventModule = new EventModule(db);

/**
 * GET /v1/events/:id
 *
 * Retrieves the details of an event if it was created in the last 30 days.
 * Supply the unique identifier of the event, which you might have received in a webhook.
 *
 * This matches Stripe's GET /v1/events/:id endpoint.
 * @see https://docs.stripe.com/api/events/retrieve
 *
 * Returns an event object if a valid identifier was provided.
 * Platforms can access events for their connected accounts.
 */
router.get(
  '/:id',
  RequirePlatform(),
  AsyncHandler(async (req: express.Request, res: express.Response) => {
    const eventId = req.params.id;
    const platformAccountId = req.user.account;

    Logger.info('Retrieving event', { eventId, accountId: platformAccountId });

    const event = await eventModule.GetEvent(eventId);

    if (!event) {
      throw new AppError(
        ERRORS.EVENT_NOT_FOUND.message,
        ERRORS.EVENT_NOT_FOUND.status,
        ERRORS.EVENT_NOT_FOUND.type
      );
    }

    // Check if event belongs to this platform (using platform_account field)
    if (event.platform_account !== platformAccountId) {
      throw new AppError(
        ERRORS.EVENT_NOT_FOUND.message,
        ERRORS.EVENT_NOT_FOUND.status,
        ERRORS.EVENT_NOT_FOUND.type
      );
    }

    Logger.info('Event retrieved successfully', { eventId });
    res.json(event);
  })
);

/**
 * GET /v1/events
 *
 * List events, going back up to 30 days. Each event data is rendered according to
 * the API version at its creation time, specified in the event object's `api_version` attribute.
 *
 * This matches Stripe's GET /v1/events endpoint.
 * @see https://docs.stripe.com/api/events/list
 *
 * Query parameters:
 * - created: Filter by creation timestamp (object with gt, gte, lt, lte, or single timestamp)
 * - ending_before: Cursor for backward pagination
 * - limit: Number of results (1-100, default: 10)
 * - starting_after: Cursor for forward pagination
 * - type: Specific event name or group using * as wildcard
 * - types: Array of up to 20 specific event names (mutually exclusive with type)
 *
 * Returns a dictionary with a `data` property that contains an array of events.
 * Platforms receive events for themselves and all their connected accounts.
 */
router.get(
  '/',
  RequirePlatform(),
  AsyncHandler(async (req: express.Request, res: express.Response) => {
    const platformAccountId = req.user.account;

    const limit = req.query.limit
      ? parseInt(req.query.limit as string, 10)
      : 10;
    const startingAfter = req.query.starting_after as string | undefined;
    const endingBefore = req.query.ending_before as string | undefined;
    const created = ParseCreatedFilter(req.query as Record<string, unknown>);
    const type = req.query.type as string | undefined;
    const types = req.query.types
      ? Array.isArray(req.query.types)
        ? (req.query.types as string[])
        : [req.query.types as string]
      : undefined;

    Logger.info('Listing events', {
      accountId: platformAccountId,
      limit,
      startingAfter,
      endingBefore,
      type,
      types,
    });

    try {
      // Query events directly by platform_account
      const result = await eventModule.ListEventsByPlatform({
        platformAccount: platformAccountId,
        limit,
        startingAfter,
        endingBefore,
        created,
        type,
        types,
      });

      res.json(result);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unknown error';

      if (
        message ===
          'You cannot parameterize both starting_after and ending_before.' ||
        message === 'Invalid starting_after ID' ||
        message === 'Invalid ending_before ID' ||
        message === 'You may pass either type or types, but not both.' ||
        message === 'types array cannot contain more than 20 items.'
      ) {
        throw new AppError(
          message,
          ERRORS.INVALID_REQUEST.status,
          ERRORS.INVALID_REQUEST.type
        );
      }
      throw error;
    }
  })
);

export default router;
