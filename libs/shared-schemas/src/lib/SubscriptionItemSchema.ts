import { z } from 'zod';
import { ExpandableSchema } from './ExpandableSchema';
import { InvoiceItemDiscountSchema } from './InvoiceItemSchema';
import { RecurringIntervalSchema } from './PriceSchema';

// ─────────────────────────────────────────────────────────────────────────────
// Reusable nested object schemas
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Controls how Zoneless handles payment when a subscription update requires payment
 * and `collection_method=charge_automatically`.
 */
export const SubscriptionPaymentBehaviorSchema = z.enum([
  'allow_incomplete',
  'default_incomplete',
  'error_if_incomplete',
  'pending_if_incomplete',
]);

/**
 * Determines how to handle prorations when the billing cycle changes or an item's
 * quantity changes. Defaults to `create_prorations`.
 */
export const SubscriptionProrationBehaviorSchema = z.enum([
  'always_invoice',
  'create_prorations',
  'none',
]);

/**
 * Define thresholds at which an invoice will be sent, and the subscription advanced
 * to a new billing period. Pass an empty string to remove previously-defined thresholds.
 */
export const SubscriptionItemBillingThresholdsSchema = z.union([
  z.object({
    usage_gte: z.number().int(),
  }),
  z.literal(''),
]);

/**
 * Data used to generate a new Price object inline when creating a subscription item.
 * Unlike checkout/invoice item `price_data`, recurring is required.
 * @see https://docs.stripe.com/api/subscription_items/create#create_subscription_item-price_data
 */
export const SubscriptionItemPriceDataSchema = z
  .object({
    currency: z.string().min(1).max(4).toLowerCase(),
    product: z.string().min(1),
    recurring: z.object({
      interval: RecurringIntervalSchema,
      interval_count: z.number().int().positive().optional(),
    }),
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

// ─────────────────────────────────────────────────────────────────────────────
// Create Subscription Item Schema
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Schema for creating a Subscription Item.
 * Adds a new item to an existing subscription. No existing items will be changed
 * or replaced.
 * @see https://docs.stripe.com/api/subscription_items/create
 */
export const CreateSubscriptionItemSchema = z
  .object({
    subscription: z.string().min(1),
    /** Pass an empty string to remove previously-defined thresholds. */
    billing_thresholds: SubscriptionItemBillingThresholdsSchema.optional(),
    discounts: z.array(InvoiceItemDiscountSchema).optional(),
    metadata: z.record(z.string(), z.string()).optional(),
    payment_behavior: SubscriptionPaymentBehaviorSchema.optional(),
    price: z.string().optional(),
    price_data: SubscriptionItemPriceDataSchema.optional(),
    proration_behavior: SubscriptionProrationBehaviorSchema.optional(),
    proration_date: z.number().int().optional(),
    quantity: z.number().int().nonnegative().optional(),
    tax_rates: z.array(z.string()).optional(),
  })
  .merge(ExpandableSchema)
  .refine((data) => !!data.price || !!data.price_data, {
    message: 'Either `price` or `price_data` is required',
  })
  .refine((data) => !(data.price && data.price_data), {
    message: 'Only one of `price` or `price_data` may be specified',
  });

export type CreateSubscriptionItemInput = z.infer<
  typeof CreateSubscriptionItemSchema
>;

// ─────────────────────────────────────────────────────────────────────────────
// Update Subscription Item Schema
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Schema for updating a Subscription Item.
 * Updates the plan or quantity of an item on a current subscription.
 * @see https://docs.stripe.com/api/subscription_items/update
 */
export const UpdateSubscriptionItemSchema = z
  .object({
    /** Pass an empty string to remove previously-defined thresholds. */
    billing_thresholds: SubscriptionItemBillingThresholdsSchema.optional(),
    /** Pass an empty string to remove previously-defined discounts. */
    discounts: z
      .union([z.array(InvoiceItemDiscountSchema), z.literal('')])
      .optional(),
    metadata: z.record(z.string(), z.string()).optional(),
    off_session: z.boolean().optional(),
    payment_behavior: SubscriptionPaymentBehaviorSchema.optional(),
    price: z.string().optional(),
    price_data: SubscriptionItemPriceDataSchema.optional(),
    proration_behavior: SubscriptionProrationBehaviorSchema.optional(),
    proration_date: z.number().int().optional(),
    quantity: z.number().int().nonnegative().optional(),
    /** Pass an empty string to remove previously-defined tax rates. */
    tax_rates: z.union([z.array(z.string()), z.literal('')]).optional(),
  })
  .merge(ExpandableSchema)
  .refine((data) => !(data.price && data.price_data), {
    message: 'Only one of `price` or `price_data` may be specified',
  });

export type UpdateSubscriptionItemInput = z.infer<
  typeof UpdateSubscriptionItemSchema
>;

// ─────────────────────────────────────────────────────────────────────────────
// Retrieve Subscription Item Schema
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Schema for retrieving a Subscription Item.
 * @see https://docs.stripe.com/api/subscription_items/retrieve
 */
export const RetrieveSubscriptionItemSchema = ExpandableSchema;
export type RetrieveSubscriptionItemInput = z.infer<
  typeof RetrieveSubscriptionItemSchema
>;

// ─────────────────────────────────────────────────────────────────────────────
// List Subscription Items Schema
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Schema for listing Subscription Items.
 * Returns a list of subscription items for a given subscription.
 * @see https://docs.stripe.com/api/subscription_items/list
 */
export const ListSubscriptionItemsSchema = z
  .object({
    subscription: z.string().min(1),
    ending_before: z.string().optional(),
    limit: z.number().int().min(1).max(100).optional(),
    starting_after: z.string().optional(),
  })
  .merge(ExpandableSchema);

export type ListSubscriptionItemsInput = z.infer<
  typeof ListSubscriptionItemsSchema
>;

export const ListSubscriptionItemsFiltersSchema = z.object({
  subscription: z.string().min(1),
});
export type ListSubscriptionItemsFiltersInput = z.infer<
  typeof ListSubscriptionItemsFiltersSchema
>;

// ─────────────────────────────────────────────────────────────────────────────
// Delete Subscription Item Schema
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Schema for deleting a Subscription Item.
 * Removes an item from the subscription. Does not cancel the subscription.
 * @see https://docs.stripe.com/api/subscription_items/delete
 */
export const DeleteSubscriptionItemSchema = z.object({
  clear_usage: z.boolean().optional(),
  payment_behavior: SubscriptionPaymentBehaviorSchema.optional(),
  proration_behavior: SubscriptionProrationBehaviorSchema.optional(),
  proration_date: z.number().int().optional(),
});
export type DeleteSubscriptionItemInput = z.infer<
  typeof DeleteSubscriptionItemSchema
>;
