import { z } from 'zod';

/**
 * Schema for creating an external wallet.
 * Only wallet_address is required - other fields have sensible defaults.
 */
export const CreateExternalWalletSchema = z.object({
  wallet_address: z
    .string()
    .min(32, 'Wallet address must be at least 32 characters')
    .max(44, 'Wallet address must be at most 44 characters')
    .regex(
      /^[1-9A-HJ-NP-Za-km-z]+$/,
      'Wallet address must be a valid base58 Solana address'
    ),
  network: z.string().min(1, 'Network is required').optional(),
  currency: z
    .string()
    .min(3, 'Currency must be at least 3 characters')
    .max(4, 'Currency must be at most 4 characters')
    .optional(),
  account_holder_name: z.string().nullable().optional(),
  account_holder_type: z.enum(['individual', 'company']).nullable().optional(),
  default_for_currency: z.boolean().nullable().optional(),
  metadata: z.record(z.string(), z.string()).optional(),
});

export type CreateExternalWalletInput = z.infer<
  typeof CreateExternalWalletSchema
>;

/**
 * Schema for updating an external wallet.
 * All fields are optional - only provided fields will be updated.
 * Protected fields (id, object, account, last4, fingerprint) cannot be updated.
 */
export const UpdateExternalWalletSchema = z
  .object({
    account_holder_name: z.string().nullable(),
    account_holder_type: z.enum(['individual', 'company']).nullable(),
    default_for_currency: z.boolean().nullable(),
    metadata: z.record(z.string(), z.string()),
  })
  .partial()
  .refine((data) => Object.keys(data).length > 0, {
    message: 'At least one field must be provided for update',
  });

export type UpdateExternalWalletInput = z.infer<
  typeof UpdateExternalWalletSchema
>;

/**
 * Schema for listing external wallets with pagination.
 */
export const ListExternalWalletsSchema = z.object({
  limit: z.number().min(1).max(100).optional(),
  starting_after: z.string().optional(),
  ending_before: z.string().optional(),
});

export type ListExternalWalletsInput = z.infer<
  typeof ListExternalWalletsSchema
>;
