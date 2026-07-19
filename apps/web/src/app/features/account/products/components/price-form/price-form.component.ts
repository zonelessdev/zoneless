import {
  Component,
  Input,
  Output,
  EventEmitter,
  OnInit,
  OnChanges,
  SimpleChanges,
  signal,
  WritableSignal,
  ChangeDetectionStrategy,
  inject,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Price, RecurringInterval } from '@zoneless/shared-types';
import { ConfigService } from '../../../../../data';
import { CreatePriceInput, UpdatePriceInput } from '@zoneless/shared-schemas';

export type PriceFormMode = 'create' | 'edit';

@Component({
  selector: 'app-price-form',
  standalone: true,
  imports: [FormsModule],
  templateUrl: './price-form.component.html',
  styleUrls: ['./price-form.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PriceFormComponent implements OnInit, OnChanges {
  readonly configService = inject(ConfigService);

  @Input() price: Price | null = null;
  @Input() mode: PriceFormMode = 'create';
  @Input() showErrors = false;
  @Input() isOpen = false;

  @Output() formChange = new EventEmitter<
    CreatePriceInput | UpdatePriceInput
  >();
  @Output() validationChange = new EventEmitter<boolean>();

  selectedPricing: WritableSignal<'one-time' | 'recurring'> =
    signal('recurring');

  unitAmount: WritableSignal<number> = signal(0);
  unitAmountError: WritableSignal<string> = signal('');

  interval: WritableSignal<RecurringInterval> = signal('month');

  nickname: WritableSignal<string> = signal('');
  NICKNAME_MAX_LENGTH = 22;

  lookupKey: WritableSignal<string> = signal('');
  LOOKUP_KEY_MAX_LENGTH = 200;

  ngOnInit(): void {
    this.InitializeForm();
  }

  ngOnChanges(changes: SimpleChanges): void {
    // Reinitialize form when panel opens
    if (changes['isOpen'] && this.isOpen) {
      this.InitializeForm();
    }
  }

  InitializeForm(): void {
    if (this.price) {
      this.selectedPricing.set(this.price.recurring ? 'recurring' : 'one-time');
      if (this.price.unit_amount) {
        this.unitAmount.set(Math.round(this.price.unit_amount / 100));
      }
      this.interval.set(this.price.recurring?.interval || 'month');
      this.nickname.set(this.price.nickname || '');
      this.lookupKey.set(this.price.lookup_key || '');
    }
    this.EmitFormChange();
  }

  ChangePricing(pricing: 'one-time' | 'recurring'): void {
    if (this.mode === 'edit') {
      return;
    }
    this.selectedPricing.set(pricing);
    if (pricing === 'recurring') {
      this.interval.set('month');
    }
    this.EmitFormChange();
  }

  OnUnitAmountChange(value: number): void {
    this.unitAmount.set(value);
    this.ValidateUnitAmount();
    this.EmitFormChange();
  }

  ValidateUnitAmount(): void {
    const unitAmount = this.unitAmount();
    this.unitAmountError.set('');
    if (this.mode === 'edit') {
      //Skip for now, we create prices separately after first creation.
      return;
    }
    if (!unitAmount) {
      this.unitAmountError.set('Please enter an amount');
      return;
    }
    if (unitAmount < 0) {
      this.unitAmountError.set('Amount must be greater than 0');
    }
  }

  OnIntervalChange(value: RecurringInterval): void {
    this.interval.set(value);
    this.EmitFormChange();
  }

  OnNicknameChange(value: string): void {
    this.nickname.set(value.trim());
    this.EmitFormChange();
  }

  OnLookupKeyChange(value: string): void {
    this.lookupKey.set(value.trim());
    this.EmitFormChange();
  }

  ValidateAll(): boolean {
    this.ValidateUnitAmount();
    return this.IsValid();
  }

  IsValid(): boolean {
    return !this.unitAmountError();
  }

  CreatePriceFormData(): CreatePriceInput {
    const data: CreatePriceInput = {
      nickname: this.nickname(),
      unit_amount: this.FormatUnitAmount(this.unitAmount()),
      currency: 'usdc',
    };
    if (this.selectedPricing() === 'recurring') {
      data.recurring = {
        interval: this.interval(),
      };
    }
    if (this.lookupKey()) {
      data.lookup_key = this.lookupKey();
    }
    return data;
  }

  UpdatePriceFormData(): UpdatePriceInput {
    const data: UpdatePriceInput = {
      nickname: this.nickname(),
    };
    if (this.lookupKey()) {
      data.lookup_key = this.lookupKey();
    }
    return data;
  }

  FormatUnitAmount(amount: number): number {
    return Math.round(amount * 100);
  }

  private EmitFormChange(): void {
    if (this.mode === 'create') {
      this.formChange.emit(this.CreatePriceFormData());
    } else {
      this.formChange.emit(this.UpdatePriceFormData());
    }
    this.validationChange.emit(this.IsValid());
  }

  MetadataToArray(
    metadata: Record<string, string> | null | undefined
  ): { key: string; value: string }[] {
    if (!metadata || Object.keys(metadata).length === 0) {
      return [{ key: '', value: '' }];
    }
    return Object.entries(metadata).map(([key, value]) => ({
      key,
      value: String(value),
    }));
  }

  FormatMetadata(
    metadataArray: { key: string; value: string }[]
  ): Record<string, string> {
    const metadata: Record<string, string> = {};
    for (const entry of metadataArray) {
      if (entry.key !== '') {
        metadata[entry.key] = entry.value;
      }
    }
    return metadata;
  }
}
