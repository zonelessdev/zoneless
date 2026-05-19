import {
  ChangeDetectionStrategy,
  Component,
  inject,
  signal,
  WritableSignal,
} from '@angular/core';

import type { PaginatedListColumn } from '../../../shared';

import {
  PaginatedListComponent,
  SlidePanelComponent,
  LoaderComponent,
} from '../../../shared';

import { ConnectedAccountDetailComponent } from '../components';

import { AccountService } from '../../../data';

import type { Account } from '@zoneless/shared-types';

@Component({
  selector: 'app-connected-accounts',
  imports: [
    PaginatedListComponent,
    SlidePanelComponent,
    LoaderComponent,
    ConnectedAccountDetailComponent,
  ],
  templateUrl: './connected-accounts.component.html',
  styleUrl: './connected-accounts.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ConnectedAccountsComponent {
  readonly accountService = inject(AccountService);

  // Connected Account detail panel state (platform only)
  connectedAccountPanelOpen: WritableSignal<boolean> = signal(false);

  // Connected accounts columns (platform only)
  connectedAccountColumns: PaginatedListColumn[] = [
    {
      header: 'Account',
      field: 'id',
      type: 'text',
      formatter: (item: unknown) => {
        const account = item as Account;
        const individual = account.individual;
        if (individual?.first_name || individual?.last_name) {
          return [individual.first_name, individual.last_name]
            .filter(Boolean)
            .join(' ');
        }
        return account.email ?? account.id;
      },
    },
    {
      header: 'Account country',
      field: 'country',
      type: 'text',
    },
    {
      header: 'Account status',
      field: 'payouts_enabled',
      type: 'status',
      formatter: (item: unknown) => {
        const account = item as Account;
        return account.payouts_enabled ? 'enabled' : 'restricted';
      },
    },
    {
      header: 'Connected on',
      field: 'created',
      type: 'date',
    },
  ];

  // Connected Accounts Methods (Platform Only)
  async OnConnectedAccountClick(item: unknown): Promise<void> {
    const account = item as Account;
    this.connectedAccountPanelOpen.set(true);

    try {
      await this.accountService.LoadConnectedAccount(account.id);
    } catch (error) {
      console.error('Failed to load connected account details:', error);
    }
  }

  OnConnectedAccountPanelClosed(): void {
    this.connectedAccountPanelOpen.set(false);
    this.accountService.ClearSelectedConnectedAccount();
  }

  GetConnectedAccountPanelTitle(): string {
    const account = this.accountService.selectedConnectedAccount();
    if (!account) return 'Account details';
    return this.accountService.GetConnectedAccountDisplayName(account);
  }
}
