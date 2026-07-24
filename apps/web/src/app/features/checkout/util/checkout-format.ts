import type { CheckoutSession, PaymentLink } from '@zoneless/shared-types';

export const DEFAULT_CHECKOUT_CONFIRMATION_MESSAGE = 'Thanks for your order';

export function FormatUsdcAmount(cents: number | null | undefined): string {
  return `US$${((cents ?? 0) / 100).toFixed(2)}`;
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
