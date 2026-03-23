import { Injectable, inject, signal, WritableSignal } from '@angular/core';
import { ApiService } from '../../core';
import { Balance, BalanceDetails } from '@zoneless/shared-types';

@Injectable({
  providedIn: 'root',
})
export class BalanceService {
  private readonly api = inject(ApiService);

  balance: WritableSignal<Balance | null> = signal(null);
  balanceDetails: WritableSignal<BalanceDetails | null> = signal(null);
  loading: WritableSignal<boolean> = signal(false);
  detailsLoading: WritableSignal<boolean> = signal(false);
  syncing: WritableSignal<boolean> = signal(false);

  Reset(): void {
    this.balance.set(null);
    this.balanceDetails.set(null);
  }

  async GetBalance(): Promise<Balance> {
    this.loading.set(true);
    try {
      const balance = await this.api.Call<Balance>('GET', 'balance');
      this.balance.set(balance);
      return balance;
    } finally {
      this.loading.set(false);
    }
  }

  async GetBalanceDetails(): Promise<BalanceDetails> {
    this.detailsLoading.set(true);
    try {
      const details = await this.api.Call<BalanceDetails>(
        'GET',
        'balance/details'
      );
      this.balanceDetails.set(details);
      return details;
    } finally {
      this.detailsLoading.set(false);
    }
  }

  async SyncBalance(): Promise<BalanceDetails> {
    this.syncing.set(true);
    try {
      const details = await this.api.Call<BalanceDetails>(
        'POST',
        'balance/sync'
      );
      this.balanceDetails.set(details);
      await this.GetBalance();
      return details;
    } finally {
      this.syncing.set(false);
    }
  }

  GetAvailableBalance(currency: string): number {
    const balance = this.balance();
    if (!balance) return 0;
    return balance.available.find((b) => b.currency === currency)?.amount || 0;
  }

  GetPendingBalance(currency: string): number {
    const balance = this.balance();
    if (!balance) return 0;
    return balance.pending.find((b) => b.currency === currency)?.amount || 0;
  }
}
