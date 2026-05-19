import { Routes } from '@angular/router';

export const productRoutes: Routes = [
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
];
