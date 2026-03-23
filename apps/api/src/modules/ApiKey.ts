/**
 * @fileOverview Methods for ApiKeys
 *
 * API keys are hashed using SHA-256 before storage. The plaintext token
 * is only available at creation time and is never stored in the database.
 *
 * Events emitted:
 * - api_key.created: When a new API key is created
 * - api_key.updated: When an API key is updated
 * - api_key.deleted: When an API key is deleted
 *
 * @module ApiKey
 */

import { createHash } from 'crypto';
import { Database } from './Database';
import { EventService } from './EventService';
import { ExtractChangedFields } from './Event';
import { GenerateId } from '../utils/IdGenerator';
import { Now } from '../utils/Timestamp';
import { ValidateUpdate } from './Util';
import { ListHelper, ListOptions, ListResult } from '../utils/ListHelper';
import { ApiKey, ApiKeyCreateResult } from '@zoneless/shared-types';
import { GetAppConfig } from './AppConfig';
import {
  CreateApiKeySchema,
  CreateApiKeyInput,
  UpdateApiKeySchema,
  UpdateApiKeyInput,
} from '../schemas/ApiKeySchema';

/**
 * Hash an API key token using SHA-256.
 * This is a one-way operation - the original token cannot be recovered.
 */
function HashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export class ApiKeyModule {
  private readonly db: Database;
  private readonly eventService: EventService | null;
  private readonly listHelper: ListHelper<ApiKey>;

  constructor(db: Database, eventService?: EventService) {
    this.db = db;
    this.eventService = eventService || null;
    this.listHelper = new ListHelper<ApiKey>(db, {
      collection: 'ApiKeys',
      orderByField: 'created',
      orderDirection: 'desc',
      urlPath: '/v1/api_keys',
    });
  }

  /**
   * Create a new API key for an account.
   * Returns both the stored ApiKey (with hashed token) and the plaintext token.
   * The plaintext token is only available at creation time - it is not stored.
   * Emits an 'api_key.created' event if EventService is configured.
   *
   * @param accountId - The account ID to create the key for
   * @param name - A friendly name for the API key
   * @param metadata - Optional key-value metadata pairs
   * @param livemode - Whether this is a live mode key (default: true)
   * @returns The ApiKey object and the plaintext token (shown once only)
   */
  async CreateApiKey(
    accountId: string,
    name: string,
    metadata?: Record<string, string>,
    livemode: boolean = GetAppConfig().livemode
  ): Promise<ApiKeyCreateResult> {
    const plaintextToken = GenerateId(livemode ? 'sk_live_z' : 'sk_test_z', 99);
    const apiKey = this.CreateApiKeyObject(
      accountId,
      name,
      plaintextToken,
      metadata,
      livemode
    );
    await this.db.Set<ApiKey>('ApiKeys', apiKey.id, apiKey);

    // Emit api_key.created event
    if (this.eventService) {
      await this.eventService.Emit('api_key.created', accountId, apiKey);
    }

    return {
      api_key: apiKey,
      plaintext_token: plaintextToken,
    };
  }

  /**
   * Create a new API key from validated input.
   *
   * @param accountId - The account ID to create the key for
   * @param input - The validated input data
   * @param livemode - Whether this is a live mode key (default: true)
   * @returns The ApiKey object and the plaintext token (shown once only)
   */
  async CreateApiKeyFromInput(
    accountId: string,
    input: CreateApiKeyInput,
    livemode: boolean = GetAppConfig().livemode
  ): Promise<ApiKeyCreateResult> {
    const validatedInput = ValidateUpdate(CreateApiKeySchema, input);
    return this.CreateApiKey(
      accountId,
      validatedInput.name,
      validatedInput.metadata,
      livemode
    );
  }

  /**
   * Look up an API key by its plaintext token.
   * The token is hashed and compared against stored hashes.
   *
   * @param token - The plaintext API key token
   * @returns The ApiKey if found, null otherwise
   */
  async GetApiKeyByToken(token: string): Promise<ApiKey | null> {
    const tokenHash = HashToken(token);
    const apiKeys = await this.db.Find<ApiKey>(
      'ApiKeys',
      'token_hash',
      tokenHash
    );
    if (apiKeys && apiKeys.length > 0) {
      return apiKeys[0];
    }
    return null;
  }

  /**
   * Get an API key by its ID.
   *
   * @param id - The API key ID
   * @returns The ApiKey if found, null otherwise
   */
  async GetApiKey(id: string): Promise<ApiKey | null> {
    return this.db.Get<ApiKey>('ApiKeys', id);
  }

  /**
   * Get all API keys for an account.
   *
   * @param accountId - The account ID to list keys for
   * @returns Array of API keys (token hashes are included but not useful without plaintext)
   */
  async GetApiKeysByAccount(accountId: string): Promise<ApiKey[]> {
    return this.db.Find<ApiKey>('ApiKeys', 'account', accountId);
  }

  /**
   * List API keys for an account with cursor-based pagination.
   *
   * @param options - List options including account, limit, pagination cursors
   * @returns Paginated list of API keys
   */
  async ListApiKeys(options: ListOptions): Promise<ListResult<ApiKey>> {
    return this.listHelper.List(options);
  }

  /**
   * Update an API key.
   * Emits an 'api_key.updated' event if EventService is configured.
   *
   * @param id - The API key ID
   * @param input - The fields to update
   * @returns The updated API key
   */
  async UpdateApiKey(id: string, input: UpdateApiKeyInput): Promise<ApiKey> {
    const validatedUpdate = ValidateUpdate(UpdateApiKeySchema, input);

    // Get previous state for the event (before update)
    const previousApiKey = this.eventService ? await this.GetApiKey(id) : null;

    await this.db.Update<ApiKey>('ApiKeys', id, validatedUpdate);

    const apiKey = await this.GetApiKey(id);
    if (!apiKey) {
      throw new Error('API key not found after update');
    }

    // Emit api_key.updated event
    if (this.eventService && previousApiKey) {
      const previousAttributes = ExtractChangedFields(
        previousApiKey as unknown as Record<string, unknown>,
        validatedUpdate as Record<string, unknown>
      );

      await this.eventService.Emit('api_key.updated', apiKey.account, apiKey, {
        previousAttributes,
      });
    }

    return apiKey;
  }

  /**
   * Revoke an API key by its ID.
   * Revoked keys cannot be used for authentication.
   * Emits an 'api_key.updated' event if EventService is configured.
   *
   * @param apiKeyId - The API key ID to revoke
   * @returns The revoked API key
   */
  async RevokeApiKey(apiKeyId: string): Promise<ApiKey> {
    // Get previous state for the event (before update)
    const previousApiKey = this.eventService
      ? await this.GetApiKey(apiKeyId)
      : null;

    await this.db.Update<ApiKey>('ApiKeys', apiKeyId, {
      status: 'revoked',
    });

    const apiKey = await this.GetApiKey(apiKeyId);
    if (!apiKey) {
      throw new Error('API key not found after revocation');
    }

    // Emit api_key.updated event
    if (this.eventService && previousApiKey) {
      const previousAttributes = ExtractChangedFields(
        previousApiKey as unknown as Record<string, unknown>,
        { status: 'revoked' } as Record<string, unknown>
      );

      await this.eventService.Emit('api_key.updated', apiKey.account, apiKey, {
        previousAttributes,
      });
    }

    return apiKey;
  }

  /**
   * Delete an API key.
   * Emits an 'api_key.deleted' event if EventService is configured.
   *
   * @param id - The API key ID
   * @returns Deletion confirmation object
   */
  async DeleteApiKey(
    id: string
  ): Promise<{ id: string; object: 'api_key'; deleted: boolean }> {
    // Get the API key before deletion for the event
    const apiKey = this.eventService ? await this.GetApiKey(id) : null;

    await this.db.Delete('ApiKeys', id);

    // Emit api_key.deleted event
    if (this.eventService && apiKey) {
      await this.eventService.Emit('api_key.deleted', apiKey.account, apiKey);
    }

    return {
      id,
      object: 'api_key',
      deleted: true,
    };
  }

  /**
   * Update the last_used timestamp for an API key.
   * Called when the key is successfully used for authentication.
   *
   * @param apiKeyId - The API key ID
   */
  async UpdateLastUsed(apiKeyId: string): Promise<void> {
    await this.db.Update<ApiKey>('ApiKeys', apiKeyId, {
      last_used: Now(),
    });
  }

  /**
   * Create an ApiKey object with a hashed token.
   * The plaintext token is passed in but only its hash and prefix are stored.
   * API keys are always owned by platform accounts.
   */
  private CreateApiKeyObject(
    accountId: string,
    name: string,
    plaintextToken: string,
    metadata?: Record<string, string>,
    livemode: boolean = GetAppConfig().livemode
  ): ApiKey {
    return {
      id: GenerateId('api_key_z'),
      object: 'api_key',
      created: Now(),
      livemode,
      name: name,
      token_hash: HashToken(plaintextToken),
      token_prefix: plaintextToken.substring(0, 15) + '...',
      account: accountId,
      platform_account: accountId, // API keys are always for platform accounts
      last_used: null,
      metadata: metadata || {},
      status: 'active',
    };
  }
}
