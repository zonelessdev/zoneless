import {
  Component,
  Input,
  Output,
  EventEmitter,
  ChangeDetectionStrategy,
} from '@angular/core';
import { DatePipe, DecimalPipe } from '@angular/common';

import { Transfer } from '@zoneless/shared-types';
import { StatusChipComponent } from '../../../../shared';

@Component({
  selector: 'app-transfer-detail',
  standalone: true,
  imports: [DatePipe, DecimalPipe, StatusChipComponent],
  templateUrl: './transfer-detail.component.html',
  styleUrls: ['./transfer-detail.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TransferDetailComponent {
  @Input({ required: true }) transfer!: Transfer;
  @Input() isPlatform = false;

  @Output() accountClicked = new EventEmitter<string>();

  OnAccountClick(): void {
    this.accountClicked.emit(this.transfer.destination);
  }

  GetAmount(): number {
    return this.transfer.amount / 100;
  }

  GetCurrency(): string {
    return this.transfer.currency.toUpperCase();
  }

  GetCreatedDate(): number {
    // API returns Unix timestamps in seconds, DatePipe expects milliseconds
    return this.transfer.created * 1000;
  }

  GetDescription(): string | null {
    return this.transfer.description;
  }

  GetId(): string {
    return this.transfer.id;
  }

  GetDestinationId(): string {
    return this.transfer.destination;
  }

  GetTransferGroup(): string | null {
    return this.transfer.transfer_group;
  }

  GetSourceAccount(): string {
    return this.transfer.account;
  }

  GetMetadataEntries(): { key: string; value: string }[] {
    if (
      !this.transfer.metadata ||
      Object.keys(this.transfer.metadata).length === 0
    ) {
      return [];
    }
    return Object.entries(this.transfer.metadata).map(([key, value]) => ({
      key,
      value: String(value),
    }));
  }

  CopyToClipboard(text: string): void {
    navigator.clipboard.writeText(text);
  }
}
