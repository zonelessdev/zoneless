/**
 * Resolve payout-volume IDV thresholds from platform identity rules.
 *
 * Resolution: first matching country_thresholds row for account.country,
 * else global payout_volume_threshold_cents, else null (IDV threshold off).
 */

import type { AccountIdentityRulesSettings } from '@zoneless/shared-types';

/**
 * True when any payout-volume threshold rule is configured (global or country).
 */
export function HasPayoutVolumeThresholdRules(
  rules: AccountIdentityRulesSettings | null | undefined
): boolean {
  if (!rules) return false;
  if (
    rules.payout_volume_threshold_cents != null &&
    rules.payout_volume_threshold_cents >= 0
  ) {
    return true;
  }
  return (rules.country_thresholds?.length ?? 0) > 0;
}

/**
 * Resolve the lifetime paid payout volume threshold (cents) for a connected
 * account country. Returns null when IDV volume gating is disabled.
 */
export function ResolvePayoutVolumeThresholdCents(
  rules: AccountIdentityRulesSettings | null | undefined,
  country: string | null | undefined
): number | null {
  if (!rules) return null;

  const normalizedCountry = country?.trim().toUpperCase() || null;
  if (normalizedCountry && rules.country_thresholds?.length) {
    for (const row of rules.country_thresholds) {
      const countries = (row.countries ?? []).map((c) =>
        c.trim().toUpperCase()
      );
      if (countries.includes(normalizedCountry)) {
        return row.payout_volume_threshold_cents;
      }
    }
  }

  if (
    rules.payout_volume_threshold_cents != null &&
    rules.payout_volume_threshold_cents >= 0
  ) {
    return rules.payout_volume_threshold_cents;
  }

  return null;
}

/**
 * Format a payout volume threshold in cents as a USD display string.
 */
export function FormatPayoutVolumeThresholdCents(
  thresholdCents: number | null | undefined
): string | null {
  if (thresholdCents == null || thresholdCents < 0) return null;
  return `$${(thresholdCents / 100).toLocaleString('en-US', {
    maximumFractionDigits: 2,
  })}`;
}
