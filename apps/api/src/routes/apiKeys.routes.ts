import * as express from 'express';
import { AsyncHandler } from '../utils/AsyncHandler';
import { AppError } from '../utils/AppError';
import { ERRORS } from '../utils/Errors';
import { Logger } from '../utils/Logger';
import { ParseCreatedFilter } from '../utils/ListHelper';

import { db } from '../modules/Database';
import { ApiKeyModule } from '../modules/ApiKey';
import { EventService } from '../modules/EventService';

import { ValidateRequest } from '../middleware/ValidateRequest';
import { RequirePlatform } from '../middleware/Authorization';

import {
  CreateApiKeySchema,
  UpdateApiKeySchema,
} from '../schemas/ApiKeySchema';

const router = express.Router();

const eventService = new EventService(db);
const apiKeyModule = new ApiKeyModule(db, eventService);

/**
 * POST /v1/api_keys
 * Create a new API key.
 *
 * Required parameters:
 * - name: A friendly name to identify the key
 *
 * Optional parameters:
 * - metadata: Key-value pairs to store with the key
 *
 * Only platform accounts can create API keys.
 * The plaintext token is returned only on creation.
 */
router.post(
  '/',
  RequirePlatform(),
  ValidateRequest(CreateApiKeySchema),
  AsyncHandler(async (req: express.Request, res: express.Response) => {
    const platformAccountId = req.user.account;

    Logger.info('Creating API key', {
      name: req.body.name,
    });

    const result = await apiKeyModule.CreateApiKeyFromInput(
      platformAccountId,
      req.body
    );

    Logger.info('API key created successfully', {
      apiKeyId: result.api_key.id,
    });

    // Return the API key with the plaintext token (shown only once)
    res.status(201).json({
      ...result.api_key,
      plaintext_token: result.plaintext_token,
    });
  })
);

/**
 * GET /v1/api_keys
 * List all API keys.
 *
 * Query parameters:
 * - limit: Maximum number of items to return (1-100, default 10)
 * - starting_after: Cursor for pagination - returns items after this ID
 * - ending_before: Cursor for pagination - returns items before this ID
 * - created: Filter by created timestamp (supports created[gt], created[gte], etc.)
 *
 * Only platform accounts can list API keys.
 * Plaintext tokens are not included in the response.
 */
router.get(
  '/',
  RequirePlatform(),
  AsyncHandler(async (req: express.Request, res: express.Response) => {
    const platformAccountId = req.user.account;

    Logger.info('Listing API keys', {
      accountId: platformAccountId,
    });

    const limit = req.query.limit
      ? parseInt(req.query.limit as string, 10)
      : 10;
    const startingAfter = req.query.starting_after as string | undefined;
    const endingBefore = req.query.ending_before as string | undefined;
    const created = ParseCreatedFilter(req.query as Record<string, unknown>);

    const result = await apiKeyModule.ListApiKeys({
      account: platformAccountId,
      limit,
      startingAfter,
      endingBefore,
      created,
    });

    Logger.info('API keys listed successfully', {
      accountId: platformAccountId,
      count: result.data.length,
      hasMore: result.has_more,
    });

    res.json(result);
  })
);

/**
 * GET /v1/api_keys/:id
 * Retrieve an API key.
 *
 * Only platform accounts can retrieve API keys.
 * The plaintext token is not included in the response.
 */
router.get(
  '/:id',
  RequirePlatform(),
  AsyncHandler(async (req: express.Request, res: express.Response) => {
    const platformAccountId = req.user.account;
    const id = req.params.id;

    const apiKey = await apiKeyModule.GetApiKey(id);

    if (!apiKey) {
      throw new AppError(
        ERRORS.API_KEY_NOT_FOUND.message,
        ERRORS.API_KEY_NOT_FOUND.status,
        ERRORS.API_KEY_NOT_FOUND.type
      );
    }

    // Verify the API key belongs to this platform
    if (apiKey.account !== platformAccountId) {
      throw new AppError(
        ERRORS.API_KEY_NOT_FOUND.message,
        ERRORS.API_KEY_NOT_FOUND.status,
        ERRORS.API_KEY_NOT_FOUND.type
      );
    }

    res.json(apiKey);
  })
);

/**
 * POST /v1/api_keys/:id
 * Update an API key.
 *
 * Optional parameters:
 * - name: New name for the API key
 * - status: 'active' or 'inactive'
 * - metadata: Key-value pairs to store with the key
 *
 * Only platform accounts can update API keys.
 */
router.post(
  '/:id',
  RequirePlatform(),
  ValidateRequest(UpdateApiKeySchema),
  AsyncHandler(async (req: express.Request, res: express.Response) => {
    const platformAccountId = req.user.account;
    const id = req.params.id;

    // Verify the API key exists and belongs to this platform
    const existingApiKey = await apiKeyModule.GetApiKey(id);

    if (!existingApiKey) {
      throw new AppError(
        ERRORS.API_KEY_NOT_FOUND.message,
        ERRORS.API_KEY_NOT_FOUND.status,
        ERRORS.API_KEY_NOT_FOUND.type
      );
    }

    if (existingApiKey.account !== platformAccountId) {
      throw new AppError(
        ERRORS.API_KEY_NOT_FOUND.message,
        ERRORS.API_KEY_NOT_FOUND.status,
        ERRORS.API_KEY_NOT_FOUND.type
      );
    }

    Logger.info('Updating API key', {
      apiKeyId: id,
      fields: Object.keys(req.body),
    });

    const updatedApiKey = await apiKeyModule.UpdateApiKey(id, req.body);

    Logger.info('API key updated successfully', {
      apiKeyId: updatedApiKey.id,
    });

    res.json(updatedApiKey);
  })
);

/**
 * DELETE /v1/api_keys/:id
 * Delete an API key.
 *
 * Only platform accounts can delete API keys.
 * Note: The platform master key cannot be deleted if it's the only active key.
 */
router.delete(
  '/:id',
  RequirePlatform(),
  AsyncHandler(async (req: express.Request, res: express.Response) => {
    const platformAccountId = req.user.account;
    const id = req.params.id;

    // Verify the API key exists and belongs to this platform
    const existingApiKey = await apiKeyModule.GetApiKey(id);

    if (!existingApiKey) {
      throw new AppError(
        ERRORS.API_KEY_NOT_FOUND.message,
        ERRORS.API_KEY_NOT_FOUND.status,
        ERRORS.API_KEY_NOT_FOUND.type
      );
    }

    if (existingApiKey.account !== platformAccountId) {
      throw new AppError(
        ERRORS.API_KEY_NOT_FOUND.message,
        ERRORS.API_KEY_NOT_FOUND.status,
        ERRORS.API_KEY_NOT_FOUND.type
      );
    }

    // Check if this is the last active API key
    const allApiKeysResult = await apiKeyModule.ListApiKeys({
      account: platformAccountId,
      limit: 100, // Get all keys to check
    });
    const activeKeys = allApiKeysResult.data.filter(
      (k) => k.status === 'active'
    );

    if (activeKeys.length === 1 && activeKeys[0].id === id) {
      throw new AppError(
        'Cannot delete the last active API key. Create a new key first or deactivate this one instead.',
        400,
        'invalid_request_error'
      );
    }

    Logger.info('Deleting API key', { apiKeyId: id });

    const result = await apiKeyModule.DeleteApiKey(id);

    Logger.info('API key deleted successfully', { apiKeyId: id });

    res.json(result);
  })
);

/**
 * POST /v1/api_keys/:id/roll
 * Roll an API key (create a new token for an existing key).
 *
 * This creates a new token while keeping the same key ID, name, metadata, and livemode.
 * The old token is immediately invalidated.
 * The new plaintext token is returned only once.
 *
 * Only platform accounts can roll API keys.
 */
router.post(
  '/:id/roll',
  RequirePlatform(),
  AsyncHandler(async (req: express.Request, res: express.Response) => {
    const platformAccountId = req.user.account;
    const id = req.params.id;

    // Verify the API key exists and belongs to this platform
    const existingApiKey = await apiKeyModule.GetApiKey(id);

    if (!existingApiKey) {
      throw new AppError(
        ERRORS.API_KEY_NOT_FOUND.message,
        ERRORS.API_KEY_NOT_FOUND.status,
        ERRORS.API_KEY_NOT_FOUND.type
      );
    }

    if (existingApiKey.account !== platformAccountId) {
      throw new AppError(
        ERRORS.API_KEY_NOT_FOUND.message,
        ERRORS.API_KEY_NOT_FOUND.status,
        ERRORS.API_KEY_NOT_FOUND.type
      );
    }

    Logger.info('Rolling API key', { apiKeyId: id });

    // Create a new API key with the same name, metadata, and livemode
    const result = await apiKeyModule.CreateApiKeyFromInput(
      platformAccountId,
      {
        name: existingApiKey.name,
        metadata: existingApiKey.metadata,
      },
      existingApiKey.livemode
    );

    // Delete the old key
    await apiKeyModule.DeleteApiKey(id);

    Logger.info('API key rolled successfully', {
      oldApiKeyId: id,
      newApiKeyId: result.api_key.id,
    });

    // Return the new API key with the plaintext token
    res.status(201).json({
      ...result.api_key,
      plaintext_token: result.plaintext_token,
      rolled_from: id,
    });
  })
);

export default router;
