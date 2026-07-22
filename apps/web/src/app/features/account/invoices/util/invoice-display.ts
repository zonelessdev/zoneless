import type {
  Customer,
  Invoice,
  Price,
  Subscription,
} from '@zoneless/shared-types';
import { FormatIntervalLabel } from '../../products/util/price-display';

export function FormatInvoiceNumber(invoice: Invoice): string {
  return invoice.number ?? '—';
}

export function FormatInvoiceCustomerName(invoice: Invoice): string {
  if (invoice.customer_name) return invoice.customer_name;

  const customer = invoice.customer;
  if (!customer || typeof customer === 'string') return '—';
  return customer.name ?? '—';
}

export function FormatInvoiceCustomerEmail(invoice: Invoice): string {
  if (invoice.customer_email) return invoice.customer_email;

  const customer = invoice.customer;
  if (!customer) return '—';
  if (typeof customer === 'string') return customer;
  return (customer as Customer).email ?? customer.id;
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
