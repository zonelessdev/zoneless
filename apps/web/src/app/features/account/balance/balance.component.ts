import {
  ChangeDetectionStrategy,
  Component,
  inject,
  signal,
  WritableSignal,
} from '@angular/core';
import { DecimalPipe } from '@angular/common';

import type { PaginatedListColumn } from '../../../shared';
import { BalanceService } from '../../../data';
import { TransactionListComponent } from '../components';

@Component({
  selector: 'app-balance',
  imports: [TransactionListComponent, DecimalPipe],
  templateUrl: './balance.component.html',
  styleUrl: './balance.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class BalanceComponent {
  readonly balanceService = inject(BalanceService);

  // Balance view tab state
  balanceTab: WritableSignal<'all' | 'payouts'> = signal('all');

  // Balance transaction columns for the Balance view
  balanceTransactionColumns: PaginatedListColumn[] = [
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
      header: 'Amount',
      field: 'amount',
      type: 'currency',
    },
    {
      header: 'Fee',
      field: 'fee',
      type: 'currency',
    },
    {
      header: 'Net',
      field: 'net',
      type: 'currency-with-code',
      currencyField: 'currency',
      bolded: true,
    },
  ];

  // Payout-only query params
  payoutQueryParams = { type: 'payout' };

  GetTotalBalance(): number {
    const available = this.balanceService.GetAvailableBalance('usdc') / 100;
    const pending = this.balanceService.GetPendingBalance('usdc') / 100;
    return available + pending;
  }

  GetAvailableBalance(): number {
    return this.balanceService.GetAvailableBalance('usdc') / 100;
  }

  SetBalanceTab(tab: 'all' | 'payouts'): void {
    this.balanceTab.set(tab);
  }
}
