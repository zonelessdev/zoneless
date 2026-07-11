import {
  ChangeDetectionStrategy,
  Component,
  inject,
  signal,
  WritableSignal,
  OnInit,
} from '@angular/core';
import { DecimalPipe } from '@angular/common';

import type { PaginatedListColumn } from '../../../../../shared';
import { BalanceService } from '../../../../../data';
import { TransactionListComponent } from '../../../components';
import { MetaService } from '../../../../../core';

@Component({
  selector: 'app-express-balance',
  imports: [TransactionListComponent, DecimalPipe],
  templateUrl: './express-balance.component.html',
  styleUrl: './express-balance.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ExpressBalanceComponent implements OnInit {
  readonly balanceService = inject(BalanceService);
  private readonly metaService = inject(MetaService);

  balanceTab: WritableSignal<'all' | 'payouts'> = signal('all');

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
