import {
  WebhookDelivery,
  WebhookDeliveryAttempt,
  WebhookDeliveryBatch,
} from '@zoneless/shared-types';
import { Database } from './Database';
import { EventModule } from './Event';
import { WebhookDeliveryModule } from './WebhookDelivery';
import { WebhookEndpointModule } from './WebhookEndpoint';
import { WebhookDispatcher } from './WebhookDispatcher';
import { Now } from '../utils/Timestamp';
import { Logger } from '../utils/Logger';

const DEFAULT_BATCH_SIZE = 20;
const MAX_BATCH_SIZE = 100;

export type WebhookDeliveryOutcome = 'succeeded' | 'retrying' | 'failed';

export type WebhookDeliveryBatchResult = Omit<WebhookDeliveryBatch, 'object'>;

export class WebhookDeliveryWorker {
  private readonly deliveryModule: WebhookDeliveryModule;
  private readonly eventModule: EventModule;
  private readonly webhookEndpointModule: WebhookEndpointModule;
  private readonly webhookDispatcher: WebhookDispatcher;

  constructor(db: Database) {
    this.deliveryModule = new WebhookDeliveryModule(db);
    this.eventModule = new EventModule(db);
    this.webhookEndpointModule = new WebhookEndpointModule(db);
    this.webhookDispatcher = new WebhookDispatcher();
  }

  async ProcessBatch(
    options: { limit?: number; platformAccountId?: string } = {}
  ): Promise<WebhookDeliveryBatchResult> {
    const limit = Math.min(
      Math.max(options.limit ?? DEFAULT_BATCH_SIZE, 1),
      MAX_BATCH_SIZE
    );
    const result: WebhookDeliveryBatchResult = {
      processed: 0,
      succeeded: 0,
      retrying: 0,
      failed: 0,
    };

    for (let index = 0; index < limit; index++) {
      const delivery = await this.deliveryModule.ClaimNext(
        options.platformAccountId
      );
      if (!delivery) break;

      const outcome = await this.Attempt(delivery);
      result.processed += 1;

      if (outcome === 'succeeded') {
        result.succeeded += 1;
      } else if (outcome === 'retrying') {
        result.retrying += 1;
      } else if (outcome === 'failed') {
        result.failed += 1;
      }
    }

    return result;
  }

  async ProcessDelivery(
    deliveryId: string
  ): Promise<WebhookDeliveryOutcome | null> {
    const delivery = await this.deliveryModule.ClaimById(deliveryId);
    if (!delivery) return null;

    return this.Attempt(delivery);
  }

  /** Null when another worker holds the claim, so this attempt settled nothing. */
  private async Attempt(
    delivery: WebhookDelivery
  ): Promise<WebhookDeliveryOutcome | null> {
    const event = await this.eventModule.GetEvent(delivery.event_id);
    const endpoint = await this.webhookEndpointModule.GetWebhookEndpoint(
      delivery.webhook_endpoint_id
    );

    if (!event || !endpoint || endpoint.status !== 'enabled') {
      Logger.warn('Webhook delivery abandoned: endpoint is gone or disabled', {
        deliveryId: delivery.id,
        eventId: delivery.event_id,
        webhookEndpointId: delivery.webhook_endpoint_id,
      });

      const settled = await this.deliveryModule.MarkFailed(
        delivery.id,
        delivery.claim_token
      );
      return settled ? 'failed' : null;
    }

    const attemptedAt = Now();
    const response = await this.webhookDispatcher.Send(
      event,
      endpoint.url,
      endpoint.secret
    );

    const attempt: WebhookDeliveryAttempt = {
      attempt_number: delivery.attempts.length + 1,
      attempted_at: attemptedAt,
      completed_at: Now(),
      result: response.result,
      http_status: response.statusCode,
      duration_ms: response.durationMs,
      error: response.error,
      url: endpoint.url,
    };

    if (response.result === 'succeeded') {
      const settled = await this.deliveryModule.RecordSuccess(
        delivery,
        attempt
      );
      return settled ? 'succeeded' : null;
    }

    const status = await this.deliveryModule.RecordFailure(delivery, attempt);
    if (status === null) return null;

    return status === 'failed' ? 'failed' : 'retrying';
  }
}
