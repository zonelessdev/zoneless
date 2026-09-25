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

import {
  Event,
  EventDataObject,
  EventType,
  WebhookDelivery,
  WebhookEndpointRecord,
} from '@zoneless/shared-types';
import { Database } from './Database';
import { EventModule } from './Event';
import { AccountModule } from './Account';
import { WebhookEndpointModule } from './WebhookEndpoint';
import { WebhookDeliveryModule } from './WebhookDelivery';
import { WebhookDeliveryWorker } from './WebhookDeliveryWorker';
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
  private readonly eventModule: EventModule;
  private readonly accountModule: AccountModule;
  private readonly webhookEndpointModule: WebhookEndpointModule;
  private readonly webhookDeliveryModule: WebhookDeliveryModule;
  private readonly webhookDeliveryWorker: WebhookDeliveryWorker;

  constructor(db: Database) {
    this.eventModule = new EventModule(db);
    this.accountModule = new AccountModule(db);
    this.webhookEndpointModule = new WebhookEndpointModule(db);
    this.webhookDeliveryModule = new WebhookDeliveryModule(db);
    this.webhookDeliveryWorker = new WebhookDeliveryWorker(db);
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

    const deliveries = await this.PersistDeliveries(event, endpoints);

    // Dispatch webhooks asynchronously (don't await - fire and forget)
    this.DeliverFirstAttempts(event, deliveries).catch((error) => {
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
   * Persists a webhook delivery for the event to each subscribed endpoint.
   *
   * @param event - The event to dispatch
   * @param endpoints - The endpoints subscribed to the event type
   * @returns The created deliveries, empty when there is nothing to deliver
   */
  private async PersistDeliveries(
    event: Event,
    endpoints: WebhookEndpointRecord[]
  ): Promise<WebhookDelivery[]> {
    if (endpoints.length === 0) {
      Logger.debug('No webhook endpoints configured for event type', {
        eventId: event.id,
        eventType: event.type,
        platformAccountId: event.platform_account,
      });
      return [];
    }

    Logger.debug('Dispatching webhooks', {
      eventId: event.id,
      eventType: event.type,
      platformAccountId: event.platform_account,
      endpointCount: endpoints.length,
    });

    try {
      return await this.webhookDeliveryModule.CreateDeliveriesForEvent(
        event,
        endpoints
      );
    } catch (error) {
      Logger.error('Failed to persist webhook deliveries', error, {
        eventId: event.id,
        eventType: event.type,
      });
      return [];
    }
  }

  /**
   * Sends the first delivery attempt for each persisted delivery.
   *
   * @param event - The event being dispatched
   * @param deliveries - The deliveries to attempt
   */
  private async DeliverFirstAttempts(
    event: Event,
    deliveries: WebhookDelivery[]
  ): Promise<void> {
    // Dispatch to all endpoints in parallel
    const results = await Promise.allSettled(
      deliveries.map((delivery) =>
        this.webhookDeliveryWorker.ProcessDelivery(delivery.id)
      )
    );

    // Log summary
    const successful = results.filter(
      (result) => result.status === 'fulfilled' && result.value === 'succeeded'
    ).length;

    Logger.info('Webhook dispatch completed', {
      eventId: event.id,
      eventType: event.type,
      platformAccountId: event.platform_account,
      successful,
      failed: results.length - successful,
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
