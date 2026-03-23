/**
 * Webhook endpoint configuration.
 * Platforms can create multiple webhook endpoints to receive events.
 *
 * Related guide: [Setting up webhooks](https://docs.stripe.com/webhooks/configure)
 */
export interface WebhookEndpoint {
  /** Unique identifier for the webhook endpoint */
  id: string;
  /** String representing the object's type. Objects of the same type share the same value. */
  object: 'webhook_endpoint';
  /** The API version events are rendered as for this webhook endpoint */
  api_version: string | null;
  /** The ID of the associated Connect application */
  application: string | null;
  /** Time at which the object was created. Measured in seconds since the Unix epoch. */
  created: number;
  /** An optional description of what the webhook is used for */
  description: string | null;
  /** The list of events to enable for this endpoint. `['*']` indicates that all events are enabled, except those that require explicit selection. */
  enabled_events: string[];
  /** Has the value `true` if the object exists in live mode or the value `false` if the object exists in test mode. */
  livemode: boolean;
  /** Set of key-value pairs that you can attach to an object. This can be useful for storing additional information about the object in a structured format. */
  metadata: Record<string, string>;
  /** The endpoint's secret, used to generate webhook signatures. Only returned at creation. */
  secret: string;
  /** The status of the webhook. It can be `enabled` or `disabled`. */
  status: 'enabled' | 'disabled';
  /** The URL of the webhook endpoint. */
  url: string;
}

/**
 * Internal storage representation of a webhook endpoint.
 * Extends the public API type with internal fields needed for multi-tenancy.
 * @internal
 */
export interface WebhookEndpointRecord extends WebhookEndpoint {
  /** The account this webhook endpoint belongs to (internal field, not returned in API) */
  account: string;

  /**
   * The platform account that owns this resource.
   * For connected account resources, this is the platform's account ID.
   * For platform's own resources, this equals the account field (self-referential).
   * @zoneless_extension
   */
  platform_account: string;
}

/**
 * Response returned when a webhook endpoint is deleted.
 */
export interface WebhookEndpointDeletedResponse {
  /** The ID of the deleted webhook endpoint */
  id: string;
  /** String representing the object's type */
  object: 'webhook_endpoint';
  /** Whether the webhook endpoint was deleted */
  deleted: true;
}
