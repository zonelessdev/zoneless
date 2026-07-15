import {
  Customer,
  CustomerAddress,
  CustomerDiscount,
  CustomerInvoiceCustomField,
  CustomerShipping,
  CustomerSubscription,
  CustomerTaxId,
  CustomerTaxRate,
} from './Customer';
import {
  InvoiceDiscountAmount,
  InvoicePretaxCreditAmount,
  InvoiceTax,
  InvoiceTaxabilityReason,
} from './InvoiceItem';
import { InvoiceLineItem } from './InvoiceLineItem';
import { InvoicePaymentsList } from './InvoicePayment';

/**
 * Stripe-compatible Invoice object for Zoneless.
 * Represents a statement of amounts owed by a customer, covering one-off charges and
 * subscription billing cycles. Settled in USDC on Solana.
 *
 * @see https://docs.stripe.com/api/invoices/object
 */
export interface Invoice {
  /** Unique identifier for the object. For preview invoices, this id is prefixed with `upcoming_in`. */
  id: string;
  /** String representing the object's type. Objects of the same type share the same value. */
  object: 'invoice';
  /** The country of the business associated with this invoice, most often the business creating the invoice. */
  account_country: string | null;
  /** The public name of the business associated with this invoice, most often the business creating the invoice. */
  account_name: string | null;
  /**
   * The account tax IDs associated with the invoice. Only editable when the invoice is a draft.
   * Expandable.
   */
  account_tax_ids: (string | CustomerTaxId)[] | null;
  /**
   * Final amount due at this time for this invoice. If the invoice's total is smaller than the
   * minimum charge amount, or if there is account credit that can be applied, amount_due may be 0.
   * The charge generated for the invoice is for this amount.
   */
  amount_due: number;
  /** Amount that was overpaid on the invoice. The amount overpaid is credited to the customer's credit balance. */
  amount_overpaid: number;
  /** The amount, in the smallest currency unit, that was paid. */
  amount_paid: number;
  /** Amount, in the smallest currency unit, that was paid on the invoice outside of Zoneless. */
  amount_paid_off_stripe: number;
  /** The difference between amount_due and amount_paid, in the smallest currency unit. */
  amount_remaining: number;
  /** This is the sum of all the shipping amounts. */
  amount_shipping: number;
  /** ID of the Connect Application that created the invoice. Expandable. */
  application: string | null;
  /**
   * Number of payment attempts made for this invoice, from the perspective of the payment retry
   * schedule. Any payment attempt counts as the first attempt, and subsequently only automatic
   * retries increment the attempt count.
   */
  attempt_count: number;
  /**
   * Whether an attempt has been made to pay the invoice. An invoice is not attempted until 1 hour
   * after the invoice.created webhook, for example.
   */
  attempted: boolean;
  /**
   * Controls whether Zoneless performs automatic collection of the invoice. If false, the
   * invoice's state doesn't automatically advance without an explicit action.
   */
  auto_advance: boolean;
  /** Settings and latest results for automatic tax lookup for this invoice. */
  automatic_tax: InvoiceAutomaticTax;
  /**
   * The time when this invoice is currently scheduled to be automatically finalized. Null if the
   * invoice is not scheduled to finalize, or if it is no longer in draft.
   */
  automatically_finalizes_at: number | null;
  /** Indicates the reason why the invoice was created. */
  billing_reason: InvoiceBillingReason | null;
  /**
   * Either charge_automatically, or send_invoice. When charging automatically, Zoneless will
   * attempt to pay this invoice using the default source attached to the customer. When sending
   * an invoice, Zoneless will email this invoice to the customer with payment instructions.
   */
  collection_method: 'charge_automatically' | 'send_invoice';
  /**
   * The confirmation secret associated with this invoice. Contains the client_secret of the
   * PaymentIntent that Zoneless creates during invoice finalization. Expandable.
   */
  confirmation_secret: InvoiceConfirmationSecret | null;
  /** Time at which the object was created. Measured in seconds since the Unix epoch. */
  created: number;
  /** Three-letter ISO currency code, in lowercase. Must be a supported currency. */
  currency: 'usdc';
  /** Custom fields displayed on the invoice. */
  custom_fields: CustomerInvoiceCustomField[] | null;
  /** The ID of the customer to bill. Expandable. */
  customer: string | Customer;
  /** The ID of the account representing the customer to bill. */
  customer_account: string | null;
  /**
   * The customer's address. Until the invoice is finalized, this field will equal customer.address.
   * Once the invoice is finalized, this field will no longer be updated.
   */
  customer_address: CustomerAddress | null;
  /**
   * The customer's email. Until the invoice is finalized, this field will equal customer.email.
   * Once the invoice is finalized, this field will no longer be updated.
   */
  customer_email: string | null;
  /**
   * The customer's name. Until the invoice is finalized, this field will equal customer.name.
   * Once the invoice is finalized, this field will no longer be updated.
   */
  customer_name: string | null;
  /**
   * The customer's phone number. Until the invoice is finalized, this field will equal customer.phone.
   * Once the invoice is finalized, this field will no longer be updated.
   */
  customer_phone: string | null;
  /**
   * The customer's shipping information. Until the invoice is finalized, this field will equal
   * customer.shipping. Once the invoice is finalized, this field will no longer be updated.
   */
  customer_shipping: CustomerShipping | null;
  /**
   * The customer's tax exempt status. Until the invoice is finalized, this field will equal
   * customer.tax_exempt. Once the invoice is finalized, this field will no longer be updated.
   */
  customer_tax_exempt: 'exempt' | 'none' | 'reverse' | null;
  /**
   * The customer's tax IDs. Until the invoice is finalized, this field will contain the same tax
   * IDs as customer.tax_ids. Once the invoice is finalized, this field will no longer be updated.
   * @remarks Stripe supports 100+ country-specific tax ID types; kept as a plain string here
   * for maintainability, matching CustomerTaxId.type.
   */
  customer_tax_ids: InvoiceCustomerTaxId[] | null;
  /**
   * ID of the default payment method for the invoice. It must belong to the customer associated
   * with the invoice. Expandable.
   */
  default_payment_method: string | null;
  /**
   * ID of the default payment source for the invoice. It must belong to the customer associated
   * with the invoice and be in a chargeable state. Expandable.
   */
  default_source: string | null;
  /** The tax rates applied to this invoice, if any. */
  default_tax_rates: CustomerTaxRate[];
  /** An arbitrary string attached to the object. Often useful for displaying to users. Referenced as 'memo' in the Dashboard. */
  description: string | null;
  /**
   * The discounts applied to the invoice. Line item discounts are applied before invoice discounts.
   * Use `expand[]=discounts` to expand each discount.
   */
  discounts: (string | CustomerDiscount)[];
  /**
   * The date on which payment for this invoice is due. Null for invoices where
   * collection_method=charge_automatically.
   */
  due_date: number | null;
  /**
   * The date when this invoice is in effect. Same as finalized_at unless overwritten. When
   * defined, this value replaces the system-generated 'Date of issue' printed on the invoice PDF
   * and receipt.
   */
  effective_at: number | null;
  /**
   * Ending customer balance after the invoice is finalized. Null if the invoice has not been
   * finalized yet.
   */
  ending_balance: number | null;
  /** Footer displayed on the invoice. */
  footer: string | null;
  /** Details of the invoice that was cloned. See invoice revision documentation for more details. */
  from_invoice: InvoiceFromInvoice | null;
  /**
   * The URL for the hosted invoice page, which allows customers to view and pay an invoice.
   * Null if the invoice has not been finalized yet.
   */
  hosted_invoice_url: string | null;
  /**
   * The link to download the PDF for the invoice. Null if the invoice has not been finalized yet.
   */
  invoice_pdf: string | null;
  /**
   * The connected account that issues the invoice. The invoice is presented with the branding
   * and support information of the specified account.
   */
  issuer: InvoiceIssuer;
  /**
   * The error encountered during the previous attempt to finalize the invoice. Cleared when the
   * invoice is successfully finalized.
   */
  last_finalization_error: InvoiceLastFinalizationError | null;
  /** The ID of the most recent non-draft revision of this invoice. Expandable. */
  latest_revision: string | Invoice | null;
  /**
   * The individual line items that make up the invoice. Sorted as: (1) pending invoice items
   * (including prorations) in reverse chronological order, (2) subscription items in reverse
   * chronological order, and (3) invoice items added after invoice creation in chronological order.
   */
  lines: InvoiceLinesList;
  /** If the object exists in live mode, the value is true. If the object exists in test mode, the value is false. */
  livemode: boolean;
  /**
   * Set of key-value pairs that you can attach to an object. This can be useful for storing
   * additional information about the object in a structured format.
   */
  metadata: Record<string, string> | null;
  /**
   * The time at which payment will next be attempted. Null for invoices where
   * collection_method=send_invoice.
   */
  next_payment_attempt: number | null;
  /**
   * A unique, identifying string that appears on emails sent to the customer for this invoice.
   * Starts with the customer's unique invoice_prefix if it is specified.
   */
  number: string | null;
  /**
   * The account (if any) for which the funds of the invoice payment are intended. If set, the
   * invoice will be presented with the branding and support information of the specified account.
   * Expandable.
   */
  on_behalf_of: string | null;
  /** The parent that generated this invoice. */
  parent: InvoiceParent | null;
  /** Configuration settings for the PaymentIntent that is generated when the invoice is finalized. */
  payment_settings: InvoicePaymentSettings;
  /** Payments for this invoice. Expandable. */
  payments: InvoicePaymentsList;
  /**
   * The latest timestamp at which invoice items can be associated with this invoice. Use the
   * line item period to get the service period for each price.
   */
  period_end: number;
  /**
   * The earliest timestamp at which invoice items can be associated with this invoice. Use the
   * line item period to get the service period for each price.
   */
  period_start: number;
  /** Total amount of all post-payment credit notes issued for this invoice. */
  post_payment_credit_notes_amount: number;
  /** Total amount of all pre-payment credit notes issued for this invoice. */
  pre_payment_credit_notes_amount: number;
  /** The transaction number that appears on email receipts sent for this invoice. */
  receipt_number: string | null;
  /**
   * The rendering-related settings that control how the invoice is displayed on customer-facing
   * surfaces such as PDF and Hosted Invoice Page.
   */
  rendering: InvoiceRendering | null;
  /** The details of the cost of shipping, including the ShippingRate applied on the invoice. */
  shipping_cost: InvoiceShippingCost | null;
  /**
   * Shipping details for the invoice. The Invoice PDF will use shipping_details if set, otherwise
   * the PDF will render the shipping address from the customer.
   */
  shipping_details: CustomerShipping | null;
  /**
   * Starting customer balance before the invoice is finalized. If the invoice has not been
   * finalized yet, this will be the current customer balance. For revision invoices, this also
   * includes any customer balance that was applied to the original invoice.
   */
  starting_balance: number;
  /** Extra information about an invoice for the customer's credit card statement. */
  statement_descriptor: string | null;
  /** The status of the invoice, one of draft, open, paid, uncollectible, or void. */
  status: InvoiceStatus | null;
  /** The timestamps at which the invoice status was updated. */
  status_transitions: InvoiceStatusTransitions;
  /**
   * Total of all subscriptions, invoice items, and prorations on the invoice before any invoice
   * level discount or exclusive tax is applied. Item discounts are already incorporated.
   */
  subtotal: number;
  /**
   * The integer amount in the smallest currency unit representing the subtotal of the invoice
   * before any invoice level discount or tax is applied. Item discounts are already incorporated.
   */
  subtotal_excluding_tax: number | null;
  /** ID of the test clock this invoice belongs to. Expandable. */
  test_clock: string | null;
  /**
   * If billing_reason is set to subscription_threshold, this returns more information on which
   * threshold rules triggered the invoice.
   */
  threshold_reason: InvoiceThresholdReason | null;
  /** Total after discounts and taxes. */
  total: number;
  /** The aggregate amounts calculated per discount across all line items. */
  total_discount_amounts: InvoiceDiscountAmount[] | null;
  /**
   * The integer amount in the smallest currency unit representing the total amount of the invoice
   * including all discounts but excluding all tax.
   */
  total_excluding_tax: number | null;
  /**
   * Contains pretax credit amounts (ex: discount, credit grants, etc) that apply to this invoice.
   * This is a combined list of pretax credit amounts across all invoice line items.
   */
  total_pretax_credit_amounts: InvoicePretaxCreditAmount[] | null;
  /** The aggregate tax information of all line items. */
  total_taxes: InvoiceTax[] | null;
  /**
   * The account (if any) the payment will be attributed to for tax reporting, and where funds
   * from the payment will be transferred to.
   */
  transfer_data: InvoiceTransferData | null;
  /**
   * Invoices are automatically paid or sent 1 hour after webhooks are delivered, or until all
   * webhook delivery attempts have been exhausted. Tracks the time when webhooks for this invoice
   * were successfully delivered. If the invoice had no webhooks to deliver, this is set while
   * the invoice is being created.
   */
  webhooks_delivered_at: number | null;

  /**
   * The platform account that owns this resource.
   * @zoneless_extension
   */
  platform_account: string;
}

/**
 * Deleted invoice response object.
 */
export interface InvoiceDeleted {
  /** Unique identifier for the object. */
  id: string;
  /** String representing the object's type. */
  object: 'invoice';
  /** Always true for a deleted object. */
  deleted: true;
}

/** The status of an invoice. */
export type InvoiceStatus =
  | 'draft'
  | 'open'
  | 'paid'
  | 'uncollectible'
  | 'void';

/** Indicates the reason why the invoice was created. */
export type InvoiceBillingReason =
  | 'automatic_pending_invoice_item_invoice'
  | 'manual'
  | 'quote_accept'
  | 'subscription'
  | 'subscription_create'
  | 'subscription_cycle'
  | 'subscription_threshold'
  | 'subscription_update'
  | 'upcoming';

// ─────────────────────────────────────────────────────────────────────────────
// Automatic tax
// ─────────────────────────────────────────────────────────────────────────────

/** Settings and latest results for automatic tax lookup for an invoice. */
export interface InvoiceAutomaticTax {
  /** If Zoneless disabled automatic tax, this enum describes why. */
  disabled_reason:
    | 'finalization_requires_location_inputs'
    | 'finalization_system_error'
    | null;
  /**
   * Whether Zoneless automatically computes tax on this invoice. Note that incompatible invoice
   * items (invoice items with manually specified tax rates, negative amounts, or
   * tax_behavior=unspecified) cannot be added to automatic tax invoices.
   */
  enabled: boolean;
  /**
   * The account that's liable for tax. If set, the business address and tax registrations
   * required to perform the tax calculation are loaded from this account.
   */
  liability: InvoiceTaxLiability | null;
  /** The tax provider powering automatic tax. */
  provider: string | null;
  /** The status of the most recent automated tax calculation for this invoice. */
  status: 'complete' | 'failed' | 'requires_location_inputs' | null;
}

/** The account that's liable for tax on an invoice. */
export interface InvoiceTaxLiability {
  /** The connected account being referenced when type is account. Expandable. */
  account: string | null;
  /** Type of the account referenced. */
  type: 'account' | 'self';
}

// ─────────────────────────────────────────────────────────────────────────────
// Confirmation secret
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The confirmation secret associated with an invoice. Contains the client_secret of the
 * PaymentIntent created during invoice finalization.
 */
export interface InvoiceConfirmationSecret {
  /** The client_secret of the payment that Zoneless creates for the invoice after finalization. */
  client_secret: string;
  /**
   * The type of client_secret. Currently this is always payment_intent, referencing the default
   * PaymentIntent created during invoice finalization.
   */
  type: 'payment_intent';
}

// ─────────────────────────────────────────────────────────────────────────────
// Customer tax IDs (snapshot on invoice)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * A customer's tax ID as snapshotted on an invoice.
 * @remarks Stripe supports 100+ country-specific tax ID types; kept as a plain string here
 * for maintainability, matching CustomerTaxId.type and CheckoutSession.customer_details.tax_ids.
 */
export interface InvoiceCustomerTaxId {
  /** The type of the tax ID (e.g. us_ein, eu_vat). */
  type: string;
  /** The value of the tax ID. */
  value: string | null;
}

// ─────────────────────────────────────────────────────────────────────────────
// From invoice / issuer
// ─────────────────────────────────────────────────────────────────────────────

/** Details of the invoice that was cloned. */
export interface InvoiceFromInvoice {
  /** The relation between this invoice and the cloned invoice. */
  action: string;
  /** The invoice that was cloned. Expandable. */
  invoice: string | Invoice;
}

/** The connected account that issues the invoice. */
export interface InvoiceIssuer {
  /** The connected account being referenced when type is account. Expandable. */
  account: string | null;
  /** Type of the account referenced. */
  type: 'account' | 'self';
}

// ─────────────────────────────────────────────────────────────────────────────
// Last finalization error
// ─────────────────────────────────────────────────────────────────────────────

/** The error encountered during the previous attempt to finalize the invoice. */
export interface InvoiceLastFinalizationError {
  /**
   * For card errors resulting from a card issuer decline, a short string indicating how to
   * proceed with an error if they provide one.
   */
  advice_code: string | null;
  /** For some errors that could be handled programmatically, a short string indicating the error code reported. */
  code: string | null;
  /** A URL to more information about the error code reported. */
  doc_url: string | null;
  /** A human-readable message providing more details about the error. */
  message: string | null;
  /**
   * For card errors resulting from a card issuer decline, a 2 digit code which indicates the
   * advice given to merchant by the card network on how to proceed with an error.
   */
  network_advice_code: string | null;
  /** For payments declined by the network, an alphanumeric code which indicates the reason the payment failed. */
  network_decline_code: string | null;
  /** If the error is parameter-specific, the parameter related to the error. */
  param: string | null;
  /**
   * If the error is specific to the type of payment method, the payment method type that had a
   * problem. Only populated for invoice-related errors.
   */
  payment_method_type: string | null;
  /** The type of error returned. */
  type:
    | 'api_error'
    | 'card_error'
    | 'idempotency_error'
    | 'invalid_request_error';
}

// ─────────────────────────────────────────────────────────────────────────────
// Lines list
// ─────────────────────────────────────────────────────────────────────────────

/** The individual line items that make up an invoice. */
export interface InvoiceLinesList {
  /** String representing the object's type. Objects of the same type share the same value. Always has the value list. */
  object: 'list';
  /** Details about each object. */
  data: InvoiceLineItem[];
  /** True if this list has another page of items after this one that can be fetched. */
  has_more: boolean;
  /** Total number of line items on the invoice. */
  total_count: number;
  /** The URL where this list can be accessed. */
  url: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Parent
// ─────────────────────────────────────────────────────────────────────────────

/** The parent that generated this invoice. */
export interface InvoiceParent {
  /** Details about the quote that generated this invoice. Present when type is quote_details. */
  quote_details: InvoiceQuoteDetails | null;
  /** Details about the subscription that generated this invoice. Present when type is subscription_details. */
  subscription_details: InvoiceSubscriptionDetails | null;
  /** The type of parent that generated this invoice. */
  type: 'quote_details' | 'subscription_details';
}

/** Details about the quote that generated this invoice. */
export interface InvoiceQuoteDetails {
  /** The quote that generated this invoice. */
  quote: string;
}

/** Details about the subscription that generated this invoice. */
export interface InvoiceSubscriptionDetails {
  /**
   * Set of key-value pairs defined as subscription metadata when an invoice is created. Becomes
   * an immutable snapshot of the subscription metadata at the time of invoice finalization.
   */
  metadata: Record<string, string> | null;
  /** The subscription that generated this invoice. Expandable. */
  subscription: string | CustomerSubscription;
  /**
   * Only set for upcoming invoices that preview prorations. The time used to calculate
   * prorations.
   */
  subscription_proration_date: number | null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Payment settings
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Configuration settings for the PaymentIntent that is generated when the invoice is finalized.
 * @remarks Simplified from Stripe's payment_settings, which also exposes
 * payment_method_options for many fiat rails (ACH, cards, iDEAL, etc.) that Zoneless doesn't
 * support since all payments are settled in USDC. Matches the simplification on CustomerSubscription.
 */
export interface InvoicePaymentSettings {
  /**
   * ID of the mandate to be used for this invoice. It must correspond to the payment method used
   * to pay the invoice, including the invoice's default_payment_method or default_source, if set.
   */
  default_mandate: string | null;
  /**
   * Payment-method-specific configuration to provide to the invoice's PaymentIntent.
   * Opaque stub for Stripe API parity; Zoneless settles invoices in USDC.
   */
  payment_method_options: object | null;
  /**
   * The list of payment method types (e.g. crypto) to provide to the invoice's PaymentIntent.
   * If not set, Zoneless attempts to automatically determine the types to use.
   */
  payment_method_types: string[] | null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Rendering
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The rendering-related settings that control how the invoice is displayed on customer-facing
 * surfaces such as PDF and Hosted Invoice Page.
 */
export interface InvoiceRendering {
  /** How line-item prices and amounts will be displayed with respect to tax on invoice PDFs. */
  amount_tax_display: string | null;
  /** Invoice pdf rendering options. */
  pdf: {
    /**
     * Page size of invoice pdf. Options include a4, letter, and auto. If set to auto, page size
     * will be switched to a4 or letter based on customer locale.
     */
    page_size: 'a4' | 'auto' | 'letter' | null;
  } | null;
  /** ID of the rendering template that the invoice is formatted by. */
  template: string | null;
  /** Version of the rendering template that the invoice is using. */
  template_version: number | null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Shipping cost
// ─────────────────────────────────────────────────────────────────────────────

/** The details of the cost of shipping, including the ShippingRate applied on the invoice. */
export interface InvoiceShippingCost {
  /** Total shipping cost before any taxes are applied. */
  amount_subtotal: number;
  /** Total tax amount applied due to shipping costs. If no tax was applied, defaults to 0. */
  amount_tax: number;
  /** Total shipping cost after taxes are applied. */
  amount_total: number;
  /** The ID of the ShippingRate for this invoice. Expandable. */
  shipping_rate: string | null;
  /** The taxes applied to the shipping rate. Expandable. */
  taxes: InvoiceShippingCostTax[] | null;
}

/** A tax amount applied to shipping on an invoice. */
export interface InvoiceShippingCostTax {
  /** Amount of tax applied for this rate. */
  amount: number;
  /** The tax rate applied. */
  rate: CustomerTaxRate;
  /**
   * The reasoning behind this tax, for example, if the product is tax exempt. The possible
   * values for this field may be extended as new tax rules are supported.
   */
  taxability_reason: InvoiceTaxabilityReason | null;
  /** The amount on which tax is calculated, in the smallest currency unit. */
  taxable_amount: number | null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Status transitions
// ─────────────────────────────────────────────────────────────────────────────

/** The timestamps at which the invoice status was updated. */
export interface InvoiceStatusTransitions {
  /** The time that the invoice draft was finalized. */
  finalized_at: number | null;
  /** The time that the invoice was marked uncollectible. */
  marked_uncollectible_at: number | null;
  /** The time that the invoice was paid. */
  paid_at: number | null;
  /** The time that the invoice was voided. */
  voided_at: number | null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Threshold reason
// ─────────────────────────────────────────────────────────────────────────────

/**
 * If billing_reason is set to subscription_threshold, more information on which threshold rules
 * triggered the invoice.
 */
export interface InvoiceThresholdReason {
  /** The total invoice amount threshold boundary if it triggered the threshold invoice. */
  amount_gte: number | null;
  /** Indicates which line items triggered a threshold invoice. */
  item_reasons: InvoiceThresholdItemReason[];
}

/** Indicates which line items triggered a threshold invoice. */
export interface InvoiceThresholdItemReason {
  /** The IDs of the line items that triggered the threshold invoice. */
  line_item_ids: string[];
  /** The quantity threshold boundary that applied to the given line item. */
  usage_gte: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Transfer data
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The account (if any) the payment will be attributed to for tax reporting, and where funds from
 * the payment will be transferred to.
 */
export interface InvoiceTransferData {
  /** The amount that will be transferred automatically when the invoice is paid. If no amount is set, the full amount is transferred. */
  amount: number | null;
  /** The account where funds from the payment will be transferred to upon payment success. */
  destination: string;
}
