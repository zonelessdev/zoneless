import { z } from 'zod';
import { ExpandableSchema } from './ExpandableSchema';

const PackageDimensionsSchema = z.object({
  height: z.number().min(0).max(100000),
  length: z.number().min(0).max(100000),
  weight: z.number().min(0).max(100000),
  width: z.number().min(0).max(100000),
});

const MarketingFeatureSchema = z.object({
  name: z.string().min(1).max(80).nullable(),
});

/**
 * Schema for retrieving a product.
 */
export const RetrieveProductSchema = ExpandableSchema;
export type RetrieveProductInput = z.infer<typeof RetrieveProductSchema>;

/**
 * Schema for creating a product. Only name is required.
 */
export const CreateProductSchema = z
  .object({
    name: z.string().min(1).max(200),
    active: z.boolean().default(true).optional(),
    description: z.string().max(40000).optional(),
    id: z.string().min(1).max(32).optional(),
    metadata: z.record(z.string(), z.string()).optional(),
    tax_code: z.string().optional(),
    tax_details: z
      .object({
        performance_locations: z.string().optional(),
        tax_code: z.string().optional(),
      })
      .optional(),
    default_price_data: z
      .object({
        currency: z.string().min(1).max(4),
        product: z.string().min(1).max(32).optional(), //Used to set product id after creating product then creating price.
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
        metadata: z.record(z.string(), z.string()).optional(),
        recurring: z
          .object({
            interval: z.enum(['day', 'week', 'month', 'year']),
            interval_count: z.number().int().positive().optional(),
            trial_period_days: z.number().int().positive().optional(),
            usage_type: z.enum(['metered', 'licensed']).optional(),
            meter: z.string().optional(),
          })
          .optional(),
        tax_behavior: z
          .enum(['exclusive', 'inclusive', 'unspecified'])
          .optional(),
        unit_amount: z.number().int().positive(),
        unit_amount_decimal: z.string().optional(),
      })
      .optional(),
    identifiers: z
      .object({
        ean: z.string().max(500).optional(),
        gtin: z.string().max(500).optional(),
        isbn: z.string().max(500).optional(),
        jan: z.string().max(500).optional(),
        mpn: z.string().max(70).optional(),
        nsn: z.string().max(500).optional(),
        upc: z.string().max(500).optional(),
      })
      .optional(),
    images: z.array(z.string()).max(8).optional(),
    marketing_features: z.array(MarketingFeatureSchema).max(15).optional(),
    package_dimensions: PackageDimensionsSchema.optional(),
    shippable: z.boolean().optional(),
    statement_descriptor: z.string().max(22).optional(),
    unit_label: z.string().optional(),
    url: z.string().url().optional(),
  })
  .merge(ExpandableSchema);

export type CreateProductInput = z.infer<typeof CreateProductSchema>;

/**
 * Schema for updating a product.
 */
export const UpdateProductSchema = z
  .object({
    active: z.boolean().optional(),
    default_price: z.string().optional(),
    description: z.string().max(40000).optional(),
    metadata: z.record(z.string(), z.string()).optional(),
    name: z.string().min(1).max(200).optional(),
    tax_code: z.string().optional(),
    images: z.array(z.string()).max(8).optional(),
    marketing_features: z.array(MarketingFeatureSchema).max(15).optional(),
    package_dimensions: PackageDimensionsSchema.optional(),
    shippable: z.boolean().optional(),
    statement_descriptor: z.string().max(22).optional(),
    unit_label: z.string().optional(),
    url: z.string().url().optional(),
  })
  .merge(ExpandableSchema);

export type UpdateProductInput = z.infer<typeof UpdateProductSchema>;

/**
 * Schema for listing products
 */
export const ListProductsSchema = z
  .object({
    active: z.boolean().optional(),
    created: z
      .object({
        gt: z.number().int().optional(),
        gte: z.number().int().optional(),
        lt: z.number().int().optional(),
        lte: z.number().int().optional(),
      })
      .optional(),
    ending_before: z.string().optional(),
    ids: z.array(z.string()).optional(),
    limit: z.number().int().min(1).max(100).optional(),
    shippable: z.boolean().optional(),
    starting_after: z.string().optional(),
    url: z.string().url().optional(),
  })
  .merge(ExpandableSchema);
export type ListProductsInput = z.infer<typeof ListProductsSchema>;

export const ListProductsFiltersSchema = z.object({
  active: z.boolean().optional(),
  shippable: z.boolean().optional(),
  ids: z.array(z.string()).optional(),
  url: z.string().url().optional(),
});
export type ListProductsFiltersInput = z.infer<
  typeof ListProductsFiltersSchema
>;
