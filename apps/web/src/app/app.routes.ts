import { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: 'account',
    redirectTo: '/account/home',
    pathMatch: 'full',
  },
  {
    path: 'account',
    loadComponent: () =>
      import('./features/account/account.component').then(
        (m) => m.AccountComponent
      ),
    loadChildren: () =>
      import('./features/account/account.routes').then((m) => m.accountRoutes),
  },
  {
    path: 'setup',
    loadComponent: () =>
      import('./features/setup/setup.component').then(
        (mod) => mod.SetupComponent
      ),
  },
  {
    path: 'onboard',
    loadComponent: () =>
      import('./features/onboard/onboard.component').then(
        (mod) => mod.OnboardComponent
      ),
  },
  {
    path: 'login',
    loadComponent: () =>
      import('./features/login/login.component').then(
        (mod) => mod.LoginComponent
      ),
  },
  {
    path: 'platform-login',
    loadComponent: () =>
      import('./features/platform-login/platform-login.component').then(
        (mod) => mod.PlatformLoginComponent
      ),
  },
  {
    path: 'session-expired',
    loadComponent: () =>
      import('./features/session-expired/session-expired.component').then(
        (mod) => mod.SessionExpiredComponent
      ),
  },
  {
    path: 'checkout-old',
    loadComponent: () =>
      import('./features/checkout-old/checkout-old.component').then(
        (mod) => mod.CheckoutComponent
      ),
  },
  {
    path: 'checkout/:checkoutSessionId',
    loadComponent: () =>
      import('./features/checkout/checkout.component').then(
        (mod) => mod.CheckoutComponent
      ),
  },
  {
    path: '',
    redirectTo: '/account/home',
    pathMatch: 'full',
  },
  {
    path: '**',
    loadComponent: () =>
      import('./features/not-found/not-found.component').then(
        (mod) => mod.NotFoundComponent
      ),
  },
];
