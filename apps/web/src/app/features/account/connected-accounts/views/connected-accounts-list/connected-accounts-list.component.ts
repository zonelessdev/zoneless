import {
  ChangeDetectionStrategy,
  Component,
  inject,
  signal,
  WritableSignal,
  OnInit,
  OnDestroy,
  ViewChild,
} from '@angular/core';

import type { PaginatedListColumn } from '../../../../../shared';
import { MetaService } from '../../../../../core';
import {
  PaginatedListComponent,
  SlidePanelComponent,
  LoaderComponent,
} from '../../../../../shared';

import { ConnectedAccountDetailComponent } from '../../../components';
import { CreateConnectedAccountHostComponent } from '../../components/create-connected-account-host/create-connected-account-host.component';
import { ConnectedAccountActionsService } from '../../services/connected-account-actions.service';

import { AccountService } from '../../../../../data';

import type { Account } from '@zoneless/shared-types';
import { GetCountryName } from '../../../../../utils';
import { Subscription } from 'rxjs';

@Component({
  selector: 'app-connected-accounts-list',
  imports: [
    PaginatedListComponent,
    SlidePanelComponent,
    LoaderComponent,
    ConnectedAccountDetailComponent,
    CreateConnectedAccountHostComponent,
  ],
  templateUrl: './connected-accounts-list.component.html',
  styleUrl: './connected-accounts-list.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ConnectedAccountsListComponent implements OnInit, OnDestroy {
  readonly accountService = inject(AccountService);
  readonly actions = inject(ConnectedAccountActionsService);
  private readonly metaService = inject(MetaService);
  private sub?: Subscription;

  @ViewChild('accountsList') accountsList?: PaginatedListComponent<any>;

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
    this.sub = this.actions.events$.subscribe(() => {
      this.accountsList?.Reload();
    });
  }

  ngOnDestroy(): void {
    this.sub?.unsubscribe();
  }

  async OnConnectedAccountClick(item: unknown): Promise<void> {
    const account = item as Account;
    await this.OpenAccountPanel(account.id);
  }

  async OnViewCreatedAccount(accountId: string): Promise<void> {
    await this.OpenAccountPanel(accountId);
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

  private async OpenAccountPanel(accountId: string): Promise<void> {
    this.connectedAccountPanelOpen.set(true);
    try {
      await this.accountService.LoadConnectedAccount(accountId);
    } catch (error) {
      console.error('Failed to load connected account details:', error);
    }
  }

  private CopyAccountId(account: Account): void {
    void navigator.clipboard.writeText(account.id);
  }
}
