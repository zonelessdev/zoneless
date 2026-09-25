/** Status of a webhook delivery. Only `pending` and `retrying` can be claimed. */
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

/** Delivery of one Event to one webhook endpoint. @internal */
export interface WebhookDelivery {
  id: string;
  object: 'webhook_delivery';
  event_id: string;
  webhook_endpoint_id: string;
  /** Retries stop once the delivery is `succeeded` or `failed` */
  status: WebhookDeliveryStatus;
  /** Time the next attempt is due, or null once retries have stopped */
  next_attempt_at: number | null;
  delivered_at: number | null;
  claim_until: number | null;
  /** Set while a worker holds the claim; a stale token cannot settle the delivery */
  claim_token: string | null;
  attempts: WebhookDeliveryAttempt[];
  /** The platform account that owns the Event. @zoneless_extension */
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
