import { Customer, CustomerDiscount, CustomerTaxRate } from './Customer';
import { Price } from './Price';

/**
 * Stripe-compatible Invoice Item object for Zoneless.
 * Represents an item to be added to an invoice, covering one-off charges and prorations.
 *
 * @see https://docs.stripe.com/api/invoiceitems/object
 */
export interface InvoiceItem {
  /** Unique identifier for the object. */
  id: string;
  /** String representing the object's type. Objects of the same type share the same value. */
  object: 'invoiceitem';
  /** Amount (in the currency specified) of the invoice item. This should always be equal to unit_amount * quantity. */
  amount: number;
  /** Three-letter ISO currency code, in lowercase. Must be a supported currency. */
  currency: 'usdc';
  /** The ID of the customer to bill for this invoice item. Expandable. */
  customer: string | Customer;
  /** The ID of the account to bill for this invoice item. */
  customer_account: string | null;
  /** Time at which the object was created. Measured in seconds since the Unix epoch. */
  date: number;
  /** An arbitrary string attached to the object. Often useful for displaying to users. */
  description: string | null;
  /** If true, discounts will apply to this invoice item. Always false for prorations. */
  discountable: boolean;
  /**
   * The discounts which apply to the invoice item. Item discounts are applied before invoice discounts.
   * Use `expand[]=discounts` to expand each discount.
   */
  discounts: (string | CustomerDiscount)[] | null;
  /** The ID of the invoice this invoice item belongs to. Expandable. */
  invoice: string | null;
  /** If the object exists in live mode, the value is true. If the object exists in test mode, the value is false. */
  livemode: boolean;
  /**
   * Set of key-value pairs that you can attach to an object. This can be useful for storing additional
   * information about the object in a structured format.
   */
  metadata: Record<string, string> | null;
  /** The amount after discounts, but before credits and taxes. This field is null for discountable=true items. */
  net_amount: number | null;
  /** The parent that generated this invoice item. */
  parent: InvoiceItemParent | null;
  /**
   * The period associated with this invoice item. When set to different values, the period will be
   * rendered on the invoice.
   */
  period: InvoicePeriod;
  /** The pricing information of the invoice item. */
  pricing: InvoicePricing | null;
  /** Whether the invoice item was created automatically as a proration adjustment when the customer switched plans. */
  proration: boolean;
  /**
   * Contains information about proration items. This field is only populated for prorations created
   * from subscriptions with billing_mode=flexible.
   */
  proration_details: InvoiceItemProrationDetails | null;
  /**
   * Quantity of units for the invoice item in integer format, with any decimal precision truncated.
   * For the item's full-precision decimal quantity, use quantity_decimal. This field will be
   * deprecated in favor of quantity_decimal in a future version. If the invoice item is a proration,
   * the quantity of the subscription that the proration was computed for.
   */
  quantity: number;
  /** Non-negative decimal with at most 12 decimal places. The quantity of units for the invoice item. */
  quantity_decimal: string;
  /**
   * The tax rates which apply to the invoice item. When set, the default_tax_rates on the invoice do
   * not apply to this invoice item.
   */
  tax_rates: CustomerTaxRate[] | null;
  /** ID of the test clock this invoice item belongs to. Expandable. */
  test_clock: string | null;
  /**
   * The platform account that owns this resource.
   * @zoneless_extension
   */
  platform_account: string;
}

/**
 * Deleted invoice item response object.
 */
export interface InvoiceItemDeleted {
  /** Unique identifier for the object. */
  id: string;
  /** String representing the object's type. */
  object: 'invoiceitem';
  /** Always true for a deleted object. */
  deleted: true;
}

// ─────────────────────────────────────────────────────────────────────────────
// Shared invoice shapes (reused by Invoice and InvoiceLineItem)
// ─────────────────────────────────────────────────────────────────────────────

/** The period associated with an invoice item or line item. */
export interface InvoicePeriod {
  /** The end of the period, which must be greater than or equal to the start. This value is inclusive. */
  end: number;
  /** The start of the period. This value is inclusive. */
  start: number;
}

/** The pricing information of an invoice item or line item. */
export interface InvoicePricing {
  /** Additional details about the price this item is associated with. Present when type is price_details. */
  price_details: InvoicePriceDetails | null;
  /** The type of the pricing details. */
  type: 'price_details';
  /**
   * The unit amount (in the currency specified) of the item which contains a decimal value with at most
   * 12 decimal places.
   */
  unit_amount_decimal: string | null;
}

/** Additional details about the price an invoice item or line item is associated with. */
export interface InvoicePriceDetails {
  /** The ID of the price this item is associated with. Expandable. */
  price: string | Price;
  /** The ID of the product this item is associated with. */
  product: string;
}

/** The amount of discount calculated for a single discount. */
export interface InvoiceDiscountAmount {
  /** The amount, in the smallest currency unit, of the discount. */
  amount: number;
  /** The discount that was applied to get this discount amount. Expandable. */
  discount: string | CustomerDiscount;
}

/** A pretax credit amount (ex: discount, credit grants, etc) on an invoice or line item. */
export interface InvoicePretaxCreditAmount {
  /** The amount, in the smallest currency unit, of the pretax credit amount. */
  amount: number;
  /**
   * The credit balance transaction that was applied to get this pretax credit amount.
   * Present when type is credit_balance_transaction. Expandable.
   */
  credit_balance_transaction: string | null;
  /**
   * The discount that was applied to get this pretax credit amount.
   * Present when type is discount. Expandable.
   */
  discount: string | CustomerDiscount | null;
  /** Type of the pretax credit amount referenced. */
  type: 'credit_balance_transaction' | 'discount';
}

/** Tax information for an invoice or line item. */
export interface InvoiceTax {
  /** The amount of the tax, in the smallest currency unit. */
  amount: number;
  /** Whether this tax is inclusive or exclusive. */
  tax_behavior: 'exclusive' | 'inclusive';
  /** Additional details about the tax rate. Only present when type is tax_rate_details. */
  tax_rate_details: InvoiceTaxRateDetails | null;
  /**
   * The reasoning behind this tax, for example, if the product is tax exempt. The possible values for
   * this field may be extended as new tax rules are supported.
   */
  taxability_reason: InvoiceTaxabilityReason;
  /** The amount on which tax is calculated, in the smallest currency unit. */
  taxable_amount: number | null;
  /** The type of tax information. */
  type: 'tax_rate_details';
}

/** Additional details about a tax rate referenced on an invoice or line item. */
export interface InvoiceTaxRateDetails {
  /** ID of the tax rate. Expandable. */
  tax_rate: string | CustomerTaxRate;
}

/** The reasoning behind a tax amount on an invoice or line item. */
export type InvoiceTaxabilityReason =
  | 'customer_exempt'
  | 'not_available'
  | 'not_collecting'
  | 'not_subject_to_tax'
  | 'not_supported'
  | 'portion_product_exempt'
  | 'portion_reduced_rated'
  | 'portion_standard_rated'
  | 'product_exempt'
  | 'product_exempt_holiday'
  | 'proportionally_rated'
  | 'reduced_rated'
  | 'reverse_charge'
  | 'standard_rated'
  | 'taxable_basis_reduced'
  | 'zero_rated';

// ─────────────────────────────────────────────────────────────────────────────
// Parent
// ─────────────────────────────────────────────────────────────────────────────

/** The parent that generated this invoice item. */
export interface InvoiceItemParent {
  /** Details about the subscription that generated this invoice item. Present when type is subscription_details. */
  subscription_details: InvoiceItemSubscriptionDetails | null;
  /** The type of parent that generated this invoice item. */
  type: 'subscription_details';
}

/** Details about the subscription that generated this invoice item. */
export interface InvoiceItemSubscriptionDetails {
  /** The subscription that generated this invoice item. */
  subscription: string;
  /** The subscription item that generated this invoice item. */
  subscription_item: string | null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Proration details
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Contains information about proration items. Only populated for prorations created from
 * subscriptions with billing_mode=flexible.
 */
export interface InvoiceItemProrationDetails {
  /**
   * For a credit proration, links to the debit invoice line items or invoice item that the credit
   * applies to.
   */
  credited_items: InvoiceItemProrationCreditedItems | null;
  /** Discount amounts applied when the proration was created. */
  discount_amounts: InvoiceDiscountAmount[];
}

/** Credited debit items for a credit proration. */
export interface InvoiceItemProrationCreditedItems {
  /**
   * When type is invoice_item, the invoice item id for the debited invoice item corresponding to
   * this credit proration.
   */
  invoice_item: string | null;
  /**
   * When type is invoice_line_items, the invoice and the debited invoice line item(s) on that
   * invoice corresponding to this credit proration.
   */
  invoice_line_item_details: InvoiceItemProrationInvoiceLineItemDetails | null;
  /** Whether the credit references a pending invoice item or one or more invoice line items on an invoice. */
  type: 'invoice_item' | 'invoice_line_items';
}

/** Invoice and debited line items corresponding to a credit proration. */
export interface InvoiceItemProrationInvoiceLineItemDetails {
  /** The invoice id for the debited line item(s). */
  invoice: string;
  /** IDs of the debited invoice line item(s) on the invoice that correspond to the credit proration. */
  invoice_line_items: string[];
}
