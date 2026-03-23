/**
 * @fileOverview Methods for Events
 *
 *
 * @module Event
 */

import { Database } from './Database';
import { GenerateId } from '../utils/IdGenerator';
import { Now } from '../utils/Timestamp';
import { Event, EventDataObject, EventType } from '@zoneless/shared-types';
import { ListHelper, ListOptions, ListResult } from '../utils/ListHelper';
import { GetAppConfig } from './AppConfig';
import { GetPlatformAccountId } from './PlatformAccess';
import { AccountModule } from './Account';

/**
 * Deep equality check for comparing values.
 */
function IsEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a === null || b === null) return a === b;
  if (typeof a !== typeof b) return false;

  if (typeof a === 'object' && typeof b === 'object') {
    const aObj = a as Record<string, unknown>;
    const bObj = b as Record<string, unknown>;
    const aKeys = Object.keys(aObj);
    const bKeys = Object.keys(bObj);

    if (aKeys.length !== bKeys.length) return false;

    for (const key of aKeys) {
      if (!IsEqual(aObj[key], bObj[key])) return false;
    }
    return true;
  }

  return false;
}

/**
 * Extracts the previous values of fields that actually changed.
 * Matches Stripe's previous_attributes behavior - only includes fields
 * where the new value differs from the old value.
 *
 * @param previousObject - The object before the update
 * @param updateFields - The fields being updated
 * @returns An object containing only the previous values of actually changed fields, or null if nothing changed
 *
 * @example
 * const previous = { name: 'John', email: 'john@example.com', age: 30 };
 * const updates = { name: 'Jane', email: 'john@example.com' }; // email unchanged
 * ExtractChangedFields(previous, updates);
 * // Returns: { name: 'John' } - email excluded because it didn't change
 */
export function ExtractChangedFields(
  previousObject: Record<string, unknown>,
  updateFields: Record<string, unknown>
): Record<string, unknown> | null {
  const changedFields: Record<string, unknown> = {};

  for (const key of Object.keys(updateFields)) {
    if (
      key in previousObject &&
      !IsEqual(previousObject[key], updateFields[key])
    ) {
      changedFields[key] = previousObject[key];
    }
  }

  return Object.keys(changedFields).length > 0 ? changedFields : null;
}

export class EventModule {
  db: Database;
  private readonly listHelper: ListHelper<Event>;
  private readonly platformListHelper: ListHelper<Event>;
  private readonly accountModule: AccountModule;

  constructor(db: Database) {
    this.db = db;
    this.accountModule = new AccountModule(db);
    this.listHelper = new ListHelper<Event>(db, {
      collection: 'Events',
      orderByField: 'created',
      orderDirection: 'desc',
      urlPath: '/v1/events',
    });
    // List helper for querying by platform_account (for platform-level queries)
    this.platformListHelper = new ListHelper<Event>(db, {
      collection: 'Events',
      orderByField: 'created',
      orderDirection: 'desc',
      urlPath: '/v1/events',
      accountField: 'platform_account',
    });
  }

  async CreateEvent(
    type: EventType,
    account: string,
    dataObject: EventDataObject,
    options: {
      idempotencyKey?: string | null;
      requestId?: string | null;
      livemode?: boolean;
      apiVersion?: string;
      context?: string | null;
      previousAttributes?: Partial<EventDataObject> | null;
      pendingWebhooks?: number;
      platformAccountId?: string;
    } = {}
  ): Promise<Event> {
    // Determine platform account if not provided
    let platformAccountId = options.platformAccountId;
    if (!platformAccountId) {
      const accountData = await this.accountModule.GetAccount(account);
      platformAccountId = accountData
        ? GetPlatformAccountId(accountData)
        : account;
    }

    const event = this.EventObject(
      type,
      account,
      platformAccountId,
      dataObject,
      options
    );
    await this.db.Set('Events', event.id, event);
    return event;
  }

  EventObject(
    type: EventType,
    account: string,
    platformAccountId: string,
    dataObject: EventDataObject,
    options: {
      idempotencyKey?: string | null;
      requestId?: string | null;
      livemode?: boolean;
      apiVersion?: string;
      context?: string | null;
      previousAttributes?: Partial<EventDataObject> | null;
      pendingWebhooks?: number;
    } = {}
  ): Event {
    const {
      idempotencyKey = null,
      requestId = null,
      livemode = GetAppConfig().livemode,
      apiVersion = null,
      context = null,
      previousAttributes = null,
      pendingWebhooks = 0,
    } = options;

    const event: Event = {
      id: GenerateId('evt_z'),
      object: 'event',
      api_version: apiVersion,
      created: Now(),
      data: {
        object: dataObject,
        previous_attributes: previousAttributes,
      },
      livemode: livemode,
      pending_webhooks: pendingWebhooks,
      request: {
        id: requestId,
        idempotency_key: idempotencyKey,
      },
      type: type,
      account: account,
      platform_account: platformAccountId,
      context: context,
    };
    return event;
  }

  /**
   * Retrieve a single event by ID.
   * Events can be retrieved for up to 30 days after creation.
   *
   * @param eventId - The event ID to retrieve
   * @returns The event if found, null otherwise
   */
  async GetEvent(eventId: string): Promise<Event | null> {
    return await this.db.Get<Event>('Events', eventId);
  }

  /**
   * List events with filtering and pagination.
   * Matches Stripe's GET /v1/events endpoint.
   *
   * @param options - List options including filters and pagination
   * @returns List result with events
   */
  async ListEvents(
    options: ListOptions & {
      type?: string;
      types?: string[];
    }
  ): Promise<ListResult<Event>> {
    const { type, types, ...listOptions } = options;

    // Validate that type and types are not both provided
    if (type && types) {
      throw new Error('You may pass either type or types, but not both.');
    }

    // Validate types array length
    if (types && types.length > 20) {
      throw new Error('types array cannot contain more than 20 items.');
    }

    // Use filters for exact type match (no wildcard)
    const filters: Record<string, unknown> = { ...listOptions.filters };
    if (type && !type.includes('*')) {
      filters.type = type;
    }

    // Use ListHelper for base pagination and created filtering
    let result = await this.listHelper.List({
      ...listOptions,
      filters,
    });

    // Post-filter for wildcard or multiple types (can't be done via database query)
    if (type && type.includes('*')) {
      // Wildcard matching: convert 'account.*' to prefix match
      const prefix = type.replace('*', '');
      result = {
        ...result,
        data: result.data.filter((event) => event.type.startsWith(prefix)),
      };
    } else if (types && types.length > 0) {
      // Filter by array of specific types
      result = {
        ...result,
        data: result.data.filter((event) => types.includes(event.type)),
      };
    }

    return result;
  }

  /**
   * List events for a platform (queries by platform_account field).
   * Returns all events belonging to the platform and its connected accounts.
   * Supports the same filtering as ListEvents.
   *
   * @param options - List options with platform account ID
   * @returns List result with events
   */
  async ListEventsByPlatform(
    options: Omit<ListOptions, 'account'> & {
      platformAccount: string;
      type?: string;
      types?: string[];
    }
  ): Promise<ListResult<Event>> {
    const { platformAccount, type, types, ...listOptions } = options;

    // Validate that type and types are not both provided
    if (type && types) {
      throw new Error('You may pass either type or types, but not both.');
    }

    // Validate types array length
    if (types && types.length > 20) {
      throw new Error('types array cannot contain more than 20 items.');
    }

    // Use filters for exact type match (no wildcard)
    const filters: Record<string, unknown> = { ...listOptions.filters };
    if (type && !type.includes('*')) {
      filters.type = type;
    }

    // Use the platform list helper which queries by platform_account
    let result = await this.platformListHelper.List({
      ...listOptions,
      account: platformAccount, // This will query platform_account field
      filters,
    });

    // Post-filter for wildcard or multiple types (can't be done via database query)
    if (type && type.includes('*')) {
      // Wildcard matching: convert 'account.*' to prefix match
      const prefix = type.replace('*', '');
      result = {
        ...result,
        data: result.data.filter((event) => event.type.startsWith(prefix)),
      };
    } else if (types && types.length > 0) {
      // Filter by array of specific types
      result = {
        ...result,
        data: result.data.filter((event) => types.includes(event.type)),
      };
    }

    return result;
  }
}
