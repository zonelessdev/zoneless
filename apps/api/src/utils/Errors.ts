/**
 * Centralized error definitions for consistent error handling
 */

export interface ErrorDefinition {
  message: string;
  status: number;
  type: string;
}

export const ERRORS = {
  // Authentication errors
  UNAUTHORIZED: {
    message: 'Authentication required',
    status: 401,
    type: 'authentication_error',
  },
  INVALID_TOKEN: {
    message: 'Invalid or expired token',
    status: 401,
    type: 'authentication_error',
  },
  INVALID_API_KEY: {
    message: 'Invalid API key',
    status: 401,
    type: 'authentication_error',
  },
  LINK_ALREADY_USED: {
    message: 'This link has already been used',
    status: 410,
    type: 'link_expired',
  },

  // Authorization errors
  PERMISSION_DENIED: {
    message: 'You do not have permission to perform this action',
    status: 403,
    type: 'permission_denied',
  },
  NOT_ACCOUNT_OWNER: {
    message: 'You are not the owner of this account',
    status: 403,
    type: 'permission_denied',
  },
  NOT_RESOURCE_OWNER: {
    message: 'You are not the owner of this resource',
    status: 403,
    type: 'permission_denied',
  },

  // Resource errors
  ACCOUNT_NOT_FOUND: {
    message: 'Account not found',
    status: 404,
    type: 'resource_missing',
  },
  NO_SUCH_CONNECTED_ACCOUNT: {
    message: 'No such connected account',
    status: 404,
    type: 'invalid_request_error',
  },
  PERSON_NOT_FOUND: {
    message: 'Person not found',
    status: 404,
    type: 'resource_missing',
  },
  TRANSFER_NOT_FOUND: {
    message: 'Transfer not found',
    status: 404,
    type: 'resource_missing',
  },
  PAYOUT_NOT_FOUND: {
    message: 'Payout not found',
    status: 404,
    type: 'resource_missing',
  },
  EXTERNAL_WALLET_NOT_FOUND: {
    message: 'External wallet not found',
    status: 404,
    type: 'resource_missing',
  },
  ACCOUNT_LINK_NOT_FOUND: {
    message: 'Account link not found',
    status: 404,
    type: 'resource_missing',
  },
  BALANCE_NOT_FOUND: {
    message: 'Balance not found',
    status: 404,
    type: 'resource_missing',
  },
  BALANCE_TRANSACTION_NOT_FOUND: {
    message: 'Balance transaction not found',
    status: 404,
    type: 'resource_missing',
  },
  TOPUP_NOT_FOUND: {
    message: 'Top-up not found',
    status: 404,
    type: 'resource_missing',
  },
  WEBHOOK_ENDPOINT_NOT_FOUND: {
    message: 'Webhook endpoint not found',
    status: 404,
    type: 'resource_missing',
  },
  API_KEY_NOT_FOUND: {
    message: 'API key not found',
    status: 404,
    type: 'resource_missing',
  },
  EVENT_NOT_FOUND: {
    message: 'Event not found',
    status: 404,
    type: 'resource_missing',
  },
  ROUTE_NOT_FOUND: {
    message: 'Route not found',
    status: 404,
    type: 'invalid_request_error',
  },

  // Validation errors
  VALIDATION_ERROR: {
    message: 'Validation error',
    status: 400,
    type: 'validation_error',
  },
  INVALID_REQUEST: {
    message: 'Invalid request',
    status: 400,
    type: 'invalid_request_error',
  },

  // Conflict errors
  DUPLICATE_RESOURCE: {
    message: 'Resource already exists',
    status: 409,
    type: 'conflict',
  },
  IDEMPOTENCY_CONFLICT: {
    message: 'Idempotency key already used with different parameters',
    status: 409,
    type: 'idempotency_error',
  },

  // Rate limiting
  RATE_LIMITED: {
    message: 'Too many requests. Please try again later.',
    status: 429,
    type: 'rate_limit_error',
  },

  // Server errors
  INTERNAL_ERROR: {
    message: 'An unexpected error occurred',
    status: 500,
    type: 'internal_server_error',
  },
  DATABASE_ERROR: {
    message: 'Database operation failed',
    status: 500,
    type: 'internal_server_error',
  },
} as const;

export type ErrorCode = keyof typeof ERRORS;
