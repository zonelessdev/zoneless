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
  ViewChild,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import {
  Product,
  Price,
  MarketingFeature,
  RecurringInterval,
} from '@zoneless/shared-types';
import { ConfigService } from '../../../../../data';
import {
  CreateProductInput,
  UpdateProductInput,
} from '@zoneless/shared-schemas';
import {
  PaginatedListComponent,
  PaginatedListColumn,
} from '../../../../../shared';
import { PriceActionsHostComponent } from '../price-actions-host/price-actions-host.component';
import { PriceActionsService } from '../../services/price-actions.service';
import { MetadataEditorComponent } from '../../../components';
import { Subscription } from 'rxjs';
import { FormatPriceDisplay } from '../../util/price-display';
export type ProductFormMode = 'create' | 'edit';

@Component({
  selector: 'app-product-form',
  standalone: true,
  imports: [
    FormsModule,
    PaginatedListComponent,
    PriceActionsHostComponent,
    MetadataEditorComponent,
  ],
  templateUrl: './product-form.component.html',
  styleUrls: ['./product-form.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProductFormComponent implements OnInit, OnChanges {
  readonly configService = inject(ConfigService);
  readonly priceActions = inject(PriceActionsService);
  private sub?: Subscription;
  @ViewChild('pricesList') pricesList?: PaginatedListComponent<any>;

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

  statementDescriptor: WritableSignal<string> = signal('');
  STATEMENT_DESCRIPTOR_MAX_LENGTH = 22;

  unitLabel: WritableSignal<string> = signal('');

  metadata: WritableSignal<Record<string, string>> = signal({});
  metadataArray: WritableSignal<{ key: string; value: string }[]> = signal([]);

  image: WritableSignal<string> = signal('');

  unitAmount: WritableSignal<number> = signal(0);
  unitAmountError: WritableSignal<string> = signal('');

  marketingFeatures: WritableSignal<MarketingFeature[]> = signal([]);

  selectedPricing: WritableSignal<'one-time' | 'recurring'> =
    signal('recurring');

  interval: WritableSignal<RecurringInterval> = signal('month');

  detailsExpanded: WritableSignal<boolean> = signal(false);

  priceColumns: WritableSignal<PaginatedListColumn[]> = signal([]);
  priceQueryParams: WritableSignal<Record<string, string>> = signal({});

  ngOnInit(): void {
    this.InitializeForm();
    this.sub = this.priceActions.events$.subscribe(() => {
      // Any successful action invalidates the list
      this.pricesList?.Reload();
    });
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
      this.statementDescriptor.set(this.product.statement_descriptor || '');
      this.unitLabel.set(this.product.unit_label || '');
      this.metadata.set(this.product.metadata || {});
      this.marketingFeatures.set(this.product.marketing_features || []);
    } else {
      this.name.set('');
    }

    if (this.mode === 'edit') {
      this.InitPriceList(this.product?.id || '');
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

  OnStatementDescriptorChange(value: string): void {
    this.statementDescriptor.set(value.trim());
    this.EmitFormChange();
  }

  OnUnitLabelChange(value: string): void {
    this.unitLabel.set(value.trim());
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

  OnIntervalChange(value: RecurringInterval): void {
    this.interval.set(value);
    this.EmitFormChange();
  }

  OnMarketingFeatureNameChange(index: number, value: string): void {
    this.marketingFeatures.update((marketingFeatures) =>
      marketingFeatures.map((marketingFeature, i) =>
        i === index ? { ...marketingFeature, name: value } : marketingFeature
      )
    );
    this.EmitFormChange();
  }

  OnMetadataChange(metadata: Record<string, string>): void {
    this.metadata.set(metadata);
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
      statement_descriptor: this.statementDescriptor(),
      unit_label: this.unitLabel(),
      metadata: this.metadata(),
      marketing_features:
        this.marketingFeatures().length > 0 ? this.marketingFeatures() : [],
    };
    if (this.selectedPricing() === 'recurring') {
      data.default_price_data = {
        currency: 'usdc',
        recurring: {
          interval: this.interval(),
        },
        unit_amount: this.FormatUnitAmount(this.unitAmount()),
      };
    } else {
      data.default_price_data = {
        currency: 'usdc',
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
      statement_descriptor: this.statementDescriptor(),
      unit_label: this.unitLabel(),
      metadata: this.metadata(),
      marketing_features: this.marketingFeatures(),
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

  ToggleDetailsExpanded(): void {
    this.detailsExpanded.update((expanded) => !expanded);
  }

  RemoveMarketingFeature(index: number): void {
    this.marketingFeatures.update((marketingFeatures) =>
      marketingFeatures.filter((_, i) => i !== index)
    );
    this.EmitFormChange();
  }

  AddMoreMarketingFeature(): void {
    this.marketingFeatures.update((marketingFeatures) => [
      ...marketingFeatures,
      { name: '' },
    ]);
    this.EmitFormChange();
  }

  InitPriceList(productId: string): void {
    this.priceColumns.set([
      {
        header: 'Price',
        field: 'unit_amount',
        type: 'text',
        bolded: true,
        formatter: (item: unknown) => {
          return FormatPriceDisplay(item as Price);
        },
      },
      {
        header: '',
        field: 'active',
        type: 'status',
        formatter: (item: unknown) => {
          const price = item as Price;
          if (!price.active) {
            return 'archived';
          }
          if ((this.product?.default_price as Price)?.id === price.id) {
            return 'default';
          }
          return '';
        },
      },
      {
        header: 'Created',
        field: 'created',
        type: 'date',
      },
      {
        header: '',
        field: '',
        type: 'actions',
        actions: [
          {
            title: 'Copy price ID',
            action: (item: Price) => this.priceActions.CopyPriceId(item),
          },
          {
            title: 'Edit price',
            action: (item: Price) => this.priceActions.OpenEdit(item),
            disabled: (item: Price) => !item.active,
          },
          {
            title: 'Archive price',
            action: (item: Price) => this.priceActions.OpenArchive(item),
            hidden: (item: Price) => !item.active,
            disabled: (item: Price) =>
              item.id === (this.product?.default_price as Price)?.id,
          },
          {
            title: 'Unarchive price',
            action: (item: Price) => this.priceActions.OpenUnarchive(item),
            hidden: (item: Price) => item.active,
          },
        ],
      },
    ]);

    this.priceQueryParams.set({
      product: productId,
    });
  }

  AddPrice(): void {
    const productId = this.product?.id;
    if (!productId) return;
    this.priceActions.OpenCreate(productId);
  }

  OnPriceListClick(price: Price): void {
    this.priceActions.OpenEdit(price);
  }
}
