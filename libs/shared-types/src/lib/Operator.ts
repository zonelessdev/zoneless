/**
 * Types for the operator API (/v1/operator).
 *
 * Operator mode is enabled by setting the OPERATOR_API_KEY env var.
 * It allows a managed-hosting operator to provision and manage platform
 * accounts on a shared multi-tenant instance.
 *
 * @zoneless_extension
 */

/**
 * Per-platform activity stats for a trailing window (amounts in cents).
 */
export interface OperatorPlatformStats {
  /** Connected accounts under this platform */
  connected_accounts: number;
  /** Settled payment/charge volume in the window (cents) */
  payment_volume: number;
  /** Absolute payout outflow in the window (cents) */
  payout_volume: number;
  /** Count of payment/charge balance transactions */
  payment_count: number;
  /** Metered API-key requests in the window */
  api_requests: number;
  /** Max Event or BalanceTransaction created timestamp, or null if none */
  last_activity: number | null;
}

/**
 * Summary of a platform account returned by the operator API.
 */
export interface OperatorPlatform {
  object: 'operator_platform';
  /** The platform account ID */
  id: string;
  /** Platform display name */
  name: string;
  /** Unix timestamp when the platform was created */
  created: number;
  /** True if the operator has disabled this platform */
  disabled: boolean;
  /** Present when GET /platforms is called with include=stats */
  stats?: OperatorPlatformStats;
}

/**
 * Response from GET /v1/operator/platforms
 */
export interface OperatorPlatformList {
  object: 'list';
  data: OperatorPlatform[];
}

/**
 * Response from POST /v1/operator/platforms/:id/login_link
 */
export interface OperatorLoginLink {
  object: 'operator_login_link';
  /** Dashboard URL with an embedded login token */
  url: string;
  /** Unix timestamp when the login token expires */
  expires_at: number;
}

/**
 * A single day of API usage for a platform.
 */
export interface UsageCounter {
  object: 'usage_counter';
  /** The platform account ID */
  platform_account: string;
  /** Day in YYYY-MM-DD format (UTC) */
  date: string;
  /** Number of authenticated API requests made on that day */
  count: number;
}

/**
 * Response from GET /v1/operator/platforms/:id/usage
 */
export interface OperatorUsage {
  object: 'operator_usage';
  /** The platform account ID */
  platform_account: string;
  /** Daily usage counters, most recent first */
  data: UsageCounter[];
  /** Total requests across the returned window */
  total: number;
}

/**
 * One day in an operator summary time series (UTC).
 */
export interface OperatorDailyPoint {
  /** Day in YYYY-MM-DD format (UTC) */
  date: string;
  /** Aggregated value for the day (cents for volume series, count for count series) */
  value: number;
}

/**
 * Instance-wide summary from GET /v1/operator/summary.
 * Amounts are exact cents (not telemetry buckets).
 */
export interface OperatorSummary {
  object: 'operator_summary';
  /** Trailing window length in days */
  days: number;
  /** Platform (root) account count */
  platforms: number;
  /** Connected account count across all platforms */
  connected_accounts: number;
  /** Settled payment/charge volume in the window (cents) */
  payment_volume: number;
  /** Absolute payout outflow in the window (cents) */
  payout_volume: number;
  /** Count of payment/charge balance transactions */
  payment_count: number;
  /** Metered API-key requests in the window */
  api_requests: number;
  /** Daily payment volume (oldest → newest, zero-filled) */
  volume_by_day: OperatorDailyPoint[];
  /** Daily absolute payout volume (oldest → newest, zero-filled) */
  payout_by_day: OperatorDailyPoint[];
}

/**
 * Slim event row for operator activity feeds.
 */
export interface OperatorEvent {
  object: 'operator_event';
  id: string;
  type: string;
  created: number;
  platform_account: string;
  /** Best-effort amount in cents from the event payload, if present */
  amount: number | null;
  /** Short human-readable detail derived from the event payload */
  summary: string | null;
}

/**
 * Response from GET /v1/operator/events
 */
export interface OperatorEventList {
  object: 'list';
  data: OperatorEvent[];
  has_more: boolean;
}
