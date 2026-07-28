/**
 * Anonymous usage telemetry types.
 * Opt-in heartbeats from self-hosted instances — see TELEMETRY.md.
 */

/** Coarse payment-count buckets for the last 7 days */
export type TelemetryPaymentCountBucket =
  | '0'
  | '1-10'
  | '11-100'
  | '101-1000'
  | '1000+';

/**
 * Coarse settled USDC volume buckets for the last 7 days.
 * Thresholds are in USD (amounts stored as Stripe-style cents).
 */
export type TelemetryVolumeBucket =
  | '0'
  | 'lt_10'
  | 'lt_100'
  | 'lt_1k'
  | 'lt_10k'
  | 'lt_100k'
  | 'lt_1m'
  | 'gte_1m';

/** Coarse connected-account count buckets */
export type TelemetryConnectedAccountsBucket =
  | '0'
  | '1'
  | '2-10'
  | '11-100'
  | '100+';

/**
 * Payload POSTed to the first-party ingest endpoint.
 * Whitelist only — never include PII, secrets, or exact amounts.
 */
export interface TelemetryReport {
  instance_id: string;
  zoneless_version: string;
  livemode: boolean;
  single_tenant: boolean;
  setup_completed: boolean;
  os: string;
  node_major: number;
  payment_count_7d: TelemetryPaymentCountBucket;
  /** Settled payment/charge volume (last 7 days), coarse bucket */
  usdc_volume_7d: TelemetryVolumeBucket;
  /** Absolute payout volume (last 7 days), coarse bucket */
  usdc_payout_volume_7d: TelemetryVolumeBucket;
  connected_accounts: TelemetryConnectedAccountsBucket;
}

/**
 * Persisted consent + identity for this deployment.
 * Stored in TelemetryConfigs with id `telemetry`.
 */
export interface TelemetryConfig {
  id: 'telemetry';
  object: 'telemetry_config';
  /** Whether this instance has opted in */
  enabled: boolean;
  /** Random UUID assigned on first enable; null when never enabled */
  instance_id: string | null;
  /** Unix timestamp of last successful send, or null */
  last_sent_at: number | null;
  created: number;
  updated: number;
}

/** Response from GET /v1/telemetry */
export interface TelemetryStatus {
  object: 'telemetry_status';
  /** False on operator-managed instances (telemetry UI hidden) */
  available: boolean;
  /** Effective enabled state (available && consented && !forced_off && livemode) */
  enabled: boolean;
  /** Whether this instance has consented in the DB */
  consented: boolean;
  /** True when env kill switch or operator mode blocks sending */
  forced_off: boolean;
  instance_id: string | null;
  last_sent_at: number | null;
}

/** Request body for POST /v1/telemetry */
export interface UpdateTelemetryRequest {
  enabled: boolean;
}
