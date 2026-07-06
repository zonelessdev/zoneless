import { z } from 'zod';
import { ExpandableSchema } from './ExpandableSchema';

// ─────────────────────────────────────────────────────────────────────────────
// Reusable nested object schemas
// ─────────────────────────────────────────────────────────────────────────────

const CustomerAddressSchema = z.object({
  city: z.string().optional(),
  country: z.string().optional(),
  line1: z.string().optional(),
  line2: z.string().optional(),
  postal_code: z.string().optional(),
  state: z.string().optional(),
});

const CustomerCashBalanceSchema = z.object({
  settings: z
    .object({
      reconciliation_mode: z.enum(['automatic', 'manual', 'merchant_default']),
    })
    .optional(),
});

const CustomerInvoiceCustomFieldSchema = z.object({
  name: z.string().min(1).max(40),
  value: z.string().min(1).max(140),
});

const CustomerInvoiceSettingsSchema = z.object({
  custom_fields: z.array(CustomerInvoiceCustomFieldSchema).max(4).optional(),
  default_payment_method: z.string().optional(),
  footer: z.string().optional(),
  rendering_options: z
    .object({
      amount_tax_display: z
        .enum(['exclude_tax', 'include_inclusive_tax'])
        .optional(),
      template: z.string().optional(),
    })
    .optional(),
});

const CustomerShippingSchema = z.object({
  address: CustomerAddressSchema,
  name: z.string().min(1),
  phone: z.string().optional(),
});

const CustomerTaxSchema = z.object({
  ip_address: z.string().optional(),
  validate_location: z.enum(['deferred', 'immediately']).optional(),
});

const CustomerUpdateTaxSchema = z.object({
  ip_address: z.string().optional(),
  validate_location: z.enum(['auto', 'deferred', 'immediately']).optional(),
});

const CustomerTaxIdDataSchema = z.object({
  type: z.string().min(1),
  value: z.string().min(1),
});

/**
 * Schema for retrieving a customer.
 */
export const RetrieveCustomerSchema = ExpandableSchema;
export type RetrieveCustomerInput = z.infer<typeof RetrieveCustomerSchema>;

/**
 * Schema for creating a customer.
 */
export const CreateCustomerSchema = z
  .object({
    address: CustomerAddressSchema.optional(),
    balance: z.number().int().optional(),
    business_name: z.string().max(150).optional(),
    cash_balance: CustomerCashBalanceSchema.optional(),
    description: z.string().optional(),
    email: z.string().email().max(512).optional(),
    individual_name: z.string().max(150).optional(),
    invoice_prefix: z
      .string()
      .regex(
        /^[A-Z0-9]{3,12}$/,
        'Invoice prefix must be 3-12 uppercase letters or numbers'
      )
      .optional(),
    invoice_settings: CustomerInvoiceSettingsSchema.optional(),
    metadata: z.record(z.string(), z.string()).optional(),
    name: z.string().max(256).optional(),
    next_invoice_sequence: z.number().int().positive().optional(),
    payment_method: z.string().optional(),
    phone: z.string().max(20).optional(),
    preferred_locales: z.array(z.string()).optional(),
    shipping: CustomerShippingSchema.optional(),
    source: z.string().optional(),
    tax: CustomerTaxSchema.optional(),
    tax_exempt: z.enum(['exempt', 'none', 'reverse']).optional(),
    tax_id_data: z.array(CustomerTaxIdDataSchema).optional(),
    test_clock: z.string().optional(),
  })
  .merge(ExpandableSchema);

export type CreateCustomerInput = z.infer<typeof CreateCustomerSchema>;

/**
 * Schema for updating a customer. All fields are optional; any parameters not
 * provided are left unchanged. Accepts mostly the same arguments as customer creation.
 */
export const UpdateCustomerSchema = z
  .object({
    address: CustomerAddressSchema.optional(),
    balance: z.number().int().optional(),
    business_name: z.string().max(150).optional(),
    cash_balance: CustomerCashBalanceSchema.optional(),
    default_source: z.string().max(500).optional(),
    description: z.string().optional(),
    email: z.string().email().max(512).optional(),
    individual_name: z.string().max(150).optional(),
    invoice_prefix: z
      .string()
      .regex(
        /^[A-Z0-9]{3,12}$/,
        'Invoice prefix must be 3-12 uppercase letters or numbers'
      )
      .optional(),
    invoice_settings: CustomerInvoiceSettingsSchema.optional(),
    metadata: z.record(z.string(), z.string()).optional(),
    name: z.string().max(256).optional(),
    next_invoice_sequence: z.number().int().positive().optional(),
    phone: z.string().max(20).optional(),
    preferred_locales: z.array(z.string()).optional(),
    shipping: CustomerShippingSchema.optional(),
    source: z.string().optional(),
    tax: CustomerUpdateTaxSchema.optional(),
    tax_exempt: z.enum(['exempt', 'none', 'reverse']).optional(),
  })
  .merge(ExpandableSchema);

export type UpdateCustomerInput = z.infer<typeof UpdateCustomerSchema>;

/**
 * Schema for listing customers.
 */
export const ListCustomersSchema = z
  .object({
    created: z
      .object({
        gt: z.number().int().optional(),
        gte: z.number().int().optional(),
        lt: z.number().int().optional(),
        lte: z.number().int().optional(),
      })
      .optional(),
    email: z.string().email().max(512).optional(),
    ending_before: z.string().optional(),
    limit: z.number().int().min(1).max(100).optional(),
    starting_after: z.string().optional(),
    test_clock: z.string().optional(),
  })
  .merge(ExpandableSchema);

export type ListCustomersInput = z.infer<typeof ListCustomersSchema>;

export const ListCustomersFiltersSchema = z.object({
  email: z.string().email().max(512).optional(),
  test_clock: z.string().optional(),
});
export type ListCustomersFiltersInput = z.infer<
  typeof ListCustomersFiltersSchema
>;
