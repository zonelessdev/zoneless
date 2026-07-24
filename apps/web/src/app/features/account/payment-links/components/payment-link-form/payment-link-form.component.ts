import {
  ChangeDetectionStrategy,
  Component,
  EventEmitter,
  Input,
  OnChanges,
  OnDestroy,
  OnInit,
  Output,
  SimpleChanges,
  WritableSignal,
  computed,
  inject,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import type { Price, Product } from '@zoneless/shared-types';
import { CreatePaymentLinkInput } from '@zoneless/shared-schemas';
import { ProductService } from '../../../../../data';
import { MoreInfoHoverComponent } from '../../../../../shared';
import { ISO_CODES } from '../../../../../utils';
import { Subscription } from 'rxjs';
import { PaymentLinkCreateFormPayload } from '../../services/payment-link-actions.service';
import { ProductActionsService } from '../../../products/services/product-actions.service';
import { FormatUsdcAmount } from '../../../../checkout/util/checkout-format';
import { DEFAULT_CHECKOUT_CONFIRMATION_MESSAGE } from '../../../../checkout/util/checkout-completion';

const MAX_CUSTOM_FIELDS = 3;

export type PaymentLinkFormTab = 'payment' | 'after';
export type PaymentLinkLinkType = 'products' | 'custom';
export type AfterCompletionMode = 'hosted_confirmation' | 'redirect';
export type PreviewDevice = 'desktop' | 'mobile';

export type SelectedLineItem = {
  key: string;
  name: string;
  unitAmount: number;
  quantity: number;
  priceId: string;
  recurringInterval?: string | null;
};

export type PreviewCustomField = {
  key: string;
  label: string;
};

export type PaymentLinkFormPreviewState = {
  tab: PaymentLinkFormTab;
  linkType: PaymentLinkLinkType;
  lineItems: SelectedLineItem[];
  customTitle: string;
  customPreset: number;
  collectCustomerNames: boolean;
  collectBusinessNames: boolean;
  collectBillingAddresses: boolean;
  collectShippingAddresses: boolean;
  collectPhone: boolean;
  collectTaxIds: boolean;
  customFields: PreviewCustomField[];
  allowPromotionCodes: boolean;
  requireTerms: boolean;
  savePaymentDetails: boolean;
  afterCompletionMode: AfterCompletionMode;
  customConfirmationMessage: string;
  useCustomConfirmationMessage: boolean;
  submitType: 'auto' | 'book' | 'donate' | 'pay' | 'subscribe';
  previewDevice: PreviewDevice;
};

@Component({
  selector: 'app-payment-link-form',
  standalone: true,
  imports: [FormsModule, MoreInfoHoverComponent],
  templateUrl: './payment-link-form.component.html',
  styleUrl: './payment-link-form.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PaymentLinkFormComponent implements OnInit, OnChanges, OnDestroy {
  private readonly productService = inject(ProductService);
  private readonly productActions = inject(ProductActionsService);
  private productEventsSub?: Subscription;

  @Input() isOpen = false;
  @Input() showErrors = false;

  @Output() formChange = new EventEmitter<PaymentLinkFormPreviewState>();
  @Output() validationChange = new EventEmitter<boolean>();

  activeTab: WritableSignal<PaymentLinkFormTab> = signal('payment');
  linkType: WritableSignal<PaymentLinkLinkType> = signal('products');
  typeMenuOpen: WritableSignal<boolean> = signal(false);

  lineItems: WritableSignal<SelectedLineItem[]> = signal([]);
  productSearch: WritableSignal<string> = signal('');
  productMenuOpen: WritableSignal<boolean> = signal(false);
  recentProducts: WritableSignal<Product[]> = signal([]);
  productsLoading: WritableSignal<boolean> = signal(false);
  productsError: WritableSignal<string | null> = signal(null);

  customTitle: WritableSignal<string> = signal('');
  customPreset: WritableSignal<number> = signal(10);
  customMinimum: WritableSignal<number> = signal(1);
  customMaximum: WritableSignal<number> = signal(1000);

  automaticTax: WritableSignal<boolean> = signal(false);
  managedPayments: WritableSignal<boolean> = signal(false);
  collectCustomerNames: WritableSignal<boolean> = signal(false);
  collectBusinessNames: WritableSignal<boolean> = signal(false);
  collectBillingAddresses: WritableSignal<boolean> = signal(false);
  collectShippingAddresses: WritableSignal<boolean> = signal(false);
  collectPhone: WritableSignal<boolean> = signal(false);
  limitPayments: WritableSignal<boolean> = signal(false);
  paymentLimit: WritableSignal<number> = signal(1);

  advancedExpanded: WritableSignal<boolean> = signal(false);
  addCustomFields: WritableSignal<boolean> = signal(false);
  customFieldLabels: WritableSignal<string[]> = signal(['']);
  allowPromotionCodes: WritableSignal<boolean> = signal(false);
  collectTaxIds: WritableSignal<boolean> = signal(false);
  savePaymentDetails: WritableSignal<boolean> = signal(false);
  requireTerms: WritableSignal<boolean> = signal(false);
  submitType: WritableSignal<'auto' | 'book' | 'donate' | 'pay' | 'subscribe'> =
    signal('pay');

  afterCompletionMode: WritableSignal<AfterCompletionMode> = signal(
    'hosted_confirmation'
  );
  useCustomConfirmationMessage: WritableSignal<boolean> = signal(false);
  customConfirmationMessage: WritableSignal<string> = signal('');
  redirectUrl: WritableSignal<string> = signal('');
  redirectUrlError: WritableSignal<string> = signal('');

  splitPayment: WritableSignal<boolean> = signal(false);
  connectedAccountId: WritableSignal<string> = signal('');
  createInvoice: WritableSignal<boolean> = signal(false);

  lineItemsError: WritableSignal<string> = signal('');
  customTitleError: WritableSignal<string> = signal('');
  customAmountError: WritableSignal<string> = signal('');

  previewDevice: WritableSignal<PreviewDevice> = signal('desktop');

  private readonly OnDocumentClick = (event: MouseEvent): void => {
    const target = event.target as HTMLElement | null;
    if (!target) return;
    if (!target.closest('.type-select-wrap')) {
      this.typeMenuOpen.set(false);
    }
    if (!target.closest('.product-picker')) {
      this.productMenuOpen.set(false);
    }
  };

  filteredProducts = computed(() => {
    const query = this.productSearch().trim().toLowerCase();
    const selectedKeys = new Set(this.lineItems().map((item) => item.key));
    return this.recentProducts().filter((product) => {
      if (selectedKeys.has(product.id)) return false;
      if (!this.GetDefaultPrice(product)) return false;
      if (!query) return true;
      return product.name.toLowerCase().includes(query);
    });
  });

  ngOnInit(): void {
    // Capture phase so clicks still close menus inside the create-flow surface,
    // which calls stopPropagation() to avoid closing the whole overlay.
    document.addEventListener('click', this.OnDocumentClick, true);
    this.productEventsSub = this.productActions.events$.subscribe((event) => {
      if (event.type === 'created') {
        void this.OnProductCreated(event.product);
      }
    });
    this.EmitFormChange();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['isOpen'] && this.isOpen) {
      this.ResetForm();
      void this.LoadRecentProducts();
    }
  }

  ngOnDestroy(): void {
    document.removeEventListener('click', this.OnDocumentClick, true);
    this.productEventsSub?.unsubscribe();
  }

  ResetForm(): void {
    this.activeTab.set('payment');
    this.linkType.set('products');
    this.typeMenuOpen.set(false);
    this.lineItems.set([]);
    this.productSearch.set('');
    this.productMenuOpen.set(false);
    this.productsError.set(null);
    this.customTitle.set('');
    this.customPreset.set(10);
    this.customMinimum.set(1);
    this.customMaximum.set(1000);
    this.automaticTax.set(false);
    this.managedPayments.set(false);
    this.collectCustomerNames.set(false);
    this.collectBusinessNames.set(false);
    this.collectBillingAddresses.set(false);
    this.collectShippingAddresses.set(false);
    this.collectPhone.set(false);
    this.limitPayments.set(false);
    this.paymentLimit.set(1);
    this.advancedExpanded.set(false);
    this.addCustomFields.set(false);
    this.customFieldLabels.set(['']);
    this.allowPromotionCodes.set(false);
    this.collectTaxIds.set(false);
    this.savePaymentDetails.set(false);
    this.requireTerms.set(false);
    this.submitType.set('pay');
    this.afterCompletionMode.set('hosted_confirmation');
    this.useCustomConfirmationMessage.set(false);
    this.customConfirmationMessage.set('');
    this.redirectUrl.set('');
    this.redirectUrlError.set('');
    this.splitPayment.set(false);
    this.connectedAccountId.set('');
    this.createInvoice.set(false);
    this.lineItemsError.set('');
    this.customTitleError.set('');
    this.customAmountError.set('');
    this.previewDevice.set('desktop');
    this.EmitFormChange();
  }

  async LoadRecentProducts(): Promise<void> {
    this.productsLoading.set(true);
    this.productsError.set(null);
    try {
      const response = await this.productService.ListProducts({
        active: true,
        limit: 20,
        expand: ['default_price'],
      });
      this.recentProducts.set(response.data ?? []);
    } catch (error) {
      console.error('Failed to load products:', error);
      this.recentProducts.set([]);
      this.productsError.set('Failed to load products');
    } finally {
      this.productsLoading.set(false);
    }
  }

  SetTab(tab: PaymentLinkFormTab): void {
    this.activeTab.set(tab);
    this.EmitFormChange();
  }

  ToggleTypeMenu(): void {
    this.typeMenuOpen.update((open) => !open);
    this.productMenuOpen.set(false);
  }

  SelectLinkType(type: PaymentLinkLinkType): void {
    this.linkType.set(type);
    this.typeMenuOpen.set(false);
    this.ValidateAll();
    this.EmitFormChange();
  }

  OnProductSearchFocus(): void {
    this.productMenuOpen.set(true);
    this.typeMenuOpen.set(false);
    if (this.recentProducts().length === 0 && !this.productsLoading()) {
      void this.LoadRecentProducts();
    }
  }

  OnProductSearchChange(value: string): void {
    this.productSearch.set(value);
    this.productMenuOpen.set(true);
  }

  SelectProduct(product: Product): void {
    const price = this.GetDefaultPrice(product);
    if (!price) return;

    this.AddLineItemFromProduct(product, price);
    this.productSearch.set('');
    this.productMenuOpen.set(false);
  }

  RemoveLineItem(key: string): void {
    this.lineItems.update((items) => items.filter((item) => item.key !== key));
    this.ValidateLineItems();
    this.EmitFormChange();
  }

  OpenAddProduct(): void {
    this.productMenuOpen.set(false);
    this.productActions.OpenCreate();
  }

  async OnProductCreated(product: Product): Promise<void> {
    let resolved = product;
    if (!this.GetDefaultPrice(resolved)) {
      try {
        resolved = await this.productService.GetProduct(product.id);
      } catch (error) {
        console.error('Failed to load created product:', error);
        await this.LoadRecentProducts();
        return;
      }
    }

    const price = this.GetDefaultPrice(resolved);
    if (price) {
      this.AddLineItemFromProduct(resolved, price);
    }
    await this.LoadRecentProducts();
  }

  readonly defaultConfirmationMessage = DEFAULT_CHECKOUT_CONFIRMATION_MESSAGE;

  FormatPrice(unitAmount: number, interval?: string | null): string {
    const formatted = FormatUsdcAmount(unitAmount);
    return interval ? `${formatted} / ${interval}` : formatted;
  }

  FormatProductPrice(product: Product): string {
    const price = this.GetDefaultPrice(product);
    if (!price) return 'No price';
    return this.FormatPrice(price.unit_amount ?? 0, price.recurring?.interval);
  }

  GetDefaultPrice(product: Product): Price | null {
    if (!product.default_price || typeof product.default_price === 'string') {
      return null;
    }
    return product.default_price;
  }

  ToggleAdvanced(): void {
    this.advancedExpanded.update((expanded) => !expanded);
  }

  OnCheckboxChange(signalRef: WritableSignal<boolean>, checked: boolean): void {
    signalRef.set(checked);
    if (signalRef === this.limitPayments && !checked) {
      this.paymentLimit.set(1);
    }
    if (signalRef === this.addCustomFields) {
      this.customFieldLabels.set(['']);
    }
    this.ValidateAll();
    this.EmitFormChange();
  }

  OnCustomFieldLabelChange(index: number, value: string): void {
    this.customFieldLabels.update((labels) =>
      labels.map((label, i) => (i === index ? value : label))
    );
    this.EmitFormChange();
  }

  AddCustomField(): void {
    if (this.customFieldLabels().length >= MAX_CUSTOM_FIELDS) return;
    this.customFieldLabels.update((labels) => [...labels, '']);
    this.EmitFormChange();
  }

  RemoveCustomField(index: number): void {
    this.customFieldLabels.update((labels) => {
      const next = labels.filter((_, i) => i !== index);
      return next.length > 0 ? next : [''];
    });
    this.EmitFormChange();
  }

  CanAddCustomField(): boolean {
    return this.customFieldLabels().length < MAX_CUSTOM_FIELDS;
  }

  SetAfterCompletionMode(mode: AfterCompletionMode): void {
    this.afterCompletionMode.set(mode);
    this.ValidateRedirectUrl();
    this.EmitFormChange();
  }

  OnRedirectUrlChange(value: string): void {
    this.redirectUrl.set(value.trim());
    this.ValidateRedirectUrl();
    this.EmitFormChange();
  }

  OnCustomConfirmationMessageChange(value: string): void {
    this.customConfirmationMessage.set(value);
    this.EmitFormChange();
  }

  OnSubmitTypeChange(
    value: 'auto' | 'book' | 'donate' | 'pay' | 'subscribe'
  ): void {
    this.submitType.set(value);
    this.EmitFormChange();
  }

  OnPaymentLimitChange(value: number): void {
    this.paymentLimit.set(Number(value) || 1);
    this.EmitFormChange();
  }

  OnCustomTitleChange(value: string): void {
    this.customTitle.set(value);
    this.ValidateCustomAmount();
    this.EmitFormChange();
  }

  OnCustomPresetChange(value: number): void {
    this.customPreset.set(Number(value) || 0);
    this.ValidateCustomAmount();
    this.EmitFormChange();
  }

  OnCustomMinimumChange(value: number): void {
    this.customMinimum.set(Number(value) || 0);
    this.ValidateCustomAmount();
    this.EmitFormChange();
  }

  OnCustomMaximumChange(value: number): void {
    this.customMaximum.set(Number(value) || 0);
    this.ValidateCustomAmount();
    this.EmitFormChange();
  }

  SetPreviewDevice(device: PreviewDevice): void {
    this.previewDevice.set(device);
    this.EmitFormChange();
  }

  ValidateLineItems(): void {
    this.lineItemsError.set('');
    if (this.linkType() === 'products' && this.lineItems().length === 0) {
      this.lineItemsError.set('Add at least one product');
    }
  }

  ValidateCustomAmount(): void {
    this.customTitleError.set('');
    this.customAmountError.set('');
    if (this.linkType() !== 'custom') return;

    if (!this.customTitle().trim()) {
      this.customTitleError.set('Please enter a title');
    }

    const preset = this.ToCents(this.customPreset());
    const minimum = this.ToCents(this.customMinimum());
    const maximum = this.ToCents(this.customMaximum());

    if (preset <= 0 || minimum <= 0 || maximum <= 0) {
      this.customAmountError.set('Amounts must be greater than 0');
      return;
    }
    if (minimum > preset || preset > maximum) {
      this.customAmountError.set(
        'Preset amount must be between the minimum and maximum'
      );
    }
  }

  ValidateRedirectUrl(): void {
    this.redirectUrlError.set('');
    if (this.afterCompletionMode() !== 'redirect') return;

    const url = this.redirectUrl();
    if (!url) {
      this.redirectUrlError.set(
        "That URL doesn't look right. Check for typos, and make sure you include 'http://' or 'https://'."
      );
      return;
    }
    try {
      const parsed = new URL(url);
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
        throw new Error('Invalid protocol');
      }
    } catch {
      this.redirectUrlError.set(
        "That URL doesn't look right. Check for typos, and make sure you include 'http://' or 'https://'."
      );
    }
  }

  ValidateAll(): boolean {
    this.ValidateLineItems();
    this.ValidateCustomAmount();
    this.ValidateRedirectUrl();
    return this.IsValid();
  }

  IsValid(): boolean {
    if (this.afterCompletionMode() === 'redirect' && this.redirectUrlError()) {
      return false;
    }
    if (this.linkType() === 'products') {
      return this.lineItems().length > 0 && !this.lineItemsError();
    }
    return (
      !!this.customTitle().trim() &&
      !this.customTitleError() &&
      !this.customAmountError()
    );
  }

  CreateFormPayload(): PaymentLinkCreateFormPayload {
    const options = this.BuildCreateOptions();

    if (this.linkType() === 'custom') {
      return {
        createInput: {
          ...options,
          line_items: [{ price: 'pending', quantity: 1 }],
        },
        customAmount: {
          name: this.customTitle().trim(),
          preset: this.ToCents(this.customPreset()),
          minimum: this.ToCents(this.customMinimum()),
          maximum: this.ToCents(this.customMaximum()),
        },
      };
    }

    return {
      createInput: {
        ...options,
        line_items: this.lineItems().map((item) => ({
          price: item.priceId,
          quantity: item.quantity,
        })),
      },
    };
  }

  private AddLineItemFromProduct(product: Product, price: Price): void {
    if (this.lineItems().some((item) => item.key === product.id)) return;

    this.lineItems.update((items) => [
      ...items,
      {
        key: product.id,
        name: product.name,
        unitAmount: price.unit_amount ?? 0,
        quantity: 1,
        priceId: price.id,
        recurringInterval: price.recurring?.interval ?? null,
      },
    ]);
    this.ValidateLineItems();
    this.EmitFormChange();
  }

  private BuildCreateOptions(): Omit<CreatePaymentLinkInput, 'line_items'> {
    return {
      submit_type: this.submitType(),
      allow_promotion_codes: this.allowPromotionCodes() || undefined,
      automatic_tax: this.automaticTax() ? { enabled: true } : undefined,
      managed_payments: this.managedPayments() ? { enabled: true } : undefined,
      billing_address_collection: this.collectBillingAddresses()
        ? 'required'
        : undefined,
      shipping_address_collection: this.collectShippingAddresses()
        ? { allowed_countries: ISO_CODES.map((country) => country.code) }
        : undefined,
      phone_number_collection: this.collectPhone()
        ? { enabled: true }
        : undefined,
      tax_id_collection: this.collectTaxIds() ? { enabled: true } : undefined,
      name_collection: this.BuildNameCollection(),
      restrictions: this.limitPayments()
        ? { completed_sessions: { limit: Math.max(1, this.paymentLimit()) } }
        : undefined,
      consent_collection: this.requireTerms()
        ? { terms_of_service: 'required' }
        : undefined,
      payment_intent_data: this.savePaymentDetails()
        ? { setup_future_usage: 'off_session' }
        : undefined,
      custom_fields: this.BuildCustomFields(),
      after_completion: this.BuildAfterCompletion(),
      invoice_creation: this.createInvoice() ? { enabled: true } : undefined,
      transfer_data:
        this.splitPayment() && this.connectedAccountId().trim()
          ? { destination: this.connectedAccountId().trim() }
          : undefined,
    };
  }

  private BuildNameCollection(): CreatePaymentLinkInput['name_collection'] {
    if (!this.collectCustomerNames() && !this.collectBusinessNames()) {
      return undefined;
    }
    return {
      individual: this.collectCustomerNames() ? { enabled: true } : undefined,
      business: this.collectBusinessNames() ? { enabled: true } : undefined,
    };
  }

  private BuildCustomFields(): CreatePaymentLinkInput['custom_fields'] {
    const fields = this.PreviewCustomFields();
    if (fields.length === 0) return undefined;
    return fields.map((field) => ({
      key: field.key,
      type: 'text' as const,
      label: { type: 'custom' as const, custom: field.label.slice(0, 50) },
      // Schema requires the config object matching `type`.
      text: {},
    }));
  }

  private PreviewCustomFields(): PreviewCustomField[] {
    if (!this.addCustomFields()) return [];
    const seen = new Set<string>();
    const fields: PreviewCustomField[] = [];
    for (const raw of this.customFieldLabels()) {
      const label = raw.trim().slice(0, 50);
      if (!label) continue;
      const baseKey = label
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^_|_$/g, '')
        .slice(0, 200);
      if (!baseKey) continue;
      let key = baseKey;
      let suffix = 2;
      while (seen.has(key)) {
        key = `${baseKey}_${suffix++}`.slice(0, 200);
      }
      seen.add(key);
      fields.push({ key, label });
      if (fields.length >= MAX_CUSTOM_FIELDS) break;
    }
    return fields;
  }

  private BuildAfterCompletion(): CreatePaymentLinkInput['after_completion'] {
    if (this.afterCompletionMode() === 'redirect') {
      return {
        type: 'redirect',
        redirect: { url: this.redirectUrl() },
      };
    }

    if (this.useCustomConfirmationMessage()) {
      return {
        type: 'hosted_confirmation',
        hosted_confirmation: {
          custom_message: this.customConfirmationMessage().slice(0, 500),
        },
      };
    }

    return { type: 'hosted_confirmation' };
  }

  private ToCents(amount: number): number {
    return Math.round(amount * 100);
  }

  EmitFormChange(): void {
    this.formChange.emit({
      tab: this.activeTab(),
      linkType: this.linkType(),
      lineItems: this.lineItems(),
      customTitle: this.customTitle(),
      customPreset: this.ToCents(this.customPreset()),
      collectCustomerNames: this.collectCustomerNames(),
      collectBusinessNames: this.collectBusinessNames(),
      collectBillingAddresses: this.collectBillingAddresses(),
      collectShippingAddresses: this.collectShippingAddresses(),
      collectPhone: this.collectPhone(),
      collectTaxIds: this.collectTaxIds(),
      customFields: this.PreviewCustomFields(),
      allowPromotionCodes: this.allowPromotionCodes(),
      requireTerms: this.requireTerms(),
      savePaymentDetails: this.savePaymentDetails(),
      afterCompletionMode: this.afterCompletionMode(),
      customConfirmationMessage: this.customConfirmationMessage(),
      useCustomConfirmationMessage: this.useCustomConfirmationMessage(),
      submitType: this.submitType(),
      previewDevice: this.previewDevice(),
    });
    this.validationChange.emit(this.IsValid());
  }
}
