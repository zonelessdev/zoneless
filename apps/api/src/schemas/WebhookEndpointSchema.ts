import { z } from 'zod';
import { EVENT_TYPES, EventType } from '@zoneless/shared-types';

/**
 * Schema for creating a webhook endpoint.
 * URL and enabled_events are required.
 *
 * A webhook endpoint must have a `url` and a list of `enabled_events`.
 * You may optionally specify the Boolean `connect` parameter. If set to true,
 * then a Connect webhook endpoint that notifies the specified `url` about events
 * from all connected accounts is created; otherwise an account webhook endpoint
 * that notifies the specified `url` only about events from your account is created.
 */
export const CreateWebhookEndpointSchema = z.object({
  enabled_events: z
    .array(z.string())
    .min(1, 'At least one event type must be specified')
    .refine(
      (events) => events.every((e) => EVENT_TYPES.includes(e as EventType)),
      { message: 'Invalid event type specified' }
    ),
  url: z.string().url('URL must be a valid URL'),
  api_version: z.string().optional(),
  connect: z.boolean().optional(),
  description: z
    .string()
    .max(500, 'Description must be 500 characters or less')
    .optional(),
  metadata: z.record(z.string(), z.string()).optional(),
});

export type CreateWebhookEndpointInput = z.infer<
  typeof CreateWebhookEndpointSchema
>;

/**
 * Schema for updating a webhook endpoint.
 * All fields are optional - only provided fields will be updated.
 */
export const UpdateWebhookEndpointSchema = z
  .object({
    url: z.string().url('URL must be a valid URL'),
    enabled_events: z
      .array(z.string())
      .min(1, 'At least one event type must be specified')
      .refine(
        (events) => events.every((e) => EVENT_TYPES.includes(e as EventType)),
        { message: 'Invalid event type specified' }
      ),
    description: z
      .string()
      .max(500, 'Description must be 500 characters or less')
      .nullable(),
    disabled: z.boolean(),
    metadata: z.record(z.string(), z.string()),
  })
  .partial()
  .refine((data) => Object.keys(data).length > 0, {
    message: 'At least one field must be provided for update',
  });

export type UpdateWebhookEndpointInput = z.infer<
  typeof UpdateWebhookEndpointSchema
>;

/**
 * Schema for listing webhook endpoints.
 * All fields are optional pagination parameters.
 */
export const ListWebhookEndpointsSchema = z.object({
  limit: z.number().int().min(1).max(100).optional(),
  starting_after: z.string().optional(),
  ending_before: z.string().optional(),
});

export type ListWebhookEndpointsInput = z.infer<
  typeof ListWebhookEndpointsSchema
>;
