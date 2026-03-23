/**
 * @fileOverview Modular list helper for cursor-based pagination
 *
 * Provides reusable list functionality for all collection endpoints.
 * Follows Stripe's list API pattern with cursor-based pagination.
 *
 *
 * @module ListHelper
 */

import { Database } from '../modules/Database';
import { QueryParameters, QueryOperators } from '@zoneless/shared-types';

export interface ListOptions {
  /** Account ID to filter by */
  account: string;
  /** Maximum number of items to return (1-100, default 10) */
  limit?: number;
  /** Cursor for pagination - returns items after this ID */
  startingAfter?: string;
  /** Cursor for pagination - returns items before this ID */
  endingBefore?: string;
  /** Filter by created timestamp */
  created?:
    | {
        gt?: number;
        gte?: number;
        lt?: number;
        lte?: number;
      }
    | number;
  /** Additional filters — plain values use equality, or pass { operator, value } for other comparisons */
  filters?: Record<string, unknown | FilterCondition>;
}

export interface FilterCondition {
  operator: QueryOperators;
  value: unknown;
}

export interface ListResult<T> {
  object: 'list';
  data: T[];
  has_more: boolean;
  url: string;
}

export interface ListConfig {
  /** Collection name in database */
  collection: string;
  /** Field to order by (default: 'created') */
  orderByField?: string;
  /** Order direction (default: 'desc') */
  orderDirection?: 'asc' | 'desc';
  /** URL path for the resource (e.g., '/v1/balance_transactions') */
  urlPath: string;
  /** Field name to filter by account (default: 'account') */
  accountField?: string;
}

/**
 * Generic list helper that provides cursor-based pagination
 */
export class ListHelper<T extends { id: string; created: number }> {
  private readonly db: Database;
  private readonly config: ListConfig;

  constructor(db: Database, config: ListConfig) {
    this.db = db;
    this.config = {
      orderByField: 'created',
      orderDirection: 'desc',
      accountField: 'account',
      ...config,
    };
  }

  /**
   * List items with cursor-based pagination
   */
  async List(options: ListOptions): Promise<ListResult<T>> {
    const {
      account,
      limit = 10,
      startingAfter,
      endingBefore,
      created,
      filters = {},
    } = options;

    // Validate pagination parameters
    if (startingAfter && endingBefore) {
      throw new Error(
        'You cannot parameterize both starting_after and ending_before.'
      );
    }

    // Cap limit at 100
    const effectiveLimit = Math.min(limit, 100);

    // Build query parameters
    const queryParams: QueryParameters = {
      collection: this.config.collection,
      method: 'READ',
      orderBy: [
        {
          key: this.config.orderByField!,
          direction: this.config.orderDirection,
        },
      ],
      parameters: [
        {
          key: this.config.accountField!,
          operator: QueryOperators['=='],
          value: account,
        },
      ],
      // Fetch one extra to determine has_more
      limit: effectiveLimit + 1,
    };

    // Handle cursor pagination
    if (startingAfter) {
      const cursorItem = await this.db.Get<T>(
        this.config.collection,
        startingAfter
      );
      if (!cursorItem) {
        throw new Error('Invalid starting_after ID');
      }
      queryParams.startAfter = cursorItem[
        this.config.orderByField! as keyof T
      ] as number;
    }

    if (endingBefore) {
      const cursorItem = await this.db.Get<T>(
        this.config.collection,
        endingBefore
      );
      if (!cursorItem) {
        throw new Error('Invalid ending_before ID');
      }
      queryParams.endAt =
        (cursorItem[this.config.orderByField! as keyof T] as number) + 1;
    }

    // Add created timestamp filters
    if (created) {
      if (typeof created === 'object') {
        if (created.gt) {
          queryParams.parameters!.push({
            key: 'created',
            operator: QueryOperators['>'],
            value: created.gt,
          });
        }
        if (created.gte) {
          queryParams.parameters!.push({
            key: 'created',
            operator: QueryOperators['>='],
            value: created.gte,
          });
        }
        if (created.lt) {
          queryParams.parameters!.push({
            key: 'created',
            operator: QueryOperators['<'],
            value: created.lt,
          });
        }
        if (created.lte) {
          queryParams.parameters!.push({
            key: 'created',
            operator: QueryOperators['<='],
            value: created.lte,
          });
        }
      } else {
        queryParams.parameters!.push({
          key: 'created',
          operator: QueryOperators['=='],
          value: created,
        });
      }
    }

    // Add additional filters
    for (const [key, value] of Object.entries(filters)) {
      if (value !== undefined && value !== null) {
        if (IsFilterCondition(value)) {
          queryParams.parameters!.push({
            key,
            operator: value.operator,
            value: value.value,
          });
        } else {
          queryParams.parameters!.push({
            key,
            operator: QueryOperators['=='],
            value,
          });
        }
      }
    }

    // Execute query
    const results = await this.db.Query<T>(queryParams);

    // Determine has_more and trim results
    const hasMore = results.length > effectiveLimit;
    const data = hasMore ? results.slice(0, effectiveLimit) : results;

    return {
      object: 'list',
      data,
      has_more: hasMore,
      url: this.config.urlPath,
    };
  }
}

function IsFilterCondition(value: unknown): value is FilterCondition {
  return (
    typeof value === 'object' &&
    value !== null &&
    'operator' in value &&
    'value' in value
  );
}

/**
 * Timestamp filter type used for created, arrival_date, etc.
 */
export type TimestampFilter =
  | {
      gt?: number;
      gte?: number;
      lt?: number;
      lte?: number;
    }
  | number;

/**
 * Parse a generic timestamp filter from request query parameters.
 * Supports simple timestamp format: ?field=123
 * And object notation: ?field[gt]=123&field[gte]=456
 *
 * @param query - The query parameters object
 * @param fieldName - The name of the timestamp field (e.g., 'created', 'arrival_date')
 * @returns The parsed filter or undefined
 */
export function ParseTimestampFilter(
  query: Record<string, unknown>,
  fieldName: string
): TimestampFilter | undefined {
  if (query[fieldName] === undefined && !HasBracketNotation(query, fieldName)) {
    return undefined;
  }

  // Simple value: ?field=123
  if (
    typeof query[fieldName] === 'string' ||
    typeof query[fieldName] === 'number'
  ) {
    return parseInt(String(query[fieldName]), 10);
  }

  // Object notation: field[gt], field[gte], field[lt], field[lte]
  const filter: {
    gt?: number;
    gte?: number;
    lt?: number;
    lte?: number;
  } = {};

  if (query[`${fieldName}[gt]`]) {
    filter.gt = parseInt(String(query[`${fieldName}[gt]`]), 10);
  }
  if (query[`${fieldName}[gte]`]) {
    filter.gte = parseInt(String(query[`${fieldName}[gte]`]), 10);
  }
  if (query[`${fieldName}[lt]`]) {
    filter.lt = parseInt(String(query[`${fieldName}[lt]`]), 10);
  }
  if (query[`${fieldName}[lte]`]) {
    filter.lte = parseInt(String(query[`${fieldName}[lte]`]), 10);
  }

  return Object.keys(filter).length > 0 ? filter : undefined;
}

/**
 * Check if query has bracket notation for a field
 */
function HasBracketNotation(
  query: Record<string, unknown>,
  fieldName: string
): boolean {
  return (
    query[`${fieldName}[gt]`] !== undefined ||
    query[`${fieldName}[gte]`] !== undefined ||
    query[`${fieldName}[lt]`] !== undefined ||
    query[`${fieldName}[lte]`] !== undefined
  );
}

/**
 * Parse created filter from request query parameters.
 * Convenience wrapper around ParseTimestampFilter for the common 'created' field.
 *
 * @param query - The query parameters object
 * @returns The parsed filter or undefined
 */
export function ParseCreatedFilter(
  query: Record<string, unknown>
): ListOptions['created'] | undefined {
  return ParseTimestampFilter(query, 'created');
}
