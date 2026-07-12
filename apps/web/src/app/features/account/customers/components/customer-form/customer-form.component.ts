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
import { Customer, CustomerAddress } from '@zoneless/shared-types';
import { ConfigService } from '../../../../../data';
import {
  CreateCustomerInput,
  UpdateCustomerInput,
} from '@zoneless/shared-schemas';
import { MetadataEditorComponent } from '../../../components';
import { ISO_CODES, GetCountryDialCode } from '../../../../../utils';

export type CustomerFormMode = 'create' | 'edit';
export type CustomerAccountType = 'individual' | 'company';

interface AddressFields {
  country: WritableSignal<string>;
  line1: WritableSignal<string>;
  line2: WritableSignal<string>;
  city: WritableSignal<string>;
  postalCode: WritableSignal<string>;
  state: WritableSignal<string>;
  visible: WritableSignal<boolean>;
}

interface PhoneFields {
  countryCode: WritableSignal<string>;
  number: WritableSignal<string>;
  full: WritableSignal<string>;
  error: WritableSignal<string>;
}

interface TaxIdRow {
  type: string;
  value: string;
}

@Component({
  selector: 'app-customer-form',
  standalone: true,
  imports: [FormsModule, MetadataEditorComponent],
  templateUrl: './customer-form.component.html',
  styleUrls: ['./customer-form.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CustomerFormComponent implements OnInit, OnChanges {
  readonly configService = inject(ConfigService);
  readonly ISO_CODES = ISO_CODES;

  readonly NAME_MAX_LENGTH = 256;
  readonly INDIVIDUAL_NAME_MAX_LENGTH = 150;
  readonly BUSINESS_NAME_MAX_LENGTH = 150;
  readonly EMAIL_MAX_LENGTH = 512;
  readonly PHONE_MAX_LENGTH = 20;

  readonly PREFERRED_LOCALES: { value: string; label: string }[] = [
    { value: 'en', label: 'English' },
    { value: 'en-GB', label: 'English (United Kingdom)' },
    { value: 'fr', label: 'French' },
    { value: 'de', label: 'German' },
    { value: 'es', label: 'Spanish' },
    { value: 'it', label: 'Italian' },
    { value: 'nl', label: 'Dutch' },
    { value: 'pt', label: 'Portuguese' },
    { value: 'pt-BR', label: 'Portuguese (Brazil)' },
    { value: 'ja', label: 'Japanese' },
    { value: 'zh', label: 'Chinese' },
    { value: 'ko', label: 'Korean' },
  ];

  readonly TAX_ID_TYPES: { value: string; label: string }[] = [
    { value: 'eu_vat', label: 'EU VAT' },
    { value: 'gb_vat', label: 'GB VAT' },
    { value: 'us_ein', label: 'US EIN' },
    { value: 'au_abn', label: 'AU ABN' },
    { value: 'au_arn', label: 'AU ARN' },
    { value: 'br_cnpj', label: 'BR CNPJ' },
    { value: 'br_cpf', label: 'BR CPF' },
    { value: 'ca_bn', label: 'CA BN' },
    { value: 'ca_gst_hst', label: 'CA GST/HST' },
    { value: 'ca_pst_bc', label: 'CA PST (BC)' },
    { value: 'ca_pst_mb', label: 'CA PST (MB)' },
    { value: 'ca_pst_sk', label: 'CA PST (SK)' },
    { value: 'ca_qst', label: 'CA QST' },
    { value: 'ch_vat', label: 'CH VAT' },
    { value: 'cl_tin', label: 'CL TIN' },
    { value: 'es_cif', label: 'ES CIF' },
    { value: 'in_gst', label: 'IN GST' },
    { value: 'jp_cn', label: 'JP CN' },
    { value: 'jp_rn', label: 'JP RN' },
    { value: 'jp_trn', label: 'JP TRN' },
    { value: 'mx_rfc', label: 'MX RFC' },
    { value: 'my_sst', label: 'MY SST' },
    { value: 'no_vat', label: 'NO VAT' },
    { value: 'nz_gst', label: 'NZ GST' },
    { value: 'ru_inn', label: 'RU INN' },
    { value: 'sg_gst', label: 'SG GST' },
    { value: 'sg_uen', label: 'SG UEN' },
    { value: 'th_vat', label: 'TH VAT' },
    { value: 'tw_vat', label: 'TW VAT' },
    { value: 'za_vat', label: 'ZA VAT' },
  ];

  readonly TAX_EXEMPT_OPTIONS: {
    value: 'none' | 'exempt' | 'reverse';
    label: string;
  }[] = [
    { value: 'none', label: 'None' },
    { value: 'exempt', label: 'Exempt' },
    { value: 'reverse', label: 'Reverse' },
  ];

  @Input() customer: Customer | null = null;
  @Input() mode: CustomerFormMode = 'create';
  @Input() showErrors = false;
  @Input() isOpen = false;

  @Output() formChange = new EventEmitter<
    CreateCustomerInput | UpdateCustomerInput
  >();
  @Output() validationChange = new EventEmitter<boolean>();

  accountType: WritableSignal<CustomerAccountType> = signal('individual');

  firstName: WritableSignal<string> = signal('');
  lastName: WritableSignal<string> = signal('');
  businessName: WritableSignal<string> = signal('');
  name: WritableSignal<string> = signal('');
  nameError: WritableSignal<string> = signal('');

  email: WritableSignal<string> = signal('');
  emailError: WritableSignal<string> = signal('');

  billingAddress: AddressFields = this.CreateAddressFields();
  billingPhone: PhoneFields = this.CreatePhoneFields();

  shippingSameAsBilling: WritableSignal<boolean> = signal(false);
  shippingName: WritableSignal<string> = signal('');
  shippingNameError: WritableSignal<string> = signal('');
  shippingAddress: AddressFields = this.CreateAddressFields();
  shippingPhone: PhoneFields = this.CreatePhoneFields();

  preferredLocale: WritableSignal<string> = signal('');
  taxExempt: WritableSignal<'none' | 'exempt' | 'reverse'> = signal('none');

  taxIds: WritableSignal<TaxIdRow[]> = signal([{ type: '', value: '' }]);
  taxIdsError: WritableSignal<string> = signal('');

  metadata: WritableSignal<Record<string, string>> = signal({});

  billingExpanded: WritableSignal<boolean> = signal(true);
  moreOptionsExpanded: WritableSignal<boolean> = signal(false);

  private displayNameTouched = false;

  ngOnInit(): void {
    this.InitializeForm();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['isOpen'] && this.isOpen) {
      this.InitializeForm();
    }
  }

  InitializeForm(): void {
    this.displayNameTouched = false;
    this.nameError.set('');
    this.emailError.set('');
    this.shippingNameError.set('');
    this.taxIdsError.set('');
    this.billingPhone.error.set('');
    this.shippingPhone.error.set('');
    this.billingExpanded.set(true);
    this.moreOptionsExpanded.set(false);

    if (this.customer) {
      const isCompany =
        !!this.customer.business_name && !this.customer.individual_name;
      this.accountType.set(isCompany ? 'company' : 'individual');

      if (this.customer.individual_name) {
        const parts = this.customer.individual_name.trim().split(/\s+/);
        this.firstName.set(parts[0] || '');
        this.lastName.set(parts.slice(1).join(' ') || '');
      } else {
        this.firstName.set('');
        this.lastName.set('');
      }

      this.businessName.set(this.customer.business_name || '');
      this.name.set(this.customer.name || '');
      this.displayNameTouched = !!this.customer.name;
      this.email.set(this.customer.email || '');

      this.SetAddressFields(this.billingAddress, this.customer.address);
      this.SetPhoneFields(this.billingPhone, this.customer.phone);

      if (this.customer.shipping) {
        this.shippingSameAsBilling.set(false);
        this.shippingName.set(this.customer.shipping.name || '');
        this.SetAddressFields(
          this.shippingAddress,
          this.customer.shipping.address
        );
        this.SetPhoneFields(this.shippingPhone, this.customer.shipping.phone);
      } else {
        this.shippingSameAsBilling.set(false);
        this.shippingName.set('');
        this.ClearAddressFields(this.shippingAddress, false);
        this.ClearPhoneFields(this.shippingPhone);
      }

      this.preferredLocale.set(this.customer.preferred_locales?.[0] || '');
      this.taxExempt.set(this.customer.tax_exempt || 'none');
      this.metadata.set(this.customer.metadata || {});
      this.taxIds.set([{ type: '', value: '' }]);
    } else {
      this.accountType.set('individual');
      this.firstName.set('');
      this.lastName.set('');
      this.businessName.set('');
      this.name.set('');
      this.email.set('');
      this.ClearAddressFields(this.billingAddress, true);
      this.ClearPhoneFields(this.billingPhone);
      this.shippingSameAsBilling.set(false);
      this.shippingName.set('');
      this.ClearAddressFields(this.shippingAddress, true);
      this.ClearPhoneFields(this.shippingPhone);
      this.preferredLocale.set('');
      this.taxExempt.set('none');
      this.metadata.set({});
      this.taxIds.set([{ type: '', value: '' }]);
    }

    this.EmitFormChange();
  }

  OnAccountTypeChange(value: CustomerAccountType): void {
    this.accountType.set(value);
    this.SyncDisplayNameFromAccount();
    this.EmitFormChange();
  }

  OnFirstNameChange(value: string): void {
    this.firstName.set(value);
    this.SyncDisplayNameFromAccount();
    this.ValidateName();
    this.EmitFormChange();
  }

  OnLastNameChange(value: string): void {
    this.lastName.set(value);
    this.SyncDisplayNameFromAccount();
    this.ValidateName();
    this.EmitFormChange();
  }

  OnBusinessNameChange(value: string): void {
    this.businessName.set(value);
    this.SyncDisplayNameFromAccount();
    this.ValidateName();
    this.EmitFormChange();
  }

  OnNameChange(value: string): void {
    this.displayNameTouched = true;
    this.name.set(value);
    this.ValidateName();
    this.EmitFormChange();
  }

  OnEmailChange(value: string): void {
    this.email.set(value.trim());
    this.ValidateEmail();
    this.EmitFormChange();
  }

  ToggleBillingExpanded(): void {
    this.billingExpanded.update((expanded) => !expanded);
  }

  ToggleMoreOptionsExpanded(): void {
    this.moreOptionsExpanded.update((expanded) => !expanded);
  }

  // ── Address handlers ──────────────────────────────────────────────────────

  OnBillingCountryChange(value: string): void {
    this.billingAddress.country.set(value);
    const country = ISO_CODES.find((c) => c.code === value);
    if (country) {
      this.billingPhone.countryCode.set(country.code);
      this.UpdateFullPhone(this.billingPhone);
    }
    this.EmitFormChange();
  }

  OnBillingLine1Change(value: string): void {
    this.billingAddress.line1.set(value);
    this.EmitFormChange();
  }

  OnBillingLine2Change(value: string): void {
    this.billingAddress.line2.set(value);
    this.EmitFormChange();
  }

  OnBillingCityChange(value: string): void {
    this.billingAddress.city.set(value);
    this.EmitFormChange();
  }

  OnBillingPostalCodeChange(value: string): void {
    this.billingAddress.postalCode.set(value);
    this.EmitFormChange();
  }

  OnBillingStateChange(value: string): void {
    this.billingAddress.state.set(value);
    this.EmitFormChange();
  }

  RemoveBillingAddress(): void {
    this.ClearAddressFields(this.billingAddress, false);
    this.EmitFormChange();
  }

  AddBillingAddress(): void {
    this.billingAddress.visible.set(true);
  }

  OnShippingCountryChange(value: string): void {
    this.shippingAddress.country.set(value);
    const country = ISO_CODES.find((c) => c.code === value);
    if (country) {
      this.shippingPhone.countryCode.set(country.code);
      this.UpdateFullPhone(this.shippingPhone);
    }
    this.ValidateShipping();
    this.EmitFormChange();
  }

  OnShippingLine1Change(value: string): void {
    this.shippingAddress.line1.set(value);
    this.ValidateShipping();
    this.EmitFormChange();
  }

  OnShippingLine2Change(value: string): void {
    this.shippingAddress.line2.set(value);
    this.EmitFormChange();
  }

  OnShippingCityChange(value: string): void {
    this.shippingAddress.city.set(value);
    this.ValidateShipping();
    this.EmitFormChange();
  }

  OnShippingPostalCodeChange(value: string): void {
    this.shippingAddress.postalCode.set(value);
    this.ValidateShipping();
    this.EmitFormChange();
  }

  OnShippingStateChange(value: string): void {
    this.shippingAddress.state.set(value);
    this.EmitFormChange();
  }

  RemoveShippingAddress(): void {
    this.ClearAddressFields(this.shippingAddress, false);
    this.ValidateShipping();
    this.EmitFormChange();
  }

  AddShippingAddress(): void {
    this.shippingAddress.visible.set(true);
  }

  // ── Phone handlers ────────────────────────────────────────────────────────

  OnBillingPhoneCountryChange(value: string): void {
    this.billingPhone.countryCode.set(value);
    this.UpdateFullPhone(this.billingPhone);
    this.ValidatePhone(this.billingPhone);
    this.EmitFormChange();
  }

  OnBillingPhoneNumberChange(value: string): void {
    this.billingPhone.number.set(value);
    this.UpdateFullPhone(this.billingPhone);
    this.ValidatePhone(this.billingPhone);
    this.EmitFormChange();
  }

  OnShippingPhoneCountryChange(value: string): void {
    this.shippingPhone.countryCode.set(value);
    this.UpdateFullPhone(this.shippingPhone);
    this.ValidatePhone(this.shippingPhone);
    this.ValidateShipping();
    this.EmitFormChange();
  }

  OnShippingPhoneNumberChange(value: string): void {
    this.shippingPhone.number.set(value);
    this.UpdateFullPhone(this.shippingPhone);
    this.ValidatePhone(this.shippingPhone);
    this.ValidateShipping();
    this.EmitFormChange();
  }

  GetPhoneDialCode(phone: PhoneFields): string {
    return GetCountryDialCode(phone.countryCode());
  }

  GetPhonePlaceholder(phone: PhoneFields): string {
    const country = ISO_CODES.find((c) => c.code === phone.countryCode());
    return country?.phoneExample || '123 456 7890';
  }

  // ── Shipping / locale / tax ───────────────────────────────────────────────

  OnShippingSameAsBillingChange(checked: boolean): void {
    this.shippingSameAsBilling.set(checked);
    if (checked) {
      this.shippingNameError.set('');
      this.shippingPhone.error.set('');
    }
    this.ValidateShipping();
    this.EmitFormChange();
  }

  OnShippingNameChange(value: string): void {
    this.shippingName.set(value);
    this.ValidateShipping();
    this.EmitFormChange();
  }

  OnPreferredLocaleChange(value: string): void {
    this.preferredLocale.set(value);
    this.EmitFormChange();
  }

  OnTaxExemptChange(value: 'none' | 'exempt' | 'reverse'): void {
    this.taxExempt.set(value);
    this.EmitFormChange();
  }

  OnTaxIdTypeChange(index: number, value: string): void {
    this.taxIds.update((rows) =>
      rows.map((row, i) => (i === index ? { ...row, type: value } : row))
    );
    this.ValidateTaxIds();
    this.EmitFormChange();
  }

  OnTaxIdValueChange(index: number, value: string): void {
    this.taxIds.update((rows) =>
      rows.map((row, i) => (i === index ? { ...row, value } : row))
    );
    this.ValidateTaxIds();
    this.EmitFormChange();
  }

  AddTaxId(): void {
    this.taxIds.update((rows) => [...rows, { type: '', value: '' }]);
  }

  RemoveTaxId(index: number): void {
    this.taxIds.update((rows) => {
      const next = rows.filter((_, i) => i !== index);
      return next.length > 0 ? next : [{ type: '', value: '' }];
    });
    this.ValidateTaxIds();
    this.EmitFormChange();
  }

  OnMetadataChange(metadata: Record<string, string>): void {
    this.metadata.set(metadata);
    this.EmitFormChange();
  }

  // ── Validation ────────────────────────────────────────────────────────────

  ValidateName(): void {
    this.nameError.set('');
    const displayName = this.name().trim();
    if (displayName.length > this.NAME_MAX_LENGTH) {
      this.nameError.set(
        `Display name must be ${this.NAME_MAX_LENGTH} characters or fewer`
      );
      return;
    }

    if (this.accountType() === 'individual') {
      const individualName = this.GetIndividualName();
      if (individualName.length > this.INDIVIDUAL_NAME_MAX_LENGTH) {
        this.nameError.set(
          `Name must be ${this.INDIVIDUAL_NAME_MAX_LENGTH} characters or fewer`
        );
      }
    } else if (
      this.businessName().trim().length > this.BUSINESS_NAME_MAX_LENGTH
    ) {
      this.nameError.set(
        `Business name must be ${this.BUSINESS_NAME_MAX_LENGTH} characters or fewer`
      );
    }
  }

  ValidateEmail(): void {
    const email = this.email();
    this.emailError.set('');
    if (!email) return;
    if (email.length > this.EMAIL_MAX_LENGTH) {
      this.emailError.set(
        `Email must be ${this.EMAIL_MAX_LENGTH} characters or fewer`
      );
      return;
    }
    if (!this.IsValidEmail(email)) {
      this.emailError.set('Please enter a valid email address');
    }
  }

  ValidatePhone(phone: PhoneFields): void {
    phone.error.set('');
    const full = phone.full();
    if (!full) return;
    if (full.length > this.PHONE_MAX_LENGTH) {
      phone.error.set(
        `Phone must be ${this.PHONE_MAX_LENGTH} characters or fewer`
      );
    }
  }

  ValidateShipping(): void {
    this.shippingNameError.set('');
    if (this.shippingSameAsBilling()) return;
    if (!this.HasShippingInput()) return;
    if (!this.shippingName().trim()) {
      this.shippingNameError.set('Please enter a recipient name');
    }
  }

  ValidateTaxIds(): void {
    this.taxIdsError.set('');
    for (const row of this.taxIds()) {
      const hasType = !!row.type.trim();
      const hasValue = !!row.value.trim();
      if (hasType !== hasValue) {
        this.taxIdsError.set('Each tax ID needs both a type and a value');
        return;
      }
    }
  }

  ValidateAll(): boolean {
    this.ValidateName();
    this.ValidateEmail();
    this.ValidatePhone(this.billingPhone);
    this.ValidatePhone(this.shippingPhone);
    this.ValidateShipping();
    this.ValidateTaxIds();
    return this.IsValid();
  }

  IsValid(): boolean {
    return (
      !this.nameError() &&
      !this.emailError() &&
      !this.billingPhone.error() &&
      !this.shippingPhone.error() &&
      !this.shippingNameError() &&
      !this.taxIdsError()
    );
  }

  CreateCustomerFormData(): CreateCustomerInput {
    const shared = this.BuildSharedFormData();
    const data: CreateCustomerInput = { ...shared };

    const taxIdData = this.taxIds()
      .filter((row) => row.type.trim() && row.value.trim())
      .map((row) => ({ type: row.type.trim(), value: row.value.trim() }));
    if (taxIdData.length > 0) {
      data.tax_id_data = taxIdData;
    }

    return data;
  }

  UpdateCustomerFormData(): UpdateCustomerInput {
    return this.BuildSharedFormData();
  }

  private BuildSharedFormData(): {
    address?: UpdateCustomerInput['address'];
    business_name?: string;
    email?: string;
    individual_name?: string;
    metadata?: Record<string, string>;
    name?: string;
    phone?: string;
    preferred_locales?: string[];
    shipping?: UpdateCustomerInput['shipping'];
    tax_exempt?: 'exempt' | 'none' | 'reverse';
  } {
    const data: {
      address?: UpdateCustomerInput['address'];
      business_name?: string;
      email?: string;
      individual_name?: string;
      metadata?: Record<string, string>;
      name?: string;
      phone?: string;
      preferred_locales?: string[];
      shipping?: UpdateCustomerInput['shipping'];
      tax_exempt?: 'exempt' | 'none' | 'reverse';
    } = {
      metadata: this.metadata(),
      tax_exempt: this.taxExempt(),
    };

    const displayName = this.name().trim();
    if (displayName) {
      data.name = displayName;
    } else if (this.mode === 'edit') {
      data.name = '';
    }

    if (this.accountType() === 'individual') {
      const individualName = this.GetIndividualName();
      if (individualName) {
        data.individual_name = individualName;
      }
      // Clear the unused counterpart on edit so type detection stays correct
      if (this.mode === 'edit') {
        data.business_name = '';
      }
    } else {
      const businessName = this.businessName().trim();
      if (businessName) {
        data.business_name = businessName;
      }
      if (this.mode === 'edit') {
        data.individual_name = '';
      }
    }

    if (this.email()) {
      data.email = this.email();
    }

    const address = this.BuildAddressPayload(this.billingAddress);
    if (address) {
      data.address = address;
    }

    if (this.billingPhone.full()) {
      data.phone = this.billingPhone.full();
    }

    const shipping = this.BuildShippingPayload();
    if (shipping) {
      data.shipping = shipping;
    }

    if (this.preferredLocale()) {
      data.preferred_locales = [this.preferredLocale()];
    }

    return data;
  }

  private BuildShippingPayload(): UpdateCustomerInput['shipping'] | undefined {
    if (this.shippingSameAsBilling()) {
      const address = this.BuildAddressPayload(this.billingAddress);
      const shippingName =
        this.name().trim() ||
        this.GetIndividualName() ||
        this.businessName().trim();
      if (!address && !this.billingPhone.full() && !shippingName) {
        return undefined;
      }
      if (!shippingName) {
        return undefined;
      }
      return {
        name: shippingName,
        address: address || {
          country: undefined,
          line1: undefined,
          line2: undefined,
          city: undefined,
          postal_code: undefined,
          state: undefined,
        },
        phone: this.billingPhone.full() || undefined,
      };
    }

    if (!this.HasShippingInput()) {
      return undefined;
    }

    const shippingName = this.shippingName().trim();
    if (!shippingName) {
      return undefined;
    }

    return {
      name: shippingName,
      address: this.BuildAddressPayload(this.shippingAddress) || {
        country: undefined,
        line1: undefined,
        line2: undefined,
        city: undefined,
        postal_code: undefined,
        state: undefined,
      },
      phone: this.shippingPhone.full() || undefined,
    };
  }

  private BuildAddressPayload(
    fields: AddressFields
  ): UpdateCustomerInput['address'] | undefined {
    if (!fields.visible()) return undefined;
    const country = fields.country().trim();
    const line1 = fields.line1().trim();
    const line2 = fields.line2().trim();
    const city = fields.city().trim();
    const postalCode = fields.postalCode().trim();
    const state = fields.state().trim();

    if (!country && !line1 && !line2 && !city && !postalCode && !state) {
      return undefined;
    }

    return {
      country: country || undefined,
      line1: line1 || undefined,
      line2: line2 || undefined,
      city: city || undefined,
      postal_code: postalCode || undefined,
      state: state || undefined,
    };
  }

  private HasShippingInput(): boolean {
    return !!(
      this.shippingName().trim() ||
      this.shippingPhone.full() ||
      this.HasAddressValues(this.shippingAddress)
    );
  }

  private HasAddressValues(fields: AddressFields): boolean {
    if (!fields.visible()) return false;
    return !!(
      fields.country().trim() ||
      fields.line1().trim() ||
      fields.line2().trim() ||
      fields.city().trim() ||
      fields.postalCode().trim() ||
      fields.state().trim()
    );
  }

  private GetIndividualName(): string {
    return `${this.firstName().trim()} ${this.lastName().trim()}`.trim();
  }

  private SyncDisplayNameFromAccount(): void {
    if (this.displayNameTouched) return;
    if (this.accountType() === 'individual') {
      this.name.set(this.GetIndividualName());
    } else {
      this.name.set(this.businessName().trim());
    }
  }

  private CreateAddressFields(): AddressFields {
    return {
      country: signal(''),
      line1: signal(''),
      line2: signal(''),
      city: signal(''),
      postalCode: signal(''),
      state: signal(''),
      visible: signal(true),
    };
  }

  private CreatePhoneFields(): PhoneFields {
    return {
      countryCode: signal('US'),
      number: signal(''),
      full: signal(''),
      error: signal(''),
    };
  }

  private SetAddressFields(
    fields: AddressFields,
    address: CustomerAddress | null | undefined
  ): void {
    if (address && this.AddressHasAnyValue(address)) {
      fields.visible.set(true);
      fields.country.set(address.country || '');
      fields.line1.set(address.line1 || '');
      fields.line2.set(address.line2 || '');
      fields.city.set(address.city || '');
      fields.postalCode.set(address.postal_code || '');
      fields.state.set(address.state || '');
    } else {
      this.ClearAddressFields(fields, false);
    }
  }

  private AddressHasAnyValue(address: CustomerAddress): boolean {
    return !!(
      address.country ||
      address.line1 ||
      address.line2 ||
      address.city ||
      address.postal_code ||
      address.state
    );
  }

  private ClearAddressFields(fields: AddressFields, visible: boolean): void {
    fields.country.set('');
    fields.line1.set('');
    fields.line2.set('');
    fields.city.set('');
    fields.postalCode.set('');
    fields.state.set('');
    fields.visible.set(visible);
  }

  private SetPhoneFields(
    phone: PhoneFields,
    fullPhone: string | null | undefined
  ): void {
    if (fullPhone) {
      this.ParseAndSetPhone(phone, fullPhone);
    } else {
      this.ClearPhoneFields(phone);
    }
  }

  private ClearPhoneFields(phone: PhoneFields): void {
    phone.countryCode.set('US');
    phone.number.set('');
    phone.full.set('');
    phone.error.set('');
  }

  private ParseAndSetPhone(phone: PhoneFields, fullPhone: string): void {
    const sortedCountries = [...ISO_CODES].sort(
      (a, b) => b.dialCode.length - a.dialCode.length
    );
    for (const country of sortedCountries) {
      if (fullPhone.startsWith(country.dialCode)) {
        phone.countryCode.set(country.code);
        phone.number.set(fullPhone.substring(country.dialCode.length).trim());
        this.UpdateFullPhone(phone);
        return;
      }
    }
    phone.number.set(fullPhone);
    this.UpdateFullPhone(phone);
  }

  private UpdateFullPhone(phone: PhoneFields): void {
    const dialCode = this.GetPhoneDialCode(phone);
    const number = phone.number().trim();
    if (number) {
      phone.full.set(`${dialCode}${number}`.trim());
    } else {
      phone.full.set('');
    }
  }

  private IsValidEmail(email: string): boolean {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }

  private EmitFormChange(): void {
    if (this.mode === 'create') {
      this.formChange.emit(this.CreateCustomerFormData());
    } else {
      this.formChange.emit(this.UpdateCustomerFormData());
    }
    this.validationChange.emit(this.IsValid());
  }
}
