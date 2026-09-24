import {
  ACCOUNT_LINKS_PAGES,
  ACCOUNTS_PAGES,
  AGENT_DOCS_SECTION,
  API_QUICKSTART_PAGE,
  API_SECTIONS,
  AGENT_PAYMENTS_QUICKSTART_PAGE,
  AGENT_MARKETPLACE_QUICKSTART_PAGE,
  AUTHENTICATION_PAGE,
  BALANCE_PAGES,
  BALANCE_TRANSACTIONS_PAGES,
  BILLING_PAGES,
  CHARGES_PAGES,
  CHECKOUT_API_QUICKSTART_PAGE,
  CHECKOUT_SESSIONS_PAGES,
  CONNECTED_ACCOUNTS_PAGE,
  CUSTOMERS_PAGES,
  DEPLOYMENT_PAGE,
  ENVIRONMENT_VARIABLES_PAGE,
  ERRORS_PAGE,
  EVENTS_PAGES,
  EXPANDING_RESPONSES_PAGE,
  EXTERNAL_WALLETS_PAGES,
  FUND_PLATFORM_WALLET_PAGE,
  PRIMARY_GUIDE_SECTIONS,
  IDEMPOTENT_REQUESTS_PAGE,
  IDENTITY_VERIFICATION_PAGE,
  IDENTITY_VERIFICATION_SESSIONS_PAGES,
  INVOICE_ITEMS_PAGES,
  INVOICES_PAGES,
  LOCAL_DEVELOPMENT_PAGE,
  LOGIN_LINKS_PAGES,
  MIGRATE_FROM_STRIPE_PAGE,
  PAGINATION_PAGE,
  PAYMENT_INTENTS_PAGES,
  PAYMENT_LINK_QUICKSTART_PAGE,
  PAYMENT_LINKS_PAGES,
  PAYOUTS_PAGES,
  PERSONS_PAGES,
  PLATFORM_DASHBOARD_PAGE,
  PRICES_PAGES,
  PRODUCTS_PAGES,
  QUICKSTART_PAGE,
  SELF_HOSTING_PAGE,
  SUBSCRIPTIONS_PAGES,
  SUBSCRIPTION_ITEMS_PAGES,
  TOPUPS_PAGES,
  TRANSFERS_PAGES,
  WEBHOOK_ENDPOINTS_PAGES,
  WEBHOOKS_PAGE,
} from './data';
import type { DocPage, DocSection } from './data';

export interface DocRoute {
  route: string;
  title: string;
  description: string;
  category: string;
  pages: DocPage[];
}

export const docSections: DocSection[] = [
  ...PRIMARY_GUIDE_SECTIONS,
  ...API_SECTIONS,
  AGENT_DOCS_SECTION,
];

export const docPageGroups: Record<string, DocPage[]> = {
  accounts: ACCOUNTS_PAGES,
  persons: PERSONS_PAGES,
  'login-links': LOGIN_LINKS_PAGES,
  'account-links': ACCOUNT_LINKS_PAGES,
  'external-wallets': EXTERNAL_WALLETS_PAGES,
  balance: BALANCE_PAGES,
  'balance-transactions': BALANCE_TRANSACTIONS_PAGES,
  charges: CHARGES_PAGES,
  customers: CUSTOMERS_PAGES,
  topups: TOPUPS_PAGES,
  transfers: TRANSFERS_PAGES,
  'payment-intents': PAYMENT_INTENTS_PAGES,
  'payment-links': PAYMENT_LINKS_PAGES,
  'checkout-sessions': CHECKOUT_SESSIONS_PAGES,
  payouts: PAYOUTS_PAGES,
  products: PRODUCTS_PAGES,
  prices: PRICES_PAGES,
  subscriptions: SUBSCRIPTIONS_PAGES,
  subscriptionitems: SUBSCRIPTION_ITEMS_PAGES,
  invoiceitems: INVOICE_ITEMS_PAGES,
  invoices: INVOICES_PAGES,
  billing: BILLING_PAGES,
  events: EVENTS_PAGES,
  'webhook-endpoints': WEBHOOK_ENDPOINTS_PAGES,
  'identity-verification-sessions': IDENTITY_VERIFICATION_SESSIONS_PAGES,
};

export const docSinglePages: DocPage[] = [
  QUICKSTART_PAGE,
  AGENT_PAYMENTS_QUICKSTART_PAGE,
  AGENT_MARKETPLACE_QUICKSTART_PAGE,
  FUND_PLATFORM_WALLET_PAGE,
  PAYMENT_LINK_QUICKSTART_PAGE,
  API_QUICKSTART_PAGE,
  CHECKOUT_API_QUICKSTART_PAGE,
  SELF_HOSTING_PAGE,
  ENVIRONMENT_VARIABLES_PAGE,
  CONNECTED_ACCOUNTS_PAGE,
  LOCAL_DEVELOPMENT_PAGE,
  DEPLOYMENT_PAGE,
  PLATFORM_DASHBOARD_PAGE,
  AUTHENTICATION_PAGE,
  ERRORS_PAGE,
  IDEMPOTENT_REQUESTS_PAGE,
  PAGINATION_PAGE,
  EXPANDING_RESPONSES_PAGE,
  WEBHOOKS_PAGE,
  MIGRATE_FROM_STRIPE_PAGE,
  IDENTITY_VERIFICATION_PAGE,
];

export function DocHref(section: string, subsection?: string): string {
  return subsection ? `/${section}/${subsection}` : `/${section}`;
}

export function GetDocPages(sectionId: string): DocPage[] {
  const pageGroup = docPageGroups[sectionId];
  if (pageGroup) return pageGroup;

  const singlePage = docSinglePages.find((page) => page.id === sectionId);
  return singlePage ? [singlePage] : [];
}

export function GetDocRoutes(): DocRoute[] {
  const routes: DocRoute[] = [];

  for (const section of docSections) {
    for (const child of section.children ?? []) {
      const pages = GetDocPages(child.id);
      if (pages.length === 0) continue;

      routes.push({
        route: DocHref(child.id),
        title: child.title,
        description: pages[0].description,
        category: section.title,
        pages,
      });

      for (const subChild of child.children ?? []) {
        const page = pages.find((candidate) => candidate.id === subChild.id);
        if (!page) continue;

        routes.push({
          route: DocHref(child.id, subChild.id),
          title: page.title,
          description: page.description,
          category: child.title,
          pages: [page],
        });
      }
    }
  }

  return routes;
}
