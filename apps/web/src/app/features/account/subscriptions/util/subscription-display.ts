import type {
  Customer,
  Price,
  Product,
  Subscription,
} from '@zoneless/shared-types';

/**
 * Display status for the subscriptions list.
 * Mirrors Stripe: active subscriptions set to cancel show "Cancels {date}".
 */
export function GetSubscriptionListStatus(subscription: Subscription): string {
  if (
    subscription.cancel_at_period_end &&
    (subscription.status === 'active' || subscription.status === 'trialing')
  ) {
    const cancelAt =
      subscription.cancel_at ??
      subscription.items?.data?.[0]?.current_period_end ??
      null;
    if (cancelAt) {
      return `Cancels ${FormatShortDate(cancelAt)}`;
    }
  }
  return subscription.status;
}

export function FormatSubscriptionCustomerEmail(
  subscription: Subscription
): string {
  const customer = subscription.customer;
  if (!customer) return '—';
  if (typeof customer === 'string') return customer;
  return customer.email ?? customer.id;
}

export function FormatSubscriptionCustomerName(
  subscription: Subscription
): string {
  const customer = subscription.customer;
  if (!customer || typeof customer === 'string') return '—';
  return customer.name ?? '—';
}

export function FormatSubscriptionCustomerDescription(
  subscription: Subscription
): string {
  const customer = subscription.customer;
  if (!customer || typeof customer === 'string') return '—';
  return (customer as Customer).description ?? '—';
}

export function FormatSubscriptionCollectionMethod(
  subscription: Subscription
): string {
  return subscription.collection_method === 'charge_automatically'
    ? 'Automatic'
    : 'Send invoice';
}

export function FormatSubscriptionProduct(subscription: Subscription): string {
  const item = subscription.items?.data?.[0];
  if (!item) return '—';

  const price = item.price;
  if (typeof price === 'string') return price;

  const expandedPrice = price as Price;
  const product = expandedPrice.product;
  if (product && typeof product === 'object') {
    return (product as Product).name || expandedPrice.id;
  }
  if (expandedPrice.nickname) return expandedPrice.nickname;
  if (typeof product === 'string') return product;
  return expandedPrice.id;
}

function FormatShortDate(unixSeconds: number): string {
  return new Date(unixSeconds * 1000).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
  });
}
