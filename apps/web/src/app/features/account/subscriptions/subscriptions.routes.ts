import { Routes } from '@angular/router';

export const subscriptionRoutes: Routes = [
  {
    path: '',
    children: [
      {
        path: '',
        loadComponent: () =>
          import('./views/subscription-list/subscription-list.component').then(
            (m) => m.SubscriptionListComponent
          ),
      },
    ],
  },
];
