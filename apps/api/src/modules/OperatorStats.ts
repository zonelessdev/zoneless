/**
 * @fileOverview Operator instance stats
 *
 * Aggregations for the managed-hosting operator control plane:
 * instance summary, per-platform stats, and recent events.
 * Reads BalanceTransactions / Accounts / UsageCounters / Events (no writes).
 *
 * @module OperatorStats
 */

import {
  Event,
  OperatorDailyPoint,
  OperatorEvent,
  OperatorPlatformStats,
  OperatorSummary,
  QueryOperators,
} from '@zoneless/shared-types';
import { Database } from './Database';
import { Now } from '../utils/Timestamp';
import { ListHelper } from '../utils/ListHelper';

const PAYMENT_TYPES = ['payment', 'charge'];
const DEFAULT_EVENT_TYPES = [
  'payment_intent.succeeded',
  'charge.succeeded',
  'payout.paid',
  'payout.failed',
  'account.created',
  'account.updated',
  'transfer.created',
  'customer.subscription.created',
  'product.created',
  'price.created',
  'payment_link.created',
  'customer.created',
];

interface VolumeGroupRow {
  _id: string | null;
  count: number;
  gross: number;
}

interface DailyVolumeRow {
  _id: string;
  value: number;
}

interface CountGroupRow {
  _id: string | null;
  count: number;
}

interface LastActivityRow {
  _id: string;
  last: number;
}

export interface ListRecentEventsInput {
  limit: number;
  types?: string[];
  startingAfter?: string;
  endingBefore?: string;
}

export class OperatorStatsModule {
  private readonly db: Database;
  private readonly eventListHelper: ListHelper<Event>;

  constructor(db: Database) {
    this.db = db;
    this.eventListHelper = new ListHelper<Event>(db, {
      collection: 'Events',
      orderByField: 'created',
      orderDirection: 'desc',
      urlPath: '/v1/operator/events',
    });
  }

  /**
   * Instance-wide KPIs and daily volume series for a trailing window.
   */
  async GetSummary(days: number): Promise<OperatorSummary> {
    const window = WindowBounds(days);
    const [
      platforms,
      connectedAccounts,
      paymentAgg,
      payoutAgg,
      apiRequests,
      volumeByDay,
      payoutByDay,
    ] = await Promise.all([
      this.CountPlatforms(),
      this.CountConnectedAccounts(),
      this.AggregatePayments(null, window.start, window.end),
      this.AggregatePayouts(null, window.start, window.end),
      this.SumApiRequests(null, window.sinceDate),
      this.DailySeries('payment', window, days),
      this.DailySeries('payout', window, days),
    ]);

    return {
      object: 'operator_summary',
      days,
      platforms,
      connected_accounts: connectedAccounts,
      payment_volume: paymentAgg.gross,
      payout_volume: payoutAgg.gross,
      payment_count: paymentAgg.count,
      api_requests: apiRequests,
      volume_by_day: volumeByDay,
      payout_by_day: payoutByDay,
    };
  }

  /**
   * Per-platform stats keyed by platform account ID.
   */
  async GetPlatformStatsMap(
    days: number
  ): Promise<Map<string, OperatorPlatformStats>> {
    const window = WindowBounds(days);
    const [
      connectedRows,
      paymentRows,
      payoutRows,
      usageRows,
      eventActivity,
      btActivity,
    ] = await Promise.all([
      this.db.Aggregate<CountGroupRow>('Accounts', [
        {
          $match: {
            $expr: { $ne: ['$platform_account', '$id'] },
          },
        },
        {
          $group: {
            _id: '$platform_account',
            count: { $sum: 1 },
          },
        },
      ]),
      this.db.Aggregate<VolumeGroupRow>('BalanceTransactions', [
        {
          $match: {
            type: { $in: PAYMENT_TYPES },
            created: { $gte: window.start, $lt: window.end },
          },
        },
        {
          $group: {
            _id: '$platform_account',
            count: { $sum: 1 },
            gross: { $sum: '$amount' },
          },
        },
      ]),
      this.db.Aggregate<VolumeGroupRow>('BalanceTransactions', [
        {
          $match: {
            type: 'payout',
            created: { $gte: window.start, $lt: window.end },
          },
        },
        {
          $group: {
            _id: '$platform_account',
            count: { $sum: 1 },
            gross: { $sum: { $abs: '$amount' } },
          },
        },
      ]),
      this.UsageByPlatform(window.sinceDate),
      this.db.Aggregate<LastActivityRow>('Events', [
        {
          $group: {
            _id: '$platform_account',
            last: { $max: '$created' },
          },
        },
      ]),
      this.db.Aggregate<LastActivityRow>('BalanceTransactions', [
        {
          $group: {
            _id: '$platform_account',
            last: { $max: '$created' },
          },
        },
      ]),
    ]);

    const map = new Map<string, OperatorPlatformStats>();

    const Ensure = (platformId: string): OperatorPlatformStats => {
      let stats = map.get(platformId);
      if (!stats) {
        stats = {
          connected_accounts: 0,
          payment_volume: 0,
          payout_volume: 0,
          payment_count: 0,
          api_requests: 0,
          last_activity: null,
        };
        map.set(platformId, stats);
      }
      return stats;
    };

    for (const row of connectedRows) {
      if (!row._id) continue;
      Ensure(row._id).connected_accounts = row.count;
    }
    for (const row of paymentRows) {
      if (!row._id) continue;
      const stats = Ensure(row._id);
      stats.payment_volume = row.gross;
      stats.payment_count = row.count;
    }
    for (const row of payoutRows) {
      if (!row._id) continue;
      Ensure(row._id).payout_volume = row.gross;
    }
    for (const [platformId, count] of usageRows) {
      Ensure(platformId).api_requests = count;
    }
    for (const row of eventActivity) {
      if (!row._id) continue;
      const stats = Ensure(row._id);
      stats.last_activity = MaxNullable(stats.last_activity, row.last);
    }
    for (const row of btActivity) {
      if (!row._id) continue;
      const stats = Ensure(row._id);
      stats.last_activity = MaxNullable(stats.last_activity, row.last);
    }

    return map;
  }

  /**
   * Recent events across all platforms (operator activity feed).
   * Uses the shared ListHelper cursor pagination (starting_after / ending_before).
   */
  async ListRecentEvents(
    input: ListRecentEventsInput
  ): Promise<{ data: OperatorEvent[]; has_more: boolean }> {
    const effectiveTypes =
      input.types && input.types.length > 0 ? input.types : DEFAULT_EVENT_TYPES;
    const effectiveLimit = Math.min(Math.max(input.limit, 1), 100);

    const result = await this.eventListHelper.List({
      limit: effectiveLimit,
      startingAfter: input.startingAfter,
      endingBefore: input.endingBefore,
      filters: {
        type: {
          operator: QueryOperators.in,
          value: effectiveTypes,
        },
      },
    });

    return {
      data: result.data.map(ToOperatorEvent),
      has_more: result.has_more,
    };
  }

  private async CountPlatforms(): Promise<number> {
    const rows = await this.db.Aggregate<CountGroupRow>('Accounts', [
      {
        $match: {
          $expr: { $eq: ['$platform_account', '$id'] },
        },
      },
      { $group: { _id: null, count: { $sum: 1 } } },
    ]);
    return rows[0]?.count ?? 0;
  }

  private async CountConnectedAccounts(): Promise<number> {
    const rows = await this.db.Aggregate<CountGroupRow>('Accounts', [
      {
        $match: {
          $expr: { $ne: ['$platform_account', '$id'] },
        },
      },
      { $group: { _id: null, count: { $sum: 1 } } },
    ]);
    return rows[0]?.count ?? 0;
  }

  private async AggregatePayments(
    platformAccountId: string | null,
    start: number,
    end: number
  ): Promise<{ count: number; gross: number }> {
    const match: Record<string, unknown> = {
      type: { $in: PAYMENT_TYPES },
      created: { $gte: start, $lt: end },
    };
    if (platformAccountId) {
      match.platform_account = platformAccountId;
    }
    const rows = await this.db.Aggregate<VolumeGroupRow>(
      'BalanceTransactions',
      [
        { $match: match },
        {
          $group: {
            _id: null,
            count: { $sum: 1 },
            gross: { $sum: '$amount' },
          },
        },
      ]
    );
    return {
      count: rows[0]?.count ?? 0,
      gross: rows[0]?.gross ?? 0,
    };
  }

  private async AggregatePayouts(
    platformAccountId: string | null,
    start: number,
    end: number
  ): Promise<{ count: number; gross: number }> {
    const match: Record<string, unknown> = {
      type: 'payout',
      created: { $gte: start, $lt: end },
    };
    if (platformAccountId) {
      match.platform_account = platformAccountId;
    }
    const rows = await this.db.Aggregate<VolumeGroupRow>(
      'BalanceTransactions',
      [
        { $match: match },
        {
          $group: {
            _id: null,
            count: { $sum: 1 },
            gross: { $sum: { $abs: '$amount' } },
          },
        },
      ]
    );
    return {
      count: rows[0]?.count ?? 0,
      gross: rows[0]?.gross ?? 0,
    };
  }

  private async SumApiRequests(
    platformAccountId: string | null,
    sinceDate: string
  ): Promise<number> {
    const match: Record<string, unknown> = {
      date: { $gte: sinceDate },
    };
    if (platformAccountId) {
      match.platform_account = platformAccountId;
    }
    const rows = await this.db.Aggregate<CountGroupRow>('UsageCounters', [
      { $match: match },
      {
        $group: {
          _id: null,
          count: { $sum: '$count' },
        },
      },
    ]);
    return rows[0]?.count ?? 0;
  }

  private async UsageByPlatform(
    sinceDate: string
  ): Promise<Map<string, number>> {
    const rows = await this.db.Aggregate<CountGroupRow>('UsageCounters', [
      { $match: { date: { $gte: sinceDate } } },
      {
        $group: {
          _id: '$platform_account',
          count: { $sum: '$count' },
        },
      },
    ]);
    const map = new Map<string, number>();
    for (const row of rows) {
      if (!row._id) continue;
      map.set(row._id, row.count);
    }
    return map;
  }

  private async DailySeries(
    kind: 'payment' | 'payout',
    window: { start: number; end: number },
    days: number
  ): Promise<OperatorDailyPoint[]> {
    const match =
      kind === 'payment'
        ? {
            type: { $in: PAYMENT_TYPES },
            created: { $gte: window.start, $lt: window.end },
          }
        : {
            type: 'payout',
            created: { $gte: window.start, $lt: window.end },
          };
    const valueExpr = kind === 'payment' ? '$amount' : { $abs: '$amount' };

    const rows = await this.db.Aggregate<DailyVolumeRow>(
      'BalanceTransactions',
      [
        { $match: match },
        {
          $group: {
            _id: {
              $dateToString: {
                format: '%Y-%m-%d',
                date: {
                  $toDate: { $multiply: ['$created', 1000] },
                },
                timezone: 'UTC',
              },
            },
            value: { $sum: valueExpr },
          },
        },
      ]
    );

    const byDate = new Map(rows.map((row) => [row._id, row.value]));
    return BuildZeroFilledDays(days, byDate);
  }
}

function WindowBounds(days: number): {
  start: number;
  end: number;
  sinceDate: string;
} {
  const end = Now();
  const start = end - days * 24 * 60 * 60;
  const since = new Date();
  since.setUTCDate(since.getUTCDate() - (days - 1));
  const sinceDate = since.toISOString().slice(0, 10);
  return { start, end, sinceDate };
}

function BuildZeroFilledDays(
  days: number,
  byDate: Map<string, number>
): OperatorDailyPoint[] {
  const points: OperatorDailyPoint[] = [];
  const cursor = new Date();
  cursor.setUTCHours(0, 0, 0, 0);
  cursor.setUTCDate(cursor.getUTCDate() - (days - 1));
  for (let i = 0; i < days; i++) {
    const date = cursor.toISOString().slice(0, 10);
    points.push({ date, value: byDate.get(date) ?? 0 });
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return points;
}

function MaxNullable(a: number | null, b: number): number {
  return a === null ? b : Math.max(a, b);
}

function ToOperatorEvent(event: Event): OperatorEvent {
  const payload = (event.data?.object ?? {}) as Record<string, unknown>;
  return {
    object: 'operator_event',
    id: event.id,
    type: event.type,
    created: event.created,
    platform_account: event.platform_account,
    amount: ExtractAmount(payload),
    summary: SummarizeEvent(event.type, payload),
  };
}

function ExtractAmount(payload: Record<string, unknown>): number | null {
  for (const key of [
    'amount',
    'amount_received',
    'unit_amount',
    'amount_total',
  ]) {
    const value = payload[key];
    if (typeof value === 'number' && Number.isFinite(value)) {
      return Math.abs(value);
    }
  }
  return null;
}

function SummarizeEvent(
  type: string,
  payload: Record<string, unknown>
): string | null {
  if (type.startsWith('customer.subscription')) {
    const status = AsString(payload.status);
    const id = AsString(payload.id);
    return [status, id].filter(Boolean).join(' · ') || null;
  }

  const resource = type.split('.')[0];

  switch (resource) {
    case 'product':
      return AsString(payload.name);

    case 'price': {
      const parts: string[] = [];
      const unitAmount = AsNumber(payload.unit_amount);
      if (unitAmount !== null) {
        parts.push(FormatUsdcCents(unitAmount));
      }
      const priceType = AsString(payload.type);
      if (priceType === 'recurring') {
        const recurring = payload.recurring as
          | { interval?: string; interval_count?: number }
          | null
          | undefined;
        const interval = recurring?.interval;
        const count = recurring?.interval_count ?? 1;
        if (interval) {
          parts.push(
            count > 1 ? `every ${count} ${interval}s` : `per ${interval}`
          );
        } else {
          parts.push('recurring');
        }
      } else if (priceType === 'one_time') {
        parts.push('one-time');
      }
      const nickname = AsString(payload.nickname);
      if (nickname) parts.push(nickname);
      return parts.length ? parts.join(' · ') : null;
    }

    case 'customer':
      return (
        AsString(payload.email) ||
        AsString(payload.name) ||
        AsString(payload.business_name) ||
        AsString(payload.individual_name)
      );

    case 'payment_link':
      return AsString(payload.url) || AsString(payload.id);

    case 'account': {
      const parts: string[] = [];
      const accountType = AsString(payload.type);
      if (accountType && accountType !== 'none') {
        parts.push(accountType);
      }
      const id = AsString(payload.id);
      const platformAccount = AsString(payload.platform_account);
      if (id && platformAccount && id === platformAccount) {
        parts.push('platform');
      }
      const name =
        AsString(
          (
            payload.settings as
              | { dashboard?: { display_name?: string } }
              | undefined
          )?.dashboard?.display_name
        ) ||
        AsString(
          (payload.business_profile as { name?: string } | undefined)?.name
        );
      if (name) parts.push(name);
      else if (id) parts.push(id);
      return parts.length ? parts.join(' · ') : null;
    }

    case 'payment_intent':
    case 'charge':
    case 'payout':
    case 'transfer':
      // Amount is exposed separately on OperatorEvent.amount
      return null;

    default:
      return AsString(payload.name) || AsString(payload.id) || null;
  }
}

function AsString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function AsNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function FormatUsdcCents(cents: number): string {
  return `${(Math.abs(cents) / 100).toFixed(2)} USDC`;
}
