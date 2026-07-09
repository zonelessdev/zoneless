import { z } from 'zod';
import { ExpandableSchema } from './ExpandableSchema';

// ─────────────────────────────────────────────────────────────────────────────
// Reusable nested object schemas
// ─────────────────────────────────────────────────────────────────────────────

const PaymentIntentAddressSchema = z.object({
  city: z.string().optional(),
  country: z.string().optional(),
  line1: z.string().optional(),
  line2: z.string().optional(),
  postal_code: z.string().optional(),
  state: z.string().optional(),
});

const PaymentIntentShippingSchema = z.object({
  address: PaymentIntentAddressSchema,
  name: z.string().min(1),
  carrier: z.string().optional(),
  phone: z.string().optional(),
  tracking_number: z.string().optional(),
});

/**
 * @remarks Stripe's line-item `payment_method_options` also define card, card_present,
 * klarna, and paypal commodity/category bags. Those are fiat-rail specific and omitted.
 */
const PaymentIntentAmountDetailsSchema = z.object({
  discount_amount: z.number().int().positive().optional(),
  enforce_arithmetic_validation: z.boolean().optional(),
  line_items: z
    .array(
      z.object({
        product_name: z.string().min(1).max(1024),
        quantity: z.number().int().positive(),
        unit_cost: z.number().int().nonnegative(),
        discount_amount: z.number().int().positive().optional(),
        product_code: z.string().max(12).optional(),
        tax: z
          .object({
            total_tax_amount: z.number().int().nonnegative(),
          })
          .optional(),
        unit_of_measure: z.string().max(12).optional(),
      })
    )
    .max(200)
    .optional(),
  shipping: z
    .object({
      amount: z.number().int().nonnegative().optional(),
      from_postal_code: z.string().max(10).optional(),
      to_postal_code: z.string().max(10).optional(),
    })
    .optional(),
  tax: z
    .object({
      total_tax_amount: z.number().int().nonnegative(),
    })
    .optional(),
});

const PaymentIntentAutomaticPaymentMethodsSchema = z.object({
  enabled: z.boolean(),
  allow_redirects: z.enum(['always', 'never']).optional(),
});

const PaymentIntentHooksSchema = z.object({
  inputs: z
    .object({
      tax: z
        .object({
          calculation: z.string().min(1),
        })
        .optional(),
    })
    .optional(),
});

const PaymentIntentMandateDataSchema = z.object({
  customer_acceptance: z.object({
    type: z.enum(['online', 'offline']),
    accepted_at: z.number().int().positive().optional(),
    offline: z.object({}).optional(),
    online: z
      .object({
        ip_address: z.string().min(1),
        user_agent: z.string().min(1),
      })
      .optional(),
  }),
});

const PaymentIntentPaymentDetailsSchema = z.object({
  customer_reference: z.string().optional(),
  order_reference: z.string().optional(),
});

/**
 * @remarks Stripe defines 40+ per-type hashes here (acss_debit, card, klarna, etc.).
 * Zoneless only accepts USDC wallet payments, so only the `crypto` bag is exposed.
 */
const PaymentIntentPaymentMethodDataSchema = z.object({
  type: z.enum(['crypto']).optional(),
  allow_redisplay: z.enum(['always', 'limited', 'unspecified']).optional(),
  billing_details: z
    .object({
      address: PaymentIntentAddressSchema.optional(),
      email: z.string().email().max(800).optional(),
      name: z.string().optional(),
      phone: z.string().optional(),
      tax_id: z.string().optional(),
    })
    .optional(),
  crypto: z.object({}).optional(),
  metadata: z.record(z.string(), z.string()).optional(),
  shared_payment_granted_token: z.string().optional(),
});

/**
 * @remarks Stripe defines 40+ per-payment-method-type option bags here. Zoneless only
 * accepts USDC wallet payments, so only the `crypto` option bag is exposed.
 */
const PaymentIntentPaymentMethodOptionsSchema = z.object({
  crypto: z
    .object({
      setup_future_usage: z.enum(['none']).optional(),
    })
    .optional(),
});

const PaymentIntentRadarOptionsSchema = z.object({
  session: z.string().optional(),
});

const PaymentIntentTransferDataSchema = z.object({
  destination: z.string().min(1),
  amount: z.number().int().nonnegative().optional(),
  description: z.string().optional(),
  metadata: z.record(z.string(), z.string()).optional(),
  payment_data: z
    .object({
      description: z.string().optional(),
      metadata: z.record(z.string(), z.string()).optional(),
    })
    .optional(),
});

/** Update omits `destination`; it can only be set at create time. */
const PaymentIntentUpdateTransferDataSchema = z.object({
  amount: z.number().int().nonnegative().optional(),
  description: z.string().optional(),
  metadata: z.record(z.string(), z.string()).optional(),
  payment_data: z
    .object({
      description: z.string().optional(),
      metadata: z.record(z.string(), z.string()).optional(),
    })
    .optional(),
});

// ─────────────────────────────────────────────────────────────────────────────
// Create Payment Intent Schema
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Schema for creating a PaymentIntent.
 * @see https://docs.stripe.com/api/payment_intents/create
 */
export const CreatePaymentIntentSchema = z
  .object({
    amount: z
      .number()
      .int('Amount must be an integer (cents)')
      .positive('Amount must be positive')
      .max(99999999, 'Amount supports up to eight digits'),
    currency: z.string().min(1).max(4).toLowerCase().default('usdc'),
    amount_details: PaymentIntentAmountDetailsSchema.optional(),
    application_fee_amount: z.number().int().nonnegative().optional(),
    automatic_payment_methods:
      PaymentIntentAutomaticPaymentMethodsSchema.optional(),
    capture_method: z
      .enum(['automatic', 'automatic_async', 'manual'])
      .optional(),
    confirm: z.boolean().optional(),
    confirmation_method: z.enum(['automatic', 'manual']).optional(),
    confirmation_token: z.string().optional(),
    customer: z.string().optional(),
    customer_account: z.string().optional(),
    description: z.string().optional(),
    error_on_requires_action: z.boolean().optional(),
    excluded_payment_method_types: z.array(z.string()).optional(),
    hooks: PaymentIntentHooksSchema.optional(),
    mandate: z.string().optional(),
    mandate_data: PaymentIntentMandateDataSchema.optional(),
    metadata: z.record(z.string(), z.string()).optional(),
    off_session: z.union([z.boolean(), z.string()]).optional(),
    on_behalf_of: z.string().optional(),
    payment_details: PaymentIntentPaymentDetailsSchema.optional(),
    payment_method: z.string().optional(),
    payment_method_configuration: z.string().max(100).optional(),
    payment_method_data: PaymentIntentPaymentMethodDataSchema.optional(),
    payment_method_options: PaymentIntentPaymentMethodOptionsSchema.optional(),
    payment_method_types: z.array(z.enum(['crypto'])).optional(),
    radar_options: PaymentIntentRadarOptionsSchema.optional(),
    receipt_email: z.string().email().optional(),
    return_url: z.string().url().optional(),
    setup_future_usage: z.enum(['off_session', 'on_session']).optional(),
    shipping: PaymentIntentShippingSchema.optional(),
    statement_descriptor: z
      .string()
      .max(22, 'Statement descriptor must be 22 characters or less')
      .optional(),
    statement_descriptor_suffix: z.string().optional(),
    transfer_data: PaymentIntentTransferDataSchema.optional(),
    transfer_group: z.string().optional(),
    use_stripe_sdk: z.boolean().optional(),
  })
  .merge(ExpandableSchema);

export type CreatePaymentIntentInput = z.infer<
  typeof CreatePaymentIntentSchema
>;

// ─────────────────────────────────────────────────────────────────────────────
// Update Payment Intent Schema
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Schema for updating a PaymentIntent.
 * @see https://docs.stripe.com/api/payment_intents/update
 */
export const UpdatePaymentIntentSchema = z
  .object({
    amount: z
      .number()
      .int('Amount must be an integer (cents)')
      .positive('Amount must be positive')
      .max(99999999, 'Amount supports up to eight digits')
      .optional(),
    amount_details: PaymentIntentAmountDetailsSchema.optional(),
    application_fee_amount: z.number().int().nonnegative().optional(),
    capture_method: z
      .enum(['automatic', 'automatic_async', 'manual'])
      .optional(),
    currency: z.string().min(1).max(4).toLowerCase().optional(),
    customer: z.string().optional(),
    customer_account: z.string().optional(),
    description: z.string().optional(),
    excluded_payment_method_types: z.array(z.string()).optional(),
    hooks: PaymentIntentHooksSchema.optional(),
    metadata: z.record(z.string(), z.string()).optional(),
    payment_details: PaymentIntentPaymentDetailsSchema.optional(),
    payment_method: z.string().optional(),
    payment_method_configuration: z.string().max(100).optional(),
    payment_method_data: PaymentIntentPaymentMethodDataSchema.optional(),
    payment_method_options: PaymentIntentPaymentMethodOptionsSchema.optional(),
    payment_method_types: z.array(z.enum(['crypto'])).optional(),
    receipt_email: z.string().email().optional(),
    setup_future_usage: z.enum(['off_session', 'on_session']).optional(),
    shipping: PaymentIntentShippingSchema.optional(),
    statement_descriptor: z
      .string()
      .max(22, 'Statement descriptor must be 22 characters or less')
      .optional(),
    statement_descriptor_suffix: z.string().optional(),
    transfer_data: PaymentIntentUpdateTransferDataSchema.optional(),
    transfer_group: z.string().optional(),
  })
  .merge(ExpandableSchema);

export type UpdatePaymentIntentInput = z.infer<
  typeof UpdatePaymentIntentSchema
>;

// ─────────────────────────────────────────────────────────────────────────────
// Retrieve Payment Intent Schema
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Schema for retrieving a PaymentIntent.
 * `client_secret` is required when using a publishable key.
 * @see https://docs.stripe.com/api/payment_intents/retrieve
 */
export const RetrievePaymentIntentSchema = z
  .object({
    client_secret: z.string().optional(),
  })
  .merge(ExpandableSchema);

export type RetrievePaymentIntentInput = z.infer<
  typeof RetrievePaymentIntentSchema
>;

// ─────────────────────────────────────────────────────────────────────────────
// List Payment Intents Schema
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Schema for listing PaymentIntents.
 * @see https://docs.stripe.com/api/payment_intents/list
 */
export const ListPaymentIntentsSchema = z
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
    limit: z.number().int().min(1).max(100).optional(),
    starting_after: z.string().optional(),
  })
  .merge(ExpandableSchema);

export type ListPaymentIntentsInput = z.infer<typeof ListPaymentIntentsSchema>;

export const ListPaymentIntentsFiltersSchema = z.object({
  customer: z.string().optional(),
  customer_account: z.string().optional(),
});
export type ListPaymentIntentsFiltersInput = z.infer<
  typeof ListPaymentIntentsFiltersSchema
>;

// ─────────────────────────────────────────────────────────────────────────────
// List Payment Intent Line Items Schema
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Schema for listing PaymentIntent amount details line items.
 * @see https://docs.stripe.com/api/payment_intents/amount_details_line_items
 */
export const ListPaymentIntentLineItemsSchema = z
  .object({
    ending_before: z.string().optional(),
    limit: z.number().int().min(1).max(100).optional(),
    starting_after: z.string().optional(),
  })
  .merge(ExpandableSchema);

export type ListPaymentIntentLineItemsInput = z.infer<
  typeof ListPaymentIntentLineItemsSchema
>;

// ─────────────────────────────────────────────────────────────────────────────
// Cancel Payment Intent Schema
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Schema for canceling a PaymentIntent.
 * @see https://docs.stripe.com/api/payment_intents/cancel
 */
export const CancelPaymentIntentSchema = z
  .object({
    cancellation_reason: z
      .enum(['abandoned', 'duplicate', 'fraudulent', 'requested_by_customer'])
      .optional(),
  })
  .merge(ExpandableSchema);

export type CancelPaymentIntentInput = z.infer<
  typeof CancelPaymentIntentSchema
>;
