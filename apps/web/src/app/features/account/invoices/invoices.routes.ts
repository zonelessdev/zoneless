import { Routes } from '@angular/router';
import { InvoiceActionsService } from './services/invoice-actions.service';

export const invoiceRoutes: Routes = [
  {
    path: '',
    providers: [InvoiceActionsService],
    children: [
      {
        path: '',
        loadComponent: () =>
          import('./views/invoice-list/invoice-list.component').then(
            (m) => m.InvoiceListComponent
          ),
      },
      {
        path: ':invoiceId',
        loadComponent: () =>
          import('./views/invoice-detail/invoice-detail.component').then(
            (m) => m.InvoiceDetailComponent
          ),
      },
    ],
  },
];
