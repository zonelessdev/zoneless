/**
 * @fileOverview Helpers for recurring billing intervals.
 *
 * @module RecurringInterval
 */

import type { RecurringInterval } from '@zoneless/shared-types';

export const SECONDS_PER_HOUR = 60 * 60;
export const SECONDS_PER_DAY = 24 * SECONDS_PER_HOUR;

const HOURS_PER_INTERVAL: Record<RecurringInterval, number> = {
  hour: 1,
  day: 24,
  week: 24 * 7,
  month: 24 * 30,
  year: 24 * 365,
};

const SECONDS_PER_INTERVAL: Record<RecurringInterval, number> = {
  hour: SECONDS_PER_HOUR,
  day: SECONDS_PER_DAY,
  week: 7 * SECONDS_PER_DAY,
  month: 30 * SECONDS_PER_DAY,
  year: 365 * SECONDS_PER_DAY,
};

/**
 * Converts a recurring interval (+ count) to period length in hours.
 * Used when creating on-chain Solana subscription plans.
 */
export function RecurringIntervalToHours(
  interval: RecurringInterval,
  intervalCount = 1
): number {
  return HOURS_PER_INTERVAL[interval] * intervalCount;
}

/**
 * Advances a Unix timestamp by a recurring interval (+ count).
 */
export function AddRecurringInterval(
  start: number,
  interval: RecurringInterval,
  intervalCount = 1
): number {
  return start + SECONDS_PER_INTERVAL[interval] * intervalCount;
}
