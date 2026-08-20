import { z } from 'zod';

const BASE58_RE = /^[1-9A-HJ-NP-Za-km-z]+$/;
const EVM_ADDRESS_RE = /^0x[a-fA-F0-9]{40}$/;
const ALLOWED_NETWORKS = new Set([
  'solana',
  'base',
  'arbitrum',
  'ethereum',
  'optimism',
  'polygon',
  'tron',
]);
const EVM_NETWORKS = new Set([
  'base',
  'arbitrum',
  'ethereum',
  'optimism',
  'polygon',
]);

function IsValidWalletAddress(network: string, address: string): boolean {
  if (network === 'solana') {
    return (
      address.length >= 32 && address.length <= 44 && BASE58_RE.test(address)
    );
  }
  if (EVM_NETWORKS.has(network)) {
    return EVM_ADDRESS_RE.test(address);
  }
  if (network === 'tron') {
    return address.startsWith('T') && BASE58_RE.test(address);
  }
  return false;
}

/**
 * Schema for creating an external wallet.
 * Only wallet_address is required - other fields have sensible defaults.
 */
export const CreateExternalWalletSchema = z
  .object({
    wallet_address: z
      .string()
      .min(1, 'Wallet address is required')
      .max(64, 'Wallet address must be at most 64 characters'),
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
  })
  .superRefine((data, ctx) => {
    const network = (data.network ?? 'solana').toLowerCase();
    const currency = (data.currency ?? 'usdc').toLowerCase();

    if (!ALLOWED_NETWORKS.has(network)) {
      ctx.addIssue({
        code: 'custom',
        path: ['network'],
        message: 'Unsupported network',
      });
      return;
    }

    if (currency !== 'usdc' && currency !== 'usdt') {
      ctx.addIssue({
        code: 'custom',
        path: ['currency'],
        message: 'Currency must be usdc or usdt',
      });
      return;
    }

    if (network === 'tron' && currency !== 'usdt') {
      ctx.addIssue({
        code: 'custom',
        path: ['currency'],
        message: 'Tron wallets must use usdt',
      });
      return;
    }

    if ((network === 'solana' || EVM_NETWORKS.has(network)) && currency !== 'usdc') {
      ctx.addIssue({
        code: 'custom',
        path: ['currency'],
        message: 'This network only supports usdc',
      });
      return;
    }

    if (!IsValidWalletAddress(network, data.wallet_address)) {
      ctx.addIssue({
        code: 'custom',
        path: ['wallet_address'],
        message:
          network === 'solana'
            ? 'Wallet address must be a valid base58 Solana address'
            : network === 'tron'
            ? 'Wallet address must be a valid Tron address'
            : 'Wallet address must be a valid EVM address',
      });
    }
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
