/**
 * @fileOverview Event service for creating events and dispatching webhooks
 *
 * This service combines event creation with webhook dispatching.
 *
 * Webhooks are dispatched to all enabled webhook endpoints that subscribe
 * to the event type for the relevant platform.
 *
 * In multi-tenant mode, events are routed to the platform that owns the
 * resource being acted upon.
 *
 *
 * @module EventService
 */

import { Event, EventDataObject, EventType } from '@zoneless/shared-types';
import { Database } from './Database';
import { EventModule } from './Event';
import { AccountModule } from './Account';
import { WebhookEndpointModule } from './WebhookEndpoint';
import { WebhookDispatcher } from './WebhookDispatcher';
import { GetPlatformAccountId } from './PlatformAccess';
import { GetRequestContext } from '../middleware/RequestContext';
import { Logger } from '../utils/Logger';

interface EventOptions {
  livemode?: boolean;
  apiVersion?: string;
  context?: string | null;
  previousAttributes?: Partial<EventDataObject> | null;
}

export class EventService {
  private readonly db: Database;
  private readonly eventModule: EventModule;
  private readonly accountModule: AccountModule;
  private readonly webhookEndpointModule: WebhookEndpointModule;
  private readonly webhookDispatcher: WebhookDispatcher;

  constructor(db: Database) {
    this.db = db;
    this.eventModule = new EventModule(db);
    this.accountModule = new AccountModule(db);
    this.webhookEndpointModule = new WebhookEndpointModule(db);
    this.webhookDispatcher = new WebhookDispatcher();
  }

  /**
   * Creates an event and dispatches webhooks to all subscribed endpoints.
   *
   * This method:
   * 1. Determines which platform should receive the event based on the account
   * 2. Creates the event in the database
   * 3. Finds all webhook endpoints that subscribe to this event type
   * 4. Sends the webhook to each endpoint
   * 5. Returns the created event
   *
   * Webhook delivery is done asynchronously (fire and forget) to not block
   * the response. Failures are logged but don't affect the event creation.
   *
   * Request context (idempotency key, request ID) is automatically pulled
   * from AsyncLocalStorage - no need to pass explicitly.
   *
   * @param type - Event type (e.g., 'account.created', 'account.updated')
   * @param account - The account ID this event relates to
   * @param dataObject - The data object to include in the event
   * @param options - Additional event options
   * @returns The created event
   */
  async Emit(
    type: EventType,
    account: string,
    dataObject: EventDataObject,
    options: EventOptions = {}
  ): Promise<Event> {
    // Determine which platform should receive this event
    const platformAccountId = await this.ResolvePlatformForEvent(
      account,
      dataObject
    );

    // Get request context (idempotency key, request ID) from AsyncLocalStorage
    const reqContext = GetRequestContext();

    // Get webhook endpoints count before creating event to set pending_webhooks
    const endpoints =
      await this.webhookEndpointModule.GetWebhookEndpointsForEvent(
        platformAccountId,
        type
      );
    const pendingWebhooksCount = endpoints.length;

    // Create the event with request context merged in
    const event = await this.eventModule.CreateEvent(
      type,
      account,
      dataObject,
      {
        ...options,
        idempotencyKey: reqContext?.idempotencyKey || null,
        requestId: reqContext?.requestId || null,
        pendingWebhooks: pendingWebhooksCount,
      }
    );

    Logger.info('Event created', {
      eventId: event.id,
      eventType: type,
      account,
      platformAccountId,
      pendingWebhooks: pendingWebhooksCount,
    });

    // Dispatch webhooks asynchronously (don't await - fire and forget)
    this.DispatchWebhooks(event, platformAccountId).catch((error) => {
      Logger.error('Failed to dispatch webhooks', error, {
        eventId: event.id,
        eventType: type,
      });
    });

    return event;
  }

  /**
   * Determines which platform should receive an event based on the account.
   * For account events, uses the account's platform_account field.
   * For other resources, looks up the owning account's platform.
   *
   * @param account - The account ID from the event
   * @param dataObject - The event data object
   * @returns The platform account ID that should receive the event
   */
  private async ResolvePlatformForEvent(
    account: string,
    dataObject: EventDataObject
  ): Promise<string> {
    // For account events, use the platform_account field directly
    if ('object' in dataObject && dataObject.object === 'account') {
      const acct = dataObject as { id: string; platform_account: string };
      return acct.platform_account;
    }

    // For other resources, look up the account's platform
    const resourceAccount = await this.accountModule.GetAccount(account);
    if (resourceAccount) {
      return GetPlatformAccountId(resourceAccount);
    }

    // Fallback to the account itself (might be a platform)
    return account;
  }

  /**
   * Dispatches webhook for an event to all subscribed webhook endpoints.
   *
   * @param event - The event to dispatch
   * @param platformAccountId - The platform to send webhooks to
   */
  private async DispatchWebhooks(
    event: Event,
    platformAccountId: string
  ): Promise<void> {
    // Get all webhook endpoints that subscribe to this event type
    const endpoints =
      await this.webhookEndpointModule.GetWebhookEndpointsForEvent(
        platformAccountId,
        event.type
      );

    if (endpoints.length === 0) {
      Logger.debug('No webhook endpoints configured for event type', {
        eventId: event.id,
        eventType: event.type,
        platformAccountId,
      });
      return;
    }

    Logger.debug('Dispatching webhooks', {
      eventId: event.id,
      eventType: event.type,
      platformAccountId,
      endpointCount: endpoints.length,
    });

    // Dispatch to all endpoints in parallel
    const results = await Promise.allSettled(
      endpoints.map(async (endpoint) => {
        try {
          const result = await this.webhookDispatcher.Send(
            event,
            endpoint.url,
            endpoint.secret
          );

          if (!result.success) {
            Logger.warn('Webhook delivery failed', {
              eventId: event.id,
              eventType: event.type,
              webhookEndpointId: endpoint.id,
              url: endpoint.url,
              error: result.error,
              statusCode: result.statusCode,
            });
          }

          return result;
        } catch (error) {
          Logger.error('Webhook dispatch error', error, {
            eventId: event.id,
            eventType: event.type,
            webhookEndpointId: endpoint.id,
            url: endpoint.url,
          });
          throw error;
        }
      })
    );

    // Log summary
    const successful = results.filter(
      (r) =>
        r.status === 'fulfilled' && (r.value as { success: boolean }).success
    ).length;
    const failed = results.length - successful;

    Logger.info('Webhook dispatch completed', {
      eventId: event.id,
      eventType: event.type,
      platformAccountId,
      successful,
      failed,
      total: results.length,
    });
  }

  /**
   * Creates an event object without saving to database or dispatching webhooks.
   * Useful for testing or previewing events.
   *
   * @param type - Event type
   * @param account - The account ID
   * @param platformAccountId - The platform account ID
   * @param dataObject - The data object
   * @param options - Additional event options
   * @returns The event object (not persisted)
   */
  CreateEventObject(
    type: EventType,
    account: string,
    platformAccountId: string,
    dataObject: EventDataObject,
    options: EventOptions = {}
  ): Event {
    return this.eventModule.EventObject(
      type,
      account,
      platformAccountId,
      dataObject,
      options
    );
  }
}
