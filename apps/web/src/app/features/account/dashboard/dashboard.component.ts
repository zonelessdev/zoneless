import {
  ChangeDetectionStrategy,
  Component,
  signal,
  WritableSignal,
  inject,
  OnInit,
} from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { SlidePanelComponent } from '../../../shared';
import {
  AddFundsPanelComponent,
  BalanceDetailComponent,
  TransactionListComponent,
} from '../components';

import type { PaginatedListColumn } from '../../../shared';
import {
  TopupService,
  BalanceService,
  AccountService,
  PersonService,
} from '../../../data';
import { AuthService, MetaService } from '../../../core';

import type { TopUp } from '@zoneless/shared-types';

@Component({
  selector: 'app-dashboard',
  imports: [
    DecimalPipe,
    SlidePanelComponent,
    AddFundsPanelComponent,
    BalanceDetailComponent,
    TransactionListComponent,
  ],
  templateUrl: './dashboard.component.html',
  styleUrl: './dashboard.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DashboardComponent implements OnInit {
  private readonly authService = inject(AuthService);
  private readonly topupService = inject(TopupService);
  private readonly balanceService = inject(BalanceService);
  private readonly accountService = inject(AccountService);
  readonly personService = inject(PersonService);
  private readonly metaService = inject(MetaService);
  // Add Funds panel state (platform only)
  addFundsPanelOpen: WritableSignal<boolean> = signal(false);

  // Balance detail panel state (platform only)
  balanceDetailPanelOpen: WritableSignal<boolean> = signal(false);

  // Recent transaction columns for the Home view (simplified)
  recentTransactionColumns: PaginatedListColumn[] = [
    {
      header: 'Date',
      field: 'created',
      type: 'date',
    },
    {
      header: 'Status',
      field: 'status',
      type: 'status',
    },
    {
      header: 'Type',
      field: 'type',
      type: 'text',
      capitalize: true,
      dimmed: true,
    },
    {
      header: 'Net',
      field: 'net',
      type: 'currency-with-code',
      currencyField: 'currency',
      bolded: true,
    },
  ];

  ngOnInit(): void {
    this.metaService.SetMetaTitle('Home');
  }

  // Balance Detail Panel Methods (Platform Only)
  OnBalanceDetailClick(): void {
    this.balanceDetailPanelOpen.set(true);
  }

  OnBalanceDetailPanelClosed(): void {
    this.balanceDetailPanelOpen.set(false);
  }

  async OnBalanceSynced(): Promise<void> {
    await this.balanceService.GetBalance();
  }

  // Add Funds Panel Methods (Platform Only)
  OnAddFundsClick(): void {
    this.addFundsPanelOpen.set(true);
  }

  OnAddFundsPanelClosed(): void {
    this.addFundsPanelOpen.set(false);
    this.topupService.Reset();
  }

  async OnDepositCompleted(_deposit: TopUp): Promise<void> {
    // Refresh balance after a short delay to ensure backend has processed
    setTimeout(async () => {
      await this.balanceService.GetBalance();
    }, 1000);
  }

  GetTotalBalance(): number {
    const available = this.balanceService.GetAvailableBalance('usdc') / 100;
    const pending = this.balanceService.GetPendingBalance('usdc') / 100;
    return available + pending;
  }

  GetAvailableBalance(): number {
    return this.balanceService.GetAvailableBalance('usdc') / 100;
  }

  GetAccount() {
    return this.accountService.account();
  }

  IsPlatform(): boolean {
    return this.authService.isPlatform();
  }
}
