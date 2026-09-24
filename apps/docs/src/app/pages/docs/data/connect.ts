import { DocSection } from './types';
import { ACCOUNTS_SUBSECTION } from './accounts';
import { ACCOUNT_LINKS_SUBSECTION } from './account-links';
import { LOGIN_LINKS_SUBSECTION } from './login-links';
import { PERSONS_SUBSECTION } from './persons';
import { EXTERNAL_WALLETS_SUBSECTION } from './external-wallets';
import { BALANCE_SUBSECTION } from './balance';
import { BALANCE_TRANSACTIONS_SUBSECTION } from './balance-transactions';
import { CHARGES_SUBSECTION } from './charges';
import { CHECKOUT_SESSIONS_SUBSECTION } from './checkout-sessions';
import { CUSTOMERS_SUBSECTION } from './customers';
import { TRANSFERS_SUBSECTION } from './transfers';
import { TOPUPS_SUBSECTION } from './top-ups';
import { PAYOUTS_SUBSECTION } from './payouts';
import { PAYMENT_INTENTS_SUBSECTION } from './payment-intents';
import { PAYMENT_LINKS_SUBSECTION } from './payment-links';
import { PRICES_SUBSECTION } from './prices';
import { PRODUCTS_SUBSECTION } from './products';
import { SUBSCRIPTIONS_SUBSECTION } from './subscriptions';
import { SUBSCRIPTION_ITEMS_SUBSECTION } from './subscription-items';
import { INVOICE_ITEMS_SUBSECTION } from './invoice-items';
import { INVOICES_SUBSECTION } from './invoices';
import { BILLING_SUBSECTION } from './billing';
import { EVENTS_SUBSECTION } from './events';
import { IDENTITY_VERIFICATION_SESSIONS_SUBSECTION } from './identity-verification-sessions';
import { WEBHOOK_ENDPOINTS_SUBSECTION } from './webhook-endpoints';

export const CORE_RESOURCES_SECTION: DocSection = {
  id: 'core-resources',
  title: 'Core Resources',
  children: [
    BALANCE_SUBSECTION,
    BALANCE_TRANSACTIONS_SUBSECTION,
    CHARGES_SUBSECTION,
    CUSTOMERS_SUBSECTION,
    EVENTS_SUBSECTION,
    PAYMENT_INTENTS_SUBSECTION,
    PAYOUTS_SUBSECTION,
  ],
};

export const PRODUCTS_SECTION: DocSection = {
  id: 'products-section',
  title: 'Products',
  children: [PRODUCTS_SUBSECTION, PRICES_SUBSECTION],
};

export const CHECKOUT_SECTION: DocSection = {
  id: 'checkout',
  title: 'Checkout',
  children: [CHECKOUT_SESSIONS_SUBSECTION],
};

export const PAYMENT_LINKS_SECTION: DocSection = {
  id: 'payment-links-section',
  title: 'Payment Links',
  children: [PAYMENT_LINKS_SUBSECTION],
};

export const BILLING_SECTION: DocSection = {
  id: 'billing-section',
  title: 'Billing',
  children: [
    BILLING_SUBSECTION,
    INVOICES_SUBSECTION,
    INVOICE_ITEMS_SUBSECTION,
    SUBSCRIPTIONS_SUBSECTION,
    SUBSCRIPTION_ITEMS_SUBSECTION,
  ],
};

export const CONNECT_SECTION: DocSection = {
  id: 'connect',
  title: 'Connect',
  children: [
    ACCOUNTS_SUBSECTION,
    LOGIN_LINKS_SUBSECTION,
    ACCOUNT_LINKS_SUBSECTION,
    EXTERNAL_WALLETS_SUBSECTION,
    PERSONS_SUBSECTION,
    TOPUPS_SUBSECTION,
    TRANSFERS_SUBSECTION,
  ],
};

export const IDENTITY_SECTION: DocSection = {
  id: 'identity',
  title: 'Identity',
  children: [IDENTITY_VERIFICATION_SESSIONS_SUBSECTION],
};

export const WEBHOOKS_SECTION: DocSection = {
  id: 'webhooks-section',
  title: 'Webhooks',
  children: [WEBHOOK_ENDPOINTS_SUBSECTION],
};

export const API_SECTIONS: DocSection[] = [
  CORE_RESOURCES_SECTION,
  PRODUCTS_SECTION,
  CHECKOUT_SECTION,
  PAYMENT_LINKS_SECTION,
  BILLING_SECTION,
  CONNECT_SECTION,
  IDENTITY_SECTION,
  WEBHOOKS_SECTION,
];
