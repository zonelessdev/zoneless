import { Routes } from '@angular/router';
import { SubscriptionActionsService } from './services/subscription-actions.service';

export const subscriptionRoutes: Routes = [
  {
    path: '',
    providers: [SubscriptionActionsService],
    children: [
      {
        path: '',
        loadComponent: () =>
          import('./views/subscription-list/subscription-list.component').then(
            (m) => m.SubscriptionListComponent
          ),
      },
      {
        path: ':subscriptionId',
        loadComponent: () =>
          import(
            './views/subscription-detail/subscription-detail.component'
          ).then((m) => m.SubscriptionDetailComponent),
      },
    ],
  },
];
