import {
  ChangeDetectionStrategy,
  Component,
  inject,
  signal,
  WritableSignal,
  OnInit,
} from '@angular/core';
import { DecimalPipe } from '@angular/common';

import type { PaginatedListColumn } from '../../../shared';
import { BalanceService } from '../../../data';
import { TransactionListComponent } from '../components';
import { MetaService } from '../../../core';

@Component({
  selector: 'app-balance',
  imports: [TransactionListComponent, DecimalPipe],
  templateUrl: './balance.component.html',
  styleUrl: './balance.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class BalanceComponent implements OnInit {
  readonly balanceService = inject(BalanceService);
  private readonly metaService = inject(MetaService);
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

  ngOnInit(): void {
    this.metaService.SetMetaTitle('Balance');
  }

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
