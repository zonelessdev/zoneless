import type {
  Customer,
  CustomerAddress,
  Invoice,
  InvoiceDiscountAmount,
  InvoiceLineItem,
  InvoicePayment,
  Price,
  Subscription,
} from '@zoneless/shared-types';
import { FormatIntervalLabel } from '../../products/util/price-display';
import {
  FormatMediumDate,
  FormatSubscriptionProduct,
} from '../../subscriptions/util/subscription-display';

export interface InvoiceTimelineEvent {
  title: string;
  timestamp: number;
  active: boolean;
}

export function FormatInvoiceNumber(invoice: Invoice): string {
  return invoice.number ?? '—';
}

export function FormatInvoiceCustomerName(invoice: Invoice): string {
  if (invoice.customer_name) return invoice.customer_name;

  const customer = invoice.customer;
  if (!customer || typeof customer === 'string') return '—';
  return customer.name ?? '—';
}

/**
 * Title-ready customer label for invoice headers: snapshotted name, expanded
 * customer name, otherwise the customer ID.
 */
export function FormatInvoiceCustomerTitle(invoice: Invoice): string {
  if (invoice.customer_name) return invoice.customer_name;

  const customer = invoice.customer;
  if (!customer) return '—';
  if (typeof customer === 'string') return customer;
  return customer.name ?? customer.id;
}

export function FormatInvoiceCustomerEmail(invoice: Invoice): string {
  if (invoice.customer_email) return invoice.customer_email;

  const customer = invoice.customer;
  if (!customer) return '—';
  if (typeof customer === 'string') return customer;
  return (customer as Customer).email ?? customer.id;
}

export function GetInvoiceCustomerId(invoice: Invoice): string | null {
  const customer = invoice.customer;
  if (!customer) return null;
  if (typeof customer === 'string') return customer;
  return customer.id;
}

/**
 * Billing frequency for subscription-backed invoices (e.g. Monthly, Yearly).
 * One-off invoices return an em dash.
 */
export function FormatInvoiceFrequency(invoice: Invoice): string {
  const parent = invoice.parent;
  if (!parent || parent.type !== 'subscription_details') return '—';

  const subscription = parent.subscription_details?.subscription;
  if (!subscription || typeof subscription === 'string') return '—';

  const price = (subscription as Subscription).items?.data?.[0]?.price;
  if (!price || typeof price === 'string') return '—';

  const interval = (price as Price).recurring?.interval;
  if (!interval) return '—';

  return FormatIntervalLabel(interval);
}

/** Stripe-style billing method label for the summary / details sidebar. */
export function FormatInvoiceBillingMethod(invoice: Invoice): string {
  if (invoice.collection_method === 'send_invoice') {
    return 'Send invoice';
  }
  if (invoice.default_payment_method) {
    return 'Charge specific payment method';
  }
  return 'Charge default payment method';
}

export function FormatInvoiceCurrency(invoice: Invoice): string {
  return (invoice.currency ?? 'usdc').toUpperCase();
}

export function FormatInvoiceAmount(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

export function FormatInvoiceBillingDetails(invoice: Invoice): string {
  return FormatCustomerAddress(invoice.customer_address);
}

function FormatCustomerAddress(address: CustomerAddress | null): string {
  if (!address) return '—';

  const parts = [
    address.line1,
    address.line2,
    [address.city, address.state, address.postal_code]
      .filter(Boolean)
      .join(', '),
    address.country,
  ].filter(Boolean);

  return parts.length > 0 ? parts.join(', ') : '—';
}

export function FormatInvoiceLineDescription(
  line: InvoiceLineItem,
  invoice?: Invoice
): string {
  if (line.description) return line.description;

  const price = line.pricing?.price_details?.price;
  if (price && typeof price === 'object') {
    const product = price.product;
    if (product && typeof product === 'object' && product.name) {
      return product.name;
    }
    if (price.nickname) return price.nickname;
  }

  if (invoice) {
    const productName = FormatInvoiceSubscriptionProduct(invoice);
    if (productName !== '—') return productName;
  }

  return '—';
}

export function FormatInvoiceLinePeriod(line: InvoiceLineItem): string {
  const { start, end } = line.period ?? {};
  if (!start || !end) return '';
  return `${FormatMediumDate(start)} - ${FormatMediumDate(end)}`;
}

export function GetInvoiceLineUnitAmount(line: InvoiceLineItem): number {
  const decimal = line.pricing?.unit_amount_decimal;
  if (decimal != null && decimal !== '') {
    const parsed = Number(decimal);
    if (!Number.isNaN(parsed)) return parsed;
  }

  const quantity = line.quantity ?? 1;
  if (quantity > 0) return Math.round(line.amount / quantity);
  return line.amount;
}

export function GetInvoiceSubscriptionId(invoice: Invoice): string | null {
  const subscription = invoice.parent?.subscription_details?.subscription;
  if (!subscription) return null;
  if (typeof subscription === 'string') return subscription;
  return subscription.id;
}

export function FormatInvoiceSubscriptionProduct(invoice: Invoice): string {
  const subscription = invoice.parent?.subscription_details?.subscription;
  if (!subscription || typeof subscription === 'string') return '—';
  return FormatSubscriptionProduct(subscription);
}

export function GetInvoiceSubscriptionStatus(invoice: Invoice): string | null {
  const subscription = invoice.parent?.subscription_details?.subscription;
  if (!subscription || typeof subscription === 'string') return null;
  return subscription.status;
}

export function FormatInvoicePaymentDescription(invoice: Invoice): string {
  switch (invoice.billing_reason) {
    case 'subscription_create':
      return 'Subscription creation';
    case 'subscription_cycle':
      return 'Subscription cycle';
    case 'subscription_update':
      return 'Subscription update';
    case 'subscription_threshold':
      return 'Subscription threshold';
    case 'subscription':
      return 'Subscription';
    case 'manual':
      return 'Manual invoice';
    case 'automatic_pending_invoice_item_invoice':
      return 'Pending invoice items';
    case 'quote_accept':
      return 'Quote accepted';
    case 'upcoming':
      return 'Upcoming';
    default:
      return 'Payment';
  }
}

export function FormatInvoicePaymentStatus(payment: InvoicePayment): string {
  if (payment.status === 'paid') return 'succeeded';
  return payment.status;
}

export function GetInvoicePaymentTimestamp(payment: InvoicePayment): number {
  return (
    payment.status_transitions.paid_at ??
    payment.status_transitions.canceled_at ??
    payment.created
  );
}

export function FormatInvoiceDiscountLabel(
  discount: InvoiceDiscountAmount
): string {
  const discountRef = discount.discount;
  if (typeof discountRef === 'string') {
    return `Discount (${discountRef})`;
  }
  if (discountRef?.source?.coupon) {
    return `Discount (${discountRef.source.coupon})`;
  }
  return 'Discount';
}

export function FormatInvoicePaymentMethods(invoice: Invoice): string {
  const types = invoice.payment_settings?.payment_method_types;
  if (!types || types.length === 0) return 'USDC';
  return types
    .map((type) => {
      if (type === 'crypto') return 'USDC';
      return type
        .split('_')
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
        .join(' ');
    })
    .join(', ');
}

/** Newest-first timeline derived from invoice status transitions. */
export function BuildInvoiceTimeline(invoice: Invoice): InvoiceTimelineEvent[] {
  const events: InvoiceTimelineEvent[] = [];
  const transitions = invoice.status_transitions;

  if (transitions.paid_at) {
    events.push({
      title: `${FormatInvoiceAmount(
        invoice.amount_paid
      )} payment successfully applied`,
      timestamp: transitions.paid_at * 1000,
      active: true,
    });
  } else if (transitions.voided_at) {
    events.push({
      title: 'Invoice was voided',
      timestamp: transitions.voided_at * 1000,
      active: true,
    });
  } else if (transitions.marked_uncollectible_at) {
    events.push({
      title: 'Invoice was marked uncollectible',
      timestamp: transitions.marked_uncollectible_at * 1000,
      active: true,
    });
  }

  if (transitions.finalized_at) {
    events.push({
      title: 'Invoice was finalised',
      timestamp: transitions.finalized_at * 1000,
      active: events.length === 0,
    });

    if (invoice.hosted_invoice_url) {
      events.push({
        title: 'Invoice payment page was created',
        timestamp: transitions.finalized_at * 1000,
        active: false,
      });
    }
  }

  events.push({
    title: 'Invoice was created',
    timestamp: invoice.created * 1000,
    active: events.length === 0,
  });

  return events;
}
