import { z } from 'zod';
import { CheckoutSessionAutomaticTaxSchema } from './CheckoutSessionSchema';
import { ExpandableSchema } from './ExpandableSchema';
import { InvoiceItemDiscountSchema } from './InvoiceItemSchema';
import { RecurringIntervalSchema } from './PriceSchema';
import {
  SubscriptionItemBillingThresholdsSchema,
  SubscriptionItemPriceDataSchema,
  SubscriptionPaymentBehaviorSchema,
  SubscriptionProrationBehaviorSchema,
} from './SubscriptionItemSchema';

// ─────────────────────────────────────────────────────────────────────────────
// Reusable nested object schemas
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Payment behavior for subscription creation.
 * `pending_if_incomplete` is exclusive to subscription updates and cannot be used here.
 * @see https://docs.stripe.com/api/subscriptions/create#create_subscription-payment_behavior
 */
export const SubscriptionCreatePaymentBehaviorSchema = z.enum([
  'allow_incomplete',
  'default_incomplete',
  'error_if_incomplete',
]);

/**
 * Proration behavior for subscription creation.
 * `always_invoice` is unsupported for subscription creation.
 * @see https://docs.stripe.com/api/subscriptions/create#create_subscription-proration_behavior
 */
export const SubscriptionCreateProrationBehaviorSchema = z.enum([
  'create_prorations',
  'none',
]);

/**
 * Define thresholds at which an invoice will be sent, and the subscription advanced to a new
 * billing period. When updating, pass an empty string to remove previously-defined thresholds.
 */
export const SubscriptionBillingThresholdsSchema = z.object({
  amount_gte: z.number().int().optional(),
  reset_billing_cycle_anchor: z.boolean().optional(),
});

/**
 * Mutually exclusive with `billing_cycle_anchor`. Only valid with monthly and yearly price
 * intervals. When provided, the billing_cycle_anchor is set to the next occurrence of the
 * day_of_month at the hour, minute, and second UTC.
 */
export const SubscriptionBillingCycleAnchorConfigSchema = z.object({
  day_of_month: z.number().int().min(1).max(31),
  hour: z.number().int().min(0).max(23).optional(),
  minute: z.number().int().min(0).max(59).optional(),
  month: z.number().int().min(1).max(12).optional(),
  second: z.number().int().min(0).max(59).optional(),
});

/**
 * Controls how prorations and invoices for subscriptions are calculated and orchestrated.
 */
export const SubscriptionBillingModeSchema = z.object({
  type: z.enum(['classic', 'flexible']),
  flexible: z
    .object({
      proration_discounts: z.enum(['included', 'itemized']).optional(),
    })
    .optional(),
});

const SubscriptionBillingScheduleDurationSchema = z.object({
  interval: RecurringIntervalSchema,
  interval_count: z.number().int().positive().optional(),
});

const SubscriptionBillingScheduleBillUntilSchema = z
  .object({
    type: z.enum(['duration', 'timestamp']),
    duration: SubscriptionBillingScheduleDurationSchema.optional(),
    timestamp: z.number().int().optional(),
  })
  .refine(
    (billUntil) =>
      billUntil.type !== 'duration' || billUntil.duration !== undefined,
    {
      message: '`duration` is required when `type` is `duration`',
      path: ['duration'],
    }
  )
  .refine(
    (billUntil) =>
      billUntil.type !== 'timestamp' || billUntil.timestamp !== undefined,
    {
      message: '`timestamp` is required when `type` is `timestamp`',
      path: ['timestamp'],
    }
  );

const SubscriptionBillingScheduleAppliesToSchema = z
  .object({
    type: z.literal('price'),
    price: z.string().optional(),
  })
  .refine((appliesTo) => !!appliesTo.price, {
    message: '`price` is required when `type` is `price`',
    path: ['price'],
  });

/**
 * Sets the billing schedules for the subscription (create — `bill_until` required).
 */
export const SubscriptionBillingScheduleSchema = z.object({
  bill_until: SubscriptionBillingScheduleBillUntilSchema,
  applies_to: z.array(SubscriptionBillingScheduleAppliesToSchema).optional(),
  key: z.string().max(200).optional(),
});

/**
 * Sets the billing schedules for the subscription (update — `bill_until` optional).
 */
export const SubscriptionUpdateBillingScheduleSchema = z.object({
  bill_until: SubscriptionBillingScheduleBillUntilSchema.optional(),
  applies_to: z.array(SubscriptionBillingScheduleAppliesToSchema).optional(),
  key: z.string().max(200).optional(),
});

/**
 * Data used to generate a new Price object inline for `add_invoice_items`.
 * Unlike subscription item `price_data`, recurring is not used — these are one-off invoice items.
 * `unit_amount` may be negative to credit the customer.
 */
export const SubscriptionAddInvoiceItemPriceDataSchema = z
  .object({
    currency: z.string().min(1).max(4).toLowerCase(),
    product: z.string().min(1),
    tax_behavior: z.enum(['exclusive', 'inclusive', 'unspecified']).optional(),
    unit_amount: z.number().int().optional(),
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

const SubscriptionAddInvoiceItemPeriodEndSchema = z
  .object({
    type: z.enum(['min_item_period_end', 'timestamp']),
    timestamp: z.number().int().optional(),
  })
  .refine(
    (periodEnd) =>
      periodEnd.type !== 'timestamp' || periodEnd.timestamp !== undefined,
    {
      message: '`timestamp` is required when `type` is `timestamp`',
      path: ['timestamp'],
    }
  );

const SubscriptionAddInvoiceItemPeriodStartSchema = z
  .object({
    type: z.enum(['max_item_period_start', 'now', 'timestamp']),
    timestamp: z.number().int().optional(),
  })
  .refine(
    (periodStart) =>
      periodStart.type !== 'timestamp' || periodStart.timestamp !== undefined,
    {
      message: '`timestamp` is required when `type` is `timestamp`',
      path: ['timestamp'],
    }
  );

const SubscriptionAddInvoiceItemPeriodSchema = z
  .object({
    end: SubscriptionAddInvoiceItemPeriodEndSchema,
    start: SubscriptionAddInvoiceItemPeriodStartSchema,
  })
  .refine(
    (period) => {
      if (
        period.start.type === 'timestamp' &&
        period.end.type === 'timestamp' &&
        period.start.timestamp !== undefined &&
        period.end.timestamp !== undefined
      ) {
        return period.end.timestamp >= period.start.timestamp;
      }
      return true;
    },
    {
      message:
        '`period.end.timestamp` must be greater than or equal to `period.start.timestamp`',
      path: ['end', 'timestamp'],
    }
  );

/**
 * A price and quantity that will generate an invoice item appended to the next invoice for this
 * subscription. You may pass up to 20 items.
 */
export const SubscriptionAddInvoiceItemSchema = z
  .object({
    discountable: z.boolean().optional(),
    discounts: z.array(InvoiceItemDiscountSchema).optional(),
    metadata: z.record(z.string(), z.string()).optional(),
    period: SubscriptionAddInvoiceItemPeriodSchema.optional(),
    price: z.string().optional(),
    price_data: SubscriptionAddInvoiceItemPriceDataSchema.optional(),
    quantity: z.number().int().nonnegative().optional(),
    tax_rates: z.array(z.string()).optional(),
  })
  .refine((item) => !!item.price || !!item.price_data, {
    message: 'Either `price` or `price_data` is required',
  })
  .refine((item) => !(item.price && item.price_data), {
    message: 'Only one of `price` or `price_data` may be specified',
  });

/**
 * A subscription item attached when creating a subscription. Up to 20 items.
 */
export const SubscriptionCreateItemSchema = z
  .object({
    /** Pass an empty string to remove previously-defined thresholds. */
    billing_thresholds: SubscriptionItemBillingThresholdsSchema.optional(),
    discounts: z.array(InvoiceItemDiscountSchema).optional(),
    metadata: z.record(z.string(), z.string()).optional(),
    price: z.string().optional(),
    price_data: SubscriptionItemPriceDataSchema.optional(),
    quantity: z.number().int().nonnegative().optional(),
    tax_rates: z.array(z.string()).optional(),
  })
  .refine((item) => !!item.price || !!item.price_data, {
    message: 'Either `price` or `price_data` is required',
  })
  .refine((item) => !(item.price && item.price_data), {
    message: 'Only one of `price` or `price_data` may be specified',
  });

/**
 * A subscription item when updating a subscription. Omit `id` to add a new item;
 * set `deleted` to remove an existing one. Up to 20 items.
 */
export const SubscriptionUpdateItemSchema = z
  .object({
    id: z.string().optional(),
    /** Pass an empty string to remove previously-defined thresholds. */
    billing_thresholds: SubscriptionItemBillingThresholdsSchema.optional(),
    clear_usage: z.boolean().optional(),
    deleted: z.boolean().optional(),
    /** Pass an empty string to remove previously-defined discounts. */
    discounts: z
      .union([z.array(InvoiceItemDiscountSchema), z.literal('')])
      .optional(),
    metadata: z.record(z.string(), z.string()).optional(),
    price: z.string().optional(),
    price_data: SubscriptionItemPriceDataSchema.optional(),
    quantity: z.number().int().nonnegative().optional(),
    /** Pass an empty string to remove previously-defined tax rates. */
    tax_rates: z.union([z.array(z.string()), z.literal('')]).optional(),
  })
  .refine((item) => !item.deleted || !!item.id, {
    message: '`id` is required when `deleted` is true',
    path: ['id'],
  })
  .refine(
    (item) => item.deleted || !!item.id || !!item.price || !!item.price_data,
    {
      message:
        'Either `price` or `price_data` is required when adding a subscription item',
    }
  )
  .refine((item) => !(item.price && item.price_data), {
    message: 'Only one of `price` or `price_data` may be specified',
  });

/**
 * If specified, payment collection for this subscription will be paused.
 * Pass an empty string to resume collection.
 */
export const SubscriptionPauseCollectionSchema = z.object({
  behavior: z.enum(['keep_as_draft', 'mark_uncollectible', 'void']),
  resumes_at: z.number().int().optional(),
});

/**
 * Details about why this subscription was cancelled.
 */
export const SubscriptionCancellationDetailsSchema = z.object({
  comment: z.string().optional(),
  feedback: z
    .enum([
      'customer_service',
      'low_quality',
      'missing_features',
      'other',
      'switched_service',
      'too_complex',
      'too_expensive',
      'unused',
    ])
    .optional(),
});

/**
 * On update, `billing_cycle_anchor` is either `now` or `unchanged` (not a timestamp).
 */
export const SubscriptionUpdateBillingCycleAnchorSchema = z.enum([
  'now',
  'unchanged',
]);

const SubscriptionIssuerSchema = z
  .object({
    type: z.enum(['account', 'self']),
    account: z.string().optional(),
  })
  .refine((issuer) => issuer.type !== 'account' || !!issuer.account, {
    message: '`account` is required when `type` is `account`',
    path: ['account'],
  });

const SubscriptionInvoiceCustomFieldSchema = z.object({
  name: z.string().min(1).max(40),
  value: z.string().min(1).max(140),
});

/**
 * All invoices will be billed using the specified settings.
 */
export const SubscriptionInvoiceSettingsSchema = z.object({
  account_tax_ids: z.array(z.string()).optional(),
  custom_fields: z
    .array(SubscriptionInvoiceCustomFieldSchema)
    .max(4)
    .optional(),
  description: z.string().optional(),
  footer: z.string().optional(),
  issuer: SubscriptionIssuerSchema.optional(),
});

/**
 * Payment settings to pass to invoices created by the subscription.
 * @remarks Stripe's `payment_method_options` also define option bags for many fiat rails
 * (ACH, cards, iDEAL, etc.). Zoneless only accepts USDC wallet payments, so only the
 * `crypto` bag is exposed — matching Invoice / PaymentIntent / Checkout Session / Payment Link.
 */
export const SubscriptionPaymentSettingsSchema = z.object({
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
  save_default_payment_method: z.enum(['off', 'on_subscription']).optional(),
});

/**
 * Specifies an interval for how often to bill for any pending invoice items.
 */
export const SubscriptionPendingInvoiceItemIntervalSchema = z.object({
  interval: RecurringIntervalSchema,
  interval_count: z.number().int().positive().optional(),
});

/**
 * If specified, the funds from the subscription's invoices will be transferred to the destination.
 */
export const SubscriptionTransferDataSchema = z.object({
  destination: z.string().min(1),
  amount_percent: z.number().min(0).max(100).optional(),
});

/**
 * Settings related to subscription trials.
 */
export const SubscriptionTrialSettingsSchema = z.object({
  end_behavior: z.object({
    missing_payment_method: z.enum(['cancel', 'create_invoice', 'pause']),
  }),
});

/**
 * A timestamp at which the subscription should cancel, or a special enum value.
 */
export const SubscriptionCancelAtSchema = z.union([
  z.number().int(),
  z.enum(['max_billed_until', 'max_period_end', 'min_period_end']),
]);

/**
 * Unix timestamp representing the end of the trial period, or the special value `now` to end
 * the customer's trial immediately.
 */
export const SubscriptionTrialEndSchema = z.union([
  z.number().int(),
  z.literal('now'),
]);

// ─────────────────────────────────────────────────────────────────────────────
// Create Subscription Schema
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Schema for creating a Subscription.
 * Creates a new subscription on an existing customer. Each customer can have up to 500 active
 * or scheduled subscriptions.
 * @see https://docs.stripe.com/api/subscriptions/create
 */
export const CreateSubscriptionSchema = z
  .object({
    items: z.array(SubscriptionCreateItemSchema).min(1).max(20),
    add_invoice_items: z
      .array(SubscriptionAddInvoiceItemSchema)
      .max(20)
      .optional(),
    application_fee_percent: z.number().min(0).max(100).optional(),
    automatic_tax: CheckoutSessionAutomaticTaxSchema.optional(),
    backdate_start_date: z.number().int().optional(),
    billing_cycle_anchor: z.number().int().optional(),
    billing_cycle_anchor_config:
      SubscriptionBillingCycleAnchorConfigSchema.optional(),
    billing_mode: SubscriptionBillingModeSchema.optional(),
    billing_schedules: z.array(SubscriptionBillingScheduleSchema).optional(),
    billing_thresholds: SubscriptionBillingThresholdsSchema.optional(),
    cancel_at: SubscriptionCancelAtSchema.optional(),
    cancel_at_period_end: z.boolean().optional(),
    collection_method: z
      .enum(['charge_automatically', 'send_invoice'])
      .optional(),
    currency: z.string().min(1).max(4).toLowerCase().optional(),
    customer: z.string().max(500).optional(),
    customer_account: z.string().optional(),
    days_until_due: z.number().int().nonnegative().optional(),
    default_payment_method: z.string().optional(),
    default_source: z.string().optional(),
    default_tax_rates: z.array(z.string()).optional(),
    description: z.string().max(500).optional(),
    discounts: z.array(InvoiceItemDiscountSchema).optional(),
    invoice_settings: SubscriptionInvoiceSettingsSchema.optional(),
    metadata: z.record(z.string(), z.string()).optional(),
    off_session: z.boolean().optional(),
    on_behalf_of: z.string().optional(),
    payment_behavior: SubscriptionCreatePaymentBehaviorSchema.optional(),
    payment_settings: SubscriptionPaymentSettingsSchema.optional(),
    pending_invoice_item_interval:
      SubscriptionPendingInvoiceItemIntervalSchema.optional(),
    proration_behavior: SubscriptionCreateProrationBehaviorSchema.optional(),
    transfer_data: SubscriptionTransferDataSchema.optional(),
    trial_end: SubscriptionTrialEndSchema.optional(),
    trial_from_plan: z.boolean().optional(),
    trial_period_days: z.number().int().nonnegative().optional(),
    trial_settings: SubscriptionTrialSettingsSchema.optional(),
  })
  .merge(ExpandableSchema)
  .refine((data) => !!data.customer || !!data.customer_account, {
    message: 'Either `customer` or `customer_account` is required',
  })
  .refine((data) => !(data.customer && data.customer_account), {
    message: 'Only one of `customer` or `customer_account` may be specified',
  })
  .refine(
    (data) => !(data.billing_cycle_anchor && data.billing_cycle_anchor_config),
    {
      message:
        'Only one of `billing_cycle_anchor` or `billing_cycle_anchor_config` may be specified',
    }
  )
  .refine(
    (data) => !(data.trial_end !== undefined && data.trial_from_plan === true),
    {
      message:
        'Setting `trial_from_plan` to `true` together with `trial_end` is not allowed',
    }
  );

export type CreateSubscriptionInput = z.infer<typeof CreateSubscriptionSchema>;

// ─────────────────────────────────────────────────────────────────────────────
// Update Subscription Schema
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Schema for updating a Subscription.
 * Updates an existing subscription to match the specified parameters. When changing prices
 * or quantities, prorations are created by default.
 * @see https://docs.stripe.com/api/subscriptions/update
 */
export const UpdateSubscriptionSchema = z
  .object({
    add_invoice_items: z
      .array(SubscriptionAddInvoiceItemSchema)
      .max(20)
      .optional(),
    application_fee_percent: z.number().min(0).max(100).optional(),
    automatic_tax: CheckoutSessionAutomaticTaxSchema.optional(),
    billing_cycle_anchor: SubscriptionUpdateBillingCycleAnchorSchema.optional(),
    billing_schedules: z
      .array(SubscriptionUpdateBillingScheduleSchema)
      .optional(),
    /** Pass an empty string to remove previously-defined thresholds. */
    billing_thresholds: z
      .union([SubscriptionBillingThresholdsSchema, z.literal('')])
      .optional(),
    cancel_at: SubscriptionCancelAtSchema.optional(),
    cancel_at_period_end: z.boolean().optional(),
    cancellation_details: SubscriptionCancellationDetailsSchema.optional(),
    collection_method: z
      .enum(['charge_automatically', 'send_invoice'])
      .optional(),
    days_until_due: z.number().int().nonnegative().optional(),
    default_payment_method: z.string().optional(),
    default_source: z.string().optional(),
    /** Pass an empty string to remove previously-defined tax rates. */
    default_tax_rates: z.union([z.array(z.string()), z.literal('')]).optional(),
    description: z.string().max(500).optional(),
    /**
     * Pass an empty string to clear the subscription's discounts. An empty array leaves
     * discounts unchanged; a populated array overwrites them.
     */
    discounts: z
      .union([z.array(InvoiceItemDiscountSchema), z.literal('')])
      .optional(),
    invoice_settings: SubscriptionInvoiceSettingsSchema.optional(),
    items: z.array(SubscriptionUpdateItemSchema).max(20).optional(),
    metadata: z.record(z.string(), z.string()).optional(),
    off_session: z.boolean().optional(),
    on_behalf_of: z.string().optional(),
    /** Pass an empty string to resume payment collection. */
    pause_collection: z
      .union([SubscriptionPauseCollectionSchema, z.literal('')])
      .optional(),
    payment_behavior: SubscriptionPaymentBehaviorSchema.optional(),
    payment_settings: SubscriptionPaymentSettingsSchema.optional(),
    pending_invoice_item_interval:
      SubscriptionPendingInvoiceItemIntervalSchema.optional(),
    proration_behavior: SubscriptionProrationBehaviorSchema.optional(),
    proration_date: z.number().int().optional(),
    /** Pass an empty string to unset transfer data. */
    transfer_data: z
      .union([SubscriptionTransferDataSchema, z.literal('')])
      .optional(),
    trial_end: SubscriptionTrialEndSchema.optional(),
    trial_from_plan: z.boolean().optional(),
    trial_settings: SubscriptionTrialSettingsSchema.optional(),
  })
  .merge(ExpandableSchema)
  .refine(
    (data) => !(data.trial_end !== undefined && data.trial_from_plan === true),
    {
      message:
        'Setting `trial_from_plan` to `true` together with `trial_end` is not allowed',
    }
  );

export type UpdateSubscriptionInput = z.infer<typeof UpdateSubscriptionSchema>;

// ─────────────────────────────────────────────────────────────────────────────
// Retrieve Subscription Schema
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Schema for retrieving a Subscription.
 * @see https://docs.stripe.com/api/subscriptions/retrieve
 */
export const RetrieveSubscriptionSchema = ExpandableSchema;
export type RetrieveSubscriptionInput = z.infer<
  typeof RetrieveSubscriptionSchema
>;

// ─────────────────────────────────────────────────────────────────────────────
// List Subscriptions Schema
// ─────────────────────────────────────────────────────────────────────────────

const SubscriptionListDateFilterSchema = z.object({
  gt: z.number().int().optional(),
  gte: z.number().int().optional(),
  lt: z.number().int().optional(),
  lte: z.number().int().optional(),
});

/**
 * Status filter for listing subscriptions. Includes subscription statuses plus
 * special values `all` and `ended`.
 * @see https://docs.stripe.com/api/subscriptions/list#list_subscriptions-status
 */
export const ListSubscriptionsStatusSchema = z.enum([
  'active',
  'all',
  'canceled',
  'ended',
  'incomplete',
  'incomplete_expired',
  'past_due',
  'paused',
  'trialing',
  'unpaid',
]);

/**
 * Schema for listing Subscriptions.
 * By default, returns subscriptions that have not been canceled. Pass
 * `status=canceled` (or `all` / `ended`) to include canceled subscriptions.
 * @see https://docs.stripe.com/api/subscriptions/list
 */
export const ListSubscriptionsSchema = z
  .object({
    automatic_tax: z
      .object({
        enabled: z.boolean(),
      })
      .optional(),
    collection_method: z
      .enum(['charge_automatically', 'send_invoice'])
      .optional(),
    created: SubscriptionListDateFilterSchema.optional(),
    current_period_end: SubscriptionListDateFilterSchema.optional(),
    current_period_start: SubscriptionListDateFilterSchema.optional(),
    customer: z.string().optional(),
    customer_account: z.string().optional(),
    ending_before: z.string().optional(),
    limit: z.number().int().min(1).max(100).optional(),
    price: z.string().optional(),
    starting_after: z.string().optional(),
    status: ListSubscriptionsStatusSchema.optional(),
    test_clock: z.string().optional(),
  })
  .merge(ExpandableSchema);

export type ListSubscriptionsInput = z.infer<typeof ListSubscriptionsSchema>;

export const ListSubscriptionsFiltersSchema = z.object({
  automatic_tax: z
    .object({
      enabled: z.boolean(),
    })
    .optional(),
  collection_method: z
    .enum(['charge_automatically', 'send_invoice'])
    .optional(),
  customer: z.string().optional(),
  customer_account: z.string().optional(),
  price: z.string().optional(),
  status: ListSubscriptionsStatusSchema.optional(),
  test_clock: z.string().optional(),
});
export type ListSubscriptionsFiltersInput = z.infer<
  typeof ListSubscriptionsFiltersSchema
>;

// ─────────────────────────────────────────────────────────────────────────────
// Cancel Subscription Schema
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Schema for canceling a Subscription.
 * Cancels a customer's subscription immediately. The customer won't be charged again.
 * After it's canceled, the subscription is largely immutable — you can still update
 * its metadata and `cancellation_details`.
 * @see https://docs.stripe.com/api/subscriptions/cancel
 */
export const CancelSubscriptionSchema = z
  .object({
    cancellation_details: SubscriptionCancellationDetailsSchema.optional(),
    invoice_now: z.boolean().optional(),
    prorate: z.boolean().optional(),
  })
  .merge(ExpandableSchema);

export type CancelSubscriptionInput = z.infer<typeof CancelSubscriptionSchema>;

// ─────────────────────────────────────────────────────────────────────────────
// Migrate Subscription Schema
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Billing mode for migrating a subscription. Only `flexible` is supported — this upgrades
 * an existing subscription's billing_mode from classic.
 * @see https://docs.stripe.com/api/subscriptions/migrate#migrate_subscription-billing_mode
 */
export const MigrateSubscriptionBillingModeSchema = z.object({
  type: z.literal('flexible'),
  flexible: z
    .object({
      proration_discounts: z.enum(['included', 'itemized']).optional(),
    })
    .optional(),
});

/**
 * Schema for migrating a Subscription.
 * Upgrades the `billing_mode` of an existing subscription to `flexible`.
 * @see https://docs.stripe.com/api/subscriptions/migrate
 */
export const MigrateSubscriptionSchema = z
  .object({
    billing_mode: MigrateSubscriptionBillingModeSchema,
  })
  .merge(ExpandableSchema);

export type MigrateSubscriptionInput = z.infer<
  typeof MigrateSubscriptionSchema
>;

// ─────────────────────────────────────────────────────────────────────────────
// Resume Subscription Schema
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Schema for resuming a Subscription.
 * Initiates resumption of a paused subscription, optionally resetting the billing cycle
 * anchor and creating prorations. Only available for subscriptions with
 * `collection_method=charge_automatically`.
 * @see https://docs.stripe.com/api/subscriptions/resume
 */
export const ResumeSubscriptionSchema = z
  .object({
    billing_cycle_anchor: SubscriptionUpdateBillingCycleAnchorSchema.optional(),
    proration_behavior: SubscriptionProrationBehaviorSchema.optional(),
    proration_date: z.number().int().optional(),
  })
  .merge(ExpandableSchema);

export type ResumeSubscriptionInput = z.infer<typeof ResumeSubscriptionSchema>;
