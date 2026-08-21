import { z } from 'zod';

/**
 * Body for POST /v1/payment_pages/:urlSlug/orchestra.
 * Destination is always the platform solana USDC wallet — never accepted here.
 */
export const StartOrchestraPayinSchema = z
  .object({
    method: z.enum(['cashapp', 'deposit']),
    source_chain: z.string().min(1).optional(),
    source_asset: z.string().min(1).optional(),
  })
  .superRefine((data, ctx) => {
    if (data.method === 'deposit') {
      if (!data.source_chain?.trim()) {
        ctx.addIssue({
          code: 'custom',
          path: ['source_chain'],
          message: 'source_chain is required for deposit',
        });
      }
      if (!data.source_asset?.trim()) {
        ctx.addIssue({
          code: 'custom',
          path: ['source_asset'],
          message: 'source_asset is required for deposit',
        });
      }
    }
  });

export type StartOrchestraPayinInput = z.infer<typeof StartOrchestraPayinSchema>;
