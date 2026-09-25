import {
  Event as EventType,
  WebhookDelivery,
  WebhookDeliveryAttemptResult,
  WebhookEndpointRecord,
} from '@zoneless/shared-types';
import { Database } from '../modules/Database';
import { EventService } from '../modules/EventService';
import {
  WebhookDeliveryModule,
  WEBHOOK_DELIVERY_LOCK_SECONDS,
  WEBHOOK_RETRY_BACKOFF_SECONDS,
} from '../modules/WebhookDelivery';
import { WebhookDeliveryWorker } from '../modules/WebhookDeliveryWorker';
import {
  WebhookDispatcher,
  WebhookResponse,
} from '../modules/WebhookDispatcher';
import { WebhookEndpointModule } from '../modules/WebhookEndpoint';
import { DeterministicId, GetFixedTimestamp, ResetIdCounter } from './Setup';

jest.mock('../modules/WebhookDispatcher');
jest.mock('../modules/WebhookEndpoint');
jest.mock('../utils/IdGenerator', () => ({
  GenerateId: jest.fn((prefix: string) => DeterministicId(prefix)),
}));

let now = GetFixedTimestamp();
jest.mock('../utils/Timestamp', () => ({ Now: jest.fn(() => now) }));

jest.mock('../modules/AppConfig', () => ({
  GetAppConfig: jest.fn(() => ({
    dashboardUrl: 'http://localhost:4200',
    livemode: false,
    appSecret: 'test-secret',
  })),
}));

const PLATFORM = 'acct_z_platform';
const EVENT_ID = 'evt_z_test001';
const ENDPOINT_ID = 'we_z_test001';
const OTHER_PLATFORM = 'acct_z_other';
const COLLECTION = 'WebhookDeliveries';
const RETRY_BACKOFF_SECONDS = WEBHOOK_RETRY_BACKOFF_SECONDS;

type Row = Record<string, unknown>;

function MatchesFilter(row: Row, filter: Row): boolean {
  return Object.entries(filter).every(([field, condition]) => {
    if (field === '$or') {
      return (condition as Row[]).some((branch) => MatchesFilter(row, branch));
    }

    const value = row[field] ?? null;

    if (condition !== null && typeof condition === 'object') {
      const operators = condition as Record<string, unknown>;
      if ('$in' in operators)
        return (operators.$in as unknown[]).includes(value);
      if ('$lte' in operators) {
        return (
          value !== null && (value as number) <= (operators.$lte as number)
        );
      }
      if ('$gt' in operators) {
        return value !== null && (value as number) > (operators.$gt as number);
      }
      if ('$exists' in operators) return (value !== null) === operators.$exists;
    }

    return value === condition;
  });
}

function ApplyUpdate(row: Row, data: Row): Row {
  const { $set, $inc, $push, ...plain } = data;
  const next = { ...row, ...plain, ...($set as Row | undefined) };
  const increments = ($inc as Record<string, number> | undefined) ?? {};
  const pushes = ($push as Record<string, unknown> | undefined) ?? {};

  for (const [field, amount] of Object.entries(increments)) {
    next[field] = ((next[field] as number) ?? 0) + amount;
  }

  for (const [field, value] of Object.entries(pushes)) {
    next[field] = [...((next[field] as unknown[]) ?? []), value];
  }

  return next;
}

class DeliveryStore extends Database {
  readonly rows = new Map<string, Row>();

  override async Set<T>(
    collection: string,
    documentId: string,
    data: Partial<T>
  ): Promise<T | null> {
    const key = `${collection}:${documentId}`;
    const next = { ...(this.rows.get(key) ?? {}), ...(data as Row) };
    this.rows.set(key, next);
    return next as T;
  }

  override async Get<T>(
    collection: string,
    documentId: string
  ): Promise<T | null> {
    return (
      (this.rows.get(`${collection}:${documentId}`) as T | undefined) ?? null
    );
  }

  override async Update<T>(
    collection: string,
    documentId: string,
    data: Partial<T>
  ): Promise<T | null> {
    const key = `${collection}:${documentId}`;
    const row = this.rows.get(key);
    if (!row) return null;

    const next = ApplyUpdate(row, data as Row);
    this.rows.set(key, next);
    return next as T;
  }

  override async FindOneAndUpdateByFilter<T>(
    collection: string,
    filter: Record<string, unknown>,
    data: Record<string, unknown>
  ): Promise<T | null> {
    for (const [key, row] of this.rows) {
      if (!key.startsWith(`${collection}:`) || !MatchesFilter(row, filter)) {
        continue;
      }

      const next = ApplyUpdate(row, data);
      this.rows.set(key, next);
      return next as T;
    }

    return null;
  }

  override async Find<T>(
    collection: string,
    field: string,
    value: unknown
  ): Promise<T[]> {
    return [...this.rows]
      .filter(
        ([key, row]) =>
          key.startsWith(`${collection}:`) && (row[field] ?? null) === value
      )
      .map(([, row]) => row as T);
  }

  override async Increment(
    collection: string,
    documentId: string,
    field: string,
    amount = 1
  ): Promise<void> {
    const key = `${collection}:${documentId}`;
    const row = this.rows.get(key);
    if (!row) return;

    this.rows.set(key, {
      ...row,
      [field]: ((row[field] as number) ?? 0) + amount,
    });
  }

  override async Query<T>(): Promise<T[]> {
    return [];
  }
}

function MakeEvent(overrides: Partial<EventType> = {}): EventType {
  return {
    id: EVENT_ID,
    object: 'event',
    account: PLATFORM,
    api_version: null,
    context: null,
    created: now,
    livemode: false,
    data: {
      object: { id: 'prod_z_test001', object: 'product' },
      previous_attributes: null,
    },
    pending_webhooks: 1,
    request: null,
    type: 'product.created',
    platform_account: PLATFORM,
    ...overrides,
  };
}

function MakeEndpoint(
  overrides: Partial<WebhookEndpointRecord> = {}
): WebhookEndpointRecord {
  return {
    id: ENDPOINT_ID,
    object: 'webhook_endpoint',
    account: PLATFORM,
    platform_account: PLATFORM,
    api_version: null,
    application: null,
    created: now,
    description: null,
    enabled_events: ['*'],
    livemode: false,
    metadata: {},
    secret: 'whsec_z_testsecret',
    status: 'enabled',
    url: 'https://example.com/webhooks',
    ...overrides,
  };
}

function MakeResult(
  result: WebhookDeliveryAttemptResult,
  statusCode: number | null,
  error: string | null = null
): Awaited<ReturnType<WebhookDispatcher['Send']>> {
  return { result, statusCode, error, durationMs: 3206 };
}

const Flush = (): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, 0));

describe('WebhookDelivery', () => {
  let store: DeliveryStore;
  let send: jest.MockedFunction<WebhookDispatcher['Send']>;
  let endpointModule: jest.Mocked<WebhookEndpointModule>;
  let deliveries: WebhookDeliveryModule;
  let worker: WebhookDeliveryWorker;
  let event: EventType;
  let endpoint: WebhookEndpointRecord;

  const ReadDelivery = (id: string): WebhookDelivery =>
    store.rows.get(`${COLLECTION}:${id}`) as unknown as WebhookDelivery;

  const ReadDeliveries = (): WebhookDelivery[] =>
    [...store.rows]
      .filter(([key]) => key.startsWith(`${COLLECTION}:`))
      .map(([, row]) => row as unknown as WebhookDelivery);

  const ReadEvent = (id: string = EVENT_ID): EventType =>
    store.rows.get(`Events:${id}`) as unknown as EventType;

  const SeedDelivery = async (): Promise<WebhookDelivery> => {
    const [delivery] = await deliveries.CreateDeliveriesForEvent(event, [
      endpoint,
    ]);
    return delivery;
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    ResetIdCounter();
    now = GetFixedTimestamp();

    store = new DeliveryStore();
    deliveries = new WebhookDeliveryModule(store);
    worker = new WebhookDeliveryWorker(store);

    send = jest.mocked(WebhookDispatcher.prototype.Send);
    send.mockResolvedValue(MakeResult('succeeded', 200));

    event = MakeEvent();
    endpoint = MakeEndpoint();
    await store.Set('Events', EVENT_ID, event);

    endpointModule = jest.mocked(WebhookEndpointModule.prototype);
    endpointModule.GetWebhookEndpoint.mockResolvedValue(endpoint);
    endpointModule.GetWebhookEndpointsForEvent.mockResolvedValue([endpoint]);
  });

  describe('EventService', () => {
    it('should persist a delivery for every subscribed endpoint before the first request', async () => {
      const second = MakeEndpoint({
        id: 'we_z_test002',
        url: 'https://example.com/second',
      });
      endpointModule.GetWebhookEndpointsForEvent.mockResolvedValue([
        endpoint,
        second,
      ]);

      let storedAtFirstRequest: WebhookDelivery[] = [];
      send.mockImplementation(async () => {
        storedAtFirstRequest = ReadDeliveries();
        return MakeResult('succeeded', 200);
      });

      await new EventService(store).Emit(
        'product.created',
        PLATFORM,
        event.data.object
      );
      await Flush();

      expect(send).toHaveBeenCalledTimes(2);
      expect(storedAtFirstRequest).toHaveLength(2);
      expect(
        storedAtFirstRequest
          .map((delivery) => delivery.webhook_endpoint_id)
          .sort()
      ).toEqual([ENDPOINT_ID, second.id].sort());

      for (const delivery of storedAtFirstRequest) {
        expect(delivery.id).toMatch(/^whd_z/);
        expect(delivery.event_id).toBe(EVENT_ID);
        expect(delivery.status).toBe('pending');
        expect(delivery.next_attempt_at).toBe(now);
        expect(delivery.attempts).toEqual([]);
        expect(delivery.claim_until).toBeGreaterThan(now);
        expect(delivery.claim_token).toMatch(/^claim_z/);
      }

      expect(ReadEvent().pending_webhooks).toBe(0);
    });
  });

  describe('WebhookDeliveryWorker', () => {
    it('should mark the delivery succeeded on a successful first attempt', async () => {
      const delivery = await SeedDelivery();

      expect(await worker.ProcessBatch()).toEqual({
        processed: 1,
        succeeded: 1,
        retrying: 0,
        failed: 0,
      });

      const stored = ReadDelivery(delivery.id);
      expect(stored.status).toBe('succeeded');
      expect(stored.delivered_at).toBe(now);
      expect(stored.next_attempt_at).toBeNull();
      expect(stored.claim_until).toBeNull();
      expect(stored.claim_token).toBeNull();
      expect(stored.attempts).toEqual([
        {
          attempt_number: 1,
          attempted_at: now,
          completed_at: now,
          result: 'succeeded',
          http_status: 200,
          duration_ms: 3206,
          error: null,
          url: endpoint.url,
        },
      ]);
      expect(ReadEvent().pending_webhooks).toBe(0);
    });

    it('should record a failed attempt and schedule the next retry', async () => {
      send.mockResolvedValue(MakeResult('http_error', 500, 'HTTP 500'));
      const delivery = await SeedDelivery();

      const batch = await worker.ProcessBatch();

      expect(batch).toEqual({
        processed: 1,
        succeeded: 0,
        retrying: 1,
        failed: 0,
      });
      expect(send).toHaveBeenCalledWith(
        expect.objectContaining({ id: EVENT_ID }),
        endpoint.url,
        endpoint.secret
      );

      const stored = ReadDelivery(delivery.id);
      expect(stored.status).toBe('retrying');
      expect(stored.delivered_at).toBeNull();
      expect(stored.next_attempt_at).toBe(now + RETRY_BACKOFF_SECONDS[0]);
      expect(stored.claim_until).toBeNull();
      expect(stored.claim_token).toBeNull();
      expect(stored.attempts).toEqual([
        {
          attempt_number: 1,
          attempted_at: now,
          completed_at: now,
          result: 'http_error',
          http_status: 500,
          duration_ms: 3206,
          error: 'HTTP 500',
          url: endpoint.url,
        },
      ]);
      expect(ReadEvent().pending_webhooks).toBe(1);
    });

    it('should follow the retry backoff and give up after the last attempt', async () => {
      send.mockResolvedValue(MakeResult('network_error', null, 'fetch failed'));
      const delivery = await SeedDelivery();

      for (const [index, backoff] of RETRY_BACKOFF_SECONDS.entries()) {
        if (index > 0) now += RETRY_BACKOFF_SECONDS[index - 1];

        const batch = await worker.ProcessBatch();

        expect(batch).toEqual({
          processed: 1,
          succeeded: 0,
          retrying: 1,
          failed: 0,
        });
        expect(ReadDelivery(delivery.id).next_attempt_at).toBe(now + backoff);
      }

      now += RETRY_BACKOFF_SECONDS[RETRY_BACKOFF_SECONDS.length - 1];
      const finalBatch = await worker.ProcessBatch();

      expect(finalBatch).toEqual({
        processed: 1,
        succeeded: 0,
        retrying: 0,
        failed: 1,
      });

      const stored = ReadDelivery(delivery.id);
      expect(stored.status).toBe('failed');
      expect(stored.next_attempt_at).toBeNull();
      expect(stored.delivered_at).toBeNull();
      expect(stored.attempts.map((attempt) => attempt.attempt_number)).toEqual([
        1, 2, 3, 4,
      ]);
      expect(ReadEvent().pending_webhooks).toBe(1);

      now += 86400;
      expect(await worker.ProcessBatch()).toEqual({
        processed: 0,
        succeeded: 0,
        retrying: 0,
        failed: 0,
      });
      expect(send).toHaveBeenCalledTimes(4);
    });

    it('should stop retrying once a later attempt succeeds', async () => {
      send.mockResolvedValue(
        MakeResult(
          'timed_out',
          null,
          'The operation was aborted due to timeout'
        )
      );
      const delivery = await SeedDelivery();

      await worker.ProcessBatch();
      now += RETRY_BACKOFF_SECONDS[0];
      send.mockResolvedValue(MakeResult('succeeded', 200));

      const batch = await worker.ProcessBatch();

      expect(batch).toEqual({
        processed: 1,
        succeeded: 1,
        retrying: 0,
        failed: 0,
      });

      const stored = ReadDelivery(delivery.id);
      expect(stored.status).toBe('succeeded');
      expect(stored.delivered_at).toBe(now);
      expect(stored.attempts.map((attempt) => attempt.result)).toEqual([
        'timed_out',
        'succeeded',
      ]);
      expect(send.mock.calls.map((call) => call[0].id)).toEqual([
        EVENT_ID,
        EVENT_ID,
      ]);

      now += 86400;
      expect(await worker.ProcessBatch()).toEqual({
        processed: 0,
        succeeded: 0,
        retrying: 0,
        failed: 0,
      });
      expect(send).toHaveBeenCalledTimes(2);
    });

    it('should track multiple endpoints for the same event independently', async () => {
      const failing = MakeEndpoint({
        id: 'we_z_test002',
        url: 'https://example.com/failing',
      });
      let failingAttempts = 0;
      send.mockImplementation(async (_event, url) => {
        if (url !== failing.url) return MakeResult('succeeded', 200);

        failingAttempts += 1;
        return failingAttempts === 1
          ? MakeResult('http_error', 500, 'HTTP 500')
          : MakeResult('succeeded', 200);
      });
      endpointModule.GetWebhookEndpoint.mockImplementation(async (id) =>
        id === failing.id ? failing : endpoint
      );
      await store.Set('Events', EVENT_ID, {
        ...ReadEvent(),
        pending_webhooks: 2,
      });

      const [succeeding, retrying] = await deliveries.CreateDeliveriesForEvent(
        event,
        [endpoint, failing]
      );

      expect(await worker.ProcessBatch()).toEqual({
        processed: 2,
        succeeded: 1,
        retrying: 1,
        failed: 0,
      });
      expect(ReadDelivery(succeeding.id).status).toBe('succeeded');
      expect(ReadDelivery(retrying.id).status).toBe('retrying');
      expect(ReadEvent().pending_webhooks).toBe(1);

      now += RETRY_BACKOFF_SECONDS[0];
      expect(await worker.ProcessBatch()).toEqual({
        processed: 1,
        succeeded: 1,
        retrying: 0,
        failed: 0,
      });
      expect(ReadDelivery(retrying.id).status).toBe('succeeded');
      expect(ReadEvent().pending_webhooks).toBe(0);
    });

    it('should only process deliveries for the requested platform', async () => {
      const otherEndpoint = MakeEndpoint({
        id: 'we_z_test002',
        account: OTHER_PLATFORM,
        platform_account: OTHER_PLATFORM,
        url: 'https://example.com/other',
      });
      const otherEvent = MakeEvent({
        id: 'evt_z_test002',
        account: OTHER_PLATFORM,
        platform_account: OTHER_PLATFORM,
      });
      await store.Set('Events', otherEvent.id, otherEvent);
      endpointModule.GetWebhookEndpoint.mockImplementation(async (id) =>
        id === otherEndpoint.id ? otherEndpoint : endpoint
      );

      const [mine] = await deliveries.CreateDeliveriesForEvent(event, [
        endpoint,
      ]);
      const [other] = await deliveries.CreateDeliveriesForEvent(otherEvent, [
        otherEndpoint,
      ]);

      expect(
        await worker.ProcessBatch({ platformAccountId: PLATFORM })
      ).toEqual({
        processed: 1,
        succeeded: 1,
        retrying: 0,
        failed: 0,
      });
      expect(ReadDelivery(mine.id).status).toBe('succeeded');
      expect(ReadDelivery(other.id).status).toBe('pending');
      expect(ReadEvent(otherEvent.id).pending_webhooks).toBe(1);

      expect(await worker.ProcessBatch()).toEqual({
        processed: 1,
        succeeded: 1,
        retrying: 0,
        failed: 0,
      });
      expect(ReadDelivery(other.id).status).toBe('succeeded');
      expect(ReadEvent(otherEvent.id).pending_webhooks).toBe(0);
    });

    it('should claim one delivery at a time so a claim never expires mid-batch', async () => {
      const endpoints = [
        endpoint,
        MakeEndpoint({ id: 'we_z_test002', url: 'https://example.com/second' }),
        MakeEndpoint({ id: 'we_z_test003', url: 'https://example.com/third' }),
      ];
      endpointModule.GetWebhookEndpoint.mockImplementation(
        async (id) => endpoints.find((candidate) => candidate.id === id) ?? null
      );
      await store.Set('Events', EVENT_ID, {
        ...ReadEvent(),
        pending_webhooks: endpoints.length,
      });
      await deliveries.CreateDeliveriesForEvent(event, endpoints);

      const claimedAtSend: number[] = [];
      send.mockImplementation(async () => {
        claimedAtSend.push(
          ReadDeliveries().filter((delivery) => delivery.claim_until !== null)
            .length
        );
        return MakeResult('succeeded', 200);
      });

      expect(await worker.ProcessBatch()).toEqual({
        processed: 3,
        succeeded: 3,
        retrying: 0,
        failed: 0,
      });

      expect(claimedAtSend).toEqual([1, 1, 1]);
    });

    it('should not let a stale worker resettle a delivery another worker reclaimed', async () => {
      const delivery = await SeedDelivery();
      const stale = await deliveries.ClaimById(delivery.id);
      if (!stale) throw new Error('delivery was not claimed');
      const staleAt = now;
      const attempt = {
        attempt_number: 1,
        attempted_at: now,
        completed_at: now,
        result: 'http_error' as const,
        http_status: 500,
        duration_ms: 10,
        error: 'HTTP 500',
        url: endpoint.url,
      };

      now += WEBHOOK_DELIVERY_LOCK_SECONDS + 1;
      const owner = await deliveries.ClaimById(delivery.id);
      if (!owner) throw new Error('delivery was not reclaimed');

      expect(owner.claim_token).not.toBe(stale.claim_token);

      expect(await deliveries.RecordFailure(stale, attempt)).toBeNull();
      expect(await deliveries.RecordSuccess(stale, attempt)).toBe(false);
      expect(await deliveries.MarkFailed(delivery.id, stale.claim_token)).toBe(
        false
      );

      const stored = ReadDelivery(delivery.id);
      expect(stored.status).toBe('pending');
      expect(stored.next_attempt_at).toBe(staleAt);
      expect(stored.claim_token).toBe(owner.claim_token);
      expect(stored.claim_until).toBe(now + WEBHOOK_DELIVERY_LOCK_SECONDS);
      expect(stored.attempts).toEqual([]);
      expect(ReadEvent().pending_webhooks).toBe(1);

      await store.Update<WebhookDelivery>(COLLECTION, delivery.id, {
        status: 'succeeded',
        delivered_at: now,
        next_attempt_at: null,
        claim_until: null,
        claim_token: null,
      });

      expect(await deliveries.RecordFailure(stale, attempt)).toBeNull();
      expect(await deliveries.RecordSuccess(stale, attempt)).toBe(false);

      expect(ReadDelivery(delivery.id).status).toBe('succeeded');
      expect(ReadDelivery(delivery.id).attempts).toEqual([]);
      expect(ReadEvent().pending_webhooks).toBe(1);
    });

    it('should not decrement pending_webhooks twice for one delivery', async () => {
      const delivery = await SeedDelivery();

      await worker.ProcessBatch();
      expect(ReadEvent().pending_webhooks).toBe(0);

      await store.Update<WebhookDelivery>(COLLECTION, delivery.id, {
        status: 'retrying',
        next_attempt_at: now,
        claim_until: null,
        claim_token: null,
      });

      await worker.ProcessBatch();

      expect(ReadDelivery(delivery.id).status).toBe('succeeded');
      expect(ReadEvent().pending_webhooks).toBe(0);
    });

    it('should let only one of two workers claim a delivery', async () => {
      await SeedDelivery();
      const otherWorker = new WebhookDeliveryWorker(store);

      const [first, second] = await Promise.all([
        worker.ProcessBatch(),
        otherWorker.ProcessBatch(),
      ]);

      expect([first.processed, second.processed].sort()).toEqual([0, 1]);
      expect(send).toHaveBeenCalledTimes(1);
    });

    it('should not attempt a delivery whose next attempt is not due', async () => {
      const delivery = await SeedDelivery();
      await store.Update<WebhookDelivery>(COLLECTION, delivery.id, {
        next_attempt_at: now + 30,
      });

      expect(await worker.ProcessBatch()).toEqual({
        processed: 0,
        succeeded: 0,
        retrying: 0,
        failed: 0,
      });
      expect(send).not.toHaveBeenCalled();
    });

    const endpointStates: Array<[string, WebhookEndpointRecord | null]> = [
      ['disabled', MakeEndpoint({ status: 'disabled' })],
      ['deleted', null],
    ];

    it.each(endpointStates)(
      'should mark the delivery failed when the endpoint is %s',
      async (_state, endpointRecord) => {
        endpointModule.GetWebhookEndpoint.mockResolvedValue(endpointRecord);
        const delivery = await SeedDelivery();

        expect(await worker.ProcessBatch()).toEqual({
          processed: 1,
          succeeded: 0,
          retrying: 0,
          failed: 1,
        });
        expect(send).not.toHaveBeenCalled();

        const stored = ReadDelivery(delivery.id);
        expect(stored.status).toBe('failed');
        expect(stored.next_attempt_at).toBeNull();
        expect(stored.attempts).toEqual([]);
      }
    );
  });

  describe('WebhookDispatcher', () => {
    const RealWebhookDispatcher = jest.requireActual<
      typeof import('../modules/WebhookDispatcher')
    >('../modules/WebhookDispatcher').WebhookDispatcher;
    const originalFetch = globalThis.fetch;
    let fetchMock: jest.Mock;

    const outcomes: Array<[string, unknown, Partial<WebhookResponse>]> = [
      [
        'a 2xx response',
        { ok: true, status: 200 },
        { result: 'succeeded', statusCode: 200, error: null },
      ],
      [
        'a non-2xx response',
        { ok: false, status: 500 },
        { result: 'http_error', statusCode: 500, error: 'HTTP 500' },
      ],
      [
        'a timeout',
        Object.assign(new Error('The operation was aborted due to timeout'), {
          name: 'TimeoutError',
        }),
        {
          result: 'timed_out',
          statusCode: null,
          error: 'The operation was aborted due to timeout',
        },
      ],
      [
        'a request that never reaches the endpoint',
        new TypeError('fetch failed'),
        { result: 'network_error', statusCode: null, error: 'fetch failed' },
      ],
    ];

    beforeEach(() => {
      fetchMock = jest.fn();
      globalThis.fetch = fetchMock as unknown as typeof fetch;
    });

    afterAll(() => {
      globalThis.fetch = originalFetch;
    });

    it.each(outcomes)(
      'should report the attempt result for %s',
      async (_case, response, expected) => {
        if (response instanceof Error) {
          fetchMock.mockRejectedValue(response);
        } else {
          fetchMock.mockResolvedValue(response);
        }

        const result = await new RealWebhookDispatcher().Send(
          event,
          endpoint.url,
          endpoint.secret
        );

        expect(result).toMatchObject(expected);
        expect(result.durationMs).toBeGreaterThanOrEqual(0);
      }
    );

    it('should sign every attempt with a fresh timestamp', async () => {
      fetchMock.mockResolvedValue({ ok: true, status: 200 });
      const dispatcher = new RealWebhookDispatcher();

      await dispatcher.Send(event, endpoint.url, endpoint.secret);
      now += 5;
      await dispatcher.Send(event, endpoint.url, endpoint.secret);

      const signatures = fetchMock.mock.calls.map(
        (call) =>
          (call[1].headers as Record<string, string>)['Zoneless-Signature']
      );
      expect(signatures[0]).not.toEqual(signatures[1]);
      expect(
        fetchMock.mock.calls.map(
          (call) => JSON.parse(call[1].body as string).id as string
        )
      ).toEqual([EVENT_ID, EVENT_ID]);
    });
  });
});
