import { Routes } from '@angular/router';
import { ProductActionsService } from './services/product-actions.service';

export const productRoutes: Routes = [
  {
    path: '',
    providers: [ProductActionsService],
    children: [
      {
        path: '',
        loadComponent: () =>
          import('./views/product-catalogue/product-catalogue.component').then(
            (m) => m.ProductCatalogueComponent
          ),
      },
      {
        path: ':productId',
        loadComponent: () =>
          import('./views/product-detail/product-detail.component').then(
            (m) => m.ProductDetailComponent
          ),
      },
    ],
  },
];
