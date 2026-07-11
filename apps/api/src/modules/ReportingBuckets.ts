/**
 * @fileOverview Time-bucket helpers for dashboard reporting
 *
 * Pure functions for timezone-aware truncation, series alignment, and
 * Mongo `$dateTrunc` expressions. No database access.
 *
 * @module ReportingBuckets
 */

import { MetricInterval, MetricPoint } from '@zoneless/shared-types';

interface ZonedParts {
  year: number;
  month: number; // 1-12
  day: number;
  hour: number;
  minute: number;
  second: number;
  weekday: number; // 0=Sun .. 6=Sat
}

const WEEKDAY_INDEX: Record<string, number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
};

/**
 * Validate a timezone query param. Falls back to UTC when missing/invalid.
 */
export function ParseTimezone(raw: string | undefined): string {
  if (!raw || !raw.trim()) return 'UTC';
  const timezone = raw.trim();
  try {
    Intl.DateTimeFormat(undefined, { timeZone: timezone });
    return timezone;
  } catch {
    return 'UTC';
  }
}

/**
 * Previous period of equal length immediately before `start`.
 */
export function ComputePreviousPeriod(
  start: number,
  end: number
): { start: number; end: number } {
  const duration = end - start;
  return {
    start: start - duration,
    end: start,
  };
}

/**
 * Percent change helper. Returns null when previous is 0 or null.
 */
export function ComputeChangePercent(
  current: number,
  previous: number | null
): number | null {
  if (previous === null || previous === 0) {
    return null;
  }
  return ((current - previous) / previous) * 100;
}

export function SumPoints(points: MetricPoint[]): number {
  return points.reduce((sum, point) => sum + point.value, 0);
}

/** Read calendar/clock parts of an instant in a given IANA timezone. */
export function GetZonedParts(
  unixSeconds: number,
  timeZone: string
): ZonedParts {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone,
    weekday: 'short',
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
    second: 'numeric',
    hourCycle: 'h23',
  });
  const parts = Object.fromEntries(
    formatter
      .formatToParts(new Date(unixSeconds * 1000))
      .filter((part) => part.type !== 'literal')
      .map((part) => [part.type, part.value])
  );

  return {
    year: Number(parts['year']),
    month: Number(parts['month']),
    day: Number(parts['day']),
    hour: Number(parts['hour']),
    minute: Number(parts['minute']),
    second: Number(parts['second']),
    weekday: WEEKDAY_INDEX[parts['weekday']] ?? 0,
  };
}

/**
 * Convert a wall-clock time in `timeZone` to a unix instant.
 * Iteratively corrects for the zone offset (handles DST).
 */
export function ZonedWallTimeToUnix(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  second: number,
  timeZone: string
): number {
  let guess = Math.floor(
    Date.UTC(year, month - 1, day, hour, minute, second) / 1000
  );

  for (let i = 0; i < 4; i++) {
    const parts = GetZonedParts(guess, timeZone);
    const asUtc =
      Date.UTC(
        parts.year,
        parts.month - 1,
        parts.day,
        parts.hour,
        parts.minute,
        parts.second
      ) / 1000;
    const desired = Date.UTC(year, month - 1, day, hour, minute, second) / 1000;
    const diff = desired - asUtc;
    guess += diff;
    if (diff === 0) break;
  }

  return guess;
}

/**
 * Advance a unix timestamp by one interval bucket in `timeZone`.
 * UTC is handled via the same zoned path (IANA "UTC").
 */
export function AdvanceBucket(
  unixSeconds: number,
  interval: MetricInterval,
  timeZone: string = 'UTC'
): number {
  const parts = GetZonedParts(unixSeconds, timeZone);
  switch (interval) {
    case 'hour':
      return ZonedWallTimeToUnix(
        parts.year,
        parts.month,
        parts.day,
        parts.hour + 1,
        0,
        0,
        timeZone
      );
    case 'day':
      return ZonedWallTimeToUnix(
        parts.year,
        parts.month,
        parts.day + 1,
        0,
        0,
        0,
        timeZone
      );
    case 'week':
      return ZonedWallTimeToUnix(
        parts.year,
        parts.month,
        parts.day + 7,
        0,
        0,
        0,
        timeZone
      );
    case 'month':
      return ZonedWallTimeToUnix(
        parts.year,
        parts.month + 1,
        1,
        0,
        0,
        0,
        timeZone
      );
  }
}

/**
 * Truncate a unix timestamp to the start of its interval bucket in `timeZone`.
 */
export function TruncateToBucket(
  unixSeconds: number,
  interval: MetricInterval,
  timeZone: string = 'UTC'
): number {
  const parts = GetZonedParts(unixSeconds, timeZone);
  switch (interval) {
    case 'hour':
      return ZonedWallTimeToUnix(
        parts.year,
        parts.month,
        parts.day,
        parts.hour,
        0,
        0,
        timeZone
      );
    case 'day':
      return ZonedWallTimeToUnix(
        parts.year,
        parts.month,
        parts.day,
        0,
        0,
        0,
        timeZone
      );
    case 'week': {
      const daysFromMonday = (parts.weekday + 6) % 7;
      return ZonedWallTimeToUnix(
        parts.year,
        parts.month,
        parts.day - daysFromMonday,
        0,
        0,
        0,
        timeZone
      );
    }
    case 'month':
      return ZonedWallTimeToUnix(parts.year, parts.month, 1, 0, 0, 0, timeZone);
  }
}

/**
 * Ensure previous-period series has the same bucket count as current so
 * charts share one x-domain (avoids the line ending one interval early).
 */
export function AlignSeriesLength(
  current: MetricPoint[],
  previous: MetricPoint[] | null
): MetricPoint[] | null {
  if (!previous) return null;
  if (previous.length === current.length) return previous;
  if (previous.length > current.length) {
    return previous.slice(previous.length - current.length);
  }

  const missing = current.length - previous.length;
  const pad: MetricPoint[] = [];
  let cursor = previous[0]?.start ?? current[0]?.start ?? 0;
  const step =
    previous.length >= 2
      ? previous[1].start - previous[0].start
      : current.length >= 2
      ? current[1].start - current[0].start
      : 86400;

  for (let i = 0; i < missing; i++) {
    const end = cursor;
    cursor = end - step;
    pad.unshift({ start: cursor, end, value: 0 });
  }
  return [...pad, ...previous];
}

/**
 * Build a dense series of buckets covering [start, end), filling missing
 * aggregation results with 0.
 */
export function FillBuckets(
  start: number,
  end: number,
  interval: MetricInterval,
  aggregated: Map<number, number>,
  timeZone: string = 'UTC'
): MetricPoint[] {
  const points: MetricPoint[] = [];
  let cursor = TruncateToBucket(start, interval, timeZone);

  while (cursor < end) {
    const bucketEnd = Math.min(AdvanceBucket(cursor, interval, timeZone), end);
    points.push({
      start: Math.max(cursor, start),
      end: bucketEnd,
      value: aggregated.get(cursor) ?? 0,
    });
    cursor = AdvanceBucket(cursor, interval, timeZone);
  }

  return points;
}

/**
 * Build a Mongo `$dateTrunc` expression aligned with {@link TruncateToBucket}.
 */
export function BuildDateTruncExpr(
  interval: MetricInterval,
  timeZone: string
): Record<string, unknown> {
  const trunc: Record<string, unknown> = {
    date: { $toDate: { $multiply: ['$created', 1000] } },
    unit: interval,
    timezone: timeZone,
  };
  if (interval === 'week') {
    trunc.startOfWeek = 'monday';
  }
  return { $dateTrunc: trunc };
}

/** Convert Mongo `$dateTrunc` rows into a start→value map. */
export function RowsToBucketMap(
  rows: Array<{ _id: Date; value: number }>
): Map<number, number> {
  const map = new Map<number, number>();
  for (const row of rows) {
    map.set(Math.floor(new Date(row._id).getTime() / 1000), row.value);
  }
  return map;
}
