import type { Account, ExternalWallet } from '@zoneless/shared-types';
import { IsRejectedAccountReason } from '@zoneless/shared-schemas';
import { GetCountryName } from '../../../../utils';

export function GetAccountStatus(account: Account): string {
  if (IsRejectedAccountReason(account.requirements?.disabled_reason)) {
    return 'rejected';
  }

  // Document submitted / provider processing — Stripe "In review"
  if (account.individual?.verification?.status === 'pending') {
    return 'in_review';
  }

  const currentlyDue = account.requirements?.currently_due ?? [];
  if (currentlyDue.length > 0) {
    return 'restricted';
  }

  // Soft lite-review signals (duplicates, country mismatch, etc.)
  if ((account.requirements?.pending_verification?.length ?? 0) > 0) {
    return 'in_review';
  }

  return account.payouts_enabled ? 'enabled' : 'restricted';
}

export function FormatPayoutSchedule(account: Account): string {
  const schedule = account.settings?.payouts?.schedule;
  if (!schedule?.interval) return 'Manual';
  const interval =
    schedule.interval.charAt(0).toUpperCase() + schedule.interval.slice(1);
  if (schedule.delay_days === undefined || schedule.delay_days === null) {
    return interval;
  }
  const delay =
    schedule.delay_days === 'minimum'
      ? 'minimum delay'
      : `${schedule.delay_days} day rolling basis`;
  return `${interval} – ${delay}`;
}

export function FormatCapabilityList(account: Account): string {
  const capabilities = account.capabilities ?? {};
  const labels: string[] = [];
  if (capabilities.transfers === 'active') labels.push('Transfers');
  if (capabilities.usdc_payouts === 'active') labels.push('USDC payouts');
  if (account.charges_enabled) labels.push('USDC payments');
  return labels.length ? labels.join(', ') : 'None';
}

export function HasActiveCapabilities(account: Account): boolean {
  return (
    account.capabilities?.transfers === 'active' ||
    account.capabilities?.usdc_payouts === 'active' ||
    account.charges_enabled
  );
}

export function FormatWalletDisplay(wallet: ExternalWallet): string {
  const network = wallet.network
    ? wallet.network.charAt(0).toUpperCase() + wallet.network.slice(1)
    : 'Solana';
  return `${network} •••• ${wallet.last4}`;
}

export function FormatAccountCountry(account: Account): string {
  if (!account.country) return '—';
  return GetCountryName(account.country) || account.country;
}

export function FormatRelativeTime(unixSeconds: number): string {
  const diffMs = Date.now() - unixSeconds * 1000;
  const minutes = Math.floor(diffMs / 60000);
  if (minutes < 60) return `${Math.max(1, minutes)} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days} day${days === 1 ? '' : 's'} ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months} month${months === 1 ? '' : 's'} ago`;
  const years = Math.floor(months / 12);
  return `${years} year${years === 1 ? '' : 's'} ago`;
}
