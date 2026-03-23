import { Component, Input, ChangeDetectionStrategy } from '@angular/core';
import { DatePipe, DecimalPipe } from '@angular/common';

import { TopUp } from '@zoneless/shared-types';
import { StatusChipComponent } from '../../../../shared';

@Component({
  selector: 'app-topup-detail',
  standalone: true,
  imports: [DatePipe, DecimalPipe, StatusChipComponent],
  templateUrl: './topup-detail.component.html',
  styleUrls: ['./topup-detail.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TopupDetailComponent {
  @Input({ required: true }) topup!: TopUp;

  GetAmount(): number {
    return this.topup.amount / 100;
  }

  GetCurrency(): string {
    return this.topup.currency.toUpperCase();
  }

  GetStatus(): string {
    return this.topup.status;
  }

  GetCreatedDate(): number {
    // API returns Unix timestamps in seconds, DatePipe expects milliseconds
    return this.topup.created * 1000;
  }

  GetArrivalDate(): number | null {
    if (!this.topup.arrival_date) return null;
    return this.topup.arrival_date * 1000;
  }

  GetDescription(): string | null {
    return this.topup.description;
  }

  GetId(): string {
    return this.topup.id;
  }

  GetNetwork(): string {
    if (this.topup.metadata?.['network']) {
      return this.FormatNetwork(this.topup.metadata['network']);
    }
    return 'Solana';
  }

  private FormatNetwork(network: string): string {
    return network.charAt(0).toUpperCase() + network.slice(1).toLowerCase();
  }

  GetSenderAddress(): string | null {
    return this.topup.metadata?.['sender_address'] ?? null;
  }

  GetSenderAddressShort(): string {
    const address = this.GetSenderAddress();
    if (!address || address.length <= 12) return address || '';
    return `${address.slice(0, 6)}...${address.slice(-4)}`;
  }

  GetExplorerUrl(): string | null {
    return this.topup.metadata?.['explorer_url'] ?? null;
  }

  GetBlockchainTx(): string | null {
    return this.topup.metadata?.['blockchain_tx'] ?? null;
  }

  GetFailureMessage(): string | null {
    return this.topup.failure_message;
  }

  GetFailureCode(): string | null {
    return this.topup.failure_code;
  }

  GetMetadataEntries(): { key: string; value: string }[] {
    if (!this.topup.metadata) return [];

    const internalKeys = [
      'blockchain_tx',
      'network',
      'sender_address',
      'explorer_url',
    ];

    return Object.entries(this.topup.metadata)
      .filter(
        ([key, value]) =>
          !internalKeys.includes(key) && typeof value === 'string'
      )
      .map(([key, value]) => ({ key, value: String(value) }));
  }

  OnViewOnBlockchain(): void {
    const url = this.GetExplorerUrl();
    if (url) {
      window.open(url, '_blank', 'noopener,noreferrer');
    }
  }

  CopyToClipboard(text: string): void {
    navigator.clipboard.writeText(text);
  }
}
