import { Routes } from '@angular/router';
import { platformOnlyGuard } from './guards/platform-only.guard';

export const accountRoutes: Routes = [
  { path: '', redirectTo: 'home', pathMatch: 'full' },
  {
    path: 'home',
    loadComponent: () =>
      import('./dashboard/home.component').then((m) => m.HomeComponent),
  },
  {
    path: 'balance',
    loadChildren: () =>
      import('./balance/balance.routes').then((m) => m.balanceRoutes),
  },
  {
    path: 'customers',
    canActivate: [platformOnlyGuard],
    loadChildren: () =>
      import('./customers/customers.routes').then((m) => m.customerRoutes),
  },
  {
    path: 'subscriptions',
    canActivate: [platformOnlyGuard],
    loadChildren: () =>
      import('./subscriptions/subscriptions.routes').then(
        (m) => m.subscriptionRoutes
      ),
  },
  {
    path: 'invoices',
    canActivate: [platformOnlyGuard],
    loadChildren: () =>
      import('./invoices/invoices.routes').then((m) => m.invoiceRoutes),
  },
  {
    path: 'connected-accounts',
    canActivate: [platformOnlyGuard],
    loadChildren: () =>
      import('./connected-accounts/connected-accounts.routes').then(
        (m) => m.connectedAccountRoutes
      ),
  },
  {
    path: 'developers',
    canActivate: [platformOnlyGuard],
    loadComponent: () =>
      import('./developers/developers.component').then(
        (m) => m.DevelopersComponent
      ),
  },
  {
    path: 'settings',
    loadComponent: () =>
      import('./settings/settings.component').then((m) => m.SettingsComponent),
  },
  {
    path: 'payments',
    canActivate: [platformOnlyGuard],
    loadChildren: () =>
      import('./payment-intents/payment-intents.routes').then(
        (m) => m.paymentIntentRoutes
      ),
  },
  {
    path: 'products',
    canActivate: [platformOnlyGuard],
    loadChildren: () =>
      import('./products/products.routes').then((m) => m.productRoutes),
  },
  {
    path: 'prices',
    canActivate: [platformOnlyGuard],
    loadChildren: () =>
      import('./products/prices.routes').then((m) => m.priceRoutes),
  },
  {
    path: 'payment-links',
    canActivate: [platformOnlyGuard],
    loadChildren: () =>
      import('./payment-links/payment-links.routes').then(
        (m) => m.paymentLinkRoutes
      ),
  },
];
