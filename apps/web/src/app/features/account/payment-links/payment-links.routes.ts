import { Routes } from '@angular/router';
import { PaymentLinkActionsService } from './services/payment-link-actions.service';
import { ProductActionsService } from '../products/services/product-actions.service';
import { PriceActionsService } from '../products/services/price-actions.service';

export const paymentLinkRoutes: Routes = [
  {
    path: '',
    providers: [
      PaymentLinkActionsService,
      ProductActionsService,
      PriceActionsService,
    ],
    children: [
      {
        path: '',
        loadComponent: () =>
          import('./views/payment-link-list/payment-link-list.component').then(
            (m) => m.PaymentLinkListComponent
          ),
      },
      {
        path: ':paymentLinkId',
        loadComponent: () =>
          import(
            './views/payment-link-detail/payment-link-detail.component'
          ).then((m) => m.PaymentLinkDetailComponent),
      },
    ],
  },
];
