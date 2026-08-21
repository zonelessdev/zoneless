import type { CheckoutSession, PaymentLink } from '@zoneless/shared-types';

export const DEFAULT_CHECKOUT_CONFIRMATION_MESSAGE = 'Thanks for your order';

export function FormatUsdcAmount(cents: number | null | undefined): string {
  return `US$${((cents ?? 0) / 100).toFixed(2)}`;
}

/** Format a smallest-units amount (e.g. 6-decimal stables) as dollars. */
export function FormatStableAmount(
  amount: string | null | undefined,
  decimals = 6
): string {
  if (!amount) return 'US$0.00';
  try {
    const raw = BigInt(amount);
    const base = 10n ** BigInt(decimals);
    const whole = raw / base;
    const frac = raw % base;
    const dollars = Number(whole) + Number(frac) / Number(base);
    if (Number.isFinite(dollars)) {
      return `US$${dollars.toFixed(2)}`;
    }
    const fracStr = frac.toString().padStart(decimals, '0').replace(/0+$/, '');
    return fracStr ? `${whole}.${fracStr}` : `${whole}`;
  } catch {
    return amount;
  }
}

type SubmitType =
  | PaymentLink['submit_type']
  | CheckoutSession['submit_type']
  | null
  | undefined;

/** Label for the hosted checkout / preview pay button. */
export function GetCheckoutSubmitLabel(
  submitType: SubmitType,
  isSubscription = false
): string {
  if (isSubscription) return 'Subscribe';
  switch (submitType) {
    case 'book':
      return 'Book';
    case 'donate':
      return 'Donate';
    case 'subscribe':
      return 'Subscribe';
    default:
      return 'Pay';
  }
}
