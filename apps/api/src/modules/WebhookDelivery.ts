import {
  Event,
  WebhookDelivery,
  WebhookDeliveryAttempt,
  WebhookDeliveryStatus,
  WebhookEndpointRecord,
} from '@zoneless/shared-types';
import { Database } from './Database';
import { GenerateId } from '../utils/IdGenerator';
import { Now } from '../utils/Timestamp';
import { WEBHOOK_REQUEST_TIMEOUT_SECONDS } from './WebhookDispatcher';

/** Retry delays after the first attempt, in seconds. */
export const WEBHOOK_RETRY_BACKOFF_SECONDS = [5 * 60, 60 * 60, 6 * 60 * 60];

export const WEBHOOK_DELIVERY_LOCK_SECONDS =
  WEBHOOK_REQUEST_TIMEOUT_SECONDS + 30;

export class WebhookDeliveryModule {
  private readonly db: Database;

  constructor(db: Database) {
    this.db = db;
  }

  async CreateDeliveriesForEvent(
    event: Event,
    endpoints: WebhookEndpointRecord[]
  ): Promise<WebhookDelivery[]> {
    const now = Now();
    const deliveries = endpoints.map((endpoint) =>
      this.DeliveryObject(event, endpoint, now)
    );

    await Promise.all(
      deliveries.map((delivery) =>
        this.db.Set('WebhookDeliveries', delivery.id, delivery)
      )
    );

    return deliveries;
  }

  async ClaimNext(platformAccountId?: string): Promise<WebhookDelivery | null> {
    return this.Claim(this.ClaimFilter({ platformAccountId }));
  }

  async ClaimById(deliveryId: string): Promise<WebhookDelivery | null> {
    return this.Claim(this.ClaimFilter({ deliveryId }));
  }

  /** False when another worker holds the claim, so the attempt was not recorded. */
  async RecordSuccess(
    delivery: WebhookDelivery,
    attempt: WebhookDeliveryAttempt
  ): Promise<boolean> {
    const settled = await this.WriteAttempt(
      delivery.id,
      delivery.claim_token,
      attempt,
      {
        status: 'succeeded',
        delivered_at: attempt.completed_at,
        next_attempt_at: null,
        claim_until: null,
        claim_token: null,
      }
    );

    if (settled) {
      await this.DecrementPendingWebhooks(delivery.event_id);
    }

    return settled;
  }

  /** Null when another worker holds the claim, so the attempt was not recorded. */
  async RecordFailure(
    delivery: WebhookDelivery,
    attempt: WebhookDeliveryAttempt
  ): Promise<WebhookDeliveryStatus | null> {
    const backoff = WEBHOOK_RETRY_BACKOFF_SECONDS[attempt.attempt_number - 1];
    const nextAttemptAt =
      backoff === undefined ? null : attempt.completed_at + backoff;
    const status: WebhookDeliveryStatus =
      nextAttemptAt === null ? 'failed' : 'retrying';

    const settled = await this.WriteAttempt(
      delivery.id,
      delivery.claim_token,
      attempt,
      {
        status,
        next_attempt_at: nextAttemptAt,
        claim_until: null,
        claim_token: null,
      }
    );

    return settled ? status : null;
  }

  async MarkFailed(
    deliveryId: string,
    claimToken: string | null
  ): Promise<boolean> {
    const failed = await this.db.FindOneAndUpdateByFilter<WebhookDelivery>(
      'WebhookDeliveries',
      {
        id: deliveryId,
        status: { $in: ['pending', 'retrying'] },
        claim_token: claimToken,
      },
      {
        $set: {
          status: 'failed',
          next_attempt_at: null,
          claim_until: null,
          claim_token: null,
        },
      }
    );

    return failed !== null;
  }

  private DeliveryObject(
    event: Event,
    endpoint: WebhookEndpointRecord,
    now: number
  ): WebhookDelivery {
    return {
      id: GenerateId('whd_z'),
      object: 'webhook_delivery',
      event_id: event.id,
      webhook_endpoint_id: endpoint.id,
      platform_account: event.platform_account,
      status: 'pending',
      next_attempt_at: now,
      delivered_at: null,
      claim_until: null,
      claim_token: null,
      attempts: [],
    };
  }

  private async Claim(
    filter: Record<string, unknown>
  ): Promise<WebhookDelivery | null> {
    return this.db.FindOneAndUpdateByFilter<WebhookDelivery>(
      'WebhookDeliveries',
      filter,
      {
        $set: {
          claim_until: Now() + WEBHOOK_DELIVERY_LOCK_SECONDS,
          claim_token: GenerateId('claim_z'),
        },
      }
    );
  }

  private ClaimFilter(scope: {
    deliveryId?: string;
    platformAccountId?: string;
  }): Record<string, unknown> {
    const now = Now();

    return {
      ...(scope.deliveryId ? { id: scope.deliveryId } : {}),
      ...(scope.platformAccountId
        ? { platform_account: scope.platformAccountId }
        : {}),
      status: { $in: ['pending', 'retrying'] },
      next_attempt_at: { $lte: now },
      $or: [
        { claim_until: null },
        { claim_until: { $exists: false } },
        { claim_until: { $lte: now } },
      ],
    };
  }

  /** Appends the attempt and moves the delivery in one write guarded by the claim token. */
  private async WriteAttempt(
    deliveryId: string,
    claimToken: string | null,
    attempt: WebhookDeliveryAttempt,
    state: Record<string, unknown>
  ): Promise<boolean> {
    const settled = await this.db.FindOneAndUpdateByFilter<WebhookDelivery>(
      'WebhookDeliveries',
      {
        id: deliveryId,
        status: { $in: ['pending', 'retrying'] },
        claim_token: claimToken,
      },
      { $set: state, $push: { attempts: attempt } }
    );

    return settled !== null;
  }

  private async DecrementPendingWebhooks(eventId: string): Promise<void> {
    await this.db.FindOneAndUpdateByFilter<Event>(
      'Events',
      { id: eventId, pending_webhooks: { $gt: 0 } },
      { $inc: { pending_webhooks: -1 } }
    );
  }
}
