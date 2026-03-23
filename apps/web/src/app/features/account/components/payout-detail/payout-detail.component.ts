import { Component, Input, ChangeDetectionStrategy } from '@angular/core';
import { DatePipe, DecimalPipe } from '@angular/common';

import { Payout, ExternalWallet } from '@zoneless/shared-types';
import { StatusChipComponent } from '../../../../shared';

@Component({
  selector: 'app-payout-detail',
  standalone: true,
  imports: [DatePipe, DecimalPipe, StatusChipComponent],
  templateUrl: './payout-detail.component.html',
  styleUrls: ['./payout-detail.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PayoutDetailComponent {
  @Input({ required: true }) payout!: Payout;
  @Input() externalWallet: ExternalWallet | null = null;

  GetAmount(): number {
    return this.payout.amount / 100;
  }

  GetCurrency(): string {
    return this.payout.currency.toUpperCase();
  }

  GetStatus(): string {
    return this.payout.status;
  }

  GetArrivalDate(): number {
    // API returns Unix timestamps in seconds, DatePipe expects milliseconds
    return this.payout.arrival_date * 1000;
  }

  GetMethod(): string {
    return this.payout.method === 'instant' ? 'Instant' : 'Standard';
  }

  GetDescription(): string | null {
    return this.payout.description;
  }

  GetId(): string {
    return this.payout.id;
  }

  GetDestinationId(): string {
    return this.payout.destination;
  }

  GetViewerUrl(): string | null {
    return this.payout.metadata?.viewer_url ?? null;
  }

  GetBlockchainTx(): string | null {
    return this.payout.metadata?.blockchain_tx ?? null;
  }

  GetNetwork(): string {
    if (this.externalWallet?.network) {
      return this.FormatNetwork(this.externalWallet.network);
    }
    if (this.payout.metadata?.network) {
      return this.FormatNetwork(this.payout.metadata.network);
    }
    return 'Solana';
  }

  private FormatNetwork(network: string): string {
    return network.charAt(0).toUpperCase() + network.slice(1).toLowerCase();
  }

  GetWalletAddress(): string {
    return this.externalWallet?.wallet_address ?? '';
  }

  GetWalletAddressShort(): string {
    const address = this.GetWalletAddress();
    if (!address || address.length <= 12) return address;
    return `${address.slice(0, 6)}...${address.slice(-4)}`;
  }

  GetDestinationIdShort(): string {
    const id = this.GetDestinationId();
    if (!id || id.length <= 12) return id;
    return `${id.slice(0, 6)}...${id.slice(-4)}`;
  }

  GetFailureMessage(): string | null | undefined {
    return this.payout.failure_message;
  }

  GetFailureCode(): string | null | undefined {
    return this.payout.failure_code;
  }

  GetMetadataEntries(): { key: string; value: string }[] {
    if (!this.payout.metadata) return [];

    const internalKeys = [
      'blockchain_tx',
      'network',
      'viewer_url',
      'gas_fee',
      'gas_fee_currency',
    ];

    return Object.entries(this.payout.metadata)
      .filter(
        ([key, value]) =>
          !internalKeys.includes(key) && typeof value === 'string'
      )
      .map(([key, value]) => ({ key, value: String(value) }));
  }

  OnViewOnBlockchain(): void {
    const url = this.GetViewerUrl();
    if (url) {
      window.open(url, '_blank', 'noopener,noreferrer');
    }
  }

  CopyToClipboard(text: string): void {
    navigator.clipboard.writeText(text);
  }
}
