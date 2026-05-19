import { z } from 'zod';

/**
 * Schema for address object (nested in Person).
 * All fields are optional, but can be null when provided.
 */
const AddressSchema = z.object({
  line1: z.string().max(200).nullable(),
  line2: z.string().max(200).nullable().optional(),
  city: z.string().max(100).nullable(),
  state: z.string().nullable().optional(),
  postal_code: z.string().nullable(),
  country: z
    .string()
    .length(2, 'Country must be a 2-character ISO 3166-1 alpha-2 code')
    .nullable(),
});

/**
 * Schema for date of birth object.
 * All fields required when dob is provided, but can be null.
 */
const DobSchema = z.object({
  day: z.number().min(1).max(31).nullable(),
  month: z.number().min(1).max(12).nullable(),
  year: z.number().min(1900).max(new Date().getFullYear()).nullable(),
});

/**
 * Schema for relationship object describing the person's relationship to the account.
 */
const RelationshipSchema = z.object({
  authorizer: z.boolean().nullable().optional(),
  director: z.boolean().nullable().optional(),
  executive: z.boolean().nullable().optional(),
  legal_guardian: z.boolean().nullable().optional(),
  owner: z.boolean().nullable().optional(),
  percent_ownership: z.number().min(0).max(100).nullable().optional(),
  representative: z.boolean().nullable().optional(),
  title: z.string().max(100).nullable().optional(),
});

/**
 * Schema for verification document object.
 */
const VerificationDocumentSchema = z.object({
  back: z.string().max(500).optional(),
  front: z.string().max(500).optional(),
});

/**
 * Schema for verification object.
 */
const VerificationSchema = z.object({
  additional_document: VerificationDocumentSchema.optional(),
  document: VerificationDocumentSchema.optional(),
});

/**
 * Schema for creating a person.
 * Follows Stripe API: POST /v1/accounts/:id/persons
 *
 * All fields are optional - Stripe allows creating a minimal person
 * and updating it later.
 */
export const CreatePersonSchema = z
  .object({
    address: AddressSchema.optional(),
    dob: DobSchema.optional(),
    email: z.string().email('Email must be valid').max(800).optional(),
    first_name: z.string().max(100).optional(),
    last_name: z.string().max(100).optional(),
    phone: z.string().nullable().optional(),
    relationship: RelationshipSchema.optional(),
    ssn_last_4: z.string().length(4).optional(),
    id_number: z.string().optional(),
    metadata: z.record(z.string(), z.string()).optional(),
    verification: VerificationSchema.optional(),
  })
  .strict();

export type CreatePersonInput = z.infer<typeof CreatePersonSchema>;

/**
 * Schema for updating a person.
 * Follows Stripe API: POST /v1/accounts/:id/persons/:personId
 *
 * All fields are optional - only provided fields will be updated.
 * Protected fields (id, object, account, created) are not included.
 */
export const UpdatePersonSchema = z
  .object({
    address: AddressSchema.optional(),
    dob: DobSchema.optional(),
    email: z.string().email('Email must be valid').max(800).optional(),
    first_name: z.string().max(100).optional(),
    last_name: z.string().max(100).optional(),
    phone: z.string().nullable().optional(),
    relationship: RelationshipSchema.optional(),
    ssn_last_4: z.string().length(4).optional(),
    id_number: z.string().optional(),
    metadata: z.record(z.string(), z.string()).optional(),
    verification: VerificationSchema.optional(),
  })
  .strict()
  .refine((data) => Object.keys(data).length > 0, {
    message: 'At least one field must be provided for update',
  });

export type UpdatePersonInput = z.infer<typeof UpdatePersonSchema>;

/**
 * Schema for listing persons with filters.
 * Follows Stripe API: GET /v1/accounts/:id/persons
 */
export const ListPersonsQuerySchema = z.object({
  limit: z.coerce.number().min(1).max(100).default(10).optional(),
  starting_after: z.string().optional(),
  ending_before: z.string().optional(),
  // Relationship filters
  'relationship[authorizer]': z.coerce.boolean().optional(),
  'relationship[director]': z.coerce.boolean().optional(),
  'relationship[executive]': z.coerce.boolean().optional(),
  'relationship[legal_guardian]': z.coerce.boolean().optional(),
  'relationship[owner]': z.coerce.boolean().optional(),
  'relationship[representative]': z.coerce.boolean().optional(),
});

export type ListPersonsQuery = z.infer<typeof ListPersonsQuerySchema>;

// ─────────────────────────────────────────────────────────────────────────────
// List Persons Schema (SDK-specific, not from API)
// ─────────────────────────────────────────────────────────────────────────────

export const ListPersonsSchema = z
  .object({
    limit: z.number().int().min(1).max(100),
    starting_after: z.string(),
    ending_before: z.string(),
    relationship: z
      .object({
        authorizer: z.boolean(),
        director: z.boolean(),
        executive: z.boolean(),
        legal_guardian: z.boolean(),
        owner: z.boolean(),
        representative: z.boolean(),
      })
      .partial(),
  })
  .partial();

export type ListPersonsInput = z.infer<typeof ListPersonsSchema>;

/**
 * Helper type for relationship filters extracted from query params.
 */
export interface RelationshipFilters {
  authorizer?: boolean;
  director?: boolean;
  executive?: boolean;
  legal_guardian?: boolean;
  owner?: boolean;
  representative?: boolean;
}

/**
 * Parse relationship filters from query parameters.
 *
 * @param query - The query parameters object
 * @returns Relationship filters object
 */
export function ParseRelationshipFilters(
  query: Record<string, unknown>
): RelationshipFilters {
  const filters: RelationshipFilters = {};

  if (query['relationship[authorizer]'] !== undefined) {
    filters.authorizer = query['relationship[authorizer]'] === 'true';
  }
  if (query['relationship[director]'] !== undefined) {
    filters.director = query['relationship[director]'] === 'true';
  }
  if (query['relationship[executive]'] !== undefined) {
    filters.executive = query['relationship[executive]'] === 'true';
  }
  if (query['relationship[legal_guardian]'] !== undefined) {
    filters.legal_guardian = query['relationship[legal_guardian]'] === 'true';
  }
  if (query['relationship[owner]'] !== undefined) {
    filters.owner = query['relationship[owner]'] === 'true';
  }
  if (query['relationship[representative]'] !== undefined) {
    filters.representative = query['relationship[representative]'] === 'true';
  }

  return filters;
}
