import { Routes } from '@angular/router';
import { CustomerActionsService } from './services/customer-actions.service';

export const customerRoutes: Routes = [
  {
    path: '',
    providers: [CustomerActionsService],
    children: [
      {
        path: '',
        loadComponent: () =>
          import('./views/customer-list/customer-list.component').then(
            (m) => m.CustomerListComponent
          ),
      },
      {
        path: ':customerId',
        loadComponent: () =>
          import('./views/customer-detail/customer-detail.component').then(
            (m) => m.CustomerDetailComponent
          ),
      },
    ],
  },
];
