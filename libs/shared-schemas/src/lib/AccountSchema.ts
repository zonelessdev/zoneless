import { z } from 'zod';

// ─────────────────────────────────────────────────────────────────────────────
// Reusable enums matching the Account types
// ─────────────────────────────────────────────────────────────────────────────

const AccountTypeEnum = z.enum(['standard', 'express', 'custom', 'none']);
const BusinessTypeEnum = z.enum([
  'individual',
  'company',
  'non_profit',
  'government_entity',
]);

// ─────────────────────────────────────────────────────────────────────────────
// Nested object schemas for create/update
// ─────────────────────────────────────────────────────────────────────────────

const BusinessProfileSchema = z
  .object({
    mcc: z.string().max(4).nullable(),
    name: z.string().max(255).nullable(),
    product_description: z.string().max(40000).nullable(),
    support_email: z.string().email().nullable(),
    support_phone: z.string().max(20).nullable(),
    support_url: z.string().url().nullable(),
    url: z.string().url().nullable(),
  })
  .partial();

const CapabilitiesSchema = z
  .object({
    transfers: z
      .object({
        requested: z.boolean(),
      })
      .partial(),
    usdc_payouts: z
      .object({
        requested: z.boolean(),
      })
      .partial(),
  })
  .partial();

const TosAcceptanceSchema = z
  .object({
    date: z.number().int().positive(),
    ip: z.string(),
    service_agreement: z.enum(['full', 'recipient']),
    user_agent: z.string(),
  })
  .partial();

const PayoutScheduleSchema = z
  .object({
    delay_days: z.union([z.number().int().min(0), z.literal('minimum')]),
    interval: z.enum(['daily', 'weekly', 'monthly', 'manual']),
    monthly_anchor: z.number().int().min(1).max(31),
    weekly_anchor: z.enum([
      'monday',
      'tuesday',
      'wednesday',
      'thursday',
      'friday',
      'saturday',
      'sunday',
    ]),
  })
  .partial();

const PayoutSettingsSchema = z
  .object({
    debit_negative_balances: z.boolean(),
    schedule: PayoutScheduleSchema,
    statement_descriptor: z.string().max(22).nullable(),
  })
  .partial();

const BrandingSettingsSchema = z
  .object({
    icon: z.string().nullable(),
    logo: z.string().nullable(),
    primary_color: z
      .string()
      .regex(/^#[0-9A-Fa-f]{6}$/)
      .nullable(),
    secondary_color: z
      .string()
      .regex(/^#[0-9A-Fa-f]{6}$/)
      .nullable(),
  })
  .partial();

const DashboardSettingsSchema = z
  .object({
    display_name: z.string().max(255).nullable(),
    timezone: z.string().max(100).nullable(),
  })
  .partial();

const IdentityDiditSettingsSchema = z
  .object({
    api_key: z.string().min(1).max(512).nullable(),
    workflow_id: z.string().min(1).max(255).nullable(),
    webhook_secret: z.string().min(1).max(512).nullable(),
  })
  .partial();

const IdentityCountryThresholdSchema = z.object({
  countries: z
    .array(
      z
        .string()
        .length(2, 'Country must be a 2-character ISO 3166-1 alpha-2 code')
        .transform((c) => c.toUpperCase())
    )
    .min(1, 'At least one country is required'),
  payout_volume_threshold_cents: z.number().int().nonnegative(),
});

const IdentityRulesSettingsSchema = z
  .object({
    payout_volume_threshold_cents: z.number().int().nonnegative().nullable(),
    country_thresholds: z.array(IdentityCountryThresholdSchema).nullable(),
  })
  .partial()
  .superRefine((rules, ctx) => {
    const rows = rules.country_thresholds;
    if (!rows?.length) return;

    const seen = new Set<string>();
    for (let i = 0; i < rows.length; i++) {
      for (const code of rows[i].countries) {
        if (seen.has(code)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `Country ${code} appears in more than one threshold override`,
            path: ['country_thresholds', i, 'countries'],
          });
        }
        seen.add(code);
      }
    }
  });

const IdentitySettingsSchema = z
  .object({
    provider: z.enum(['didit']).nullable(),
    didit: IdentityDiditSettingsSchema.nullable(),
    rules: IdentityRulesSettingsSchema.nullable(),
  })
  .partial();

const SettingsSchema = z
  .object({
    branding: BrandingSettingsSchema,
    dashboard: DashboardSettingsSchema,
    payouts: PayoutSettingsSchema,
    identity: IdentitySettingsSchema.nullable(),
    // Platform-specific settings (only used for platform accounts)
    terms_url: z.string().url().nullable(),
    privacy_url: z.string().url().nullable(),
  })
  .partial();

const ControllerSchema = z
  .object({
    fees: z.object({
      payer: z.enum([
        'account',
        'application',
        'application_custom',
        'application_express',
      ]),
    }),
    losses: z.object({
      payments: z.enum(['application', 'zoneless']),
    }),
    requirement_collection: z.enum(['application', 'zoneless']),
    zoneless_dashboard: z.object({
      type: z.enum(['express', 'full', 'none']),
    }),
  })
  .partial();

// ─────────────────────────────────────────────────────────────────────────────
// Create Account Schema
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Schema for creating an account.
 * All fields are optional - defaults will be applied for missing fields.
 * @see https://docs.stripe.com/api/accounts/create
 */
export const CreateAccountSchema = z
  .object({
    // Account type
    type: AccountTypeEnum,

    // Basic info
    email: z.string().email('Email must be a valid email'),
    business_type: BusinessTypeEnum,
    country: z
      .string()
      .length(2, 'Country must be a 2-character ISO 3166-1 alpha-2 code'),
    default_currency: z.string().min(1, 'Currency must be provided'),

    // Nested objects
    business_profile: BusinessProfileSchema,
    capabilities: CapabilitiesSchema,
    tos_acceptance: TosAcceptanceSchema,
    settings: SettingsSchema,
    controller: ControllerSchema,

    // Metadata
    metadata: z.record(z.string(), z.string()),
  })
  .partial();

export type CreateAccountInput = z.infer<typeof CreateAccountSchema>;

// ─────────────────────────────────────────────────────────────────────────────
// Update Account Schema
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Schema for updating an account.
 * All fields are optional - only provided fields will be updated.
 * Protected fields (id, object, created, charges_enabled, payouts_enabled, details_submitted)
 * are not included as they should not be directly updatable via API.
 * @see https://docs.stripe.com/api/accounts/update
 */
export const UpdateAccountSchema = z
  .object({
    // Basic info (some fields can be updated)
    email: z.string().email('Email must be a valid email'),
    business_type: BusinessTypeEnum,
    default_currency: z.string().min(1, 'Currency must be provided'),

    // Nested objects
    business_profile: BusinessProfileSchema,
    capabilities: CapabilitiesSchema,
    tos_acceptance: TosAcceptanceSchema,
    settings: SettingsSchema,

    // Metadata
    metadata: z.record(z.string(), z.string()),
  })
  .partial()
  .refine((data) => Object.keys(data).length > 0, {
    message: 'At least one field must be provided for update',
  });

export type UpdateAccountInput = z.infer<typeof UpdateAccountSchema>;

// ─────────────────────────────────────────────────────────────────────────────
// Reject Account Schema
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Schema for rejecting an account.
 * @see https://docs.stripe.com/api/account/reject
 */
export const RejectAccountSchema = z.object({
  reason: z.enum(['fraud', 'terms_of_service', 'other']),
  /** When true (default), also pause payouts. Payments are always paused on reject. */
  pause_payouts: z.boolean().optional(),
});

export type RejectAccountInput = z.infer<typeof RejectAccountSchema>;

/**
 * Schema for enabling or pausing payments (charges) on a connected account.
 */
export const SetChargesEnabledSchema = z.object({
  charges_enabled: z.boolean(),
});

export type SetChargesEnabledInput = z.infer<typeof SetChargesEnabledSchema>;

/**
 * Schema for enabling or pausing payouts on a connected account.
 */
export const SetPayoutsEnabledSchema = z.object({
  payouts_enabled: z.boolean(),
});

export type SetPayoutsEnabledInput = z.infer<typeof SetPayoutsEnabledSchema>;

/** disabled_reason values written by RejectAccount */
export const REJECTED_DISABLED_REASONS = [
  'rejected.fraud',
  'rejected.terms_of_service',
  'rejected.other',
] as const;

/** Status values accepted by GET /v1/accounts?status= (excluding "all") */
export const CONNECTED_ACCOUNT_STATUS_FILTERS = [
  'restricted',
  'in_review',
  'rejected',
  'enabled',
] as const;

export type ConnectedAccountStatusFilter =
  (typeof CONNECTED_ACCOUNT_STATUS_FILTERS)[number];

export type ConnectedAccountListStatus = 'all' | ConnectedAccountStatusFilter;

export function IsConnectedAccountStatusFilter(
  value: string | undefined
): value is ConnectedAccountStatusFilter {
  return (
    !!value &&
    (CONNECTED_ACCOUNT_STATUS_FILTERS as readonly string[]).includes(value)
  );
}

export function IsRejectedAccountReason(
  reason: string | null | undefined
): boolean {
  return typeof reason === 'string' && reason.startsWith('rejected.');
}

// ─────────────────────────────────────────────────────────────────────────────
// List Accounts Schema (SDK-specific, not from API)
// ─────────────────────────────────────────────────────────────────────────────

export const ListAccountsSchema = z
  .object({
    limit: z.number().int().min(1).max(100),
    starting_after: z.string(),
    ending_before: z.string(),
    /** Connected-account overview filter (platform dashboard) */
    status: z.enum(CONNECTED_ACCOUNT_STATUS_FILTERS),
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

export type ListAccountsInput = z.infer<typeof ListAccountsSchema>;
