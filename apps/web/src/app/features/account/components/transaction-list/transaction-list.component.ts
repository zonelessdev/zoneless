import {
  ChangeDetectionStrategy,
  Component,
  inject,
  Input,
  signal,
  WritableSignal,
} from '@angular/core';

import { TransactionService, AccountService } from '../../../../data';
import { AuthService } from '../../../../core';

import {
  PaginatedListComponent,
  SlidePanelComponent,
  LoaderComponent,
  PaginatedListColumn,
} from '../../../../shared';

import {
  PayoutDetailComponent,
  TopupDetailComponent,
  TransferDetailComponent,
} from './components/index';

import type { BalanceTransaction, Account } from '@zoneless/shared-types';

@Component({
  selector: 'app-transaction-list',
  imports: [
    PaginatedListComponent,
    SlidePanelComponent,
    LoaderComponent,
    PayoutDetailComponent,
    TopupDetailComponent,
    TransferDetailComponent,
  ],
  templateUrl: './transaction-list.component.html',
  styleUrl: './transaction-list.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TransactionListComponent {
  @Input() transactionColumns: PaginatedListColumn[] = [];
  @Input() limit = 10;
  @Input() paginationEnabled = true;
  @Input() queryParams: Record<string, string> = {};

  private readonly authService = inject(AuthService);
  readonly transactionService = inject(TransactionService);
  private readonly accountService = inject(AccountService);

  // Transaction detail panel state
  transactionDetailPanelOpen: WritableSignal<boolean> = signal(false);

  // Connected Account detail panel state (platform only)
  connectedAccountPanelOpen: WritableSignal<boolean> = signal(false);

  IsPlatform(): boolean {
    return this.authService.isPlatform();
  }

  GetTransactionDetailTitle(): string {
    const detail = this.transactionService.selectedTransaction();
    if (!detail) return 'Transaction';
    if (detail.type === 'payout') return 'Payout details';
    if (detail.type === 'topup') return 'Top-up details';
    return 'Payment details';
  }

  OnTransactionDetailPanelClosed(): void {
    this.transactionDetailPanelOpen.set(false);
    this.transactionService.ClearSelection();
  }

  async OnTransactionClick(item: unknown): Promise<void> {
    const transaction = item as BalanceTransaction;

    // Only handle transfer, payout, and topup types
    if (
      transaction.type !== 'transfer' &&
      transaction.type !== 'payout' &&
      transaction.type !== 'topup'
    ) {
      return;
    }

    // Skip if source is null (shouldn't happen for these types, but handle gracefully)
    if (!transaction.source) {
      console.warn('Transaction has no source ID:', transaction);
      return;
    }

    const account = this.GetAccount();
    if (!account) return;

    // Open the panel and load transaction details
    this.transactionDetailPanelOpen.set(true);

    try {
      await this.transactionService.LoadTransactionDetail(
        account.id,
        transaction.source,
        transaction.type
      );
    } catch (error) {
      console.error('Failed to load transaction details:', error);
    }
  }

  GetAccount() {
    return this.accountService.account();
  }

  async OnTransferAccountClick(accountId: string): Promise<void> {
    this.transactionDetailPanelOpen.set(false);
    this.transactionService.ClearSelection();
    await this.OnConnectedAccountClick({ id: accountId } as Account);
  }

  // Connected Accounts Methods (Platform Only)
  async OnConnectedAccountClick(item: unknown): Promise<void> {
    const account = item as Account;
    this.connectedAccountPanelOpen.set(true);

    try {
      await this.accountService.LoadConnectedAccount(account.id);
    } catch (error) {
      console.error('Failed to load connected account details:', error);
    }
  }
}
