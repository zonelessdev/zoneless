import { z } from 'zod';
import { ExpandableSchema } from './ExpandableSchema';

// ─────────────────────────────────────────────────────────────────────────────
// Reusable nested object schemas
// ─────────────────────────────────────────────────────────────────────────────

const ChargeAddressSchema = z.object({
  city: z.string().optional(),
  country: z.string().optional(),
  line1: z.string().optional(),
  line2: z.string().optional(),
  postal_code: z.string().optional(),
  state: z.string().optional(),
});

const ChargeShippingSchema = z.object({
  address: ChargeAddressSchema,
  name: z.string().min(1),
  carrier: z.string().optional(),
  phone: z.string().optional(),
  tracking_number: z.string().optional(),
});

const ChargeRadarOptionsSchema = z.object({
  session: z.string().optional(),
});

const ChargeTransferDataSchema = z.object({
  destination: z.string().min(1),
  amount: z.number().int().nonnegative().optional(),
  description: z.string().optional(),
});

const ChargeFraudDetailsSchema = z.object({
  user_report: z.enum(['safe', 'fraudulent']),
});

// ─────────────────────────────────────────────────────────────────────────────
// Create Charge Schema
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Schema for creating a Charge.
 * @remarks This method is no longer recommended by Stripe—prefer the Payment Intents API.
 * Kept for 1:1 API compatibility.
 * @see https://docs.stripe.com/api/charges/create
 */
export const CreateChargeSchema = z
  .object({
    amount: z
      .number()
      .int('Amount must be an integer (cents)')
      .positive('Amount must be positive')
      .max(99999999, 'Amount supports up to eight digits'),
    currency: z.string().min(1).max(4).toLowerCase().default('usdc'),
    application_fee_amount: z.number().int().nonnegative().optional(),
    capture: z.boolean().optional(),
    customer: z.string().max(500).optional(),
    description: z.string().optional(),
    metadata: z.record(z.string(), z.string()).optional(),
    on_behalf_of: z.string().optional(),
    radar_options: ChargeRadarOptionsSchema.optional(),
    receipt_email: z.string().email().max(800).optional(),
    shipping: ChargeShippingSchema.optional(),
    /**
     * Legacy payment source ID (card, bank account, token, or connected account).
     * Prefer PaymentIntents with `payment_method` for new integrations.
     */
    source: z.string().optional(),
    statement_descriptor: z
      .string()
      .max(22, 'Statement descriptor must be 22 characters or less')
      .optional(),
    statement_descriptor_suffix: z.string().optional(),
    transfer_data: ChargeTransferDataSchema.optional(),
    transfer_group: z.string().optional(),
  })
  .merge(ExpandableSchema);

export type CreateChargeInput = z.infer<typeof CreateChargeSchema>;

// ─────────────────────────────────────────────────────────────────────────────
// Update Charge Schema
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Schema for updating a Charge.
 * @see https://docs.stripe.com/api/charges/update
 */
export const UpdateChargeSchema = z
  .object({
    customer: z.string().max(500).optional(),
    description: z.string().optional(),
    fraud_details: ChargeFraudDetailsSchema.optional(),
    metadata: z.record(z.string(), z.string()).optional(),
    receipt_email: z.string().email().max(800).optional(),
    shipping: ChargeShippingSchema.optional(),
    transfer_group: z.string().optional(),
  })
  .merge(ExpandableSchema);

export type UpdateChargeInput = z.infer<typeof UpdateChargeSchema>;

// ─────────────────────────────────────────────────────────────────────────────
// Retrieve Charge Schema
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Schema for retrieving a Charge.
 * @see https://docs.stripe.com/api/charges/retrieve
 */
export const RetrieveChargeSchema = ExpandableSchema;
export type RetrieveChargeInput = z.infer<typeof RetrieveChargeSchema>;

// ─────────────────────────────────────────────────────────────────────────────
// List Charges Schema
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Schema for listing Charges.
 * @see https://docs.stripe.com/api/charges/list
 */
export const ListChargesSchema = z
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
    ending_before: z.string().optional(),
    limit: z.number().int().min(1).max(100).optional(),
    payment_intent: z.string().optional(),
    starting_after: z.string().optional(),
    transfer_group: z.string().optional(),
  })
  .merge(ExpandableSchema);

export type ListChargesInput = z.infer<typeof ListChargesSchema>;

export const ListChargesFiltersSchema = z.object({
  customer: z.string().optional(),
  payment_intent: z.string().optional(),
  transfer_group: z.string().optional(),
});
export type ListChargesFiltersInput = z.infer<typeof ListChargesFiltersSchema>;

// ─────────────────────────────────────────────────────────────────────────────
// Capture Charge Schema
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Schema for capturing a Charge.
 * @see https://docs.stripe.com/api/charges/capture
 */
export const CaptureChargeSchema = z
  .object({
    amount: z
      .number()
      .int('Amount must be an integer (cents)')
      .positive('Amount must be positive')
      .max(99999999, 'Amount supports up to eight digits')
      .optional(),
    application_fee_amount: z.number().int().nonnegative().optional(),
    receipt_email: z.string().email().max(800).optional(),
    statement_descriptor: z
      .string()
      .max(22, 'Statement descriptor must be 22 characters or less')
      .optional(),
    statement_descriptor_suffix: z.string().optional(),
    transfer_data: z
      .object({
        amount: z.number().int().nonnegative().optional(),
      })
      .optional(),
    transfer_group: z.string().optional(),
  })
  .merge(ExpandableSchema);

export type CaptureChargeInput = z.infer<typeof CaptureChargeSchema>;
