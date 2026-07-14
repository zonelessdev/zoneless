import { z } from 'zod';
import { ExpandableSchema } from './ExpandableSchema';
import {
  CheckoutSessionAdjustableQuantitySchema,
  CheckoutSessionAutomaticTaxSchema,
  CheckoutSessionConsentCollectionSchema,
  CheckoutSessionCustomFieldSchema,
  CheckoutSessionCustomTextSchema,
  CheckoutSessionInvoiceCreationSchema,
  CheckoutSessionNameCollectionSchema,
  CheckoutSessionOptionalItemSchema,
  CheckoutSessionPhoneNumberCollectionSchema,
  CheckoutSessionPriceDataSchema,
  CheckoutSessionShippingAddressCollectionSchema,
  CheckoutSessionTaxIdCollectionSchema,
  CheckoutSessionTransferDataSchema,
} from './CheckoutSessionSchema';

// ─────────────────────────────────────────────────────────────────────────────
// Reusable nested object schemas
// ─────────────────────────────────────────────────────────────────────────────

const PaymentLinkAfterCompletionSchema = z
  .object({
    type: z.enum(['hosted_confirmation', 'redirect']),
    hosted_confirmation: z
      .object({
        custom_message: z.string().max(500).optional(),
      })
      .optional(),
    redirect: z
      .object({
        url: z.string().url(),
      })
      .optional(),
  })
  .refine(
    (afterCompletion) =>
      afterCompletion.type !== 'redirect' || !!afterCompletion.redirect,
    {
      message: '`redirect` is required when `type` is `redirect`',
      path: ['redirect'],
    }
  );

const PaymentLinkLineItemSchema = z
  .object({
    quantity: z.number().int().nonnegative(),
    adjustable_quantity: CheckoutSessionAdjustableQuantitySchema.optional(),
    price: z.string().optional(),
    price_data: CheckoutSessionPriceDataSchema.optional(),
  })
  .refine((lineItem) => !!lineItem.price || !!lineItem.price_data, {
    message: 'Either `price` or `price_data` is required for each line item',
  });

/**
 * A subset of parameters passed to PaymentIntent creation for Checkout Sessions in
 * `payment` mode created by this payment link.
 */
const PaymentLinkPaymentIntentDataSchema = z.object({
  capture_method: z.enum(['automatic', 'automatic_async', 'manual']).optional(),
  description: z.string().optional(),
  metadata: z.record(z.string(), z.string()).optional(),
  setup_future_usage: z.enum(['off_session', 'on_session']).optional(),
  statement_descriptor: z.string().max(22).optional(),
  statement_descriptor_suffix: z.string().optional(),
  transfer_group: z.string().optional(),
});

/**
 * Payment-method-specific configuration.
 * @remarks Stripe's documented Payment Link options here are card brand restrictions.
 * Zoneless only accepts USDC wallet payments; the `card` bag is retained for API parity,
 * and `crypto` is exposed to match Checkout Session payment method options.
 */
const PaymentLinkPaymentMethodOptionsSchema = z.object({
  card: z
    .object({
      restrictions: z
        .object({
          brands_blocked: z
            .array(
              z.enum([
                'american_express',
                'discover_global_network',
                'mastercard',
                'visa',
              ])
            )
            .optional(),
        })
        .optional(),
    })
    .optional(),
  crypto: z
    .object({
      setup_future_usage: z.enum(['none']).optional(),
    })
    .optional(),
});

const PaymentLinkRestrictionsSchema = z.object({
  completed_sessions: z.object({
    limit: z.number().int().positive(),
  }),
});

const PaymentLinkShippingOptionSchema = z.object({
  shipping_rate: z.string().optional(),
});

/**
 * Configuration data used when creating a subscription from this payment link.
 * There must be at least one line item with a recurring price to use subscription_data.
 */
const PaymentLinkSubscriptionDataSchema = z.object({
  description: z.string().max(500).optional(),
  invoice_settings: z
    .object({
      issuer: z
        .object({
          type: z.enum(['account', 'self']),
          account: z.string().optional(),
        })
        .optional(),
    })
    .optional(),
  metadata: z.record(z.string(), z.string()).optional(),
  trial_period_days: z.number().int().positive().optional(),
  trial_settings: z
    .object({
      end_behavior: z.object({
        missing_payment_method: z.enum(['cancel', 'create_invoice', 'pause']),
      }),
    })
    .optional(),
});

// ─────────────────────────────────────────────────────────────────────────────
// Retrieve Payment Link Schema
// ─────────────────────────────────────────────────────────────────────────────

export const RetrievePaymentLinkSchema = ExpandableSchema;
export type RetrievePaymentLinkInput = z.infer<
  typeof RetrievePaymentLinkSchema
>;

// ─────────────────────────────────────────────────────────────────────────────
// Create Payment Link Schema
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Schema for creating a payment link.
 * @see https://docs.stripe.com/api/payment_links/payment_links/create
 */
export const CreatePaymentLinkSchema = z
  .object({
    line_items: z.array(PaymentLinkLineItemSchema).min(1).max(20),

    after_completion: PaymentLinkAfterCompletionSchema.optional(),
    allow_promotion_codes: z.boolean().optional(),
    application_fee_amount: z.number().int().nonnegative().optional(),
    application_fee_percent: z.number().min(0).max(100).optional(),
    automatic_tax: CheckoutSessionAutomaticTaxSchema.optional(),
    billing_address_collection: z.enum(['auto', 'required']).optional(),
    consent_collection: CheckoutSessionConsentCollectionSchema.optional(),
    currency: z.string().min(1).max(4).optional(),
    custom_fields: z.array(CheckoutSessionCustomFieldSchema).max(3).optional(),
    custom_text: CheckoutSessionCustomTextSchema.optional(),
    customer_creation: z.enum(['always', 'if_required']).optional(),
    inactive_message: z.string().max(500).optional(),
    invoice_creation: CheckoutSessionInvoiceCreationSchema.optional(),
    managed_payments: z
      .object({
        enabled: z.boolean().optional(),
      })
      .optional(),
    metadata: z.record(z.string(), z.string()).optional(),
    name_collection: CheckoutSessionNameCollectionSchema.optional(),
    on_behalf_of: z.string().optional(),
    optional_items: z
      .array(CheckoutSessionOptionalItemSchema)
      .max(10)
      .optional(),
    payment_intent_data: PaymentLinkPaymentIntentDataSchema.optional(),
    payment_method_collection: z.enum(['always', 'if_required']).optional(),
    payment_method_options: PaymentLinkPaymentMethodOptionsSchema.optional(),
    payment_method_types: z.array(z.enum(['crypto'])).optional(),
    phone_number_collection:
      CheckoutSessionPhoneNumberCollectionSchema.optional(),
    restrictions: PaymentLinkRestrictionsSchema.optional(),
    shipping_address_collection:
      CheckoutSessionShippingAddressCollectionSchema.optional(),
    shipping_options: z.array(PaymentLinkShippingOptionSchema).optional(),
    submit_type: z
      .enum(['auto', 'book', 'donate', 'pay', 'subscribe'])
      .optional(),
    subscription_data: PaymentLinkSubscriptionDataSchema.optional(),
    tax_id_collection: CheckoutSessionTaxIdCollectionSchema.optional(),
    transfer_data: CheckoutSessionTransferDataSchema.optional(),
  })
  .merge(ExpandableSchema)
  .refine(
    (paymentLink) =>
      (paymentLink.line_items.length ?? 0) +
        (paymentLink.optional_items?.length ?? 0) <=
      20,
    {
      message:
        'Combined `line_items` and `optional_items` must not exceed 20 items',
      path: ['optional_items'],
    }
  );

export type CreatePaymentLinkInput = z.infer<typeof CreatePaymentLinkSchema>;

// ─────────────────────────────────────────────────────────────────────────────
// Update Payment Link Schema
// ─────────────────────────────────────────────────────────────────────────────

/**
 * To update an existing line item, specify its `id` along with the fields to change.
 * New line items cannot be added via update — use create with `price` / `price_data`.
 */
const UpdatePaymentLinkLineItemSchema = z.object({
  id: z.string().min(1),
  adjustable_quantity: CheckoutSessionAdjustableQuantitySchema.optional(),
  quantity: z.number().int().nonnegative().optional(),
});

/**
 * Updatable PaymentIntent parameters for Checkout Sessions created by this payment link.
 * Narrower than create — capture_method and setup_future_usage are not updatable.
 */
const UpdatePaymentLinkPaymentIntentDataSchema = z.object({
  description: z.string().optional(),
  metadata: z.record(z.string(), z.string()).optional(),
  statement_descriptor: z.string().max(22).optional(),
  statement_descriptor_suffix: z.string().optional(),
  transfer_group: z.string().optional(),
});

/**
 * Updatable subscription configuration for this payment link.
 * Narrower than create — description is not updatable.
 */
const UpdatePaymentLinkSubscriptionDataSchema = z.object({
  invoice_settings: z
    .object({
      issuer: z
        .object({
          type: z.enum(['account', 'self']),
          account: z.string().optional(),
        })
        .optional(),
    })
    .optional(),
  metadata: z.record(z.string(), z.string()).optional(),
  trial_period_days: z.number().int().positive().optional(),
  trial_settings: z
    .object({
      end_behavior: z.object({
        missing_payment_method: z.enum(['cancel', 'create_invoice', 'pause']),
      }),
    })
    .optional(),
});

/**
 * Schema for updating a payment link.
 * @see https://docs.stripe.com/api/payment_links/payment_links/update
 */
export const UpdatePaymentLinkSchema = z
  .object({
    active: z.boolean().optional(),
    after_completion: PaymentLinkAfterCompletionSchema.optional(),
    allow_promotion_codes: z.boolean().optional(),
    automatic_tax: CheckoutSessionAutomaticTaxSchema.optional(),
    billing_address_collection: z.enum(['auto', 'required']).optional(),
    custom_fields: z.array(CheckoutSessionCustomFieldSchema).max(3).optional(),
    custom_text: CheckoutSessionCustomTextSchema.optional(),
    customer_creation: z.enum(['always', 'if_required']).optional(),
    inactive_message: z.string().max(500).optional(),
    invoice_creation: CheckoutSessionInvoiceCreationSchema.optional(),
    line_items: z.array(UpdatePaymentLinkLineItemSchema).max(20).optional(),
    metadata: z.record(z.string(), z.string()).optional(),
    name_collection: CheckoutSessionNameCollectionSchema.optional(),
    optional_items: z
      .array(CheckoutSessionOptionalItemSchema)
      .max(10)
      .optional(),
    payment_intent_data: UpdatePaymentLinkPaymentIntentDataSchema.optional(),
    payment_method_collection: z.enum(['always', 'if_required']).optional(),
    payment_method_options: PaymentLinkPaymentMethodOptionsSchema.optional(),
    /**
     * Pass an empty array to enable dynamic payment methods from payment method settings.
     */
    payment_method_types: z.array(z.enum(['crypto'])).optional(),
    phone_number_collection:
      CheckoutSessionPhoneNumberCollectionSchema.optional(),
    restrictions: PaymentLinkRestrictionsSchema.optional(),
    shipping_address_collection:
      CheckoutSessionShippingAddressCollectionSchema.optional(),
    submit_type: z
      .enum(['auto', 'book', 'donate', 'pay', 'subscribe'])
      .optional(),
    subscription_data: UpdatePaymentLinkSubscriptionDataSchema.optional(),
    tax_id_collection: CheckoutSessionTaxIdCollectionSchema.optional(),
  })
  .merge(ExpandableSchema);

export type UpdatePaymentLinkInput = z.infer<typeof UpdatePaymentLinkSchema>;

// ─────────────────────────────────────────────────────────────────────────────
// List Payment Links Schema
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Schema for listing payment links.
 * @see https://docs.stripe.com/api/payment_links/payment_links/list
 */
export const ListPaymentLinksSchema = z
  .object({
    active: z.boolean().optional(),
    ending_before: z.string().optional(),
    limit: z.number().int().min(1).max(100).optional(),
    starting_after: z.string().optional(),
  })
  .merge(ExpandableSchema);

export type ListPaymentLinksInput = z.infer<typeof ListPaymentLinksSchema>;

export const ListPaymentLinksFiltersSchema = z.object({
  active: z.boolean().optional(),
});
export type ListPaymentLinksFiltersInput = z.infer<
  typeof ListPaymentLinksFiltersSchema
>;

// ─────────────────────────────────────────────────────────────────────────────
// List Payment Link Line Items Schema
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Schema for listing a payment link's line items.
 * @see https://docs.stripe.com/api/payment_links/payment_links/line_items
 */
export const ListPaymentLinkLineItemsSchema = z
  .object({
    ending_before: z.string().optional(),
    limit: z.number().int().min(1).max(100).optional(),
    starting_after: z.string().optional(),
  })
  .merge(ExpandableSchema);

export type ListPaymentLinkLineItemsInput = z.infer<
  typeof ListPaymentLinkLineItemsSchema
>;
