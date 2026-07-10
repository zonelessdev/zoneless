import { Routes } from '@angular/router';
import { PaymentIntentActionsService } from './services/payment-intent-actions.service';

export const paymentIntentRoutes: Routes = [
  {
    path: '',
    providers: [PaymentIntentActionsService],
    children: [
      {
        path: '',
        loadComponent: () =>
          import(
            './views/payment-intent-list/payment-intent-list.component'
          ).then((m) => m.PaymentIntentListComponent),
      },
      {
        path: ':paymentIntentId',
        loadComponent: () =>
          import(
            './views/payment-intent-detail/payment-intent-detail.component'
          ).then((m) => m.PaymentIntentDetailComponent),
      },
    ],
  },
];
