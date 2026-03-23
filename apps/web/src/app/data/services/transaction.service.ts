import { Injectable, inject, signal, WritableSignal } from '@angular/core';
import { ApiService } from '../../core';
import {
  Transfer,
  Payout,
  TopUp,
  ExternalWallet,
} from '@zoneless/shared-types';

export type TransactionType = 'transfer' | 'payout' | 'topup';

export interface TransactionDetail {
  type: TransactionType;
  transfer?: Transfer;
  payout?: Payout;
  topup?: TopUp;
  externalWallet?: ExternalWallet;
}

@Injectable({
  providedIn: 'root',
})
export class TransactionService {
  private readonly api = inject(ApiService);

  loading: WritableSignal<boolean> = signal(false);
  selectedTransaction: WritableSignal<TransactionDetail | null> = signal(null);

  Reset(): void {
    this.selectedTransaction.set(null);
    this.loading.set(false);
  }

  async GetTransfer(transferId: string): Promise<Transfer> {
    return this.api.Call<Transfer>('GET', `transfers/${transferId}`);
  }

  async GetPayout(payoutId: string): Promise<Payout> {
    return this.api.Call<Payout>('GET', `payouts/${payoutId}`);
  }

  async GetTopUp(topupId: string): Promise<TopUp> {
    return this.api.Call<TopUp>('GET', `topups/${topupId}`);
  }

  async GetExternalWallet(
    accountId: string,
    walletId: string
  ): Promise<ExternalWallet> {
    return this.api.Call<ExternalWallet>(
      'GET',
      `accounts/${accountId}/external_accounts/${walletId}`
    );
  }

  /**
   * Load full transaction details based on the balance transaction source.
   * The source field contains the ID of either a transfer, payout, or topup.
   */
  async LoadTransactionDetail(
    accountId: string,
    sourceId: string,
    type: TransactionType
  ): Promise<TransactionDetail> {
    this.loading.set(true);
    try {
      let detail: TransactionDetail;

      if (type === 'transfer') {
        const transfer = await this.GetTransfer(sourceId);
        detail = { type: 'transfer', transfer };
      } else if (type === 'topup') {
        const topup = await this.GetTopUp(sourceId);
        detail = { type: 'topup', topup };
      } else {
        const payout = await this.GetPayout(sourceId);

        // For payouts, also fetch the destination wallet details
        let externalWallet: ExternalWallet | undefined;
        if (payout.destination) {
          try {
            externalWallet = await this.GetExternalWallet(
              accountId,
              payout.destination
            );
          } catch {
            // Wallet may not exist anymore, continue without it
            console.warn('Could not load external wallet:', payout.destination);
          }
        }

        detail = { type: 'payout', payout, externalWallet };
      }

      this.selectedTransaction.set(detail);
      return detail;
    } finally {
      this.loading.set(false);
    }
  }

  ClearSelection(): void {
    this.selectedTransaction.set(null);
  }
}
