import { SubscriptionItemList } from './SubscriptionItem';

/**
 * Stripe-compatible Customer object for Zoneless.
 * Represents a customer of the business.
 *
 * @see https://docs.stripe.com/api/customers/object
 */
export interface Customer {
  /** Unique identifier for the object. */
  id: string;
  /** String representing the object's type. Objects of the same type share the same value. */
  object: 'customer';
  /** The customer's address. */
  address: CustomerAddress | null;
  /**
   * The current balance, if any, that's stored on the customer in their default currency. If
   * negative, the customer has credit to apply to their next invoice. If positive, the customer
   * has an amount owed that's added to their next invoice. The balance only considers amounts
   * that Zoneless hasn't successfully applied to any invoice. It doesn't reflect unpaid
   * invoices. This balance is only taken into account after invoices finalize. For
   * multi-currency balances, see `invoice_credit_balance`.
   */
  balance: number;
  /** The customer's business name. The maximum length is 150 characters. */
  business_name: string | null;
  /**
   * The current funds being held on behalf of the customer. You can apply these funds towards
   * payment intents when the source is "cash_balance". The `settings.reconciliation_mode`
   * field describes if these funds apply to these payment intents manually or automatically.
   */
  cash_balance: CustomerCashBalance | null;
  /** Time at which the object was created. Measured in seconds since the Unix epoch. */
  created: number;
  /** Three-letter ISO code for the currency the customer can be charged in for recurring billing purposes. */
  currency: string | null;
  /** The ID of an Account representing a customer. You can use this ID with any v1 API that accepts a customer_account parameter. */
  customer_account: string | null;
  /**
   * ID of the default payment source for the customer.
   * If you use payment methods created through the PaymentMethods API, see the
   * `invoice_settings.default_payment_method` field instead.
   */
  default_source: string | null;
  /**
   * Tracks the most recent state change on any invoice belonging to the customer. Paying an
   * invoice or marking it uncollectible via the API will set this field to false. An automatic
   * payment failure or passing the invoice's `due_date` will set this field to true.
   *
   * If an invoice becomes uncollectible by dunning, `delinquent` doesn't reset to false.
   *
   * If you care whether the customer has paid their most recent subscription invoice, use
   * `subscription.status` instead.
   */
  delinquent: boolean | null;
  /** An arbitrary string attached to the object. Often useful for displaying to users. */
  description: string | null;
  /** Describes the current discount active on the customer, if there is one. */
  discount: CustomerDiscount | null;
  /** The customer's email address. */
  email: string | null;
  /** The customer's individual name. The maximum length is 150 characters. */
  individual_name: string | null;
  /**
   * The current multi-currency balances, if any, that's stored on the customer. If positive in
   * a currency, the customer has a credit to apply to their next invoice denominated in that
   * currency. If negative, the customer has an amount owed that's added to their next invoice
   * denominated in that currency. Keyed by three-letter currency code.
   */
  invoice_credit_balance: Record<string, number>;
  /** The prefix for the customer used to generate unique invoice numbers. */
  invoice_prefix: string | null;
  /** The customer's default invoice settings. */
  invoice_settings: CustomerInvoiceSettings;
  /** If the object exists in live mode, the value is true. If the object exists in test mode, the value is false. */
  livemode: boolean;
  /** Set of key-value pairs that you can attach to an object. This can be useful for storing additional information about the object in a structured format. */
  metadata: Record<string, string>;
  /** The customer's full name or business name. */
  name: string | null;
  /**
   * The suffix of the customer's next invoice number (for example, 0001). When the account uses
   * account level sequencing, this parameter is ignored in API requests and the field omitted
   * in API responses.
   */
  next_invoice_sequence: number | null;
  /** The customer's phone number. */
  phone: string | null;
  /** The customer's preferred locales (languages), ordered by preference. */
  preferred_locales: string[] | null;
  /** Mailing and shipping address for the customer. Appears on invoices emailed to this customer. */
  shipping: CustomerShipping | null;
  /**
   * The customer's payment sources, if any.
   * @remarks For Zoneless these represent linked wallets, equivalent to Stripe's bank account sources.
   */
  sources: CustomerSourceList | null;
  /** The customer's current subscriptions, if any. */
  subscriptions: CustomerSubscriptionList | null;
  /** Tax details for the customer. */
  tax: CustomerTax;
  /**
   * Describes the customer's tax exemption status, which is none, exempt, or reverse. When set
   * to reverse, invoice and receipt PDFs include the following text: "Reverse charge".
   */
  tax_exempt: 'exempt' | 'none' | 'reverse' | null;
  /** The customer's tax IDs. */
  tax_ids: CustomerTaxIdList | null;
  /** ID of the test clock that this customer belongs to. */
  test_clock: string | null;

  /**
   * The platform account that owns this resource.
   * @zoneless_extension
   */
  platform_account: string;
}

/**
 * Deleted customer response object.
 */
export interface CustomerDeleted {
  /** Unique identifier for the object */
  id: string;
  /** String representing the object's type */
  object: 'customer';
  /** Always true for a deleted object */
  deleted: true;
}

// ─────────────────────────────────────────────────────────────────────────────
// Address & Shipping
// ─────────────────────────────────────────────────────────────────────────────

/** Address details for a customer. */
export interface CustomerAddress {
  /** City, district, suburb, town, or village. */
  city: string | null;
  /** Two-letter country code (ISO 3166-1 alpha-2). */
  country: string | null;
  /** Address line 1, such as the street, PO Box, or company name. */
  line1: string | null;
  /** Address line 2, such as the apartment, suite, unit, or building. */
  line2: string | null;
  /** ZIP or postal code. */
  postal_code: string | null;
  /** State, county, province, or region (ISO 3166-2). */
  state: string | null;
}

/** Mailing and shipping address for the customer. */
export interface CustomerShipping {
  /** Customer shipping address. */
  address: CustomerAddress;
  /** Customer name. */
  name: string | null;
  /** Customer phone (including extension). */
  phone: string | null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Cash Balance
// ─────────────────────────────────────────────────────────────────────────────

/** The current funds being held on behalf of the customer, denominated in USDC. */
export interface CustomerCashBalance {
  /** String representing the object's type. Objects of the same type share the same value. */
  object: 'cash_balance';
  /**
   * A hash of all cash balances available to this customer, keyed by three-letter currency
   * code. You cannot delete a customer with any cash balances, even if the balance is 0.
   * Amounts are represented in the smallest currency unit.
   */
  available: Record<string, number> | null;
  /** The ID of the customer whose cash balance this object represents. */
  customer: string;
  /** The ID of an Account representing a customer whose cash balance this object represents. */
  customer_account: string | null;
  /** If the object exists in live mode, the value is true. If the object exists in test mode, the value is false. */
  livemode: boolean;
  /** A hash of settings for this cash balance. */
  settings: {
    /** The configuration for how funds that land in the customer cash balance are reconciled. */
    reconciliation_mode: 'automatic' | 'manual';
    /** A flag to indicate if reconciliation mode returned is the user's default or is specific to this customer cash balance. */
    using_merchant_default: boolean;
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Discount
// ─────────────────────────────────────────────────────────────────────────────

/** Describes a discount currently active on a customer, subscription, or subscription item. */
export interface CustomerDiscount {
  /** The ID of the discount object. Discounts can't be fetched by ID. Use expand[]=discounts in API calls to expand discount IDs in an array. */
  id: string;
  /** String representing the object's type. Objects of the same type share the same value. */
  object: 'discount';
  /** The Checkout session that this coupon is applied to, if it is applied to a particular session in payment mode. Not present for subscription mode. */
  checkout_session: string | null;
  /** The ID of the customer associated with this discount. */
  customer: string | null;
  /** The ID of the account representing the customer associated with this discount. */
  customer_account: string | null;
  /** If the coupon has a duration of repeating, the date that this discount will end. If the coupon has a duration of once or forever, this attribute will be null. */
  end: number | null;
  /** The invoice that the discount's coupon was applied to, if it was applied directly to a particular invoice. */
  invoice: string | null;
  /** The invoice item id (or invoice line item id for invoice line items of type=subscription) that the discount's coupon was applied to. */
  invoice_item: string | null;
  /** The promotion code applied to create this discount. */
  promotion_code: string | null;
  /** The source of the discount. */
  source: {
    /** The coupon that was redeemed to create this discount. */
    coupon: string | null;
    /** The source type of the discount. */
    type: 'coupon';
  };
  /** Date that the coupon was applied. */
  start: number;
  /** The subscription that this coupon is applied to, if it is applied to a particular subscription. */
  subscription: string | null;
  /** The subscription item that this coupon is applied to, if it is applied to a particular subscription item. */
  subscription_item: string | null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Invoice Settings
// ─────────────────────────────────────────────────────────────────────────────

/** A customer's or subscription's default invoice settings. */
export interface CustomerInvoiceSettings {
  /** Default custom fields to be displayed on invoices for this customer. */
  custom_fields: CustomerInvoiceCustomField[] | null;
  /** ID of a payment method that's attached to the customer, to be used as the customer's default payment method for subscriptions and invoices. */
  default_payment_method: string | null;
  /** Default footer to be displayed on invoices for this customer. */
  footer: string | null;
  /** Default options for invoice PDF rendering for this customer. */
  rendering_options: {
    /** How line-item prices and amounts will be displayed with respect to tax on invoice PDFs. */
    amount_tax_display: string | null;
    /** ID of the invoice rendering template to be used for this customer's invoices. If set, the template will be used on all invoices for this customer unless a template is set directly on the invoice. */
    template: string | null;
  } | null;
}

export interface CustomerInvoiceCustomField {
  /** The name of the custom field. */
  name: string;
  /** The value of the custom field. */
  value: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Sources (legacy payment sources)
// ─────────────────────────────────────────────────────────────────────────────

/** The customer's payment sources, if any. */
export interface CustomerSourceList {
  /** String representing the object's type. Objects of the same type share the same value. Always has the value list. */
  object: 'list';
  /** Details about each object. */
  data: CustomerSource[];
  /** True if this list has another page of items after this one that can be fetched. */
  has_more: boolean;
  /** The URL where this list can be accessed. */
  url: string;
}

/**
 * A payment source attached to a customer.
 * @remarks Zoneless customers pay from linked Solana wallets rather than bank accounts, so
 * this shape mirrors Stripe's bank account source with wallet-specific field meanings noted below.
 */
export interface CustomerSource {
  /** Unique identifier for the object. */
  id: string;
  /** String representing the object's type. Objects of the same type share the same value. */
  object: string;
  /** The account this wallet belongs to. Only applicable on Accounts (not customers or recipients). */
  account: string | null;
  /** The name of the person or business that owns the wallet. */
  account_holder_name: string | null;
  /** The type of entity that holds the account. This can be either individual or company. */
  account_holder_type: 'individual' | 'company' | null;
  /** @zoneless_extension The Solana account type. Equivalent to Stripe's bank account_type. */
  account_type: string | null;
  /** A set of available payout methods for this wallet. Only values from this set should be passed as the method when creating a payout. */
  available_payout_methods: ['standard' | 'instant'] | null;
  /** @zoneless_extension Name of the wallet provider associated with the address (e.g., PHANTOM). Equivalent to Stripe's bank_name. */
  bank_name: string | null;
  /** Two-letter ISO code representing the country the wallet's owner is located in. */
  country: string;
  /** Three-letter ISO code for the currency paid out to the wallet. */
  currency: 'usdc';
  /** The ID of the customer that the wallet is associated with. */
  customer: string | null;
  /** Uniquely identifies this particular wallet. You can use this attribute to check whether two wallets are the same. */
  fingerprint: string | null;
  /** The last four characters of the wallet's public address. */
  last4: string;
  /** Set of key-value pairs that you can attach to an object. This can be useful for storing additional information about the object in a structured format. */
  metadata: Record<string, string> | null;
  /** @zoneless_extension Not applicable to Solana wallets; retained for Stripe API parity. */
  routing_number: string | null;
  /**
   * For wallets, possible values are new, validated, verified, verification_failed,
   * tokenized_account_number_deactivated or errored. A wallet that hasn't had any activity or
   * validation performed is new. If Zoneless can determine that the wallet exists, its status
   * will be validated. If customer wallet ownership verification has succeeded, the status will
   * be verified. If the verification failed for any reason, the status will be
   * verification_failed. If a payout sent to this wallet fails, we'll set the status to errored
   * and will not continue to send scheduled payouts until the wallet details are updated.
   */
  status:
    | 'new'
    | 'validated'
    | 'verified'
    | 'verification_failed'
    | 'tokenized_account_number_deactivated'
    | 'errored';
}

// ─────────────────────────────────────────────────────────────────────────────
// Tax
// ─────────────────────────────────────────────────────────────────────────────

/** Tax details for the customer. */
export interface CustomerTax {
  /** Surfaces if automatic tax computation is possible given the current customer location information. */
  automatic_tax:
    | 'failed'
    | 'not_collecting'
    | 'supported'
    | 'unrecognized_location';
  /** A recent IP address of the customer used for tax reporting and tax location inference. */
  ip_address: string | null;
  /** The identified tax location of the customer. */
  location: {
    /** The identified tax country of the customer. */
    country: string | null;
    /** The data source used to infer the customer's location. */
    source: string | null;
    /** The identified tax state, county, province, or region of the customer. */
    state: string | null;
  } | null;
  /** The tax calculation provider used for location resolution. Always zoneless, since Zoneless does not support third-party tax providers. */
  provider: 'zoneless';
}

/**
 * A tax rate that can be applied to a subscription, subscription item, or invoice line item.
 * @remarks Simplified from Stripe's TaxRate object, which supports 40+ jurisdiction-specific
 * tax_type values; kept as a plain string here for maintainability.
 */
export interface CustomerTaxRate {
  /** Unique identifier for the object. */
  id: string;
  /** String representing the object's type. Objects of the same type share the same value. */
  object: 'tax_rate';
  /** Defaults to true. When set to false, this tax rate cannot be used with new applications or Checkout Sessions, but will still work for subscriptions and invoices that already have it set. */
  active: boolean;
  /** Two-letter country code (ISO 3166-1 alpha-2). */
  country: string | null;
  /** Time at which the object was created. Measured in seconds since the Unix epoch. */
  created: number;
  /** An arbitrary string attached to the tax rate for your internal use only. It will not be visible to your customers. */
  description: string | null;
  /** The display name of the tax rate as it will appear to your customer on their receipt email, PDF, and the hosted invoice page. */
  display_name: string;
  /** This specifies if the tax rate is inclusive or exclusive. */
  inclusive: boolean;
  /** The jurisdiction for the tax rate. You can use this label field for tax reporting purposes. It also appears on your customer's invoice. */
  jurisdiction: string | null;
  /** If the object exists in live mode, the value is true. If the object exists in test mode, the value is false. */
  livemode: boolean;
  /** Set of key-value pairs that you can attach to an object. This can be useful for storing additional information about the object in a structured format. */
  metadata: Record<string, string> | null;
  /** Tax rate percentage out of 100. */
  percentage: number;
  /** ISO 3166-2 subdivision code, without country prefix. For example, "NY" for New York, United States. */
  state: string | null;
  /** The high-level tax type, such as vat or sales_tax. See Stripe's tax_type enum for the full list of supported values. */
  tax_type: string | null;
}

/** The customer's tax IDs. */
export interface CustomerTaxIdList {
  /** String representing the object's type. Objects of the same type share the same value. Always has the value list. */
  object: 'list';
  /** Details about each object. */
  data: CustomerTaxId[];
  /** True if this list has another page of items after this one that can be fetched. */
  has_more: boolean;
  /** The URL where this list can be accessed. */
  url: string;
}

export interface CustomerTaxId {
  /** Unique identifier for the object. */
  id: string;
  /** String representing the object's type. Objects of the same type share the same value. */
  object: 'tax_id';
  /** Two-letter ISO code representing the country of the tax ID. */
  country: string | null;
  /** Time at which the object was created. Measured in seconds since the Unix epoch. */
  created: number;
  /** ID of the customer. */
  customer: string | null;
  /** ID of the Account representing the customer. */
  customer_account: string | null;
  /** If the object exists in live mode, the value is true. If the object exists in test mode, the value is false. */
  livemode: boolean;
  /** The account or customer the tax ID belongs to. */
  owner: {
    /** The account being referenced when type is account. */
    account: string | null;
    /** The Connect Application being referenced when type is application. */
    application: string | null;
    /** The customer being referenced when type is customer. */
    customer: string | null;
    /** The Account representing the customer being referenced when type is customer. */
    customer_account: string | null;
    /** Type of owner referenced. */
    type: 'account' | 'application' | 'customer' | 'self';
  } | null;
  /**
   * Type of the tax ID, e.g. us_ein, eu_vat, gb_vat, jp_trn. Stripe supports 100+
   * country-specific values; kept as a plain string here for maintainability.
   */
  type: string;
  /** Value of the tax ID. */
  value: string;
  /** Tax ID verification information. */
  verification: {
    /** Verification status, one of pending, verified, unverified, or unavailable. */
    status: 'pending' | 'unavailable' | 'unverified' | 'verified';
    /** Verified address. */
    verified_address: string | null;
    /** Verified name. */
    verified_name: string | null;
  } | null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Subscriptions
// ─────────────────────────────────────────────────────────────────────────────

/** The customer's current subscriptions, if any. */
export interface CustomerSubscriptionList {
  /** String representing the object's type. Objects of the same type share the same value. Always has the value list. */
  object: 'list';
  /** Details about each object. */
  data: CustomerSubscription[];
  /** True if this list has another page of items after this one that can be fetched. */
  has_more: boolean;
  /** The URL where this list can be accessed. */
  url: string;
}

/**
 * A subscription tying a customer to one or more recurring prices.
 * @remarks Simplified from Stripe's Subscription object, which exposes dozens of
 * region-specific `payment_settings.payment_method_options` (ACH, iDEAL, Konbini, etc.) that
 * don't apply to Zoneless, since all subscriptions are settled in USDC.
 */
export interface CustomerSubscription {
  /** Unique identifier for the object. */
  id: string;
  /** String representing the object's type. Objects of the same type share the same value. */
  object: 'subscription';
  /** ID of the Connect Application that created the subscription. */
  application: string | null;
  /** A non-negative decimal between 0 and 100, with at most two decimal places. This represents the percentage of the subscription invoice total that will be transferred to the application owner's account. */
  application_fee_percent: number | null;
  /** Automatic tax settings for this subscription. */
  automatic_tax: {
    /** If Zoneless disabled automatic tax, this enum describes why. */
    disabled_reason: 'requires_location_inputs' | null;
    /** Whether Zoneless automatically computes tax on this subscription. */
    enabled: boolean;
    /** The account that's liable for tax. If set, the business address and tax registrations required to perform the tax calculation are loaded from this account. */
    liability: {
      /** The connected account being referenced when type is account. */
      account: string | null;
      /** Type of the account referenced. */
      type: 'account' | 'self';
    } | null;
  };
  /** The reference point that aligns future billing cycle dates. The timestamp is in UTC format. */
  billing_cycle_anchor: number;
  /** The fixed values used to calculate the billing_cycle_anchor. */
  billing_cycle_anchor_config: {
    /** The day of the month of the billing_cycle_anchor. */
    day_of_month: number;
    /** The hour of the day of the billing_cycle_anchor. */
    hour: number | null;
    /** The minute of the hour of the billing_cycle_anchor. */
    minute: number | null;
    /** The month to start full cycle billing periods. */
    month: number | null;
    /** The second of the minute of the billing_cycle_anchor. */
    second: number | null;
  } | null;
  /** Controls how prorations and invoices for subscriptions are calculated and orchestrated. */
  billing_mode: {
    /** Configure behavior for flexible billing mode. */
    flexible: {
      /** Controls how invoices and invoice items display proration amounts and discount amounts. */
      proration_discounts: 'included' | 'itemized';
    } | null;
    /** Controls how prorations and invoices for subscriptions are calculated and orchestrated. */
    type: 'classic' | 'flexible';
    /** Details on when the current billing_mode was adopted. */
    updated_at: number | null;
  };
  /** A date in the future at which the subscription will automatically get canceled. */
  cancel_at: number | null;
  /** Whether this subscription will (if status=active) or did (if status=canceled) cancel at the end of the current billing period. */
  cancel_at_period_end: boolean;
  /** If the subscription has been canceled, the date of that cancellation. */
  canceled_at: number | null;
  /** Details about why this subscription was cancelled. */
  cancellation_details: {
    /** Additional comments about why the user canceled the subscription, if the subscription was canceled explicitly by the user. */
    comment: string | null;
    /** The customer submitted reason for why they canceled, if the subscription was canceled explicitly by the user. */
    feedback:
      | 'customer_service'
      | 'low_quality'
      | 'missing_features'
      | 'other'
      | 'switched_service'
      | 'too_complex'
      | 'too_expensive'
      | 'unused'
      | null;
    /** Why this subscription was canceled. */
    reason:
      | 'canceled_by_retention_policy'
      | 'cancellation_requested'
      | 'payment_disputed'
      | 'payment_failed'
      | null;
  } | null;
  /** Either charge_automatically, or send_invoice. When charging automatically, Zoneless will attempt to pay this subscription at the end of the cycle using the default source attached to the customer. */
  collection_method: 'charge_automatically' | 'send_invoice';
  /** Time at which the object was created. Measured in seconds since the Unix epoch. */
  created: number;
  /** Three-letter ISO currency code, in lowercase. */
  currency: 'usdc';
  /** ID of the customer who owns the subscription. */
  customer: string;
  /** ID of the account representing the customer who owns the subscription. */
  customer_account: string | null;
  /** Number of days a customer has to pay invoices generated by this subscription. This value will be null for subscriptions where collection_method=charge_automatically. */
  days_until_due: number | null;
  /** ID of the default payment method for the subscription. It must belong to the customer associated with the subscription. This takes precedence over default_source. */
  default_payment_method: string | null;
  /** ID of the default payment source for the subscription. It must belong to the customer associated with the subscription and be in a chargeable state. */
  default_source: string | null;
  /** The tax rates that will apply to any subscription item that does not have tax_rates set. */
  default_tax_rates: CustomerTaxRate[] | null;
  /** The subscription's description, meant to be displayable to the customer. */
  description: string | null;
  /** The discounts applied to the subscription. Subscription item discounts are applied before subscription discounts. */
  discounts: string[];
  /** If the subscription has ended, the date the subscription ended. */
  ended_at: number | null;
  /** All invoices will be billed using the specified settings. */
  invoice_settings: {
    /** The account tax IDs associated with the subscription. Will be set on invoices generated by the subscription. */
    account_tax_ids: string[] | null;
    /** The connected account that issues the invoice. The invoice is presented with the branding and support information of the specified account. */
    issuer: {
      /** The connected account being referenced when type is account. */
      account: string | null;
      /** Type of the account referenced. */
      type: 'account' | 'self';
    };
  };
  /** List of subscription items, each with an attached price. */
  items: SubscriptionItemList;
  /** The most recent invoice this subscription has generated over its lifecycle (for example, when it cycles or is updated). */
  latest_invoice: string | null;
  /** If the object exists in live mode, the value is true. If the object exists in test mode, the value is false. */
  livemode: boolean;
  /** Set of key-value pairs that you can attach to an object. This can be useful for storing additional information about the object in a structured format. */
  metadata: Record<string, string>;
  /** Specifies the approximate timestamp on which any pending invoice items will be billed according to the schedule provided at pending_invoice_item_interval. */
  next_pending_invoice_item_invoice: number | null;
  /** The account (if any) the charge was made on behalf of for charges associated with this subscription. */
  on_behalf_of: string | null;
  /** If specified, payment collection for this subscription will be paused. */
  pause_collection: {
    /** The payment collection behavior for this subscription while paused. */
    behavior: 'keep_as_draft' | 'mark_uncollectible' | 'void';
    /** The time after which the subscription will resume collecting payments. */
    resumes_at: number | null;
  } | null;
  /**
   * Payment settings passed on to invoices created by the subscription.
   * @remarks Simplified from Stripe's payment_settings, which also exposes
   * payment_method_options for many fiat rails (ACH, cards, iDEAL, etc.) that Zoneless doesn't
   * support since all payments are settled in USDC.
   */
  payment_settings: {
    /** The list of payment method types to provide to every invoice created by the subscription. */
    payment_method_types: string[] | null;
    /** Configure whether Zoneless updates subscription.default_payment_method when payment succeeds. Defaults to off. */
    save_default_payment_method: 'off' | 'on_subscription' | null;
  } | null;
  /** Specifies an interval for how often to bill for any pending invoice items. */
  pending_invoice_item_interval: {
    /** Specifies invoicing frequency. Either day, week, month or year. */
    interval: 'day' | 'week' | 'month' | 'year';
    /** The number of intervals between invoices. Maximum of one year interval allowed (1 year, 12 months, or 52 weeks). */
    interval_count: number;
  } | null;
  /** You can use this SetupIntent to collect user authentication when creating a subscription without immediate payment or updating a subscription's payment method. */
  pending_setup_intent: string | null;
  /** If specified, pending updates that will be applied to the subscription once the latest_invoice has been paid. */
  pending_update: {
    /** If the update is applied, determines the date of the first full invoice, and, for plans with month or year intervals, the day of the month for subsequent invoices. */
    billing_cycle_anchor: number | null;
    /** The pending subscription-level discount that will be applied when the pending update is applied. */
    discount: CustomerDiscount | null;
    /** The point after which the changes reflected by this update will be discarded and no longer applied. */
    expires_at: number;
    /** Set of key-value pairs that you can attach to an object. */
    metadata: Record<string, string> | null;
    /** Unix timestamp representing the end of the trial period the customer will get before being charged for the first time, if the update is applied. */
    trial_end: number | null;
    /** Indicates if a plan's trial_period_days should be applied to the subscription. */
    trial_from_plan: boolean | null;
  } | null;
  /** A hash containing information about the currency presented to the customer. */
  presentment_details: {
    /** Currency used for customer payments. */
    presentment_currency: string;
  } | null;
  /** The schedule attached to the subscription. */
  schedule: string | null;
  /** Date when the subscription was first created. The date might differ from the created date due to backdating. */
  start_date: number;
  /**
   * Possible values are incomplete, incomplete_expired, trialing, active, past_due, canceled,
   * unpaid, or paused.
   *
   * For collection_method=charge_automatically a subscription moves into incomplete if the
   * initial payment attempt fails. Once the first invoice is paid, the subscription moves into
   * an active status. If the first invoice is not paid within 23 hours, the subscription
   * transitions to incomplete_expired.
   *
   * A subscription that is currently in a trial period is trialing and moves to active when the
   * trial period is over. A subscription can only enter a paused status when a trial ends
   * without a payment method.
   */
  status:
    | 'incomplete'
    | 'incomplete_expired'
    | 'trialing'
    | 'active'
    | 'past_due'
    | 'canceled'
    | 'unpaid'
    | 'paused';
  /** ID of the test clock this subscription belongs to. */
  test_clock: string | null;
  /** The account (if any) the subscription's payments will be attributed to for tax reporting, and where funds from each payment will be transferred to for each of the subscription's invoices. */
  transfer_data: {
    /** A non-negative decimal between 0 and 100, with at most two decimal places. By default, the entire amount is transferred to the destination. */
    amount_percent: number | null;
    /** The account where funds from the payment will be transferred to upon payment success. */
    destination: string;
  } | null;
  /** If the subscription has a trial, the end of that trial. */
  trial_end: number | null;
  /** Settings related to subscription trials. */
  trial_settings: {
    /** Defines how the subscription should behave when the user's trial ends. */
    end_behavior: {
      /** Indicates how the subscription should change when the trial ends if the user did not provide a payment method. */
      missing_payment_method: 'cancel' | 'create_invoice' | 'pause';
    };
  } | null;
  /** If the subscription has a trial, the beginning of that trial. */
  trial_start: number | null;
}
