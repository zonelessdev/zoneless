import { z } from 'zod';
import { ExpandableSchema } from './ExpandableSchema';

/**
 * Schema for retrieving a price.
 */
export const RetrievePriceSchema = ExpandableSchema;
export type RetrievePriceInput = z.infer<typeof RetrievePriceSchema>;

/**
 * Schema for creating a price.
 */
export const CreatePriceSchema = z
  .object({
    currency: z.string().min(1).max(4),
    active: z.boolean().default(true).optional(),
    metadata: z.record(z.string(), z.string()).optional(),
    nickname: z.string().max(22).optional(),
    product: z.string().min(1).max(32).optional(),
    recurring: z
      .object({
        interval: z.enum(['day', 'week', 'month', 'year']),
        interval_count: z.number().int().positive().optional(),
        trial_period_days: z.number().int().positive().optional(),
        usage_type: z.enum(['metered', 'licensed']).optional(),
        meter: z.string().optional(),
      })
      .optional(),
    tax_behavior: z.enum(['exclusive', 'inclusive', 'unspecified']).optional(),
    unit_amount: z.number().int().positive(),
    billing_scheme: z.enum(['per_unit', 'tiered']).optional(),
    currency_options: z
      .record(
        z.string(),
        z.object({
          custom_unit_amount: z
            .object({
              enabled: z.boolean().default(true),
              maximum: z.number().int().positive(),
              minimum: z.number().int().positive(),
              preset: z.number().int().positive(),
            })
            .optional(),
          tax_behavior: z
            .enum(['exclusive', 'inclusive', 'unspecified'])
            .optional(),
          tiers: z
            .array(
              z.object({
                flat_amount: z.number().int().positive(),
                flat_amount_decimal: z.string().optional(),
                unit_amount: z.number().int().positive().optional(),
                unit_amount_decimal: z.string().optional(),
                up_to: z.number().int().positive(),
              })
            )
            .optional(),
          unit_amount: z.number().int().positive().optional(),
          unit_amount_decimal: z.string().optional(),
        })
      )
      .optional(),
    custom_unit_amount: z
      .object({
        enabled: z.boolean().default(true),
        maximum: z.number().int().positive(),
        minimum: z.number().int().positive(),
        preset: z.number().int().positive(),
      })
      .optional(),
    lookup_key: z.string().max(200).optional(),
    product_data: z
      .object({
        name: z.string().min(1).max(200),
        active: z.boolean().default(true).optional(),
        metadata: z.record(z.string(), z.string()).optional(),
        statement_descriptor: z.string().max(22).optional(),
        tax_code: z.string().optional(),
        tax_details: z
          .object({
            performance_locations: z.string().optional(),
            tax_code: z.string().optional(),
          })
          .optional(),
        unit_label: z.string().max(12).optional(),
      })
      .optional(),
    tiers: z
      .array(
        z.object({
          flat_amount: z.number().int().positive(),
          flat_amount_decimal: z.string().optional(),
          unit_amount: z.number().int().positive().optional(),
          unit_amount_decimal: z.string().optional(),
          up_to: z.number().int().positive(),
        })
      )
      .optional(),
    tiers_mode: z.enum(['graduated', 'volume']).optional(),
    transfer_lookup_key: z.boolean().optional(),
    transform_quantity: z
      .object({
        divide_by: z.number().int().positive(),
        round: z.enum(['up', 'down']),
      })
      .optional(),
    unit_amount_decimal: z.string().optional(),
  })
  .merge(ExpandableSchema);

export type CreatePriceInput = z.infer<typeof CreatePriceSchema>;

/**
 * Schema for updating a price.
 */
export const UpdatePriceSchema = z
  .object({
    active: z.boolean().default(true).optional(),
    metadata: z.record(z.string(), z.string()).optional(),
    nickname: z.string().max(22).optional(),
    tax_behavior: z.enum(['exclusive', 'inclusive', 'unspecified']).optional(),
    currency_options: z
      .record(
        z.string(),
        z.object({
          custom_unit_amount: z
            .object({
              enabled: z.boolean().default(true),
              maximum: z.number().int().positive(),
              minimum: z.number().int().positive(),
              preset: z.number().int().positive(),
            })
            .optional(),
          tax_behavior: z
            .enum(['exclusive', 'inclusive', 'unspecified'])
            .optional(),
          tiers: z
            .array(
              z.object({
                flat_amount: z.number().int().positive(),
                flat_amount_decimal: z.string().optional(),
                unit_amount: z.number().int().positive().optional(),
                unit_amount_decimal: z.string().optional(),
                up_to: z.number().int().positive(),
              })
            )
            .optional(),
          unit_amount: z.number().int().positive().optional(),
          unit_amount_decimal: z.string().optional(),
        })
      )
      .optional(),
    lookup_key: z.string().max(200).optional(),
    transfer_lookup_key: z.boolean().optional(),
  })
  .merge(ExpandableSchema);

export type UpdatePriceInput = z.infer<typeof UpdatePriceSchema>;

/**
 * Schema for listing prices
 */
export const ListPricesSchema = z
  .object({
    active: z.boolean().optional(),
    currency: z.string().min(1).max(3).optional(),
    product: z.string().min(1).max(32).optional(),
    type: z.enum(['one_time', 'recurring']).optional(),
    created: z
      .object({
        gt: z.number().int().optional(),
        gte: z.number().int().optional(),
        lt: z.number().int().optional(),
        lte: z.number().int().optional(),
      })
      .optional(),
    ending_before: z.string().optional(),
    limit: z.number().int().min(1).max(100).optional(),
    lookup_keys: z.array(z.string()).optional(),
    recurring: z
      .object({
        interval: z.enum(['day', 'week', 'month', 'year']).optional(),
        meter: z.string().optional(),
        usage_type: z.enum(['metered', 'licensed']).optional(),
      })
      .optional(),
    starting_after: z.string().optional(),
  })
  .merge(ExpandableSchema);

export type ListPricesInput = z.infer<typeof ListPricesSchema>;

export const ListPricesFiltersSchema = z.object({
  active: z.boolean().optional(),
  currency: z.string().min(1).max(3).optional(),
  product: z.string().min(1).max(32).optional(),
  type: z.enum(['one_time', 'recurring']).optional(),
  lookup_keys: z.array(z.string()).optional(),
  recurring: z
    .object({
      interval: z.enum(['day', 'week', 'month', 'year']).optional(),
      meter: z.string().optional(),
      usage_type: z.enum(['metered', 'licensed']).optional(),
    })
    .optional(),
});
export type ListPricesFiltersInput = z.infer<typeof ListPricesFiltersSchema>;
