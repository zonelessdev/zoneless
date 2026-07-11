import { Routes } from '@angular/router';
import { BalanceActionsService } from './services/balance-actions.service';

export const balanceRoutes: Routes = [
  {
    path: '',
    providers: [BalanceActionsService],
    children: [
      {
        path: '',
        loadComponent: () =>
          import('./balance.component').then((m) => m.BalanceComponent),
      },
    ],
  },
];
