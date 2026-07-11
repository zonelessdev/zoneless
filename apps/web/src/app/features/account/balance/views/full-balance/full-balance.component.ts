import {
  ChangeDetectionStrategy,
  Component,
  computed,
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
import { BalanceActionsService } from '../../services/balance-actions.service';
import { BalanceActionsHostComponent } from '../../components/balance-actions-host/balance-actions-host.component';

type BalanceActivityTab = 'all' | 'payouts' | 'topups';

@Component({
  selector: 'app-full-balance',
  imports: [TransactionListComponent, DecimalPipe, BalanceActionsHostComponent],
  templateUrl: './full-balance.component.html',
  styleUrl: './full-balance.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FullBalanceComponent implements OnInit {
  readonly balanceService = inject(BalanceService);
  readonly actions = inject(BalanceActionsService);
  private readonly metaService = inject(MetaService);

  activityTab: WritableSignal<BalanceActivityTab> = signal('payouts');

  readonly availableBalance = computed(
    () => this.balanceService.GetAvailableBalance('usdc') / 100
  );
  readonly pendingBalance = computed(
    () => this.balanceService.GetPendingBalance('usdc') / 100
  );
  readonly totalBalance = computed(
    () => this.availableBalance() + this.pendingBalance()
  );

  readonly availablePercent = computed(() => {
    const total = this.availableBalance() + this.pendingBalance();
    if (total <= 0) return this.availableBalance() > 0 ? 100 : 0;
    return (this.availableBalance() / total) * 100;
  });

  readonly pendingPercent = computed(() => {
    const total = this.availableBalance() + this.pendingBalance();
    if (total <= 0) return this.pendingBalance() > 0 ? 100 : 0;
    return (this.pendingBalance() / total) * 100;
  });

  activityColumns: PaginatedListColumn[] = [
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
  topupQueryParams = { type: 'topup' };

  ngOnInit(): void {
    this.metaService.SetMetaTitle('Balances');
  }

  SetActivityTab(tab: BalanceActivityTab): void {
    this.activityTab.set(tab);
  }
}
