import type {
  Price,
  Product,
  RecurringInterval,
  Subscription,
  SubscriptionItem,
} from '@zoneless/shared-types';
import {
  FormatPriceWithInterval,
  FormatIntervalLabel,
} from '../../products/util/price-display';

/**
 * Display status for the subscriptions list.
 * Mirrors Stripe: active subscriptions set to cancel show "Cancels {date}".
 */
export function GetSubscriptionListStatus(subscription: Subscription): string {
  if (IsSubscriptionCancelingAtPeriodEnd(subscription)) {
    const cancelAt = GetSubscriptionCancelAt(subscription);
    if (cancelAt) {
      return `Cancels ${FormatShortDate(cancelAt)}`;
    }
  }
  return subscription.status;
}

/** True when an active/trialing subscription is scheduled to end at period end. */
export function IsSubscriptionCancelingAtPeriodEnd(
  subscription: Subscription
): boolean {
  return (
    !!subscription.cancel_at_period_end &&
    (subscription.status === 'active' || subscription.status === 'trialing')
  );
}

/** Effective cancel timestamp for a scheduled period-end cancel. */
export function GetSubscriptionCancelAt(
  subscription: Subscription
): number | null {
  return (
    subscription.cancel_at ??
    subscription.items?.data?.[0]?.current_period_end ??
    null
  );
}

/** Chip label, e.g. "Cancels 10 Aug". */
export function FormatSubscriptionCancelChipLabel(
  subscription: Subscription
): string | null {
  if (!IsSubscriptionCancelingAtPeriodEnd(subscription)) return null;
  const cancelAt = GetSubscriptionCancelAt(subscription);
  if (!cancelAt) return null;
  return `Cancels ${FormatShortDate(cancelAt)}`;
}

/** Customer email or ID for list/detail displays. */
export function FormatSubscriptionCustomerEmail(
  subscription: Subscription
): string {
  const customer = subscription.customer;
  if (!customer) return '—';
  if (typeof customer === 'string') return customer;
  return customer.email ?? customer.id;
}

/** Customer name, or em dash when missing / unexpanded. */
export function FormatSubscriptionCustomerName(
  subscription: Subscription
): string {
  const customer = subscription.customer;
  if (!customer || typeof customer === 'string') return '—';
  return customer.name ?? '—';
}

/**
 * Title-ready customer label: name when present, otherwise the customer ID.
 * Matches Stripe's subscription header (name or ID).
 */
export function FormatSubscriptionCustomerTitle(
  subscription: Subscription
): string {
  const customer = subscription.customer;
  if (!customer) return '—';
  if (typeof customer === 'string') return customer;
  return customer.name ?? customer.id;
}

export function GetSubscriptionCustomerId(
  subscription: Subscription
): string | null {
  const customer = subscription.customer;
  if (!customer) return null;
  if (typeof customer === 'string') return customer;
  return customer.id;
}

export function FormatSubscriptionCollectionMethod(
  subscription: Subscription
): string {
  return subscription.collection_method === 'charge_automatically'
    ? 'Automatic'
    : 'Send invoice';
}

/** Stripe-style billing method label for the details sidebar. */
export function FormatSubscriptionBillingMethod(
  subscription: Subscription
): string {
  if (subscription.collection_method === 'send_invoice') {
    return 'Send invoice';
  }
  if (subscription.default_payment_method) {
    return 'Charge specific payment method';
  }
  return 'Charge default payment method';
}

export function FormatSubscriptionBillingMode(
  subscription: Subscription
): string {
  const type = subscription.billing_mode?.type;
  if (!type) return '—';
  return type.charAt(0).toUpperCase() + type.slice(1);
}

export function FormatSubscriptionDiscounts(
  subscription: Subscription
): string {
  if (!subscription.discounts || subscription.discounts.length === 0) {
    return 'No coupon applied';
  }
  return `${subscription.discounts.length} applied`;
}

export function FormatSubscriptionProduct(subscription: Subscription): string {
  const item = subscription.items?.data?.[0];
  if (!item) return '—';
  return FormatSubscriptionItemProduct(item);
}

/**
 * Progress through the current billing period (0–1).
 * Used for the Stripe-style period progress ring in subscription lists.
 */
export function GetSubscriptionPeriodProgress(
  subscription: Subscription
): number | null {
  const { start, end } = GetSubscriptionCurrentPeriod(subscription);
  if (!start || !end || end <= start) return null;

  const now = Math.floor(Date.now() / 1000);
  if (now <= start) return 0;
  if (now >= end) return 1;
  return (now - start) / (end - start);
}

/** Stripe-style frequency label, e.g. "Billing monthly". */
export function FormatSubscriptionBillingFrequency(
  subscription: Subscription
): string {
  const item = subscription.items?.data?.[0];
  if (!item) return '—';
  const price = GetSubscriptionItemPrice(item);
  const interval = price?.recurring?.interval;
  if (!interval) return '—';
  return `Billing ${FormatIntervalLabel(interval).toLowerCase()}`;
}

/**
 * Next invoice date for list displays.
 * Uses current period end (when the next invoice is typically created).
 */
export function GetSubscriptionNextInvoiceDate(
  subscription: Subscription
): number | null {
  if (
    subscription.status === 'canceled' ||
    subscription.status === 'incomplete_expired'
  ) {
    return null;
  }
  return GetSubscriptionCurrentPeriod(subscription).end;
}

/** Stripe-style next invoice label, e.g. "22 Aug for $19.00". */
export function FormatSubscriptionNextInvoice(
  subscription: Subscription
): string {
  const nextDate = GetSubscriptionNextInvoiceDate(subscription);
  if (!nextDate) return '—';
  const amount = GetSubscriptionItemsTotalCents(subscription);
  return `${FormatShortDate(nextDate)} for ${FormatSubscriptionAmount(amount)}`;
}

export function FormatSubscriptionItemProduct(item: SubscriptionItem): string {
  const price = GetSubscriptionItemPrice(item);
  if (!price) {
    return typeof item.price === 'string' ? item.price : '—';
  }

  const product = price.product;
  if (product && typeof product === 'object') {
    return (product as Product).name || price.id;
  }
  if (price.nickname) return price.nickname;
  if (typeof product === 'string') return product;
  return price.id;
}

export function GetSubscriptionItemProductId(
  item: SubscriptionItem
): string | null {
  const price = GetSubscriptionItemPrice(item);
  if (!price) return null;
  const product = price.product;
  if (!product) return null;
  if (typeof product === 'string') return product;
  return (product as Product).id;
}

export function GetSubscriptionItemPrice(item: SubscriptionItem): Price | null {
  if (!item.price || typeof item.price === 'string') return null;
  return item.price as Price;
}

export function FormatSubscriptionItemPrice(item: SubscriptionItem): string {
  const price = GetSubscriptionItemPrice(item);
  if (!price) return '—';
  return FormatPriceWithInterval(
    price.unit_amount ?? 0,
    price.recurring?.interval ?? null
  );
}

export function FormatSubscriptionItemTotal(item: SubscriptionItem): string {
  const price = GetSubscriptionItemPrice(item);
  if (!price) return '—';
  const quantity = item.quantity ?? 1;
  return FormatPriceWithInterval(
    (price.unit_amount ?? 0) * quantity,
    price.recurring?.interval ?? null
  );
}

export function FormatSubscriptionPeriodRange(
  start: number | null | undefined,
  end: number | null | undefined
): string {
  if (!start || !end) return '—';
  return `${FormatShortDate(start)} to ${FormatShortDate(end)}`;
}

export function FormatSubscriptionDateRange(
  start: number | null | undefined,
  end: number | null | undefined
): string {
  if (!start || !end) return '—';
  return `${FormatMediumDate(start)} - ${FormatMediumDate(end)}`;
}

export function GetSubscriptionCurrentPeriod(subscription: Subscription): {
  start: number | null;
  end: number | null;
} {
  const item = subscription.items?.data?.[0];
  return {
    start: item?.current_period_start ?? null,
    end: item?.current_period_end ?? null,
  };
}

export function GetSubscriptionItemsTotalCents(
  subscription: Subscription
): number {
  return (subscription.items?.data ?? []).reduce((sum, item) => {
    const price = GetSubscriptionItemPrice(item);
    if (!price) return sum;
    return sum + (price.unit_amount ?? 0) * (item.quantity ?? 1);
  }, 0);
}

export function FormatSubscriptionAmount(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

/**
 * Preview of the next billing period for the upcoming invoice section.
 * Derived from subscription items when no upcoming-invoice API exists.
 */
export function GetUpcomingInvoicePreview(subscription: Subscription): {
  periodStart: number;
  periodEnd: number;
  lineItems: Array<{
    description: string;
    quantity: number;
    unitAmount: number;
    amount: number;
  }>;
  subtotal: number;
  total: number;
} | null {
  if (
    subscription.status === 'canceled' ||
    subscription.status === 'incomplete_expired' ||
    subscription.status === 'incomplete' ||
    IsSubscriptionCancelingAtPeriodEnd(subscription)
  ) {
    return null;
  }

  const items = subscription.items?.data ?? [];
  if (items.length === 0) return null;

  const first = items[0];
  const price = GetSubscriptionItemPrice(first);
  const interval = price?.recurring?.interval;
  if (!first.current_period_end || !interval) return null;

  const periodStart = first.current_period_end;
  const periodEnd = AddInterval(
    periodStart,
    interval,
    price?.recurring?.interval_count ?? 1
  );

  const lineItems = items.map((item) => {
    const itemPrice = GetSubscriptionItemPrice(item);
    const quantity = item.quantity ?? 1;
    const unitAmount = itemPrice?.unit_amount ?? 0;
    return {
      description: FormatSubscriptionItemProduct(item),
      quantity,
      unitAmount,
      amount: unitAmount * quantity,
    };
  });

  const subtotal = lineItems.reduce((sum, line) => sum + line.amount, 0);

  return {
    periodStart,
    periodEnd,
    lineItems,
    subtotal,
    total: subtotal,
  };
}

export function FormatShortDate(unixSeconds: number): string {
  return new Date(unixSeconds * 1000).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
  });
}

/** Short date with 24-hour time, e.g. "21 Aug, 16:08". */
export function FormatShortDateTime(unixSeconds: number): string {
  return new Date(unixSeconds * 1000).toLocaleString('en-GB', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

export function FormatMediumDate(unixSeconds: number): string {
  return new Date(unixSeconds * 1000).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

function AddInterval(
  unixSeconds: number,
  interval: RecurringInterval,
  count = 1
): number {
  const date = new Date(unixSeconds * 1000);
  switch (interval) {
    case 'hour':
      date.setHours(date.getHours() + count);
      break;
    case 'day':
      date.setDate(date.getDate() + count);
      break;
    case 'week':
      date.setDate(date.getDate() + 7 * count);
      break;
    case 'month':
      date.setMonth(date.getMonth() + count);
      break;
    case 'year':
      date.setFullYear(date.getFullYear() + count);
      break;
  }
  return Math.floor(date.getTime() / 1000);
}
