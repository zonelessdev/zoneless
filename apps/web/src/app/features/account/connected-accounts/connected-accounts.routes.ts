import { Routes } from '@angular/router';
import { ConnectedAccountActionsService } from './services/connected-account-actions.service';

export const connectedAccountRoutes: Routes = [
  {
    path: '',
    providers: [ConnectedAccountActionsService],
    children: [
      {
        path: '',
        loadComponent: () =>
          import(
            './views/connected-accounts-list/connected-accounts-list.component'
          ).then((m) => m.ConnectedAccountsListComponent),
      },
    ],
  },
];
