import type { SubscriptionList } from './Subscription';

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
  subscriptions: SubscriptionList | null;
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
