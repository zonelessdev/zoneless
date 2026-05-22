import { Routes } from '@angular/router';

export const accountRoutes: Routes = [
  { path: '', redirectTo: 'home', pathMatch: 'full' },
  {
    path: 'home',
    loadComponent: () =>
      import('./dashboard/dashboard.component').then(
        (m) => m.DashboardComponent
      ),
  },
  {
    path: 'balance',
    loadComponent: () =>
      import('./balance/balance.component').then((m) => m.BalanceComponent),
  },
  {
    path: 'connected-accounts',
    loadComponent: () =>
      import('./connected-accounts/connected-accounts.component').then(
        (m) => m.ConnectedAccountsComponent
      ),
  },
  {
    path: 'developers',
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
    path: 'products',
    loadChildren: () =>
      import('./products/products.routes').then((m) => m.productRoutes),
  },
  {
    path: 'prices',
    loadChildren: () =>
      import('./products/prices.routes').then((m) => m.priceRoutes),
  },
];
