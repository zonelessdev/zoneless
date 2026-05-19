import { z } from 'zod';

/**
 * Schema for creating a payout.
 * Amount is required, destination is optional (uses default wallet if not specified).
 * Matches Stripe's POST /v1/payouts parameters.
 *
 * @see https://docs.stripe.com/api/payouts/create
 */
export const CreatePayoutSchema = z.object({
  /** A positive integer in cents representing how much to payout */
  amount: z
    .number()
    .int('Amount must be an integer (cents)')
    .positive('Amount must be positive'),

  /** Three-letter ISO currency code. Defaults to 'usdc' */
  currency: z.string().default('usdc'),

  /** The ID of an external wallet to send the payout to */
  destination: z
    .string()
    .min(1, 'Destination wallet ID is required')
    .optional(),

  /** An arbitrary string attached to the object */
  description: z.string().optional(),

  /** The method used to send this payout: 'standard' or 'instant' */
  method: z.enum(['standard', 'instant']).default('instant').optional(),

  /** Set of key-value pairs to store with the payout */
  metadata: z.record(z.string(), z.string()).optional(),

  /**
   * A string that displays on the recipient's statement (up to 22 characters).
   * For crypto, this may be included in transaction metadata where supported.
   */
  statement_descriptor: z
    .string()
    .max(22, 'Statement descriptor must be 22 characters or less')
    .optional(),
});

export type CreatePayoutInput = z.infer<typeof CreatePayoutSchema>;

/**
 * Schema for updating a payout.
 * Only metadata can be updated after creation (matching Stripe's API).
 *
 * @see https://docs.stripe.com/api/payouts/update
 */
export const UpdatePayoutSchema = z
  .object({
    /** Set of key-value pairs to update on the payout */
    metadata: z.record(z.string(), z.string()),
  })
  .partial()
  .refine((data) => Object.keys(data).length > 0, {
    message: 'At least one field must be provided for update',
  });

export type UpdatePayoutInput = z.infer<typeof UpdatePayoutSchema>;

/**
 * Schema for listing payouts.
 * @see https://docs.stripe.com/api/payouts/list
 */
export const ListPayoutsSchema = z.object({
  /** A limit on the number of objects to be returned. Limit can range between 1 and 100, and the default is 10 */
  limit: z.number().int().min(1).max(100).optional(),

  /** A cursor for use in pagination. starting_after is an object ID that defines your place in the list */
  starting_after: z.string().optional(),

  /** A cursor for use in pagination. ending_before is an object ID that defines your place in the list */
  ending_before: z.string().optional(),

  /** The ID of an external wallet—only return payouts sent to this wallet */
  destination: z.string().optional(),

  /** Only return payouts that have the given status */
  status: z
    .enum(['pending', 'in_transit', 'paid', 'failed', 'canceled'])
    .optional(),

  /** Only return payouts that arrived during the given date interval */
  arrival_date: z
    .object({
      gt: z.number().optional(),
      gte: z.number().optional(),
      lt: z.number().optional(),
      lte: z.number().optional(),
    })
    .optional(),

  /** Only return payouts that were created during the given date interval */
  created: z
    .object({
      gt: z.number().optional(),
      gte: z.number().optional(),
      lt: z.number().optional(),
      lte: z.number().optional(),
    })
    .optional(),
});

export type ListPayoutsInput = z.infer<typeof ListPayoutsSchema>;

/**
 * Schema for building a batch payout transaction.
 * Takes an array of pending payout IDs and returns an unsigned transaction.
 */
export const BuildPayoutsBatchSchema = z.object({
  /** Array of payout IDs to include in the batch transaction */
  payouts: z
    .array(z.string().min(1, 'Payout ID cannot be empty'))
    .min(1, 'At least one payout ID is required')
    .max(10, 'Maximum 10 payouts per batch transaction'),
});

export type BuildPayoutsBatchInput = z.infer<typeof BuildPayoutsBatchSchema>;

/**
 * Schema for broadcasting a signed batch payout transaction.
 * Takes the signed transaction and the payout IDs it contains.
 * Optionally accepts blockhash info from the build step to avoid a redundant RPC call.
 */
export const BroadcastPayoutsBatchSchema = z.object({
  /** The signed transaction as a base64-encoded string */
  signed_transaction: z.string().min(1, 'Signed transaction is required'),

  /** Array of payout IDs included in this transaction (for verification and status updates) */
  payouts: z
    .array(z.string().min(1, 'Payout ID cannot be empty'))
    .min(1, 'At least one payout ID is required')
    .max(10, 'Maximum 10 payouts per batch transaction'),

  /** The blockhash used when building the transaction (avoids redundant RPC call) */
  blockhash: z.string().optional(),

  /** The last valid block height from the build step (avoids redundant RPC call) */
  last_valid_block_height: z.number().int().positive().optional(),
});

export type BroadcastPayoutsBatchInput = z.infer<
  typeof BroadcastPayoutsBatchSchema
>;
