import { CustomerDiscount, CustomerTaxRate } from './Customer';
import {
  InvoiceDiscountAmount,
  InvoiceItem,
  InvoicePeriod,
  InvoicePricing,
} from './InvoiceItem';

/**
 * Stripe-compatible Invoice Line Item object for Zoneless.
 * Represents a line item on an invoice, covering subscription items, invoice items, and prorations.
 *
 * @see https://docs.stripe.com/api/invoice-line-item/object
 */
export interface InvoiceLineItem {
  /** Unique identifier for the object. */
  id: string;
  /** String representing the object's type. Objects of the same type share the same value. */
  object: 'line_item';
  /** The amount, in the smallest currency unit. */
  amount: number;
  /** Three-letter ISO currency code, in lowercase. Must be a supported currency. */
  currency: 'usdc';
  /** An arbitrary string attached to the object. Often useful for displaying to users. */
  description: string | null;
  /** The amount of discount calculated per discount for this line item. */
  discount_amounts: InvoiceDiscountAmount[] | null;
  /** If true, discounts will apply to this line item. Always false for prorations. */
  discountable: boolean;
  /**
   * The discounts applied to the invoice line item. Line item discounts are applied before invoice discounts.
   * Use `expand[]=discounts` to expand each discount.
   */
  discounts: (string | CustomerDiscount)[];
  /** The ID of the invoice that contains this line item. */
  invoice: string | null;
  /** If the object exists in live mode, the value is true. If the object exists in test mode, the value is false. */
  livemode: boolean;
  /**
   * Set of key-value pairs that you can attach to an object. This can be useful for storing additional
   * information about the object in a structured format. Note that for line items with type=subscription,
   * metadata reflects the current metadata from the subscription associated with the line item, unless the
   * invoice line was directly updated with different metadata after creation.
   */
  metadata: Record<string, string>;
  /** The parent that generated this line item. */
  parent: InvoiceLineItemParent | null;
  /**
   * The period this line_item covers. For subscription line items, this is the subscription period.
   * For prorations, this starts when the proration was calculated, and ends at the period end of the
   * subscription. For invoice items, this is the time at which the invoice item was created or the period
   * of the item.
   */
  period: InvoicePeriod;
  /** Contains pretax credit amounts (ex: discount, credit grants, etc) that apply to this line item. */
  pretax_credit_amounts: InvoiceLineItemPretaxCreditAmount[] | null;
  /** The pricing information of the line item. */
  pricing: InvoicePricing | null;
  /**
   * Quantity of units for the invoice line item in integer format, with any decimal precision truncated.
   * For the line item's full-precision decimal quantity, use quantity_decimal. This field will be
   * deprecated in favor of quantity_decimal in a future version. If the line item is a proration or
   * subscription, the quantity of the subscription that the proration was computed for.
   */
  quantity: number | null;
  /** Non-negative decimal with at most 12 decimal places. The quantity of units for the line item. */
  quantity_decimal: string | null;
  /** The subtotal of the line item, in the smallest currency unit, before any discounts or taxes. */
  subtotal: number;
  /** The tax information of the line item. */
  taxes: InvoiceLineItemTax[] | null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Parent
// ─────────────────────────────────────────────────────────────────────────────

/** The parent that generated this line item. */
export interface InvoiceLineItemParent {
  /** Details about the invoice item that generated this line item. Present when type is invoice_item_details. */
  invoice_item_details: InvoiceLineItemInvoiceItemDetails | null;
  /** Details about the subscription item that generated this line item. Present when type is subscription_item_details. */
  subscription_item_details: InvoiceLineItemSubscriptionItemDetails | null;
  /** The type of parent that generated this line item. */
  type: 'invoice_item_details' | 'subscription_item_details';
}

/** Details about the invoice item that generated this line item. */
export interface InvoiceLineItemInvoiceItemDetails {
  /** The invoice item that generated this line item. Expandable. */
  invoice_item: string | InvoiceItem;
  /** Whether this is a proration. */
  proration: boolean;
  /** Additional details for proration line items. */
  proration_details: InvoiceLineItemProrationDetails | null;
  /** The subscription that the invoice item belongs to. */
  subscription: string | null;
}

/** Details about the subscription item that generated this line item. */
export interface InvoiceLineItemSubscriptionItemDetails {
  /** The invoice item that generated this line item. Expandable. */
  invoice_item: string | InvoiceItem | null;
  /** Whether this is a proration. */
  proration: boolean;
  /** Additional details for proration line items. */
  proration_details: InvoiceLineItemProrationDetails | null;
  /** The subscription that the subscription item belongs to. */
  subscription: string | null;
  /** The subscription item that generated this line item. */
  subscription_item: string;
}

/** Additional details for proration line items. */
export interface InvoiceLineItemProrationDetails {
  /**
   * For a credit proration line_item, the original debit line_items to which the credit proration applies.
   */
  credited_items: InvoiceLineItemProrationCreditedItems | null;
}

/** Credited invoice line items for a credit proration. */
export interface InvoiceLineItemProrationCreditedItems {
  /** Invoice containing the credited invoice line items. */
  invoice: string;
  /** Credited invoice line items. */
  invoice_line_items: string[];
}

// ─────────────────────────────────────────────────────────────────────────────
// Pretax credit amounts
// ─────────────────────────────────────────────────────────────────────────────

/** A pretax credit amount (ex: discount, credit grants, etc) that applies to this line item. */
export interface InvoiceLineItemPretaxCreditAmount {
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

// ─────────────────────────────────────────────────────────────────────────────
// Taxes
// ─────────────────────────────────────────────────────────────────────────────

/** Tax information for a line item. */
export interface InvoiceLineItemTax {
  /** The amount of the tax, in the smallest currency unit. */
  amount: number;
  /** Whether this tax is inclusive or exclusive. */
  tax_behavior: 'exclusive' | 'inclusive';
  /** Additional details about the tax rate. Only present when type is tax_rate_details. */
  tax_rate_details: InvoiceLineItemTaxRateDetails | null;
  /**
   * The reasoning behind this tax, for example, if the product is tax exempt. The possible values for
   * this field may be extended as new tax rules are supported.
   */
  taxability_reason: InvoiceLineItemTaxabilityReason;
  /** The amount on which tax is calculated, in the smallest currency unit. */
  taxable_amount: number | null;
  /** The type of tax information. */
  type: 'tax_rate_details';
}

/** Additional details about the tax rate. */
export interface InvoiceLineItemTaxRateDetails {
  /** ID of the tax rate. Expandable. */
  tax_rate: string | CustomerTaxRate;
}

/** The reasoning behind a tax amount on an invoice line item. */
export type InvoiceLineItemTaxabilityReason =
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
