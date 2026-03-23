import { z } from 'zod';

/**
 * Schema for creating a TopUp via the API.
 * Matches Stripe's POST /v1/topups endpoint.
 * @see https://docs.stripe.com/api/topups/create
 */
export const CreateTopUpSchema = z.object({
  /** A positive integer representing how much to transfer (required) */
  amount: z.number().int().positive(),
  /** Three-letter ISO currency code, in lowercase (required) */
  currency: z
    .string()
    .min(3)
    .max(4)
    .transform((val) => val.toLowerCase()),
  /** An arbitrary string attached to the object */
  description: z.string().max(500).optional(),
  /** Set of key-value pairs for storing additional information */
  metadata: z.record(z.string(), z.string()).optional(),
  /** The ID of a source to transfer funds from */
  source: z.string().optional(),
  /** Extra information about a top-up. Limited to 15 ASCII characters */
  statement_descriptor: z
    .string()
    .max(15)
    .regex(/^[\x20-\x7E]*$/, 'Must contain only ASCII characters')
    .optional(),
  /** A string that identifies this top-up as part of a group */
  transfer_group: z.string().max(255).optional(),
});

export type CreateTopUpInput = z.infer<typeof CreateTopUpSchema>;

/**
 * Schema for updating a TopUp.
 * Only description and metadata are editable by design (matches Stripe).
 * @see https://docs.stripe.com/api/topups/update
 */
export const UpdateTopUpSchema = z.object({
  /** An arbitrary string attached to the object */
  description: z.string().max(500).optional(),
  /** Set of key-value pairs for storing additional information */
  metadata: z.record(z.string(), z.string()).optional(),
});

export type UpdateTopUpInput = z.infer<typeof UpdateTopUpSchema>;

/**
 * Schema for list query parameters.
 * Matches Stripe's GET /v1/topups endpoint.
 * @see https://docs.stripe.com/api/topups/list
 */
export const ListTopUpsQuerySchema = z.object({
  /** Number of results to return (1-100, default: 10) */
  limit: z
    .string()
    .transform((val) => parseInt(val, 10))
    .pipe(z.number().int().min(1).max(100))
    .optional(),
  /** Cursor for forward pagination */
  starting_after: z.string().optional(),
  /** Cursor for backward pagination */
  ending_before: z.string().optional(),
  /** Filter by status */
  status: z
    .enum(['canceled', 'failed', 'pending', 'reversed', 'succeeded'])
    .optional(),
});

export type ListTopUpsQuery = z.infer<typeof ListTopUpsQuerySchema>;

/**
 * SDK input type for listing top-ups.
 * @see https://zoneless.com/docs/topups/list
 */
export interface ListTopUpsInput {
  /** Number of results to return (1-100, default: 10) */
  limit?: number;
  /** Cursor for forward pagination */
  starting_after?: string;
  /** Cursor for backward pagination */
  ending_before?: string;
  /** Filter by status */
  status?: 'canceled' | 'failed' | 'pending' | 'reversed' | 'succeeded';
  /** Filter by amount */
  amount?: {
    gt?: number;
    gte?: number;
    lt?: number;
    lte?: number;
  };
  /** Filter by created timestamp */
  created?: {
    gt?: number;
    gte?: number;
    lt?: number;
    lte?: number;
  };
}
