import { z } from 'zod';
import { ExpandableSchema } from './ExpandableSchema';

// ─────────────────────────────────────────────────────────────────────────────
// Reusable nested object schemas
// ─────────────────────────────────────────────────────────────────────────────

const InvoiceItemDiscountSchema = z
  .object({
    coupon: z.string().optional(),
    discount: z.string().optional(),
    promotion_code: z.string().optional(),
  })
  .refine(
    (discount) => {
      const count = [
        discount.coupon,
        discount.discount,
        discount.promotion_code,
      ].filter(Boolean).length;
      return count === 1;
    },
    {
      message:
        'Exactly one of `coupon`, `discount`, or `promotion_code` must be specified',
    }
  );

const InvoiceItemPeriodSchema = z
  .object({
    end: z.number().int(),
    start: z.number().int(),
  })
  .refine((period) => period.end >= period.start, {
    message: '`period.end` must be greater than or equal to `period.start`',
    path: ['end'],
  });

const InvoiceItemPriceDataSchema = z
  .object({
    currency: z.string().min(1).max(4).toLowerCase(),
    product: z.string().min(1),
    tax_behavior: z.enum(['exclusive', 'inclusive', 'unspecified']).optional(),
    unit_amount: z.number().int().nonnegative().optional(),
    unit_amount_decimal: z.string().optional(),
  })
  .refine(
    (priceData) =>
      priceData.unit_amount !== undefined ||
      priceData.unit_amount_decimal !== undefined,
    { message: 'Either `unit_amount` or `unit_amount_decimal` is required' }
  )
  .refine(
    (priceData) =>
      !(
        priceData.unit_amount !== undefined &&
        priceData.unit_amount_decimal !== undefined
      ),
    {
      message:
        'Only one of `unit_amount` or `unit_amount_decimal` may be specified',
    }
  );

const InvoiceItemPricingSchema = z.object({
  price: z.string().optional(),
});

// ─────────────────────────────────────────────────────────────────────────────
// Create Invoice Item Schema
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Schema for creating an Invoice Item.
 * Creates an item to be added to a draft invoice (up to 250 items per invoice).
 * If no invoice is specified, the item will be on the next invoice created for
 * the customer specified.
 * @see https://docs.stripe.com/api/invoiceitems/create
 */
export const CreateInvoiceItemSchema = z
  .object({
    amount: z.number().int().optional(),
    currency: z.string().min(1).max(4).toLowerCase().optional(),
    customer: z.string().max(500).optional(),
    customer_account: z.string().optional(),
    description: z.string().optional(),
    discountable: z.boolean().optional(),
    discounts: z.array(InvoiceItemDiscountSchema).optional(),
    invoice: z.string().optional(),
    metadata: z.record(z.string(), z.string()).optional(),
    period: InvoiceItemPeriodSchema.optional(),
    price_data: InvoiceItemPriceDataSchema.optional(),
    pricing: InvoiceItemPricingSchema.optional(),
    quantity: z.number().int().nonnegative().optional(),
    quantity_decimal: z.string().optional(),
    subscription: z.string().optional(),
    tax_behavior: z.enum(['exclusive', 'inclusive', 'unspecified']).optional(),
    tax_code: z.string().optional(),
    tax_rates: z.array(z.string()).optional(),
    unit_amount_decimal: z.string().optional(),
  })
  .merge(ExpandableSchema)
  .refine((data) => !!data.customer || !!data.customer_account, {
    message: 'Either `customer` or `customer_account` is required',
  })
  .refine((data) => !(data.customer && data.customer_account), {
    message: 'Only one of `customer` or `customer_account` may be specified',
  })
  .refine(
    (data) =>
      !(data.quantity !== undefined && data.quantity_decimal !== undefined),
    {
      message: 'Only one of `quantity` or `quantity_decimal` may be specified',
    }
  );

export type CreateInvoiceItemInput = z.infer<typeof CreateInvoiceItemSchema>;

// ─────────────────────────────────────────────────────────────────────────────
// Update Invoice Item Schema
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Schema for updating an Invoice Item.
 * Updating an invoice item is only possible before the invoice it's attached to
 * is closed.
 * @see https://docs.stripe.com/api/invoiceitems/update
 */
export const UpdateInvoiceItemSchema = z
  .object({
    amount: z.number().int().optional(),
    description: z.string().optional(),
    discountable: z.boolean().optional(),
    /** Pass an empty string to remove previously-defined discounts. */
    discounts: z
      .union([z.array(InvoiceItemDiscountSchema), z.literal('')])
      .optional(),
    metadata: z.record(z.string(), z.string()).optional(),
    period: InvoiceItemPeriodSchema.optional(),
    price_data: InvoiceItemPriceDataSchema.optional(),
    pricing: InvoiceItemPricingSchema.optional(),
    quantity: z.number().int().nonnegative().optional(),
    quantity_decimal: z.string().optional(),
    tax_behavior: z.enum(['exclusive', 'inclusive', 'unspecified']).optional(),
    tax_code: z.string().optional(),
    /** Pass an empty string to remove previously-defined tax rates. */
    tax_rates: z.union([z.array(z.string()), z.literal('')]).optional(),
    unit_amount_decimal: z.string().optional(),
  })
  .merge(ExpandableSchema)
  .refine(
    (data) =>
      !(data.quantity !== undefined && data.quantity_decimal !== undefined),
    {
      message: 'Only one of `quantity` or `quantity_decimal` may be specified',
    }
  );

export type UpdateInvoiceItemInput = z.infer<typeof UpdateInvoiceItemSchema>;

// ─────────────────────────────────────────────────────────────────────────────
// Retrieve Invoice Item Schema
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Schema for retrieving an Invoice Item.
 * @see https://docs.stripe.com/api/invoiceitems/retrieve
 */
export const RetrieveInvoiceItemSchema = ExpandableSchema;
export type RetrieveInvoiceItemInput = z.infer<
  typeof RetrieveInvoiceItemSchema
>;

// ─────────────────────────────────────────────────────────────────────────────
// List Invoice Items Schema
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Schema for listing Invoice Items.
 * Invoice items are returned sorted by creation date, with the most recently
 * created invoice items appearing first.
 * @see https://docs.stripe.com/api/invoiceitems/list
 */
export const ListInvoiceItemsSchema = z
  .object({
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
    invoice: z.string().optional(),
    limit: z.number().int().min(1).max(100).optional(),
    pending: z.boolean().optional(),
    starting_after: z.string().optional(),
  })
  .merge(ExpandableSchema);

export type ListInvoiceItemsInput = z.infer<typeof ListInvoiceItemsSchema>;

export const ListInvoiceItemsFiltersSchema = z.object({
  customer: z.string().optional(),
  customer_account: z.string().optional(),
  invoice: z.string().optional(),
  pending: z.boolean().optional(),
});
export type ListInvoiceItemsFiltersInput = z.infer<
  typeof ListInvoiceItemsFiltersSchema
>;

// ─────────────────────────────────────────────────────────────────────────────
// Delete Invoice Item Schema
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Schema for deleting an Invoice Item.
 * Deleting invoice items is only possible when they're not attached to invoices,
 * or if they're attached to a draft invoice.
 * @see https://docs.stripe.com/api/invoiceitems/delete
 */
export const DeleteInvoiceItemSchema = z.object({});
export type DeleteInvoiceItemInput = z.infer<typeof DeleteInvoiceItemSchema>;
