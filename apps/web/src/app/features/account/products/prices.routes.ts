import { Routes } from '@angular/router';
import { PriceActionsService } from './services/price-actions.service';

export const priceRoutes: Routes = [
  {
    path: '',
    providers: [PriceActionsService],
    children: [
      {
        path: '',
        redirectTo: '/account/products',
        pathMatch: 'full',
      },
      {
        path: ':priceId',
        loadComponent: () =>
          import('./views/price-detail/price-detail.component').then(
            (m) => m.PriceDetailComponent
          ),
      },
    ],
  },
];
