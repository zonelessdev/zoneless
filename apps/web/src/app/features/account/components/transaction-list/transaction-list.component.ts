import {
  ChangeDetectionStrategy,
  Component,
  inject,
  Input,
  signal,
  WritableSignal,
} from '@angular/core';
import { Router } from '@angular/router';

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

import type { BalanceTransaction } from '@zoneless/shared-types';

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
  /** Act on behalf of a connected account when listing transactions */
  @Input() zonelessAccount = '';
  /** Account ID used when loading payout destination wallets */
  @Input() accountId = '';

  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);
  readonly transactionService = inject(TransactionService);
  private readonly accountService = inject(AccountService);

  // Transaction detail panel state
  transactionDetailPanelOpen: WritableSignal<boolean> = signal(false);

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

    const accountId = this.GetAccountId();
    if (!accountId) return;

    // Open the panel and load transaction details
    this.transactionDetailPanelOpen.set(true);

    try {
      await this.transactionService.LoadTransactionDetail(
        accountId,
        transaction.source,
        transaction.type
      );
    } catch (error) {
      console.error('Failed to load transaction details:', error);
    }
  }

  GetAccountId(): string | null {
    if (this.accountId) return this.accountId;
    if (this.zonelessAccount) return this.zonelessAccount;
    return this.accountService.account()?.id ?? null;
  }

  async OnTransferAccountClick(accountId: string): Promise<void> {
    this.transactionDetailPanelOpen.set(false);
    this.transactionService.ClearSelection();
    await this.router.navigate(['/account/connected-accounts', accountId]);
  }
}
