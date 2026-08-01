import { z } from 'zod';

/**
 * Schemas for Identity VerificationSessions.
 * @see https://docs.stripe.com/api/identity/verification_sessions
 */

const VerificationSessionTypeEnum = z.enum([
  'document',
  'id_number',
  'address',
  'verification_flow',
]);

const ProvidedDetailsSchema = z
  .object({
    email: z.string().email().nullable(),
    phone: z.string().max(32).nullable(),
  })
  .partial();

const DocumentOptionsSchema = z
  .object({
    require_live_capture: z.boolean(),
    require_matching_selfie: z.boolean(),
    allowed_types: z.array(
      z.enum(['driving_license', 'id_card', 'passport'])
    ),
  })
  .partial();

const OptionsSchema = z
  .object({
    document: DocumentOptionsSchema,
  })
  .partial();

/**
 * Create a VerificationSession.
 * @see https://docs.stripe.com/api/identity/verification_sessions/create
 */
export const CreateIdentityVerificationSessionSchema = z.object({
  type: VerificationSessionTypeEnum.default('document'),
  /** Connected account to verify (@zoneless_extension) */
  related_account: z.string().min(1, 'related_account is required'),
  /** Person on the account; optional — defaults to the account's individual */
  related_person: z.string().min(1).optional(),
  metadata: z.record(z.string(), z.string()).optional(),
  options: OptionsSchema.optional(),
  provided_details: ProvidedDetailsSchema.optional(),
  return_url: z.string().url().optional(),
});

export type CreateIdentityVerificationSessionInput = z.infer<
  typeof CreateIdentityVerificationSessionSchema
>;

/**
 * Update a VerificationSession (metadata / provided_details only while requires_input).
 * @see https://docs.stripe.com/api/identity/verification_sessions/update
 */
export const UpdateIdentityVerificationSessionSchema = z
  .object({
    metadata: z.record(z.string(), z.string()),
    provided_details: ProvidedDetailsSchema,
    options: OptionsSchema,
  })
  .partial()
  .refine((data) => Object.keys(data).length > 0, {
    message: 'At least one field must be provided for update',
  });

export type UpdateIdentityVerificationSessionInput = z.infer<
  typeof UpdateIdentityVerificationSessionSchema
>;

export const ListIdentityVerificationSessionsSchema = z
  .object({
    limit: z.number().int().min(1).max(100),
    starting_after: z.string(),
    ending_before: z.string(),
    related_account: z.string(),
    status: z.enum([
      'requires_input',
      'processing',
      'verified',
      'canceled',
      'requires_action',
    ]),
    created: z
      .object({
        gt: z.number().int(),
        gte: z.number().int(),
        lt: z.number().int(),
        lte: z.number().int(),
      })
      .partial(),
  })
  .partial();

export type ListIdentityVerificationSessionsInput = z.infer<
  typeof ListIdentityVerificationSessionsSchema
>;
