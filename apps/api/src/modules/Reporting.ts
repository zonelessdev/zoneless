/**
 * @fileOverview Dashboard reporting metrics
 *
 * Server-side aggregation for Stripe-style overview charts.
 * Reads BalanceTransactions / Customers (no writes) and buckets by the
 * dashboard IANA timezone.
 *
 * @module Reporting
 */

import {
  MetricCompare,
  MetricId,
  MetricInterval,
  MetricPoint,
  MetricSeries,
  MetricUnit,
  ReportingMetrics,
} from '@zoneless/shared-types';
import { Database } from './Database';
import {
  AlignSeriesLength,
  BuildDateTruncExpr,
  ComputeChangePercent,
  ComputePreviousPeriod,
  FillBuckets,
  RowsToBucketMap,
  SumPoints,
} from './ReportingBuckets';

// Re-export pure helpers so routes/tests can keep importing from Reporting.
export {
  AdvanceBucket,
  AlignSeriesLength,
  BuildDateTruncExpr,
  ComputeChangePercent,
  ComputePreviousPeriod,
  FillBuckets,
  GetZonedParts,
  ParseTimezone,
  RowsToBucketMap,
  SumPoints,
  TruncateToBucket,
  ZonedWallTimeToUnix,
} from './ReportingBuckets';

const ALL_METRIC_IDS: MetricId[] = [
  'gross_volume',
  'net_volume',
  'new_customers',
];

const VALID_INTERVALS: MetricInterval[] = ['hour', 'day', 'week', 'month'];
const VALID_COMPARE: MetricCompare[] = ['previous_period', 'none'];

export interface GetMetricsInput {
  platformAccountId: string;
  start: number;
  end: number;
  interval: MetricInterval;
  compare: MetricCompare;
  metrics: MetricId[];
  /** IANA timezone for bucket boundaries (e.g. America/Los_Angeles). */
  timezone: string;
}

interface AggregateBucket {
  _id: Date;
  value: number;
}

interface VolumeBucket {
  _id: Date;
  gross: number;
  net: number;
}

interface VolumeSeries {
  gross: MetricPoint[];
  net: MetricPoint[];
}

/**
 * Parse a comma-separated metrics query param into validated MetricIds.
 * Unknown ids are dropped. Empty / missing → all known metrics.
 */
export function ParseMetricIds(raw: string | undefined): MetricId[] {
  if (!raw || !raw.trim()) {
    return [...ALL_METRIC_IDS];
  }

  const requested = raw
    .split(',')
    .map((id) => id.trim())
    .filter(Boolean) as MetricId[];

  const valid = requested.filter((id) => ALL_METRIC_IDS.includes(id));
  return valid.length > 0 ? valid : [...ALL_METRIC_IDS];
}

/** Validate and normalize an interval query param. */
export function ParseInterval(raw: string | undefined): MetricInterval {
  if (raw && VALID_INTERVALS.includes(raw as MetricInterval)) {
    return raw as MetricInterval;
  }
  return 'day';
}

/** Validate and normalize a compare query param. */
export function ParseCompare(raw: string | undefined): MetricCompare {
  if (raw && VALID_COMPARE.includes(raw as MetricCompare)) {
    return raw as MetricCompare;
  }
  return 'previous_period';
}

/** Resolve the "today" preset to [startOfUtcDay, startOfNextUtcDay). */
export function ResolveTodayPreset(nowMs: number = Date.now()): {
  start: number;
  end: number;
} {
  const now = new Date(nowMs);
  const start = Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate()
  );
  const end = start + 24 * 60 * 60 * 1000;
  return {
    start: Math.floor(start / 1000),
    end: Math.floor(end / 1000),
  };
}

export class ReportingModule {
  constructor(private readonly db: Database) {}

  /**
   * Build reporting metrics for the given platform and window.
   */
  async GetMetrics(input: GetMetricsInput): Promise<ReportingMetrics> {
    const {
      platformAccountId,
      start,
      end,
      interval,
      compare,
      metrics,
      timezone,
    } = input;

    const previousRange =
      compare === 'previous_period' ? ComputePreviousPeriod(start, end) : null;

    const result: ReportingMetrics = {
      object: 'reporting.metrics',
      start,
      end,
      interval,
      compare,
      currency: 'usdc',
      metrics: {},
    };

    const needsVolume =
      metrics.includes('gross_volume') || metrics.includes('net_volume');

    if (needsVolume) {
      const { current, previous } = await this.LoadCompared(
        (rangeStart, rangeEnd) =>
          this.AggregatePaymentVolume(
            platformAccountId,
            rangeStart,
            rangeEnd,
            interval,
            timezone
          ),
        start,
        end,
        previousRange
      );

      if (metrics.includes('gross_volume')) {
        result.metrics.gross_volume = this.BuildSeries(
          'gross_volume',
          'currency',
          current.gross,
          previous?.gross ?? null
        );
      }

      if (metrics.includes('net_volume')) {
        result.metrics.net_volume = this.BuildSeries(
          'net_volume',
          'currency',
          current.net,
          previous?.net ?? null
        );
      }
    }

    if (metrics.includes('new_customers')) {
      const { current, previous } = await this.LoadCompared(
        (rangeStart, rangeEnd) =>
          this.AggregateNewCustomers(
            platformAccountId,
            rangeStart,
            rangeEnd,
            interval,
            timezone
          ),
        start,
        end,
        previousRange
      );

      result.metrics.new_customers = this.BuildSeries(
        'new_customers',
        'count',
        current,
        previous
      );
    }

    return result;
  }

  /**
   * Fetch current window and, when comparing, the previous window of equal length.
   */
  private async LoadCompared<T>(
    fetch: (start: number, end: number) => Promise<T>,
    start: number,
    end: number,
    previousRange: { start: number; end: number } | null
  ): Promise<{ current: T; previous: T | null }> {
    const current = await fetch(start, end);
    if (!previousRange) {
      return { current, previous: null };
    }
    const previous = await fetch(previousRange.start, previousRange.end);
    return { current, previous };
  }

  private BuildSeries(
    id: MetricId,
    unit: MetricUnit,
    data: MetricPoint[],
    previousData: MetricPoint[] | null
  ): MetricSeries {
    const total = SumPoints(data);
    const previousTotal =
      previousData === null ? null : SumPoints(previousData);

    return {
      id,
      unit,
      total,
      previous_total: previousTotal,
      change_percent: ComputeChangePercent(total, previousTotal),
      data,
      previous_data: AlignSeriesLength(data, previousData),
    };
  }

  /**
   * Payment volume from the balance transaction ledger.
   * One pass yields both gross (`amount`) and net (`net`).
   */
  private async AggregatePaymentVolume(
    platformAccountId: string,
    start: number,
    end: number,
    interval: MetricInterval,
    timeZone: string
  ): Promise<VolumeSeries> {
    const rows = await this.db.Aggregate<VolumeBucket>('BalanceTransactions', [
      {
        $match: {
          account: platformAccountId,
          type: { $in: ['payment', 'charge'] },
          created: { $gte: start, $lt: end },
        },
      },
      {
        $group: {
          _id: BuildDateTruncExpr(interval, timeZone),
          gross: { $sum: '$amount' },
          net: { $sum: '$net' },
        },
      },
      { $sort: { _id: 1 } },
    ]);

    const grossMap = new Map<number, number>();
    const netMap = new Map<number, number>();
    for (const row of rows) {
      const bucketStart = Math.floor(new Date(row._id).getTime() / 1000);
      grossMap.set(bucketStart, row.gross);
      netMap.set(bucketStart, row.net);
    }

    return {
      gross: FillBuckets(start, end, interval, grossMap, timeZone),
      net: FillBuckets(start, end, interval, netMap, timeZone),
    };
  }

  private async AggregateNewCustomers(
    platformAccountId: string,
    start: number,
    end: number,
    interval: MetricInterval,
    timeZone: string
  ): Promise<MetricPoint[]> {
    const rows = await this.db.Aggregate<AggregateBucket>('Customers', [
      {
        $match: {
          platform_account: platformAccountId,
          created: { $gte: start, $lt: end },
        },
      },
      {
        $group: {
          _id: BuildDateTruncExpr(interval, timeZone),
          value: { $sum: 1 },
        },
      },
      { $sort: { _id: 1 } },
    ]);

    return FillBuckets(start, end, interval, RowsToBucketMap(rows), timeZone);
  }
}
