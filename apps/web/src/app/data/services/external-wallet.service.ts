import {
  Injectable,
  inject,
  signal,
  WritableSignal,
  computed,
} from '@angular/core';
import { ApiService } from '../../core';
import { ExternalWallet } from '@zoneless/shared-types';
import { SettingsCardRow } from '../../shared';

/**
 * Input type for creating an external wallet.
 * Only wallet_address is required - other fields have sensible defaults.
 */
export interface ExternalWalletCreateInput {
  wallet_address: string;
  network?: string;
  country?: string;
  currency?: string;
  account_holder_name?: string | null;
  account_holder_type?: 'individual' | 'company' | null;
  default_for_currency?: boolean | null;
  metadata?: Record<string, string>;
}

@Injectable({
  providedIn: 'root',
})
export class ExternalWalletService {
  private readonly api = inject(ApiService);

  loading: WritableSignal<boolean> = signal(false);
  wallets: WritableSignal<ExternalWallet[]> = signal([]);

  wallet = computed<ExternalWallet | null>(() => {
    const wallets = this.wallets();
    if (!wallets.length) return null;
    return wallets.find((w) => w.default_for_currency) || wallets[0];
  });

  Reset(): void {
    this.wallets.set([]);
  }

  /**
   * Save external wallet - creates if none exists, archives the old one if address changes.
   */
  async SaveExternalWallet(
    accountId: string,
    data: ExternalWalletCreateInput
  ): Promise<ExternalWallet> {
    this.loading.set(true);
    try {
      const existingWallet = this.wallet();

      if (existingWallet?.wallet_address === data.wallet_address) {
        return existingWallet;
      }

      if (existingWallet) {
        await this.ArchiveExternalWallet(accountId, existingWallet.id);
      }

      const wallet = await this.api.Call<ExternalWallet>(
        'POST',
        `accounts/${accountId}/external_accounts`,
        data
      );
      this.wallets.set([wallet]);
      return wallet;
    } finally {
      this.loading.set(false);
    }
  }

  private async ArchiveExternalWallet(
    accountId: string,
    walletId: string
  ): Promise<void> {
    await this.api.Call<void>(
      'DELETE',
      `accounts/${accountId}/external_accounts/${walletId}`
    );
  }

  async GetExternalWallets(accountId: string): Promise<ExternalWallet[]> {
    const response = await this.api.Call<{ data: ExternalWallet[] }>(
      'GET',
      `accounts/${accountId}/external_accounts`
    );
    this.wallets.set(response.data || []);
    return this.wallets();
  }

  GetWalletTitle(): string {
    const wallet = this.wallet();
    if (!wallet?.wallet_address) return '';
    const addr = wallet.wallet_address;
    if (addr.length <= 12) return addr;
    return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
  }

  GetFullWalletAddress(): string {
    return this.wallet()?.wallet_address || '';
  }

  private GetNetworkDisplay(): string {
    const wallet = this.wallet();
    if (!wallet?.network) return 'Solana';
    return wallet.network.charAt(0).toUpperCase() + wallet.network.slice(1);
  }

  private GetCurrencyDisplay(): string {
    const wallet = this.wallet();
    return wallet?.currency?.toUpperCase() || 'USDC';
  }

  GetSettingsCardRows(): SettingsCardRow[] {
    const wallet = this.wallet();
    if (!wallet) return [];

    return [
      {
        label: 'Network',
        value: this.GetNetworkDisplay(),
        type: 'text',
      },
      {
        label: 'Currency',
        value: this.GetCurrencyDisplay(),
        type: 'text',
      },
      {
        label: 'Wallet address',
        value: this.GetWalletTitle(),
        type: 'text',
      },
    ];
  }
}
