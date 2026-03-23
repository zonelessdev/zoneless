import * as express from 'express';
import { AsyncHandler } from '../utils/AsyncHandler';
import { AppError } from '../utils/AppError';
import { ERRORS } from '../utils/Errors';
import { Logger } from '../utils/Logger';
import { ParseCreatedFilter } from '../utils/ListHelper';

import { db } from '../modules/Database';
import { WebhookEndpointModule } from '../modules/WebhookEndpoint';

import { ValidateRequest } from '../middleware/ValidateRequest';
import { RequirePlatform } from '../middleware/Authorization';

import {
  CreateWebhookEndpointSchema,
  UpdateWebhookEndpointSchema,
} from '../schemas/WebhookEndpointSchema';

const router = express.Router();

const webhookEndpointModule = new WebhookEndpointModule(db);

/**
 * POST /v1/webhook_endpoints
 * Create a new webhook endpoint.
 *
 * Required parameters:
 * - url: The URL of the webhook endpoint
 * - enabled_events: Array of event types to subscribe to (use ['*'] for all)
 *
 * Optional parameters:
 * - description: Description of the webhook endpoint
 * - api_version: API version for event formatting
 * - metadata: Key-value pairs to store with the endpoint
 *
 * Only platform accounts can create webhook endpoints.
 * The secret is returned only on creation.
 */
router.post(
  '/',
  RequirePlatform(),
  ValidateRequest(CreateWebhookEndpointSchema),
  AsyncHandler(async (req: express.Request, res: express.Response) => {
    const platformAccountId = req.user.account;

    Logger.info('Creating webhook endpoint', {
      url: req.body.url,
      events: req.body.enabled_events,
    });

    const webhookEndpoint = await webhookEndpointModule.CreateWebhookEndpoint(
      platformAccountId,
      req.body
    );

    Logger.info('Webhook endpoint created successfully', {
      webhookEndpointId: webhookEndpoint.id,
    });

    res.status(201).json(webhookEndpoint);
  })
);

/**
 * GET /v1/webhook_endpoints
 * List all webhook endpoints.
 *
 * Query parameters:
 * - limit: Maximum number of items to return (1-100, default 10)
 * - starting_after: Cursor for pagination - returns items after this ID
 * - ending_before: Cursor for pagination - returns items before this ID
 * - created: Filter by created timestamp (supports created[gt], created[gte], etc.)
 *
 * Only platform accounts can list webhook endpoints.
 * Secrets are not included in the response.
 */
router.get(
  '/',
  RequirePlatform(),
  AsyncHandler(async (req: express.Request, res: express.Response) => {
    const platformAccountId = req.user.account;

    Logger.info('Listing webhook endpoints', {
      accountId: platformAccountId,
    });

    const limit = req.query.limit
      ? parseInt(req.query.limit as string, 10)
      : 10;
    const startingAfter = req.query.starting_after as string | undefined;
    const endingBefore = req.query.ending_before as string | undefined;
    const created = ParseCreatedFilter(req.query as Record<string, unknown>);

    const result = await webhookEndpointModule.ListWebhookEndpoints({
      account: platformAccountId,
      limit,
      startingAfter,
      endingBefore,
      created,
    });

    Logger.info('Webhook endpoints listed successfully', {
      accountId: platformAccountId,
      count: result.data.length,
      hasMore: result.has_more,
    });

    res.json(result);
  })
);

/**
 * GET /v1/webhook_endpoints/:id
 * Retrieve a webhook endpoint.
 *
 * Retrieves the webhook endpoint with the given ID.
 * Only platform accounts can retrieve webhook endpoints.
 * The secret is not included in the response.
 */
router.get(
  '/:id',
  RequirePlatform(),
  AsyncHandler(async (req: express.Request, res: express.Response) => {
    const platformAccountId = req.user.account;
    const id = req.params.id;

    // Get internal record for authorization check
    const endpointRecord = await webhookEndpointModule.GetWebhookEndpoint(id);

    if (!endpointRecord) {
      throw new AppError(
        ERRORS.WEBHOOK_ENDPOINT_NOT_FOUND.message,
        ERRORS.WEBHOOK_ENDPOINT_NOT_FOUND.status,
        ERRORS.WEBHOOK_ENDPOINT_NOT_FOUND.type
      );
    }

    // Verify the endpoint belongs to this platform
    if (endpointRecord.account !== platformAccountId) {
      throw new AppError(
        ERRORS.WEBHOOK_ENDPOINT_NOT_FOUND.message,
        ERRORS.WEBHOOK_ENDPOINT_NOT_FOUND.status,
        ERRORS.WEBHOOK_ENDPOINT_NOT_FOUND.type
      );
    }

    // Return public type (without internal fields or secret)
    const publicEndpoint = await webhookEndpointModule.GetWebhookEndpointPublic(
      id
    );
    res.json(publicEndpoint);
  })
);

/**
 * POST /v1/webhook_endpoints/:id
 * Update a webhook endpoint.
 *
 * Optional parameters:
 * - url: New URL for the webhook endpoint
 * - enabled_events: New list of event types to subscribe to
 * - description: New description
 * - disabled: Set to true to disable the endpoint
 * - metadata: Key-value pairs to store with the endpoint
 *
 * Only platform accounts can update webhook endpoints.
 */
router.post(
  '/:id',
  RequirePlatform(),
  ValidateRequest(UpdateWebhookEndpointSchema),
  AsyncHandler(async (req: express.Request, res: express.Response) => {
    const platformAccountId = req.user.account;
    const id = req.params.id;

    // Verify the endpoint exists and belongs to this platform
    const existingEndpoint = await webhookEndpointModule.GetWebhookEndpoint(id);

    if (!existingEndpoint) {
      throw new AppError(
        ERRORS.WEBHOOK_ENDPOINT_NOT_FOUND.message,
        ERRORS.WEBHOOK_ENDPOINT_NOT_FOUND.status,
        ERRORS.WEBHOOK_ENDPOINT_NOT_FOUND.type
      );
    }

    if (existingEndpoint.account !== platformAccountId) {
      throw new AppError(
        ERRORS.WEBHOOK_ENDPOINT_NOT_FOUND.message,
        ERRORS.WEBHOOK_ENDPOINT_NOT_FOUND.status,
        ERRORS.WEBHOOK_ENDPOINT_NOT_FOUND.type
      );
    }

    Logger.info('Updating webhook endpoint', {
      webhookEndpointId: id,
      fields: Object.keys(req.body),
    });

    const updatedEndpoint = await webhookEndpointModule.UpdateWebhookEndpoint(
      id,
      req.body
    );

    Logger.info('Webhook endpoint updated successfully', {
      webhookEndpointId: updatedEndpoint.id,
    });

    res.json(updatedEndpoint);
  })
);

/**
 * DELETE /v1/webhook_endpoints/:id
 * Delete a webhook endpoint.
 *
 * Only platform accounts can delete webhook endpoints.
 */
router.delete(
  '/:id',
  RequirePlatform(),
  AsyncHandler(async (req: express.Request, res: express.Response) => {
    const platformAccountId = req.user.account;
    const id = req.params.id;

    // Verify the endpoint exists and belongs to this platform
    const existingEndpoint = await webhookEndpointModule.GetWebhookEndpoint(id);

    if (!existingEndpoint) {
      throw new AppError(
        ERRORS.WEBHOOK_ENDPOINT_NOT_FOUND.message,
        ERRORS.WEBHOOK_ENDPOINT_NOT_FOUND.status,
        ERRORS.WEBHOOK_ENDPOINT_NOT_FOUND.type
      );
    }

    if (existingEndpoint.account !== platformAccountId) {
      throw new AppError(
        ERRORS.WEBHOOK_ENDPOINT_NOT_FOUND.message,
        ERRORS.WEBHOOK_ENDPOINT_NOT_FOUND.status,
        ERRORS.WEBHOOK_ENDPOINT_NOT_FOUND.type
      );
    }

    Logger.info('Deleting webhook endpoint', { webhookEndpointId: id });

    const result = await webhookEndpointModule.DeleteWebhookEndpoint(id);

    Logger.info('Webhook endpoint deleted successfully', {
      webhookEndpointId: id,
    });

    res.json(result);
  })
);

export default router;
