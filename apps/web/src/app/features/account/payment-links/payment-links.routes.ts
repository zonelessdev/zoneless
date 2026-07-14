import { Routes } from '@angular/router';

export const paymentLinkRoutes: Routes = [
  {
    path: '',
    loadComponent: () =>
      import('./views/payment-link-list/payment-link-list.component').then(
        (m) => m.PaymentLinkListComponent
      ),
  },
];
