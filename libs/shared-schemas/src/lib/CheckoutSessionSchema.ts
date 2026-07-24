import { z } from 'zod';
import { ExpandableSchema } from './ExpandableSchema';
import { RecurringIntervalSchema } from './PriceSchema';

// ─────────────────────────────────────────────────────────────────────────────
// Reusable nested object schemas
// ─────────────────────────────────────────────────────────────────────────────

const HexColorSchema = z
  .string()
  .regex(/^#[0-9A-Fa-f]{6}$/, 'Must be a hex color starting with #');

const CheckoutSessionAfterExpirationSchema = z.object({
  recovery: z.object({
    enabled: z.boolean(),
    allow_promotion_codes: z.boolean().optional(),
  }),
});

export const CheckoutSessionAutomaticTaxSchema = z.object({
  enabled: z.boolean(),
  liability: z
    .object({
      type: z.enum(['account', 'self']),
      account: z.string().optional(),
    })
    .optional(),
});

const CheckoutSessionBrandingImageSchema = z.object({
  type: z.enum(['file', 'url']),
  file: z.string().optional(),
  url: z.string().url().optional(),
});

const CheckoutSessionBrandingSettingsSchema = z.object({
  background_color: HexColorSchema.optional(),
  border_style: z.enum(['pill', 'rectangular', 'rounded']).optional(),
  button_color: HexColorSchema.optional(),
  display_name: z.string().optional(),
  font_family: z.string().optional(),
  icon: CheckoutSessionBrandingImageSchema.optional(),
  logo: CheckoutSessionBrandingImageSchema.optional(),
});

export const CheckoutSessionConsentCollectionSchema = z.object({
  payment_method_reuse_agreement: z
    .object({
      position: z.enum(['auto', 'hidden']),
    })
    .optional(),
  promotions: z.enum(['auto', 'none']).optional(),
  terms_of_service: z.enum(['none', 'required']).optional(),
});

export const CheckoutSessionCustomFieldSchema = z
  .object({
    key: z
      .string()
      .min(1)
      .max(200)
      .regex(/^[a-zA-Z0-9_-]+$/, 'Key must be alphanumeric'),
    label: z.object({
      custom: z.string().min(1).max(50),
      type: z.literal('custom'),
    }),
    type: z.enum(['dropdown', 'numeric', 'text']),
    dropdown: z
      .object({
        options: z
          .array(
            z.object({
              label: z.string().min(1).max(100),
              value: z.string().min(1).max(100),
            })
          )
          .max(200),
        default_value: z.string().max(100).optional(),
      })
      .optional(),
    numeric: z
      .object({
        default_value: z.string().max(255).optional(),
        maximum_length: z.number().int().positive().optional(),
        minimum_length: z.number().int().positive().optional(),
      })
      .optional(),
    optional: z.boolean().optional(),
    text: z
      .object({
        default_value: z.string().max(255).optional(),
        maximum_length: z.number().int().positive().optional(),
        minimum_length: z.number().int().positive().optional(),
      })
      .optional(),
  })
  .refine((field) => field[field.type] !== undefined, {
    message: 'The configuration object matching `type` is required',
  });

const CheckoutSessionCustomTextEntrySchema = z.object({
  message: z.string().min(1).max(1200),
});

export const CheckoutSessionCustomTextSchema = z.object({
  after_submit: CheckoutSessionCustomTextEntrySchema.optional(),
  shipping_address: CheckoutSessionCustomTextEntrySchema.optional(),
  submit: CheckoutSessionCustomTextEntrySchema.optional(),
  terms_of_service_acceptance: CheckoutSessionCustomTextEntrySchema.optional(),
});

/** Post-purchase behavior (hosted confirmation page vs redirect). Shared with Payment Links. */
export const CheckoutSessionAfterCompletionSchema = z
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

const CheckoutSessionCustomerUpdateSchema = z.object({
  address: z.enum(['auto', 'never']).optional(),
  name: z.enum(['auto', 'never']).optional(),
  shipping: z.enum(['auto', 'never']).optional(),
});

const CheckoutSessionDiscountSchema = z
  .object({
    coupon: z.string().optional(),
    promotion_code: z.string().optional(),
  })
  .refine((discount) => !(discount.coupon && discount.promotion_code), {
    message: 'Only one of `coupon` or `promotion_code` may be specified',
  });

export const CheckoutSessionInvoiceCreationSchema = z.object({
  enabled: z.boolean(),
  invoice_data: z
    .object({
      account_tax_ids: z.array(z.string()).optional(),
      custom_fields: z
        .array(
          z.object({
            name: z.string().min(1).max(40),
            value: z.string().min(1).max(140),
          })
        )
        .optional(),
      description: z.string().optional(),
      footer: z.string().optional(),
      issuer: z
        .object({
          type: z.enum(['account', 'self']),
          account: z.string().optional(),
        })
        .optional(),
      metadata: z.record(z.string(), z.string()).optional(),
      rendering_options: z
        .object({
          amount_tax_display: z
            .enum(['exclude_tax', 'include_inclusive_tax'])
            .optional(),
          template: z.string().optional(),
        })
        .optional(),
    })
    .optional(),
});

const CheckoutSessionProductDataSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().optional(),
  images: z.array(z.string()).max(8).optional(),
  metadata: z.record(z.string(), z.string()).optional(),
  tax_code: z.string().optional(),
  tax_details: z
    .object({
      performance_location: z.string().optional(),
      tax_code: z.string().optional(),
    })
    .optional(),
  unit_label: z.string().max(12).optional(),
});

export const CheckoutSessionPriceDataSchema = z
  .object({
    currency: z.string().min(1).max(4),
    product: z.string().optional(),
    product_data: CheckoutSessionProductDataSchema.optional(),
    recurring: z
      .object({
        interval: RecurringIntervalSchema,
        interval_count: z.number().int().positive().optional(),
      })
      .optional(),
    tax_behavior: z.enum(['exclusive', 'inclusive', 'unspecified']).optional(),
    unit_amount: z.number().int().nonnegative().optional(),
    unit_amount_decimal: z.string().optional(),
  })
  .refine((priceData) => !!priceData.product || !!priceData.product_data, {
    message: 'Either `product` or `product_data` is required',
  })
  .refine(
    (priceData) =>
      priceData.unit_amount !== undefined ||
      priceData.unit_amount_decimal !== undefined,
    { message: 'Either `unit_amount` or `unit_amount_decimal` is required' }
  );

export const CheckoutSessionAdjustableQuantitySchema = z.object({
  enabled: z.boolean(),
  maximum: z.number().int().min(1).max(999999).optional(),
  minimum: z.number().int().min(0).optional(),
});

const CheckoutSessionLineItemSchema = z
  .object({
    adjustable_quantity: CheckoutSessionAdjustableQuantitySchema.optional(),
    dynamic_tax_rates: z.array(z.string()).optional(),
    metadata: z.record(z.string(), z.string()).optional(),
    price: z.string().optional(),
    price_data: CheckoutSessionPriceDataSchema.optional(),
    quantity: z.number().int().nonnegative().optional(),
    tax_rates: z.array(z.string()).optional(),
  })
  .refine((lineItem) => !!lineItem.price || !!lineItem.price_data, {
    message: 'Either `price` or `price_data` is required for each line item',
  });

export const CheckoutSessionOptionalItemSchema = z.object({
  price: z.string().min(1),
  quantity: z.number().int().nonnegative(),
  adjustable_quantity: CheckoutSessionAdjustableQuantitySchema.optional(),
});

const CheckoutSessionNameCollectionEntrySchema = z.object({
  enabled: z.boolean(),
  optional: z.boolean().optional(),
});

export const CheckoutSessionNameCollectionSchema = z.object({
  business: CheckoutSessionNameCollectionEntrySchema.optional(),
  individual: CheckoutSessionNameCollectionEntrySchema.optional(),
});

const CheckoutSessionShippingSchema = z.object({
  address: z.object({
    line1: z.string().min(1),
    city: z.string().optional(),
    country: z.string().optional(),
    line2: z.string().optional(),
    postal_code: z.string().optional(),
    state: z.string().optional(),
  }),
  name: z.string().min(1),
  carrier: z.string().optional(),
  phone: z.string().optional(),
  tracking_number: z.string().optional(),
});

export const CheckoutSessionTransferDataSchema = z.object({
  destination: z.string().min(1),
  amount: z.number().int().nonnegative().optional(),
});

/**
 * A subset of parameters passed to PaymentIntent creation for Checkout Sessions in `payment` mode.
 * @remarks Stripe's `capture_method` here also accepts `automatic`/`automatic_async`; Zoneless
 * settles USDC transfers on confirmation, so only `manual` (hold funds) is meaningful to expose.
 */
const CheckoutSessionPaymentIntentDataSchema = z.object({
  application_fee_amount: z.number().int().nonnegative().optional(),
  capture_method: z.enum(['automatic', 'automatic_async', 'manual']).optional(),
  description: z.string().optional(),
  metadata: z.record(z.string(), z.string()).optional(),
  on_behalf_of: z.string().optional(),
  receipt_email: z.string().email().optional(),
  setup_future_usage: z.enum(['off_session', 'on_session']).optional(),
  shipping: CheckoutSessionShippingSchema.optional(),
  statement_descriptor: z.string().max(22).optional(),
  statement_descriptor_suffix: z.string().optional(),
  transfer_data: CheckoutSessionTransferDataSchema.optional(),
  transfer_group: z.string().optional(),
});

const CheckoutSessionPermissionsSchema = z.object({
  update_shipping_details: z.enum(['client_only', 'server_only']).optional(),
});

export const CheckoutSessionPhoneNumberCollectionSchema = z.object({
  enabled: z.boolean(),
});

const CheckoutSessionSavedPaymentMethodOptionsSchema = z.object({
  allow_redisplay_filters: z
    .array(z.enum(['always', 'limited', 'unspecified']))
    .optional(),
  payment_method_remove: z.enum(['disabled', 'enabled']).optional(),
  payment_method_save: z.enum(['disabled', 'enabled']).optional(),
});

const CheckoutSessionSetupIntentDataSchema = z.object({
  description: z.string().optional(),
  metadata: z.record(z.string(), z.string()).optional(),
  on_behalf_of: z.string().optional(),
});

export const CheckoutSessionShippingAddressCollectionSchema = z.object({
  /**
   * @remarks Stripe defines ~240 supported country codes here; kept as a plain string array
   * for maintainability, matching the simplification already used for CheckoutSession's
   * `shipping_address_collection.allowed_countries`.
   */
  allowed_countries: z.array(z.string().length(2)).min(1),
});

const CheckoutSessionDeliveryEstimateSchema = z.object({
  unit: z.enum(['business_day', 'day', 'hour', 'month', 'week']),
  value: z.number().int().positive(),
});

const CheckoutSessionShippingRateDataSchema = z.object({
  display_name: z.string().min(1).max(100),
  delivery_estimate: z
    .object({
      maximum: CheckoutSessionDeliveryEstimateSchema.optional(),
      minimum: CheckoutSessionDeliveryEstimateSchema.optional(),
    })
    .optional(),
  fixed_amount: z
    .object({
      amount: z.number().int().nonnegative(),
      currency: z.string().min(1).max(4),
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
  type: z.literal('fixed_amount').optional(),
});

const CheckoutSessionShippingOptionSchema = z
  .object({
    shipping_rate: z.string().optional(),
    shipping_rate_data: CheckoutSessionShippingRateDataSchema.optional(),
  })
  .refine((option) => !!option.shipping_rate || !!option.shipping_rate_data, {
    message: 'Either `shipping_rate` or `shipping_rate_data` is required',
  });

export const CheckoutSessionTaxIdCollectionSchema = z.object({
  enabled: z.boolean(),
  required: z.enum(['if_supported', 'never']).optional(),
});

/**
 * A subset of parameters passed to Subscription creation for Checkout Sessions in
 * `subscription` mode.
 */
const CheckoutSessionSubscriptionDataSchema = z.object({
  application_fee_percent: z.number().min(0).max(100).optional(),
  billing_cycle_anchor: z.number().int().positive().optional(),
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
  on_behalf_of: z.string().optional(),
  proration_behavior: z.enum(['create_prorations', 'none']).optional(),
  transfer_data: z
    .object({
      destination: z.string().min(1),
      amount_percent: z.number().min(0).max(100).optional(),
    })
    .optional(),
  trial_end: z.number().int().positive().optional(),
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
 * Payment-method-specific configuration for the PaymentIntent or SetupIntent of this
 * CheckoutSession.
 * @remarks Stripe defines 40+ per-payment-method-type option bags here (acss_debit, card,
 * klarna, wechat_pay, etc.) that are specific to fiat payment rails. Zoneless only accepts
 * USDC wallet payments, so only the `crypto` option bag is exposed, matching the simplification
 * already used for CheckoutSession's `payment_method_options`.
 */
const CheckoutSessionPaymentMethodOptionsSchema = z.object({
  crypto: z
    .object({
      setup_future_usage: z.enum(['none']).optional(),
    })
    .optional(),
});

const CheckoutSessionWalletOptionsSchema = z.object({
  /**
   * @remarks Stripe's only wallet option here is Link, which has no Zoneless equivalent since
   * Zoneless connects Solana wallets directly rather than a Stripe-hosted wallet product.
   * Retained for API parity.
   */
  link: z
    .object({
      display: z.enum(['auto', 'never']).optional(),
    })
    .optional(),
});

// ─────────────────────────────────────────────────────────────────────────────
// Retrieve Checkout Session Schema
// ─────────────────────────────────────────────────────────────────────────────

export const RetrieveCheckoutSessionSchema = ExpandableSchema;
export type RetrieveCheckoutSessionInput = z.infer<
  typeof RetrieveCheckoutSessionSchema
>;

// ─────────────────────────────────────────────────────────────────────────────
// Create Checkout Session Schema
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Schema for creating a checkout session (shared shape + common refinements).
 * Public API adds a `success_url` requirement for hosted mode; Payment Link
 * opens use this base so hosted_confirmation links can omit it.
 * @see https://docs.stripe.com/api/checkout/sessions/create
 */
const CreateCheckoutSessionBaseSchema = z
  .object({
    mode: z.enum(['payment', 'setup', 'subscription']),

    adaptive_pricing: z
      .object({
        enabled: z.boolean().optional(),
      })
      .optional(),
    after_completion: CheckoutSessionAfterCompletionSchema.optional(),
    after_expiration: CheckoutSessionAfterExpirationSchema.optional(),
    allow_promotion_codes: z.boolean().optional(),
    automatic_tax: CheckoutSessionAutomaticTaxSchema.optional(),
    billing_address_collection: z.enum(['auto', 'required']).optional(),
    branding_settings: CheckoutSessionBrandingSettingsSchema.optional(),
    cancel_url: z.string().url().optional(),
    client_reference_id: z.string().max(200).optional(),
    consent_collection: CheckoutSessionConsentCollectionSchema.optional(),
    currency: z.string().min(1).max(4).optional(),
    custom_fields: z.array(CheckoutSessionCustomFieldSchema).max(3).optional(),
    custom_text: CheckoutSessionCustomTextSchema.optional(),
    customer: z.string().optional(),
    customer_account: z.string().optional(),
    customer_creation: z.enum(['always', 'if_required']).optional(),
    customer_email: z.string().email().max(800).optional(),
    customer_update: CheckoutSessionCustomerUpdateSchema.optional(),
    discounts: z.array(CheckoutSessionDiscountSchema).max(1).optional(),
    excluded_payment_method_types: z.array(z.string()).optional(),
    expires_at: z.number().int().positive().optional(),
    integration_identifier: z.string().max(200).optional(),
    invoice_creation: CheckoutSessionInvoiceCreationSchema.optional(),
    line_items: z.array(CheckoutSessionLineItemSchema).max(100).optional(),
    locale: z.string().optional(),
    managed_payments: z
      .object({
        enabled: z.boolean().optional(),
      })
      .optional(),
    metadata: z.record(z.string(), z.string()).optional(),
    name_collection: CheckoutSessionNameCollectionSchema.optional(),
    optional_items: z
      .array(CheckoutSessionOptionalItemSchema)
      .max(10)
      .optional(),
    origin_context: z.enum(['mobile_app', 'web']).optional(),
    payment_intent_data: CheckoutSessionPaymentIntentDataSchema.optional(),
    payment_method_collection: z.enum(['always', 'if_required']).optional(),
    payment_method_options:
      CheckoutSessionPaymentMethodOptionsSchema.optional(),
    payment_method_types: z.array(z.enum(['crypto'])).optional(),
    permissions: CheckoutSessionPermissionsSchema.optional(),
    phone_number_collection:
      CheckoutSessionPhoneNumberCollectionSchema.optional(),
    redirect_on_completion: z
      .enum(['always', 'if_required', 'never'])
      .optional(),
    return_url: z.string().url().optional(),
    saved_payment_method_options:
      CheckoutSessionSavedPaymentMethodOptionsSchema.optional(),
    setup_intent_data: CheckoutSessionSetupIntentDataSchema.optional(),
    shipping_address_collection:
      CheckoutSessionShippingAddressCollectionSchema.optional(),
    shipping_options: z
      .array(CheckoutSessionShippingOptionSchema)
      .max(5)
      .optional(),
    submit_type: z
      .enum(['auto', 'book', 'donate', 'pay', 'subscribe'])
      .optional(),
    subscription_data: CheckoutSessionSubscriptionDataSchema.optional(),
    success_url: z.string().url().optional(),
    tax_id_collection: CheckoutSessionTaxIdCollectionSchema.optional(),
    ui_mode: z.enum(['elements', 'embedded_page', 'hosted_page']).optional(),
    wallet_options: CheckoutSessionWalletOptionsSchema.optional(),
  })
  .merge(ExpandableSchema)
  .refine(
    (session) =>
      session.mode === 'setup' || (session.line_items?.length ?? 0) > 0,
    {
      message: '`line_items` is required in `payment` and `subscription` mode',
      path: ['line_items'],
    }
  )
  .refine(
    (session) =>
      !(
        session.cancel_url &&
        (session.ui_mode === 'embedded_page' || session.ui_mode === 'elements')
      ),
    {
      message:
        '`cancel_url` is not allowed when `ui_mode` is `embedded_page` or `elements`',
      path: ['cancel_url'],
    }
  );

/**
 * Schema for creating a checkout session via the public API.
 * Hosted mode requires `success_url`.
 * @see https://docs.stripe.com/api/checkout/sessions/create
 */
export const CreateCheckoutSessionSchema =
  CreateCheckoutSessionBaseSchema.refine(
    (session) =>
      session.ui_mode === 'embedded_page' ||
      session.ui_mode === 'elements' ||
      !!session.success_url,
    {
      message:
        '`success_url` is required unless `ui_mode` is `embedded_page` or `elements`',
      path: ['success_url'],
    }
  );

/**
 * Schema for creating a checkout session from a Payment Link template.
 * Allows omitting `success_url` for hosted_confirmation after_completion.
 */
export const CreateCheckoutSessionFromPaymentLinkSchema =
  CreateCheckoutSessionBaseSchema;

export type CreateCheckoutSessionInput = z.infer<
  typeof CreateCheckoutSessionSchema
>;

// ─────────────────────────────────────────────────────────────────────────────
// Update Checkout Session Schema
// ─────────────────────────────────────────────────────────────────────────────

const CheckoutSessionCollectedInformationSchema = z.object({
  shipping_details: z
    .object({
      address: z.object({
        country: z.string().length(2),
        line1: z.string().min(1),
        city: z.string().optional(),
        line2: z.string().optional(),
        postal_code: z.string().optional(),
        state: z.string().optional(),
      }),
      name: z.string().min(1).max(255),
    })
    .optional(),
});

/**
 * To retain an existing line item, specify its `id`. To update one, specify its `id` along
 * with the fields to change. To add a new line item, omit `id` and specify `price` or
 * `price_data` with a `quantity`. To remove a line item, omit it from the array entirely.
 */
const UpdateCheckoutSessionLineItemSchema = z
  .object({
    adjustable_quantity: CheckoutSessionAdjustableQuantitySchema.optional(),
    id: z.string().optional(),
    metadata: z.record(z.string(), z.string()).optional(),
    price: z.string().optional(),
    price_data: CheckoutSessionPriceDataSchema.optional(),
    quantity: z.number().int().nonnegative().optional(),
    tax_rates: z.array(z.string()).optional(),
  })
  .refine(
    (lineItem) => !!lineItem.id || !!lineItem.price || !!lineItem.price_data,
    {
      message:
        'A new line item requires `price` or `price_data`; an existing one requires `id`',
    }
  );

export const UpdateCheckoutSessionSchema = z
  .object({
    collected_information: CheckoutSessionCollectedInformationSchema.optional(),
    line_items: z
      .array(UpdateCheckoutSessionLineItemSchema)
      .max(100)
      .optional(),
    metadata: z.record(z.string(), z.string()).optional(),
    shipping_options: z
      .array(CheckoutSessionShippingOptionSchema)
      .max(5)
      .optional(),
  })
  .merge(ExpandableSchema);

export type UpdateCheckoutSessionInput = z.infer<
  typeof UpdateCheckoutSessionSchema
>;

// ─────────────────────────────────────────────────────────────────────────────
// List Checkout Sessions Schema
// ─────────────────────────────────────────────────────────────────────────────

export const ListCheckoutSessionsSchema = z
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
    customer_details: z
      .object({
        email: z.string().email().max(800),
      })
      .optional(),
    ending_before: z.string().optional(),
    limit: z.number().int().min(1).max(100).optional(),
    payment_intent: z.string().optional(),
    payment_link: z.string().optional(),
    starting_after: z.string().optional(),
    status: z.enum(['complete', 'expired', 'open']).optional(),
    subscription: z.string().optional(),
  })
  .merge(ExpandableSchema);

export type ListCheckoutSessionsInput = z.infer<
  typeof ListCheckoutSessionsSchema
>;

export const ListCheckoutSessionsFiltersSchema = z.object({
  customer: z.string().optional(),
  customer_account: z.string().optional(),
  customer_details: z
    .object({
      email: z.string().email().max(800),
    })
    .optional(),
  payment_intent: z.string().optional(),
  payment_link: z.string().optional(),
  status: z.enum(['complete', 'expired', 'open']).optional(),
  subscription: z.string().optional(),
});
export type ListCheckoutSessionsFiltersInput = z.infer<
  typeof ListCheckoutSessionsFiltersSchema
>;

// ─────────────────────────────────────────────────────────────────────────────
// Expire Checkout Session Schema
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Takes no parameters. Only sessions in the `open` status can be expired.
 */
export const ExpireCheckoutSessionSchema = z.object({});
export type ExpireCheckoutSessionInput = z.infer<
  typeof ExpireCheckoutSessionSchema
>;

// ─────────────────────────────────────────────────────────────────────────────
// List Checkout Session Line Items Schema
// ─────────────────────────────────────────────────────────────────────────────

export const ListCheckoutSessionLineItemsSchema = z
  .object({
    ending_before: z.string().optional(),
    limit: z.number().int().min(1).max(100).optional(),
    starting_after: z.string().optional(),
  })
  .merge(ExpandableSchema);

export type ListCheckoutSessionLineItemsInput = z.infer<
  typeof ListCheckoutSessionLineItemsSchema
>;

// ─────────────────────────────────────────────────────────────────────────────
// Prepare Checkout Payment Schema (public payment_pages)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Body for POST /v1/payment_pages/:urlSlug/prepare.
 * Collects customer details configured on the Checkout Session before building
 * the unsigned payment transaction.
 */
export const PrepareCheckoutPaymentAddressSchema = z.object({
  line1: z.string().max(500).optional(),
  line2: z.string().max(500).optional(),
  city: z.string().max(100).optional(),
  state: z.string().max(100).optional(),
  postal_code: z.string().max(20).optional(),
  country: z.string().length(2).optional(),
});

export const PrepareCheckoutPaymentShippingAddressSchema =
  PrepareCheckoutPaymentAddressSchema.extend({
    /** Recipient name required by Stripe when collecting a shipping address. */
    name: z.string().max(150).optional(),
  });

export const PrepareCheckoutPaymentSchema = z.object({
  payer_wallet: z.string().min(1),
  email: z.string().email().max(512).optional(),
  name: z.string().max(150).optional(),
  business_name: z.string().max(150).optional(),
  phone: z.string().max(20).optional(),
  /** Structured billing address matching Stripe Checkout. */
  address: PrepareCheckoutPaymentAddressSchema.optional(),
  /** Structured shipping address matching Stripe Checkout. */
  shipping_address: PrepareCheckoutPaymentShippingAddressSchema.optional(),
  tax_id: z.string().max(50).optional(),
  custom_fields: z
    .array(
      z.object({
        key: z.string().min(1).max(200),
        value: z.string().max(255),
      })
    )
    .max(3)
    .optional(),
  terms_of_service_accepted: z.boolean().optional(),
});
export type PrepareCheckoutPaymentInput = z.infer<
  typeof PrepareCheckoutPaymentSchema
>;
