import {
  Component,
  Input,
  Output,
  EventEmitter,
  ChangeDetectionStrategy,
  inject,
  signal,
  WritableSignal,
  OnChanges,
  SimpleChanges,
} from '@angular/core';
import { DecimalPipe } from '@angular/common';

import { BalanceDetails } from '@zoneless/shared-types';
import { BalanceService } from '../../../../data';
import { LoaderComponent } from '../../../../shared';

@Component({
  selector: 'app-balance-detail',
  standalone: true,
  imports: [DecimalPipe, LoaderComponent],
  templateUrl: './balance-detail.component.html',
  styleUrls: ['./balance-detail.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class BalanceDetailComponent implements OnChanges {
  @Input() isOpen = false;
  @Output() synced = new EventEmitter<void>();

  readonly balanceService = inject(BalanceService);

  syncSuccess: WritableSignal<boolean> = signal(false);

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['isOpen'] && this.isOpen) {
      this.syncSuccess.set(false);
      this.balanceService.GetBalanceDetails();
    }
  }

  GetDetails(): BalanceDetails | null {
    return this.balanceService.balanceDetails();
  }

  GetWalletUsdc(): string {
    const details = this.GetDetails();
    if (!details) return '0.00';
    return details.wallet_usdc.toFixed(2);
  }

  GetWalletSol(): string {
    const details = this.GetDetails();
    if (!details) return '0.000';
    return details.wallet_sol.toFixed(4);
  }

  GetConnectedAccountsOwed(): number {
    const details = this.GetDetails();
    if (!details) return 0;
    return details.connected_accounts_owed / 100;
  }

  GetPlatformAvailable(): number {
    const details = this.GetDetails();
    if (!details) return 0;
    return details.platform_available / 100;
  }

  GetPlatformPending(): number {
    const details = this.GetDetails();
    if (!details) return 0;
    return details.platform_pending / 100;
  }

  GetWalletAddress(): string {
    return this.GetDetails()?.wallet_address ?? '';
  }

  GetWalletAddressShort(): string {
    const address = this.GetWalletAddress();
    if (!address || address.length <= 12) return address;
    return `${address.slice(0, 6)}...${address.slice(-4)}`;
  }

  GetExplorerUrl(): string {
    const address = this.GetWalletAddress();
    if (!address) return '';
    const isTestMode = this.balanceService.balance()?.livemode === false;
    const clusterParam = isTestMode ? '?cluster=devnet' : '';
    return `https://explorer.solana.com/address/${address}${clusterParam}`;
  }

  IsInSync(): boolean {
    const details = this.GetDetails();
    if (!details) return true;
    const walletUsdcCents = Math.round(details.wallet_usdc * 100);
    const expected = walletUsdcCents - details.connected_accounts_owed;
    return details.platform_available === expected;
  }

  async OnSync(): Promise<void> {
    this.syncSuccess.set(false);
    try {
      await this.balanceService.SyncBalance();
      this.syncSuccess.set(true);
      this.synced.emit();
      setTimeout(() => this.syncSuccess.set(false), 3000);
    } catch (error) {
      console.error('Failed to sync balance:', error);
    }
  }

  CopyToClipboard(text: string): void {
    navigator.clipboard.writeText(text);
  }

  OnViewOnExplorer(): void {
    const url = this.GetExplorerUrl();
    if (url) {
      window.open(url, '_blank', 'noopener,noreferrer');
    }
  }
}
