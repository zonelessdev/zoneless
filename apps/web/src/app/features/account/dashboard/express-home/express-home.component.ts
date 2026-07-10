import {
  ChangeDetectionStrategy,
  Component,
  inject,
  OnInit,
} from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { TransactionListComponent } from '../../components';
import type { PaginatedListColumn } from '../../../../shared';
import { BalanceService, PersonService } from '../../../../data';
import { MetaService } from '../../../../core';

@Component({
  selector: 'app-express-home',
  imports: [DecimalPipe, TransactionListComponent],
  templateUrl: './express-home.component.html',
  styleUrl: './express-home.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ExpressHomeComponent implements OnInit {
  private readonly balanceService = inject(BalanceService);
  readonly personService = inject(PersonService);
  private readonly metaService = inject(MetaService);

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
}
