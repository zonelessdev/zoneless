import { z } from 'zod';

/**
 * Schema for creating a balance transaction.
 * Balance transactions are typically created internally by other modules
 * (TopUp, Transfer, Payout) rather than via API endpoints.
 *
 * @see https://docs.stripe.com/api/balance_transactions/object
 */

const BalanceTransactionBalanceTypeEnum = z.enum([
  'issuing',
  'payments',
  'refund_and_dispute_prefunding',
]);

const BalanceTransactionStatusEnum = z.enum(['available', 'pending']);

const BalanceTransactionTypeEnum = z.enum([
  'adjustment',
  'advance',
  'advance_funding',
  'anticipation_repayment',
  'application_fee',
  'application_fee_refund',
  'charge',
  'connect_collection_transfer',
  'contribution',
  'payment',
  'payment_failure_refund',
  'payment_refund',
  'payment_reversal',
  'payout',
  'payout_cancel',
  'payout_failure',
  'refund',
  'refund_failure',
  'reserve_transaction',
  'reserved_funds',
  'stripe_fee',
  'stripe_fx_fee',
  'tax_fee',
  'topup',
  'topup_reversal',
  'transfer',
  'transfer_cancel',
  'transfer_failure',
  'transfer_refund',
]);

const BalanceTransactionFeeDetailSchema = z.object({
  amount: z.number().int(),
  application: z.string().nullable().default(null),
  currency: z.string(),
  description: z.string().nullable().default(null),
  type: z.enum([
    'application_fee',
    'payment_method_passthrough_fee',
    'stripe_fee',
    'tax',
  ]),
});

/**
 * Schema for creating a balance transaction.
 * All fields except amount, currency, account, and type are optional.
 */
export const CreateBalanceTransactionSchema = z
  .object({
    amount: z.number().int('Amount must be an integer (cents)'),
    currency: z.string().min(1, 'Currency is required'),
    account: z.string().min(1, 'Account is required'),
    type: BalanceTransactionTypeEnum,
    source: z.string().nullable(),
    description: z.string().nullable(),
    metadata: z.record(z.string(), z.string()),
    fee: z.number().int().default(0),
    fee_details: z.array(BalanceTransactionFeeDetailSchema).default([]),
    balance_type: BalanceTransactionBalanceTypeEnum.default('payments'),
    status: BalanceTransactionStatusEnum.default('pending'),
    available_on: z.number().int().positive(),
  })
  .partial()
  .refine(
    (data) =>
      data.amount !== undefined &&
      data.currency !== undefined &&
      data.account !== undefined &&
      data.type !== undefined,
    {
      message: 'Amount, currency, account, and type are required fields',
    }
  );

export type CreateBalanceTransactionInput = z.infer<
  typeof CreateBalanceTransactionSchema
>;

// ─────────────────────────────────────────────────────────────────────────────
// List Balance Transactions Schema (SDK-specific)
// ─────────────────────────────────────────────────────────────────────────────

export const ListBalanceTransactionsSchema = z
  .object({
    limit: z.number().int().min(1).max(100),
    starting_after: z.string(),
    ending_before: z.string(),
    created: z
      .object({
        gt: z.number().int(),
        gte: z.number().int(),
        lt: z.number().int(),
        lte: z.number().int(),
      })
      .partial(),
    type: BalanceTransactionTypeEnum,
    source: z.string(),
    currency: z.string(),
    payout: z.string(),
  })
  .partial();

export type ListBalanceTransactionsInput = z.infer<
  typeof ListBalanceTransactionsSchema
>;
