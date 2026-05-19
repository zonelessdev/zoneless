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
import { Product } from '@zoneless/shared-types';
import { ConfigService } from '../../../../../data';
import {
  CreateProductInput,
  UpdateProductInput,
} from '@zoneless/shared-schemas';

export type ProductFormMode = 'create' | 'edit';

@Component({
  selector: 'app-product-form',
  standalone: true,
  imports: [FormsModule],
  templateUrl: './product-form.component.html',
  styleUrls: ['./product-form.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProductFormComponent implements OnInit, OnChanges {
  readonly configService = inject(ConfigService);

  @Input() product: Product | null = null;
  @Input() mode: ProductFormMode = 'create';
  @Input() showErrors = false;
  @Input() isOpen = false;

  @Output() formChange = new EventEmitter<
    CreateProductInput | UpdateProductInput
  >();
  @Output() validationChange = new EventEmitter<boolean>();

  name: WritableSignal<string> = signal('');
  nameError: WritableSignal<string> = signal('');
  NAME_MAX_LENGTH = 200;

  description: WritableSignal<string> = signal('');
  DESCRIPTION_MAX_LENGTH = 40000;

  image: WritableSignal<string> = signal('');

  unitAmount: WritableSignal<number> = signal(0);
  unitAmountError: WritableSignal<string> = signal('');

  selectedPricing: WritableSignal<'one-time' | 'recurring'> =
    signal('recurring');

  interval: WritableSignal<'day' | 'week' | 'month' | 'year'> = signal('month');
  intervalError: WritableSignal<string> = signal('');

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
    if (this.product) {
      this.name.set(this.product.name || '');
      this.description.set(this.product.description || '');
      this.image.set(this.product.images[0] || '');
    } else {
      this.name.set('');
    }

    this.EmitFormChange();
  }

  OnNameChange(value: string): void {
    this.name.set(value.trim());
    this.ValidateName();
    this.EmitFormChange();
  }

  ValidateName(): void {
    const name = this.name();
    this.nameError.set('');
    if (!name) {
      this.nameError.set('Please enter a name');
      return;
    }
  }

  OnDescriptionChange(value: string): void {
    this.description.set(value.trim());
    this.EmitFormChange();
  }

  OnImageChange(value: string): void {
    this.image.set(value.trim());
    this.EmitFormChange();
  }

  ChangePricing(pricing: 'one-time' | 'recurring'): void {
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

  OnIntervalChange(value: 'day' | 'week' | 'month' | 'year'): void {
    this.interval.set(value);
    this.EmitFormChange();
  }

  ValidateAll(): boolean {
    this.ValidateName();
    this.ValidateUnitAmount();
    return this.IsValid();
  }

  IsValid(): boolean {
    return !this.nameError() && !this.unitAmountError();
  }

  CreateProductFormData(): CreateProductInput {
    const data: CreateProductInput = {
      name: this.name(),
      description: this.description(),
      images: this.image() ? [this.image()] : [],
    };
    if (this.selectedPricing() === 'recurring') {
      data.default_price_data = {
        currency: 'usdc',
        recurring: {
          interval: this.interval(),
        },
        unit_amount: this.FormatUnitAmount(this.unitAmount()),
      };
    }
    return data;
  }

  UpdateProductFormData(): UpdateProductInput {
    return {
      name: this.name(),
      description: this.description(),
      images: this.image() ? [this.image()] : [],
    };
  }

  FormatUnitAmount(amount: number): number {
    return Math.round(amount * 100);
  }

  private EmitFormChange(): void {
    if (this.mode === 'create') {
      this.formChange.emit(this.CreateProductFormData());
    } else {
      this.formChange.emit(this.UpdateProductFormData());
    }
    this.validationChange.emit(this.IsValid());
  }

  RemoveImage(): void {
    this.image.set('');
    this.EmitFormChange();
  }
}
