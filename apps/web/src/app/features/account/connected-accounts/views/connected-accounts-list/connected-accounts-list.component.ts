import {
  ChangeDetectionStrategy,
  Component,
  inject,
  OnInit,
  OnDestroy,
  ViewChild,
  WritableSignal,
  signal,
} from '@angular/core';
import { Router } from '@angular/router';

import type { PaginatedListColumn } from '../../../../../shared';
import { MetaService } from '../../../../../core';
import { PaginatedListComponent } from '../../../../../shared';

import { CreateConnectedAccountHostComponent } from '../../components/create-connected-account-host/create-connected-account-host.component';
import { ConnectedAccountActionsService } from '../../services/connected-account-actions.service';

import { AccountService } from '../../../../../data';

import type { Account } from '@zoneless/shared-types';
import type { ConnectedAccountListStatus } from '@zoneless/shared-schemas';
import { Subscription } from 'rxjs';
import {
  FormatAccountCountry,
  GetAccountStatus,
} from '../../util/connected-account-display';

@Component({
  selector: 'app-connected-accounts-list',
  imports: [PaginatedListComponent, CreateConnectedAccountHostComponent],
  templateUrl: './connected-accounts-list.component.html',
  styleUrl: './connected-accounts-list.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ConnectedAccountsListComponent implements OnInit, OnDestroy {
  readonly accountService = inject(AccountService);
  readonly actions = inject(ConnectedAccountActionsService);
  private readonly metaService = inject(MetaService);
  private readonly router = inject(Router);
  private sub?: Subscription;

  @ViewChild('accountsList') accountsList?: PaginatedListComponent<any>;

  statusTab: WritableSignal<ConnectedAccountListStatus> = signal('all');
  accountsQueryParams: WritableSignal<Record<string, string>> = signal({});

  readonly statusTabs: Array<{
    id: ConnectedAccountListStatus;
    label: string;
  }> = [
    { id: 'all', label: 'All' },
    { id: 'restricted', label: 'Restricted' },
    { id: 'requires_review', label: 'Requires review' },
    { id: 'rejected', label: 'Rejected' },
    { id: 'enabled', label: 'Enabled' },
  ];

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
      formatter: (item: unknown) => FormatAccountCountry(item as Account),
    },
    {
      header: 'Account status',
      field: 'payouts_enabled',
      type: 'status',
      formatter: (item: unknown) => GetAccountStatus(item as Account),
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

  SetStatusTab(tab: ConnectedAccountListStatus): void {
    this.accountsQueryParams.set(tab === 'all' ? {} : { status: tab });
    this.statusTab.set(tab);
  }

  OnConnectedAccountClick(item: unknown): void {
    const account = item as Account;
    void this.router.navigate(['/account/connected-accounts', account.id]);
  }

  OnViewCreatedAccount(accountId: string): void {
    void this.router.navigate(['/account/connected-accounts', accountId]);
  }

  private CopyAccountId(account: Account): void {
    void navigator.clipboard.writeText(account.id);
  }
}
