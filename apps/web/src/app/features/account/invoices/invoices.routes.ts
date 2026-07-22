import { Routes } from '@angular/router';

export const invoiceRoutes: Routes = [
  {
    path: '',
    children: [
      {
        path: '',
        loadComponent: () =>
          import('./views/invoice-list/invoice-list.component').then(
            (m) => m.InvoiceListComponent
          ),
      },
    ],
  },
];
