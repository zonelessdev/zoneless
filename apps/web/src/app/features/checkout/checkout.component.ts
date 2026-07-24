import {
  ChangeDetectionStrategy,
  Component,
  inject,
  OnInit,
  signal,
  WritableSignal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import bs58 from 'bs58';

import { MetaService, SolanaWalletService } from '../../core';
import { CheckoutSessionService } from '../../data/services/checkout-session.service';
import { LoaderComponent, PageLoaderComponent } from '../../shared';
import { ISO_CODES } from '../../utils';
import {
  CheckoutSession,
  CheckoutSessionCustomField,
  CheckoutSessionLineItem,
  Price,
  Product,
} from '@zoneless/shared-types';
import {
  CheckoutCollectionOptions,
  CustomFieldLabel,
  GetCheckoutCollectionOptions,
} from './util/checkout-collection';
import {
  BuildCheckoutConfirmationSections,
  CheckoutConfirmationSection,
  DEFAULT_CHECKOUT_CONFIRMATION_MESSAGE,
  GetCheckoutConfirmationMessage,
  GetCheckoutRedirectUrl,
  HasCheckoutConfirmationDetails,
} from './util/checkout-completion';
import {
  FormatUsdcAmount,
  GetCheckoutSubmitLabel,
} from './util/checkout-format';

type PaymentPhase = 'idle' | 'awaiting_wallet' | 'processing' | 'complete';

type AddressFormValue = {
  name: string;
  country: string;
  line1: string;
  line2: string;
  city: string;
  state: string;
  postalCode: string;
};

type PreparedAddress = {
  line1?: string;
  line2?: string;
  city?: string;
  state?: string;
  postal_code?: string;
  country?: string;
};

function EmptyAddressForm(): AddressFormValue {
  return {
    name: '',
    country: '',
    line1: '',
    line2: '',
    city: '',
    state: '',
    postalCode: '',
  };
}

function HasAddressDetails(form: AddressFormValue): boolean {
  return !!(
    form.line2.trim() ||
    form.city.trim() ||
    form.state.trim() ||
    form.postalCode.trim()
  );
}

@Component({
  selector: 'app-checkout',
  imports: [FormsModule, PageLoaderComponent, LoaderComponent],
  templateUrl: './checkout.component.html',
  styleUrl: './checkout.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CheckoutComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly checkoutSessionService = inject(CheckoutSessionService);
  private readonly metaService = inject(MetaService);
  private readonly solanaWalletService = inject(SolanaWalletService);

  checkoutSession: WritableSignal<CheckoutSession | null> = signal(null);
  loading: WritableSignal<boolean> = signal(true);
  paymentPhase: WritableSignal<PaymentPhase> = signal('idle');
  paymentError: WritableSignal<string | null> = signal(null);
  confirmationExpanded: WritableSignal<boolean> = signal(false);
  billingAddressExpanded: WritableSignal<boolean> = signal(false);
  shippingAddressExpanded: WritableSignal<boolean> = signal(false);

  readonly countryOptions = [...ISO_CODES].sort((a, b) =>
    a.country.localeCompare(b.country)
  );

  email = '';
  name = '';
  businessName = '';
  phone = '';
  billingAddress = EmptyAddressForm();
  shippingAddress = EmptyAddressForm();
  taxId = '';
  promotionCode = '';
  termsAccepted = false;
  customFieldValues: Record<string, string> = {};

  async ngOnInit(): Promise<void> {
    const urlSlug = this.route.snapshot.paramMap.get('checkoutSessionId');
    if (!urlSlug) return;
    await this.LoadCheckoutSession(urlSlug);
  }

  private async LoadCheckoutSession(urlSlug: string): Promise<void> {
    this.loading.set(true);
    try {
      const checkoutSession =
        await this.checkoutSessionService.GetPublicCheckoutSession(urlSlug);
      this.checkoutSession.set(checkoutSession);
      this.email =
        checkoutSession.customer_email ??
        checkoutSession.customer_details?.email ??
        '';
      this.name =
        checkoutSession.customer_details?.individual_name ??
        checkoutSession.collected_information?.individual_name ??
        '';
      this.businessName =
        checkoutSession.customer_details?.business_name ??
        checkoutSession.collected_information?.business_name ??
        '';
      this.phone = checkoutSession.customer_details?.phone ?? '';
      this.billingAddress = this.ToAddressForm(
        checkoutSession.customer_details?.address
      );
      const shipping = checkoutSession.collected_information?.shipping_details;
      this.shippingAddress = this.ToAddressForm(
        shipping?.address,
        shipping?.name
      );
      this.billingAddressExpanded.set(HasAddressDetails(this.billingAddress));
      this.shippingAddressExpanded.set(HasAddressDetails(this.shippingAddress));
      this.taxId = checkoutSession.customer_details?.tax_ids?.[0]?.value ?? '';
      this.customFieldValues = Object.fromEntries(
        (checkoutSession.custom_fields ?? []).map((field) => [
          field.key,
          this.CustomFieldValue(field),
        ])
      );
      this.metaService.SetMetaTitle(`${this.MerchantName()} - Checkout`);
      if (checkoutSession.status === 'complete') {
        this.paymentPhase.set('complete');
        this.HandleAfterCompletion(checkoutSession);
      }
    } finally {
      this.loading.set(false);
    }
  }

  CollectionOptions(): CheckoutCollectionOptions {
    const session = this.checkoutSession();
    if (!session) {
      return {
        collectCustomerNames: false,
        collectBusinessNames: false,
        collectBillingAddresses: false,
        collectShippingAddresses: false,
        collectPhone: false,
        allowPromotionCodes: false,
        requireTerms: false,
        collectTaxIds: false,
      };
    }
    return GetCheckoutCollectionOptions(session);
  }

  IsEmailLocked(): boolean {
    return !!this.checkoutSession()?.customer && !!this.email.trim();
  }

  CustomFields(): CheckoutSessionCustomField[] {
    return this.checkoutSession()?.custom_fields ?? [];
  }

  readonly FieldLabel = CustomFieldLabel;

  LineItems(): CheckoutSessionLineItem[] {
    return this.checkoutSession()?.line_items?.data ?? [];
  }

  MerchantName(): string {
    return this.checkoutSession()?.merchant?.display_name || 'Merchant';
  }

  MerchantIconUrl(): string | null {
    return this.checkoutSession()?.merchant?.icon_url ?? null;
  }

  MerchantTermsUrl(): string | null {
    return this.checkoutSession()?.merchant?.terms_url ?? null;
  }

  MerchantPrivacyUrl(): string | null {
    return this.checkoutSession()?.merchant?.privacy_url ?? null;
  }

  IsSubscription(): boolean {
    return this.checkoutSession()?.mode === 'subscription';
  }

  RecurringIntervalLabel(): string | null {
    const price = this.PrimaryPrice();
    const interval = price?.recurring?.interval;
    if (!interval) return null;
    const count = price?.recurring?.interval_count ?? 1;
    if (count === 1) return interval;
    return `${count} ${interval}s`;
  }

  PrimaryPrice(): Price | null {
    const price = this.LineItems()[0]?.price;
    if (!price || typeof price === 'string') return null;
    return price;
  }

  LineItemCadence(item: CheckoutSessionLineItem): string | null {
    const price = item.price;
    if (!price || typeof price === 'string' || !price.recurring) return null;
    const count = price.recurring.interval_count ?? 1;
    const interval = price.recurring.interval;
    if (count === 1) return `every ${interval}`;
    return `every ${count} ${interval}s`;
  }

  IsBusy(): boolean {
    const phase = this.paymentPhase();
    return phase === 'awaiting_wallet' || phase === 'processing';
  }

  IsComplete(): boolean {
    return this.paymentPhase() === 'complete';
  }

  async Pay(): Promise<void> {
    const session = this.checkoutSession();
    if (!session || this.paymentPhase() !== 'idle') return;

    const validationError = this.ValidateCollectedDetails();
    if (validationError) {
      this.paymentError.set(validationError);
      return;
    }

    this.paymentPhase.set('awaiting_wallet');
    this.paymentError.set(null);

    try {
      if (!this.solanaWalletService.GetAddress()) {
        await this.solanaWalletService.Connect();
      }
      const payerWallet = this.solanaWalletService.GetAddress();
      if (!payerWallet) {
        throw new Error('Connect a wallet to pay');
      }

      const completedSession = await this.PayWithWallet(session, payerWallet);

      this.checkoutSession.set(completedSession);
      this.paymentPhase.set('complete');
      this.HandleAfterCompletion(completedSession);
    } catch (error) {
      this.paymentError.set(this.ErrorMessage(error));
      this.paymentPhase.set('idle');
    }
  }

  ConfirmationMessage(): string {
    const session = this.checkoutSession();
    if (!session) return DEFAULT_CHECKOUT_CONFIRMATION_MESSAGE;
    return GetCheckoutConfirmationMessage(session);
  }

  ConfirmationSubtitle(): string {
    return `A payment to ${this.MerchantName()} will appear on your statement.`;
  }

  ConfirmationSections(): CheckoutConfirmationSection[] {
    const session = this.checkoutSession();
    if (!session) return [];
    return BuildCheckoutConfirmationSections(session, (cents) =>
      this.FormatAmount(cents)
    );
  }

  VisibleConfirmationSections(): CheckoutConfirmationSection[] {
    const sections = this.ConfirmationSections();
    if (this.confirmationExpanded()) return sections;
    return sections.filter((section) => !section.detailOnly);
  }

  CanExpandConfirmation(): boolean {
    return HasCheckoutConfirmationDetails(this.ConfirmationSections());
  }

  ToggleConfirmationDetails(): void {
    this.confirmationExpanded.update((expanded) => !expanded);
  }

  IsRedirecting(): boolean {
    const session = this.checkoutSession();
    return !!session && !!GetCheckoutRedirectUrl(session);
  }

  ExpandBillingAddress(): void {
    this.billingAddressExpanded.set(true);
  }

  ExpandShippingAddress(): void {
    this.shippingAddressExpanded.set(true);
  }

  private ValidateCollectedDetails(): string | null {
    const session = this.checkoutSession();
    const options = this.CollectionOptions();
    if (!this.email.trim()) return 'Email is required';
    if (
      options.collectCustomerNames &&
      !session?.name_collection?.individual?.optional &&
      !this.name.trim()
    ) {
      return 'Name is required';
    }
    if (
      options.collectBusinessNames &&
      !session?.name_collection?.business?.optional &&
      !this.businessName.trim()
    ) {
      return 'Business name is required';
    }
    if (options.collectPhone && !this.phone.trim()) {
      return 'Phone number is required';
    }
    if (options.collectBillingAddresses) {
      const billingError = this.ValidateAddressForm(
        this.billingAddress,
        'Billing address'
      );
      if (billingError) {
        this.billingAddressExpanded.set(true);
        return billingError;
      }
    }
    if (options.collectShippingAddresses) {
      if (!this.shippingAddress.name.trim()) {
        return 'Shipping name is required';
      }
      const shippingError = this.ValidateAddressForm(
        this.shippingAddress,
        'Shipping address'
      );
      if (shippingError) {
        this.shippingAddressExpanded.set(true);
        return shippingError;
      }
    }
    if (
      options.collectTaxIds &&
      session?.tax_id_collection?.required === 'if_supported' &&
      !this.taxId.trim()
    ) {
      return 'Tax ID is required';
    }
    if (options.requireTerms && !this.termsAccepted) {
      return 'Please accept the Terms of Service';
    }
    for (const field of this.CustomFields()) {
      if (field.optional) continue;
      if (!this.customFieldValues[field.key]?.trim()) {
        return `${this.FieldLabel(field)} is required`;
      }
    }
    return null;
  }

  private async PayWithWallet(
    session: CheckoutSession,
    payerWallet: string
  ): Promise<CheckoutSession> {
    const chain = session.livemode ? 'solana:mainnet' : 'solana:devnet';
    // First-time subscribers need init_authority then subscribe (2 wallet
    // approvals). Allow a couple of blockhash retries on top of that.
    const maxAttempts = this.IsSubscription() ? 5 : 2;
    let initAuthorityDone = false;
    let lastError: unknown;

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      try {
        this.paymentPhase.set('awaiting_wallet');
        const prepared = await this.checkoutSessionService.PreparePayment(
          session.url_slug,
          payerWallet,
          this.BuildCustomerDetailsPayload()
        );

        if (prepared.already_subscribed) {
          this.paymentPhase.set('processing');
          return this.checkoutSessionService.ConfirmPayment(session.url_slug, {
            already_subscribed: true,
            subscription_delegation_pda: prepared.subscription_delegation_pda,
          });
        }

        if (prepared.subscription_step === 'init_authority') {
          if (initAuthorityDone) {
            throw new Error(
              'Subscription authority init did not land. Please try again.'
            );
          }
          await this.SignAndConfirmPrepared(session, prepared, chain);
          initAuthorityDone = true;
          continue;
        }

        return await this.SignAndConfirmPrepared(session, prepared, chain);
      } catch (error) {
        lastError = error;
        if (
          this.IsSubscription() &&
          this.IsRetryableSubscribeBroadcastError(error)
        ) {
          continue;
        }
        throw error;
      }
    }
    throw lastError;
  }

  private BuildCustomerDetailsPayload(): {
    email?: string;
    name?: string;
    business_name?: string;
    phone?: string;
    address?: PreparedAddress;
    shipping_address?: PreparedAddress & { name?: string };
    tax_id?: string;
    custom_fields?: { key: string; value: string }[];
    terms_of_service_accepted?: boolean;
  } {
    const options = this.CollectionOptions();
    const customFields = this.CustomFields()
      .map((field) => ({
        key: field.key,
        value: this.customFieldValues[field.key]?.trim() ?? '',
      }))
      .filter((field) => field.value);

    return {
      ...(this.email.trim() ? { email: this.email.trim() } : {}),
      ...(options.collectCustomerNames && this.name.trim()
        ? { name: this.name.trim() }
        : {}),
      ...(options.collectBusinessNames && this.businessName.trim()
        ? { business_name: this.businessName.trim() }
        : {}),
      ...(options.collectPhone && this.phone.trim()
        ? { phone: this.phone.trim() }
        : {}),
      ...(options.collectBillingAddresses
        ? { address: this.ToPreparedAddress(this.billingAddress) }
        : {}),
      ...(options.collectShippingAddresses
        ? {
            shipping_address: {
              ...this.ToPreparedAddress(this.shippingAddress),
              ...(this.shippingAddress.name.trim()
                ? { name: this.shippingAddress.name.trim() }
                : {}),
            },
          }
        : {}),
      ...(options.collectTaxIds && this.taxId.trim()
        ? { tax_id: this.taxId.trim() }
        : {}),
      ...(customFields.length > 0 ? { custom_fields: customFields } : {}),
      ...(options.requireTerms && this.termsAccepted
        ? { terms_of_service_accepted: true }
        : {}),
    };
  }

  private ToAddressForm(
    address?: {
      country?: string | null;
      line1?: string | null;
      line2?: string | null;
      city?: string | null;
      state?: string | null;
      postal_code?: string | null;
    } | null,
    name?: string | null
  ): AddressFormValue {
    return {
      name: name ?? '',
      country: address?.country ?? '',
      line1: address?.line1 ?? '',
      line2: address?.line2 ?? '',
      city: address?.city ?? '',
      state: address?.state ?? '',
      postalCode: address?.postal_code ?? '',
    };
  }

  private ToPreparedAddress(form: AddressFormValue): PreparedAddress {
    return {
      ...(form.line1.trim() ? { line1: form.line1.trim() } : {}),
      ...(form.line2.trim() ? { line2: form.line2.trim() } : {}),
      ...(form.city.trim() ? { city: form.city.trim() } : {}),
      ...(form.state.trim() ? { state: form.state.trim() } : {}),
      ...(form.postalCode.trim()
        ? { postal_code: form.postalCode.trim() }
        : {}),
      ...(form.country.trim()
        ? { country: form.country.trim().toUpperCase() }
        : {}),
    };
  }

  private ValidateAddressForm(
    form: AddressFormValue,
    label: string
  ): string | null {
    if (!form.country.trim()) return `${label} country is required`;
    if (!form.line1.trim()) return `${label} line 1 is required`;
    if (!form.city.trim()) return `${label} city is required`;
    if (!form.postalCode.trim()) return `${label} postal code is required`;
    return null;
  }

  private CustomFieldValue(field: CheckoutSessionCustomField): string {
    if (field.type === 'dropdown') {
      return field.dropdown?.value ?? field.dropdown?.default_value ?? '';
    }
    if (field.type === 'numeric') {
      return field.numeric?.value ?? field.numeric?.default_value ?? '';
    }
    return field.text?.value ?? field.text?.default_value ?? '';
  }

  private async SignAndConfirmPrepared(
    session: CheckoutSession,
    prepared: {
      unsigned_transaction: string;
      fee_sponsored?: boolean;
      subscription_step?: 'init_authority' | 'subscribe';
    },
    chain: 'solana:mainnet' | 'solana:devnet'
  ): Promise<CheckoutSession> {
    if (prepared.fee_sponsored) {
      const signedTxBytes =
        await this.solanaWalletService.SignUnsignedTransaction(
          prepared.unsigned_transaction,
          chain
        );
      this.paymentPhase.set('processing');
      return this.checkoutSessionService.ConfirmPayment(session.url_slug, {
        signed_transaction:
          this.solanaWalletService.BytesToBase64(signedTxBytes),
        ...(prepared.subscription_step
          ? { subscription_step: prepared.subscription_step }
          : {}),
      });
    }

    const signatureBytes =
      await this.solanaWalletService.SignAndSendUnsignedTransaction(
        prepared.unsigned_transaction,
        chain
      );
    this.paymentPhase.set('processing');
    return this.checkoutSessionService.ConfirmPayment(session.url_slug, {
      signature: bs58.encode(signatureBytes),
      ...(prepared.subscription_step
        ? { subscription_step: prepared.subscription_step }
        : {}),
    });
  }

  private IsRetryableSubscribeBroadcastError(error: unknown): boolean {
    const message =
      error instanceof Error
        ? error.message
        : typeof error === 'string'
        ? error
        : '';
    return /blockhash not found|expired|already been processed|not found on-chain|may not be confirmed yet/i.test(
      message
    );
  }

  private HandleAfterCompletion(session: CheckoutSession): void {
    const redirectUrl = GetCheckoutRedirectUrl(session);
    if (!redirectUrl) return;
    window.setTimeout(() => window.location.assign(redirectUrl), 1200);
  }

  private ErrorMessage(error: unknown): string {
    if (error instanceof Error && error.message) return error.message;
    return this.IsSubscription()
      ? 'Something went wrong starting your subscription. Please try again.'
      : 'Something went wrong processing your payment. Please try again.';
  }

  LineItemImage(item: CheckoutSessionLineItem): string | null {
    const product = item.price?.product;
    if (product && typeof product === 'object') {
      return (product as Product).images?.[0] ?? null;
    }
    return null;
  }

  readonly FormatAmount = FormatUsdcAmount;

  DiscountAmount(): number {
    return this.checkoutSession()?.total_details?.amount_discount ?? 0;
  }

  DiscountLabel(): string {
    const discounts =
      this.checkoutSession()?.total_details?.breakdown?.discounts ?? [];
    const discount = discounts[0]?.discount;
    return discount?.promotion_code ?? discount?.source?.coupon ?? 'Discount';
  }

  DiscountPercent(): number | null {
    const subtotal = this.checkoutSession()?.amount_subtotal ?? 0;
    const discount = this.DiscountAmount();
    if (subtotal <= 0 || discount <= 0) return null;
    return Math.round((discount / subtotal) * 100);
  }

  SubmitLabel(): string {
    return GetCheckoutSubmitLabel(
      this.checkoutSession()?.submit_type,
      this.IsSubscription()
    );
  }

  BusyLabel(): string {
    return this.paymentPhase() === 'awaiting_wallet'
      ? 'Confirm in wallet'
      : 'Processing';
  }

  SummaryHeading(): string {
    return this.IsSubscription()
      ? `Subscribe to ${this.MerchantName()}`
      : `Pay ${this.MerchantName()}`;
  }

  MethodDetailLabel(): string {
    return this.IsSubscription()
      ? 'Subscribing with USDC on Solana'
      : 'Paying with USDC on Solana';
  }

  MethodHelpText(): string {
    const amount = this.FormatAmount(this.checkoutSession()?.amount_total);
    if (this.IsSubscription()) {
      const cadence = this.RecurringIntervalLabel();
      return cadence
        ? `Connect your wallet to authorize recurring ${amount} USDC every ${cadence}. First-time wallets approve twice.`
        : `Connect your wallet to authorize this recurring USDC subscription. First-time wallets approve twice.`;
    }
    return `Connect your wallet and approve the payment of ${amount} in USDC.`;
  }

  FinePrintVerb(): string {
    return this.IsSubscription() ? 'subscribing' : 'paying';
  }

  TotalDueLabel(): string {
    return this.IsSubscription() ? 'Total due today' : 'Total due';
  }
}
