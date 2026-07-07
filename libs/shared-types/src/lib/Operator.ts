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
  /** Number of authenticated API requests made on this day */
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
