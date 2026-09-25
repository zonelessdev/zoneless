/** Status of a webhook delivery. Only `pending` and `retrying` can be attempted. */
export type WebhookDeliveryStatus =
  | 'pending'
  | 'retrying'
  | 'succeeded'
  | 'failed';

export type WebhookDeliveryAttemptResult =
  | 'succeeded'
  | 'http_error'
  | 'timed_out'
  | 'network_error';

/** One attempt to deliver an Event to a webhook endpoint. @internal */
export interface WebhookDeliveryAttempt {
  /** 1-based position in the delivery's attempt history */
  attempt_number: number;
  /** Time the request was sent, in seconds since the Unix epoch */
  attempted_at: number;
  /** Time the request finished, in seconds since the Unix epoch */
  completed_at: number;
  result: WebhookDeliveryAttemptResult;
  /** HTTP status, or null when no response was received */
  http_status: number | null;
  duration_ms: number;
  error: string | null;
  url: string;
}

/**
 * Delivery of one Event to one webhook endpoint, persisted for every
 * subscribed endpoint before the first attempt. @internal
 */
export interface WebhookDelivery {
  id: string;
  /** String representing the object's type. Objects of the same type share the same value. */
  object: 'webhook_delivery';
  event_id: string;
  webhook_endpoint_id: string;
  /** Retries stop once the delivery is `succeeded` or `failed` */
  status: WebhookDeliveryStatus;
  /** Time the next attempt is due, or null when the delivery is no longer retried */
  next_attempt_at: number | null;
  /** Time the first successful attempt was made, or null */
  delivered_at: number | null;
  /** Time the current claim expires, or null when no worker holds it */
  claim_until: number | null;
  /** Token of the worker holding the claim. A worker whose token no longer matches has lost it and cannot settle the delivery */
  claim_token: string | null;
  attempts: WebhookDeliveryAttempt[];

  /**
   * The platform account that owns the Event this delivery belongs to.
   * @zoneless_extension
   */
  platform_account: string;
}

/** Result of one bounded retry run. @internal */
export interface WebhookDeliveryBatch {
  object: 'webhook_delivery.batch';
  /** A claim lost to another worker counts here and in none of the outcomes below */
  processed: number;
  succeeded: number;
  retrying: number;
  failed: number;
}
