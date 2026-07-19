import type { Price, RecurringInterval } from '@zoneless/shared-types';

/**
 * Formats a unit amount (cents) with an optional recurring interval suffix.
 * e.g. `$10.00 / hour`, `$10.00 / month`, or `$10.00` for one-time.
 */
export function FormatPriceWithInterval(
  unitAmount: number,
  interval?: RecurringInterval | null
): string {
  const formatted = `$${(unitAmount / 100).toFixed(2)}`;
  return interval ? `${formatted} / ${interval}` : formatted;
}

/**
 * Human-readable label for a recurring interval (e.g. Hourly, Monthly).
 */
export function FormatIntervalLabel(interval: RecurringInterval): string {
  switch (interval) {
    case 'hour':
      return 'Hourly';
    case 'day':
      return 'Daily';
    case 'week':
      return 'Weekly';
    case 'month':
      return 'Monthly';
    case 'year':
      return 'Yearly';
  }
}

/**
 * Short per-period label for list/detail displays (e.g. Per hour, Per month).
 */
export function FormatIntervalPerLabel(interval: RecurringInterval): string {
  return `Per ${interval}`;
}

/**
 * Formats a Price object's unit amount with its recurring interval if present.
 */
export function FormatPriceDisplay(price: Price | null | undefined): string {
  if (!price) {
    return 'No prices';
  }
  return FormatPriceWithInterval(
    price.unit_amount ?? 0,
    price.recurring?.interval ?? null
  );
}
