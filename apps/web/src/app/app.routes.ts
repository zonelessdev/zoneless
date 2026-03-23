import { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: 'account',
    redirectTo: '/account/home',
    pathMatch: 'full',
  },
  {
    path: 'account/:view',
    loadComponent: () =>
      import('./features/account/account.component').then(
        (mod) => mod.AccountComponent
      ),
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
