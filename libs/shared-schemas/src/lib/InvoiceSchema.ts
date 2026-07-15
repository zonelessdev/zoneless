import { z } from 'zod';
import {
  CheckoutSessionAutomaticTaxSchema,
  CheckoutSessionTransferDataSchema,
} from './CheckoutSessionSchema';
import { ExpandableSchema } from './ExpandableSchema';
import { InvoiceItemDiscountSchema } from './InvoiceItemSchema';

// ─────────────────────────────────────────────────────────────────────────────
// Reusable nested object schemas
// ─────────────────────────────────────────────────────────────────────────────

const InvoiceCustomFieldSchema = z.object({
  name: z.string().min(1).max(40),
  value: z.string().min(1).max(140),
});

const InvoiceFromInvoiceSchema = z.object({
  action: z.literal('revision'),
  invoice: z.string().min(1),
});

const InvoiceIssuerSchema = z
  .object({
    type: z.enum(['account', 'self']),
    account: z.string().optional(),
  })
  .refine((issuer) => issuer.type !== 'account' || !!issuer.account, {
    message: '`account` is required when `type` is `account`',
    path: ['account'],
  });

/**
 * Configuration settings for the PaymentIntent generated when the invoice is finalized.
 * @remarks Stripe's `payment_method_options` also define option bags for many fiat rails
 * (ACH, cards, iDEAL, etc.). Zoneless only accepts USDC wallet payments, so only the
 * `crypto` bag is exposed — matching PaymentIntent / Checkout Session / Payment Link.
 */
const InvoicePaymentSettingsSchema = z.object({
  default_mandate: z.string().optional(),
  payment_method_options: z
    .object({
      crypto: z
        .object({
          setup_future_usage: z.enum(['none']).optional(),
        })
        .optional(),
    })
    .optional(),
  payment_method_types: z.array(z.enum(['crypto'])).optional(),
});

const InvoiceRenderingSchema = z.object({
  amount_tax_display: z
    .enum(['exclude_tax', 'include_inclusive_tax'])
    .optional(),
  pdf: z
    .object({
      page_size: z.enum(['a4', 'auto', 'letter']).optional(),
    })
    .optional(),
  template: z.string().optional(),
  template_version: z.number().int().optional(),
});

const InvoiceDeliveryEstimateBoundSchema = z.object({
  unit: z.enum(['business_day', 'day', 'hour', 'month', 'week']),
  value: z.number().int().positive(),
});

const InvoiceShippingRateDataSchema = z
  .object({
    display_name: z.string().min(1).max(100),
    type: z.literal('fixed_amount'),
    delivery_estimate: z
      .object({
        maximum: InvoiceDeliveryEstimateBoundSchema.optional(),
        minimum: InvoiceDeliveryEstimateBoundSchema.optional(),
      })
      .optional(),
    fixed_amount: z
      .object({
        amount: z.number().int().nonnegative(),
        currency: z.string().min(1).max(4).toLowerCase(),
        currency_options: z
          .record(
            z.string(),
            z.object({
              amount: z.number().int().nonnegative(),
              tax_behavior: z
                .enum(['exclusive', 'inclusive', 'unspecified'])
                .optional(),
            })
          )
          .optional(),
      })
      .optional(),
    metadata: z.record(z.string(), z.string()).optional(),
    tax_behavior: z.enum(['exclusive', 'inclusive', 'unspecified']).optional(),
    tax_code: z.string().optional(),
  })
  .refine((rateData) => rateData.fixed_amount !== undefined, {
    message: '`fixed_amount` is required when `type` is `fixed_amount`',
    path: ['fixed_amount'],
  });

const InvoiceShippingCostSchema = z
  .object({
    shipping_rate: z.string().optional(),
    shipping_rate_data: InvoiceShippingRateDataSchema.optional(),
  })
  .refine(
    (shippingCost) =>
      !!shippingCost.shipping_rate || !!shippingCost.shipping_rate_data,
    {
      message: 'Either `shipping_rate` or `shipping_rate_data` is required',
    }
  )
  .refine(
    (shippingCost) =>
      !(shippingCost.shipping_rate && shippingCost.shipping_rate_data),
    {
      message:
        'Only one of `shipping_rate` or `shipping_rate_data` may be specified',
    }
  );

const InvoiceAddressSchema = z.object({
  city: z.string().optional(),
  country: z.string().optional(),
  line1: z.string().optional(),
  line2: z.string().optional(),
  postal_code: z.string().optional(),
  state: z.string().optional(),
});

const InvoiceShippingDetailsSchema = z.object({
  address: InvoiceAddressSchema,
  name: z.string().min(1),
  phone: z.string().optional(),
});

// ─────────────────────────────────────────────────────────────────────────────
// Create Invoice Schema
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Schema for creating an Invoice.
 * Creates a draft invoice for a given customer. The invoice remains a draft until
 * it is finalized, which allows it to be paid or sent.
 * @see https://docs.stripe.com/api/invoices/create
 */
export const CreateInvoiceSchema = z
  .object({
    account_tax_ids: z.array(z.string()).optional(),
    application_fee_amount: z.number().int().nonnegative().optional(),
    auto_advance: z.boolean().optional(),
    automatic_tax: CheckoutSessionAutomaticTaxSchema.optional(),
    automatically_finalizes_at: z.number().int().positive().optional(),
    collection_method: z
      .enum(['charge_automatically', 'send_invoice'])
      .optional(),
    currency: z.string().min(1).max(4).toLowerCase().optional(),
    custom_fields: z.array(InvoiceCustomFieldSchema).max(4).optional(),
    customer: z.string().max(500).optional(),
    customer_account: z.string().optional(),
    days_until_due: z.number().int().nonnegative().optional(),
    default_payment_method: z.string().optional(),
    default_source: z.string().optional(),
    default_tax_rates: z.array(z.string()).optional(),
    description: z.string().optional(),
    /** Pass an empty string to avoid inheriting any discounts from the customer. */
    discounts: z
      .union([z.array(InvoiceItemDiscountSchema), z.literal('')])
      .optional(),
    due_date: z.number().int().positive().optional(),
    effective_at: z.number().int().positive().optional(),
    footer: z.string().optional(),
    from_invoice: InvoiceFromInvoiceSchema.optional(),
    issuer: InvoiceIssuerSchema.optional(),
    metadata: z.record(z.string(), z.string()).optional(),
    number: z.string().max(26).optional(),
    on_behalf_of: z.string().optional(),
    payment_settings: InvoicePaymentSettingsSchema.optional(),
    pending_invoice_items_behavior: z.enum(['exclude', 'include']).optional(),
    rendering: InvoiceRenderingSchema.optional(),
    shipping_cost: InvoiceShippingCostSchema.optional(),
    shipping_details: InvoiceShippingDetailsSchema.optional(),
    statement_descriptor: z
      .string()
      .regex(
        /[a-zA-Z]/,
        'Statement descriptor must contain at least one letter'
      )
      .optional(),
    subscription: z.string().optional(),
    transfer_data: CheckoutSessionTransferDataSchema.optional(),
  })
  .merge(ExpandableSchema)
  .refine((data) => !!data.customer || !!data.from_invoice, {
    message: 'Either `customer` or `from_invoice` is required',
  })
  .refine(
    (data) =>
      data.collection_method === 'send_invoice' ||
      data.days_until_due === undefined,
    {
      message:
        '`days_until_due` is only valid when `collection_method` is `send_invoice`',
      path: ['days_until_due'],
    }
  )
  .refine(
    (data) =>
      data.collection_method === 'send_invoice' || data.due_date === undefined,
    {
      message:
        '`due_date` is only valid when `collection_method` is `send_invoice`',
      path: ['due_date'],
    }
  );

export type CreateInvoiceInput = z.infer<typeof CreateInvoiceSchema>;

// ─────────────────────────────────────────────────────────────────────────────
// Update Invoice Schema
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Schema for updating an Invoice.
 * Draft invoices are fully editable. Once finalized, monetary values and
 * `collection_method` become uneditable.
 * @see https://docs.stripe.com/api/invoices/update
 */
export const UpdateInvoiceSchema = z
  .object({
    account_tax_ids: z.array(z.string()).optional(),
    application_fee_amount: z.number().int().nonnegative().optional(),
    auto_advance: z.boolean().optional(),
    automatic_tax: CheckoutSessionAutomaticTaxSchema.optional(),
    automatically_finalizes_at: z.number().int().positive().optional(),
    collection_method: z
      .enum(['charge_automatically', 'send_invoice'])
      .optional(),
    /** Pass an empty string to remove previously-defined custom fields. */
    custom_fields: z
      .union([z.array(InvoiceCustomFieldSchema).max(4), z.literal('')])
      .optional(),
    days_until_due: z.number().int().nonnegative().optional(),
    default_payment_method: z.string().optional(),
    default_source: z.string().optional(),
    /** Pass an empty string to remove previously-defined tax rates. */
    default_tax_rates: z.union([z.array(z.string()), z.literal('')]).optional(),
    description: z.string().optional(),
    /** Pass an empty string to remove previously-defined discounts. */
    discounts: z
      .union([z.array(InvoiceItemDiscountSchema), z.literal('')])
      .optional(),
    due_date: z.number().int().positive().optional(),
    effective_at: z.number().int().positive().optional(),
    footer: z.string().optional(),
    issuer: InvoiceIssuerSchema.optional(),
    metadata: z.record(z.string(), z.string()).optional(),
    number: z.string().max(26).optional(),
    on_behalf_of: z.string().optional(),
    payment_settings: InvoicePaymentSettingsSchema.optional(),
    rendering: InvoiceRenderingSchema.optional(),
    shipping_cost: InvoiceShippingCostSchema.optional(),
    shipping_details: InvoiceShippingDetailsSchema.optional(),
    statement_descriptor: z
      .string()
      .regex(
        /[a-zA-Z]/,
        'Statement descriptor must contain at least one letter'
      )
      .optional(),
    /** Pass an empty string to unset transfer data. */
    transfer_data: z
      .union([CheckoutSessionTransferDataSchema, z.literal('')])
      .optional(),
  })
  .merge(ExpandableSchema)
  .refine(
    (data) =>
      data.collection_method !== 'charge_automatically' ||
      data.days_until_due === undefined,
    {
      message:
        '`days_until_due` is only valid when `collection_method` is `send_invoice`',
      path: ['days_until_due'],
    }
  )
  .refine(
    (data) =>
      data.collection_method !== 'charge_automatically' ||
      data.due_date === undefined,
    {
      message:
        '`due_date` is only valid when `collection_method` is `send_invoice`',
      path: ['due_date'],
    }
  );

export type UpdateInvoiceInput = z.infer<typeof UpdateInvoiceSchema>;

// ─────────────────────────────────────────────────────────────────────────────
// Retrieve Invoice Schema
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Schema for retrieving an Invoice.
 * @see https://docs.stripe.com/api/invoices/retrieve
 */
export const RetrieveInvoiceSchema = ExpandableSchema;
export type RetrieveInvoiceInput = z.infer<typeof RetrieveInvoiceSchema>;

// ─────────────────────────────────────────────────────────────────────────────
// List Invoices Schema
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Schema for listing Invoices.
 * Invoices are returned sorted by creation date, with the most recently
 * created invoices appearing first.
 * @see https://docs.stripe.com/api/invoices/list
 */
export const ListInvoicesSchema = z
  .object({
    collection_method: z
      .enum(['charge_automatically', 'send_invoice'])
      .optional(),
    created: z
      .object({
        gt: z.number().int().optional(),
        gte: z.number().int().optional(),
        lt: z.number().int().optional(),
        lte: z.number().int().optional(),
      })
      .optional(),
    customer: z.string().optional(),
    customer_account: z.string().optional(),
    ending_before: z.string().optional(),
    limit: z.number().int().min(1).max(100).optional(),
    starting_after: z.string().optional(),
    status: z
      .enum(['draft', 'open', 'paid', 'uncollectible', 'void'])
      .optional(),
    subscription: z.string().optional(),
  })
  .merge(ExpandableSchema);

export type ListInvoicesInput = z.infer<typeof ListInvoicesSchema>;

export const ListInvoicesFiltersSchema = z.object({
  collection_method: z
    .enum(['charge_automatically', 'send_invoice'])
    .optional(),
  customer: z.string().optional(),
  customer_account: z.string().optional(),
  status: z.enum(['draft', 'open', 'paid', 'uncollectible', 'void']).optional(),
  subscription: z.string().optional(),
});
export type ListInvoicesFiltersInput = z.infer<
  typeof ListInvoicesFiltersSchema
>;

// ─────────────────────────────────────────────────────────────────────────────
// Delete Invoice Schema
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Schema for deleting a draft Invoice.
 * Permanently deletes a one-off invoice draft. This cannot be undone. Attempts
 * to delete invoices that are no longer in a draft state will fail; once an
 * invoice has been finalized or if an invoice is for a subscription, it must
 * be voided instead.
 * @see https://docs.stripe.com/api/invoices/delete
 */
export const DeleteInvoiceSchema = z.object({});
export type DeleteInvoiceInput = z.infer<typeof DeleteInvoiceSchema>;

// ─────────────────────────────────────────────────────────────────────────────
// Finalize Invoice Schema
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Schema for finalizing a draft Invoice.
 * Stripe automatically finalizes drafts before sending and attempting payment.
 * Use this method to finalize a draft invoice manually.
 * @see https://docs.stripe.com/api/invoices/finalize
 */
export const FinalizeInvoiceSchema = z
  .object({
    auto_advance: z.boolean().optional(),
  })
  .merge(ExpandableSchema);

export type FinalizeInvoiceInput = z.infer<typeof FinalizeInvoiceSchema>;

// ─────────────────────────────────────────────────────────────────────────────
// Mark Invoice Uncollectible Schema
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Schema for marking an Invoice as uncollectible.
 * Useful for keeping track of bad debts that can be written off for accounting
 * purposes.
 * @see https://docs.stripe.com/api/invoices/mark_uncollectible
 */
export const MarkInvoiceUncollectibleSchema = ExpandableSchema;
export type MarkInvoiceUncollectibleInput = z.infer<
  typeof MarkInvoiceUncollectibleSchema
>;

// ─────────────────────────────────────────────────────────────────────────────
// Pay Invoice Schema
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Schema for paying an Invoice.
 * Attempts payment on an invoice outside of the normal collection schedule.
 * @see https://docs.stripe.com/api/invoices/pay
 */
export const PayInvoiceSchema = z
  .object({
    forgive: z.boolean().optional(),
    mandate: z.string().optional(),
    off_session: z.boolean().optional(),
    paid_out_of_band: z.boolean().optional(),
    payment_method: z.string().optional(),
    source: z.string().optional(),
  })
  .merge(ExpandableSchema);

export type PayInvoiceInput = z.infer<typeof PayInvoiceSchema>;

// ─────────────────────────────────────────────────────────────────────────────
// Void Invoice Schema
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Schema for voiding a finalized Invoice.
 * Mark a finalized invoice as void. This cannot be undone. Voiding is similar
 * to deletion, but only applies to finalized invoices and maintains a papertrail.
 * @see https://docs.stripe.com/api/invoices/void
 */
export const VoidInvoiceSchema = ExpandableSchema;
export type VoidInvoiceInput = z.infer<typeof VoidInvoiceSchema>;
