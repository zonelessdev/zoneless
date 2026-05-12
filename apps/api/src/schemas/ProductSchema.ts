import { z } from 'zod';

const PackageDimensionsSchema = z.object({
  height: z.number().min(0).max(100000),
  length: z.number().min(0).max(100000),
  weight: z.number().min(0).max(100000),
  width: z.number().min(0).max(100000),
});

const MarketingFeatureSchema = z.object({
  name: z.string().min(1).max(80),
});

/**
 * Schema for creating a product. Only name is required.
 */
export const CreateProductSchema = z.object({
  name: z.string().min(1).max(200),
  active: z.boolean().default(true).optional(),
  description: z.string().max(40000).optional(),
  id: z.string().min(1).max(32).optional(),
  metadata: z.record(z.string(), z.string()).optional(),
  tax_code: z.string().optional(),
  default_price: z.any().optional(), //TODO: add price schema
  images: z.array(z.string()).max(8).optional(),
  marketing_features: z.array(MarketingFeatureSchema).max(15).optional(),
  package_dimensions: PackageDimensionsSchema.optional(),
  shippable: z.boolean().optional(),
  statement_descriptor: z.string().max(22).optional(),
  unit_label: z.string().optional(),
  url: z.string().url().optional(),
});

export type CreateProductInput = z.infer<typeof CreateProductSchema>;

/**
 * Schema for updating a product.
 */
export const UpdateProductSchema = z.object({
  active: z.boolean().optional(),
  default_price: z.string().optional(), //TODO: add price schema
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
});

export type UpdateProductInput = z.infer<typeof UpdateProductSchema>;

/**
 * Schema for listing products
 */
export const ListProductsSchema = z.object({
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
});
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
