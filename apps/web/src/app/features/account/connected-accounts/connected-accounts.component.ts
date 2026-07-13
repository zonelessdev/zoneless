import {
  ChangeDetectionStrategy,
  Component,
  inject,
  signal,
  WritableSignal,
  OnInit,
} from '@angular/core';

import type { PaginatedListColumn } from '../../../shared';
import { MetaService } from '../../../core';
import {
  PaginatedListComponent,
  SlidePanelComponent,
  LoaderComponent,
} from '../../../shared';

import { ConnectedAccountDetailComponent } from '../components';

import { AccountService } from '../../../data';

import type { Account } from '@zoneless/shared-types';
import { GetCountryName } from '../../../utils';

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
export class ConnectedAccountsComponent implements OnInit {
  readonly accountService = inject(AccountService);
  private readonly metaService = inject(MetaService);

  connectedAccountPanelOpen: WritableSignal<boolean> = signal(false);

  connectedAccountColumns: PaginatedListColumn[] = [
    {
      header: 'Account name',
      field: 'id',
      type: 'text',
      bolded: true,
      formatter: (item: unknown) =>
        this.accountService.GetConnectedAccountDisplayName(item as Account),
    },
    {
      header: 'Account country',
      field: 'country',
      type: 'text',
      dimmed: true,
      formatter: (item: unknown) => {
        const account = item as Account;
        if (!account.country) return '—';
        return GetCountryName(account.country) || account.country;
      },
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
      dimmed: true,
      dateFormat: 'd MMM y',
    },
    {
      header: 'Payment balance (USDC)',
      field: 'payment_balance',
      type: 'text',
      dimmed: true,
      formatter: () => '—',
    },
    {
      header: 'Volume (USDC)',
      field: 'volume',
      type: 'text',
      dimmed: true,
      formatter: () => '—',
    },
    {
      header: '',
      field: '',
      type: 'actions',
      actions: [
        {
          title: 'Copy account ID',
          action: (item: Account) => this.CopyAccountId(item),
        },
      ],
    },
  ];

  ngOnInit(): void {
    this.metaService.SetMetaTitle('Connected Accounts');
  }

  OnCreateClick(): void {
    // Placeholder — account creation flow not yet implemented
  }

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

  private CopyAccountId(account: Account): void {
    void navigator.clipboard.writeText(account.id);
  }
}
