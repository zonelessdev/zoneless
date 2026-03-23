import { z } from 'zod';

/**
 * Schema for creating an API key.
 * Name is required to identify the key.
 */
export const CreateApiKeySchema = z.object({
  name: z
    .string()
    .min(1, 'Name is required')
    .max(100, 'Name must be 100 characters or less'),
  metadata: z.record(z.string(), z.string()).optional(),
});

export type CreateApiKeyInput = z.infer<typeof CreateApiKeySchema>;

/**
 * Internal schema for creating an API key with all fields.
 * Used by the module to pass additional context like livemode.
 */
export const CreateApiKeyInternalSchema = CreateApiKeySchema.extend({
  livemode: z.boolean().optional(),
});

export type CreateApiKeyInternalInput = z.infer<
  typeof CreateApiKeyInternalSchema
>;

/**
 * Schema for updating an API key.
 * All fields are optional - only provided fields will be updated.
 */
export const UpdateApiKeySchema = z
  .object({
    name: z
      .string()
      .min(1, 'Name is required')
      .max(100, 'Name must be 100 characters or less'),
    status: z.enum(['active', 'inactive']),
    metadata: z.record(z.string(), z.string()),
  })
  .partial()
  .refine((data) => Object.keys(data).length > 0, {
    message: 'At least one field must be provided for update',
  });

export type UpdateApiKeyInput = z.infer<typeof UpdateApiKeySchema>;
