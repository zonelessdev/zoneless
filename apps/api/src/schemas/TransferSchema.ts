import { z } from 'zod';

/**
 * Schema for creating a transfer.
 * @see https://docs.stripe.com/api/transfers/create
 */
export const CreateTransferSchema = z.object({
  /** A positive integer in cents representing how much to transfer (required) */
  amount: z
    .number()
    .int('Amount must be an integer (cents)')
    .positive('Amount must be positive'),

  /** Three-letter ISO code for currency in lowercase (required) */
  currency: z.string().min(1, 'Currency is required').toLowerCase(),

  /** The ID of a connected account (required) */
  destination: z.string().min(1, 'Destination account is required'),

  /** An arbitrary string attached to the object */
  description: z.string().optional(),

  /** Set of key-value pairs for storing additional information */
  metadata: z.record(z.string(), z.string()).optional(),

  /** You can use this parameter to transfer funds from a charge before they are added to your available balance */
  source_transaction: z.string().optional(),

  /** The source balance to use for this transfer. One of bank_account, card, fpx, or wallet */
  source_type: z.enum(['bank_account', 'card', 'fpx', 'wallet']).optional(),

  /** A string that identifies this transaction as part of a group */
  transfer_group: z.string().optional(),
});

export type CreateTransferInput = z.infer<typeof CreateTransferSchema>;

/**
 * Schema for updating a transfer.
 * Only description and metadata can be updated.
 * @see https://docs.stripe.com/api/transfers/update
 */
export const UpdateTransferSchema = z.object({
  /** An arbitrary string attached to the object */
  description: z.string().optional(),

  /** Set of key-value pairs for storing additional information */
  metadata: z.record(z.string(), z.string()).optional(),
});

export type UpdateTransferInput = z.infer<typeof UpdateTransferSchema>;

/**
 * Schema for listing transfers.
 * @see https://docs.stripe.com/api/transfers/list
 */
export const ListTransfersSchema = z.object({
  /** A limit on the number of objects to be returned. Limit can range between 1 and 100, and the default is 10 */
  limit: z.number().int().min(1).max(100).optional(),

  /** A cursor for use in pagination. starting_after is an object ID that defines your place in the list */
  starting_after: z.string().optional(),

  /** A cursor for use in pagination. ending_before is an object ID that defines your place in the list */
  ending_before: z.string().optional(),

  /** Only return transfers for the destination specified by this account ID */
  destination: z.string().optional(),

  /** Only return transfers with the specified transfer group */
  transfer_group: z.string().optional(),

  /** Only return transfers that were created during the given date interval */
  created: z
    .object({
      gt: z.number().optional(),
      gte: z.number().optional(),
      lt: z.number().optional(),
      lte: z.number().optional(),
    })
    .optional(),
});

export type ListTransfersInput = z.infer<typeof ListTransfersSchema>;
