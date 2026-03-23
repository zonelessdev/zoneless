/**
 * @fileOverview Methods for WebhookEndpoints
 *
 * Manages webhook endpoints that platforms create to receive events.
 * Each webhook endpoint can subscribe to specific event types and
 * will receive signed webhook payloads when events occur.
 *
 * Related guide: [Setting up webhooks](https://docs.stripe.com/webhooks/configure)
 *
 *
 * @module WebhookEndpoint
 */

import { Database } from './Database';
import { GenerateId } from '../utils/IdGenerator';
import { Now } from '../utils/Timestamp';
import {
  WebhookEndpoint as WebhookEndpointType,
  WebhookEndpointRecord,
} from '@zoneless/shared-types';
import { ValidateUpdate } from './Util';
import { ListHelper, ListOptions, ListResult } from '../utils/ListHelper';
import { GetAppConfig } from './AppConfig';
import {
  CreateWebhookEndpointSchema,
  CreateWebhookEndpointInput,
  UpdateWebhookEndpointSchema,
  UpdateWebhookEndpointInput,
} from '../schemas/WebhookEndpointSchema';

export class WebhookEndpointModule {
  private readonly db: Database;
  private readonly listHelper: ListHelper<WebhookEndpointRecord>;

  constructor(db: Database) {
    this.db = db;
    this.listHelper = new ListHelper<WebhookEndpointRecord>(db, {
      collection: 'WebhookEndpoints',
      orderByField: 'created',
      orderDirection: 'desc',
      urlPath: '/v1/webhook_endpoints',
    });
  }

  /**
   * Creates a new webhook endpoint.
   * The secret is generated automatically and returned only on creation.
   *
   * Returns the webhook endpoint object with the `secret` field populated.
   *
   * @param account - The platform account ID
   * @param input - The webhook endpoint configuration
   * @returns The created webhook endpoint with secret
   */
  async CreateWebhookEndpoint(
    account: string,
    input: CreateWebhookEndpointInput
  ): Promise<WebhookEndpointType> {
    const validatedInput = ValidateUpdate(CreateWebhookEndpointSchema, input);
    const webhookEndpointRecord = this.CreateWebhookEndpointRecord(
      account,
      validatedInput
    );
    await this.db.Set(
      'WebhookEndpoints',
      webhookEndpointRecord.id,
      webhookEndpointRecord
    );
    // Return the public type (with secret for creation response)
    return this.ToPublicType(webhookEndpointRecord, { includeSecret: true });
  }

  /**
   * Creates a webhook endpoint record for internal storage.
   * Webhook endpoints are always owned by platform accounts.
   *
   * @param account - The platform account ID
   * @param input - The webhook endpoint configuration
   * @returns The webhook endpoint record for database storage
   */
  CreateWebhookEndpointRecord(
    account: string,
    input: CreateWebhookEndpointInput
  ): WebhookEndpointRecord {
    return {
      id: GenerateId('we_z'),
      object: 'webhook_endpoint',
      account: account,
      platform_account: account, // Webhook endpoints are always for platform accounts
      api_version: input.api_version ?? null,
      application: null, // OAuth applications not yet supported
      created: Now(),
      description: input.description ?? null,
      enabled_events: input.enabled_events,
      livemode: GetAppConfig().livemode,
      metadata: input.metadata ?? {},
      secret: GenerateId('whsec_z', 32),
      status: 'enabled',
      url: input.url,
    };
  }

  /**
   * Retrieves a webhook endpoint by ID.
   * Returns the internal record with the account field for authorization checks.
   *
   * @param id - The webhook endpoint ID
   * @returns The webhook endpoint record or null if not found
   */
  async GetWebhookEndpoint(id: string): Promise<WebhookEndpointRecord | null> {
    return this.db.Get<WebhookEndpointRecord>('WebhookEndpoints', id);
  }

  /**
   * Retrieves a webhook endpoint by ID and converts to public type.
   * Use this for API responses.
   *
   * @param id - The webhook endpoint ID
   * @returns The public webhook endpoint or null if not found
   */
  async GetWebhookEndpointPublic(
    id: string
  ): Promise<WebhookEndpointType | null> {
    const record = await this.GetWebhookEndpoint(id);
    if (!record) {
      return null;
    }
    return this.ToPublicType(record);
  }

  /**
   * Lists webhook endpoints for an account with cursor-based pagination.
   *
   * Returns a dictionary with a `data` property that contains an array of
   * webhook endpoints. Secrets are not included in list responses.
   *
   * @param options - List options including account, limit, pagination cursors
   * @returns Paginated list of webhook endpoints (secrets are excluded)
   */
  async ListWebhookEndpoints(
    options: ListOptions
  ): Promise<ListResult<WebhookEndpointType>> {
    const result = await this.listHelper.List(options);

    // Convert to public type (strips internal fields and secrets)
    return {
      ...result,
      data: result.data.map((endpoint) => this.ToPublicType(endpoint)),
    };
  }

  /**
   * Lists all enabled webhook endpoints for an account that subscribe to a specific event type.
   * Returns internal records with secrets for webhook dispatch.
   *
   * @param account - The account ID
   * @param eventType - The event type to match (e.g., 'account.created')
   * @returns Array of matching webhook endpoint records with secrets (for internal use)
   * @internal
   */
  async GetWebhookEndpointsForEvent(
    account: string,
    eventType: string
  ): Promise<WebhookEndpointRecord[]> {
    const endpoints = await this.db.Find<WebhookEndpointRecord>(
      'WebhookEndpoints',
      'account',
      account
    );

    return endpoints.filter((endpoint) => {
      if (endpoint.status !== 'enabled') {
        return false;
      }

      // Check if endpoint subscribes to this event type
      return (
        endpoint.enabled_events.includes('*') ||
        endpoint.enabled_events.includes(eventType)
      );
    });
  }

  /**
   * Updates a webhook endpoint.
   *
   * You may edit the `url`, the list of `enabled_events`, and the status
   * of your endpoint.
   *
   * @param id - The webhook endpoint ID
   * @param input - The fields to update
   * @returns The updated webhook endpoint (secret excluded)
   */
  async UpdateWebhookEndpoint(
    id: string,
    input: UpdateWebhookEndpointInput
  ): Promise<WebhookEndpointType> {
    const validatedUpdate = ValidateUpdate(UpdateWebhookEndpointSchema, input);

    // Handle disabled -> status conversion (Stripe API uses `disabled` param)
    const update: Partial<WebhookEndpointRecord> = { ...validatedUpdate };
    if ('disabled' in validatedUpdate) {
      update.status = validatedUpdate.disabled ? 'disabled' : 'enabled';
      delete (update as Record<string, unknown>).disabled;
    }

    await this.db.Update<WebhookEndpointRecord>('WebhookEndpoints', id, update);

    const endpoint = await this.GetWebhookEndpoint(id);
    if (!endpoint) {
      throw new Error('Webhook endpoint not found after update');
    }

    return this.ToPublicType(endpoint);
  }

  /**
   * Deletes a webhook endpoint.
   *
   * Returns an object with the deleted webhook endpoint's ID.
   *
   * @param id - The webhook endpoint ID
   * @returns Deletion confirmation object
   */
  async DeleteWebhookEndpoint(
    id: string
  ): Promise<{ id: string; object: 'webhook_endpoint'; deleted: boolean }> {
    await this.db.Delete('WebhookEndpoints', id);

    return {
      id,
      object: 'webhook_endpoint',
      deleted: true,
    };
  }

  /**
   * Converts an internal webhook endpoint record to the public API type.
   * Strips internal fields (account) and optionally the secret.
   *
   * @param record - The internal webhook endpoint record
   * @param options - Conversion options
   * @returns The public webhook endpoint type
   */
  private ToPublicType(
    record: WebhookEndpointRecord,
    options: { includeSecret?: boolean } = {}
  ): WebhookEndpointType {
    const { account, secret, ...publicFields } = record;
    return {
      ...publicFields,
      // Secret is only included on creation
      secret: options.includeSecret ? secret : '',
    };
  }
}
