import {
  ChangeDetectionStrategy,
  Component,
  inject,
  OnInit,
  signal,
  WritableSignal,
} from '@angular/core';
import { DecimalPipe, DatePipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { SlidePanelComponent } from '../../../../shared';
import {
  AddFundsPanelComponent,
  BalanceDetailComponent,
  TransactionListComponent,
} from '../../components';
import type { PaginatedListColumn } from '../../../../shared';
import { TopupService, BalanceService, AccountService } from '../../../../data';
import { MetaService } from '../../../../core';
import type { TopUp } from '@zoneless/shared-types';

@Component({
  selector: 'app-full-home',
  imports: [
    DecimalPipe,
    DatePipe,
    RouterLink,
    SlidePanelComponent,
    AddFundsPanelComponent,
    BalanceDetailComponent,
    TransactionListComponent,
  ],
  templateUrl: './full-home.component.html',
  styleUrl: './full-home.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FullHomeComponent implements OnInit {
  private readonly topupService = inject(TopupService);
  private readonly balanceService = inject(BalanceService);
  private readonly accountService = inject(AccountService);
  private readonly metaService = inject(MetaService);

  addFundsPanelOpen: WritableSignal<boolean> = signal(false);
  balanceDetailPanelOpen: WritableSignal<boolean> = signal(false);

  recentTransactionColumns: PaginatedListColumn[] = [
    { header: 'Date', field: 'created', type: 'date' },
    { header: 'Status', field: 'status', type: 'status' },
    {
      header: 'Type',
      field: 'type',
      type: 'text',
      capitalize: true,
      dimmed: true,
    },
    {
      header: 'Amount',
      field: 'amount',
      type: 'currency-with-code',
      currencyField: 'currency',
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

  GetTotalBalance(): number {
    const available = this.balanceService.GetAvailableBalance('usdc') / 100;
    const pending = this.balanceService.GetPendingBalance('usdc') / 100;
    return available + pending;
  }

  GetAvailableBalance(): number {
    return this.balanceService.GetAvailableBalance('usdc') / 100;
  }

  GetPendingBalance(): number {
    return this.balanceService.GetPendingBalance('usdc') / 100;
  }

  GetAccount() {
    return this.accountService.account();
  }

  OnBalanceDetailClick(): void {
    this.balanceDetailPanelOpen.set(true);
  }

  OnBalanceDetailPanelClosed(): void {
    this.balanceDetailPanelOpen.set(false);
  }

  async OnBalanceSynced(): Promise<void> {
    await this.balanceService.GetBalance();
  }

  OnAddFundsClick(): void {
    this.addFundsPanelOpen.set(true);
  }

  OnAddFundsPanelClosed(): void {
    this.addFundsPanelOpen.set(false);
    this.topupService.Reset();
  }

  async OnDepositCompleted(_deposit: TopUp): Promise<void> {
    setTimeout(async () => {
      await this.balanceService.GetBalance();
    }, 1000);
  }
}
