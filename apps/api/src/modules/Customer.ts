/**
 * @fileOverview Methods for Customers
 *
 *
 * @module Customer
 */

import { Database } from './Database';
import { EventService } from './EventService';
import { GenerateId } from '../utils/IdGenerator';
import {
  Customer as CustomerType,
  CustomerAddress,
  CustomerDeleted,
  QueryOperators,
} from '@zoneless/shared-types';
import { ValidateUpdate } from './Util';
import { ExtractChangedFields } from './Event';
import {
  CreateCustomerSchema,
  CreateCustomerInput,
  UpdateCustomerSchema,
  UpdateCustomerInput,
  ListCustomersFiltersInput,
} from '@zoneless/shared-schemas';
import { ListHelper, ListOptions, ListResult } from '../utils/ListHelper';
import { Now } from '../utils/Timestamp';
import { GetAppConfig } from './AppConfig';
import { AppError } from '../utils/AppError';
import { ERRORS } from '../utils/Errors';

type AddressInput = NonNullable<CreateCustomerInput['address']>;

/**
 * Fills in missing address fields with null to satisfy CustomerAddress,
 * whose fields are all nullable but required (unlike the input schema,
 * where they're simply optional).
 */
function ToCustomerAddress(input: AddressInput): CustomerAddress {
  return {
    city: input.city ?? null,
    country: input.country ?? null,
    line1: input.line1 ?? null,
    line2: input.line2 ?? null,
    postal_code: input.postal_code ?? null,
    state: input.state ?? null,
  };
}

export class CustomerModule {
  private readonly db: Database;
  private readonly eventService: EventService | null;
  private readonly listHelper: ListHelper<CustomerType>;

  constructor(db: Database, eventService?: EventService) {
    this.db = db;
    this.eventService = eventService || null;
    this.listHelper = new ListHelper<CustomerType>(db, {
      collection: 'Customers',
      orderByField: 'created',
      orderDirection: 'desc',
      urlPath: '/v1/customers',
      accountField: 'platform_account',
    });
  }

  /**
   * Create a new customer.
   *
   * @param platformAccountId - The platform account ID
   * @param input - The input data for the customer
   * @returns The created customer
   */
  async CreateCustomer(
    platformAccountId: string,
    input: CreateCustomerInput
  ): Promise<CustomerType> {
    const validatedInput = ValidateUpdate(CreateCustomerSchema, input);

    const customer = this.CustomerObject(platformAccountId, validatedInput);

    await this.db.Set('Customers', customer.id, customer);

    if (this.eventService) {
      await this.eventService.Emit(
        'customer.created',
        customer.platform_account,
        customer
      );
    }
    return customer;
  }

  CustomerObject(
    platformAccountId: string,
    input: CreateCustomerInput
  ): CustomerType {
    const id = GenerateId('cus_z');
    const requestedReconciliationMode =
      input.cash_balance?.settings?.reconciliation_mode;
    const usingMerchantDefault =
      !requestedReconciliationMode ||
      requestedReconciliationMode === 'merchant_default';

    const customer: CustomerType = {
      id,
      object: 'customer',
      address: input.address ? ToCustomerAddress(input.address) : null,
      balance: input.balance ?? 0,
      business_name: input.business_name ?? null,
      cash_balance: {
        object: 'cash_balance',
        available: {},
        customer: id,
        customer_account: null,
        livemode: GetAppConfig().livemode,
        settings: {
          reconciliation_mode: usingMerchantDefault
            ? 'automatic'
            : requestedReconciliationMode,
          using_merchant_default: usingMerchantDefault,
        },
      },
      created: Now(),
      currency: null,
      customer_account: null,
      default_source: input.source ?? null,
      delinquent: false,
      description: input.description ?? null,
      discount: null,
      email: input.email ?? null,
      individual_name: input.individual_name ?? null,
      invoice_credit_balance: {},
      invoice_prefix: input.invoice_prefix ?? null,
      invoice_settings: {
        custom_fields: input.invoice_settings?.custom_fields ?? null,
        default_payment_method:
          input.invoice_settings?.default_payment_method ??
          input.payment_method ??
          null,
        footer: input.invoice_settings?.footer ?? null,
        rendering_options: input.invoice_settings?.rendering_options
          ? {
              amount_tax_display:
                input.invoice_settings.rendering_options.amount_tax_display ??
                null,
              template:
                input.invoice_settings.rendering_options.template ?? null,
            }
          : null,
      },
      livemode: GetAppConfig().livemode,
      metadata: input.metadata ?? {},
      name: input.name ?? null,
      next_invoice_sequence: input.next_invoice_sequence ?? null,
      phone: input.phone ?? null,
      preferred_locales: input.preferred_locales ?? null,
      shipping: input.shipping
        ? {
            address: ToCustomerAddress(input.shipping.address),
            name: input.shipping.name,
            phone: input.shipping.phone ?? null,
          }
        : null,
      sources: {
        object: 'list',
        data: [],
        has_more: false,
        url: `/v1/customers/${id}/sources`,
      },
      subscriptions: {
        object: 'list',
        data: [],
        has_more: false,
        url: `/v1/customers/${id}/subscriptions`,
      },
      tax: {
        automatic_tax: 'not_collecting',
        ip_address: input.tax?.ip_address ?? null,
        location: null,
        provider: 'zoneless',
      },
      tax_exempt: input.tax_exempt ?? 'none',
      tax_ids: {
        object: 'list',
        data: (input.tax_id_data ?? []).map((taxId) => ({
          id: GenerateId('txi_z'),
          object: 'tax_id' as const,
          country: null,
          created: Now(),
          customer: id,
          customer_account: null,
          livemode: GetAppConfig().livemode,
          owner: {
            account: null,
            application: null,
            customer: id,
            customer_account: null,
            type: 'customer' as const,
          },
          type: taxId.type,
          value: taxId.value,
          verification: null,
        })),
        has_more: false,
        url: `/v1/customers/${id}/tax_ids`,
      },
      test_clock: input.test_clock ?? null,
      platform_account: platformAccountId,
    };
    return customer;
  }

  /**
   * Get a customer by its ID.
   *
   * @param id - The customer ID
   * @returns The Customer if found, null otherwise
   */
  async GetCustomer(id: string): Promise<CustomerType | null> {
    return this.db.Get<CustomerType>('Customers', id);
  }

  /**
   * Batch-load customers by id, scoped to a single platform account.
   * Used by the expansion engine to avoid N+1 lookups.
   */
  async BatchGet(
    ids: string[],
    platformAccount: string
  ): Promise<Map<string, CustomerType>> {
    if (ids.length === 0) return new Map();
    const customers = await this.db.Query<CustomerType>({
      collection: 'Customers',
      method: 'READ',
      parameters: [
        { key: 'id', operator: QueryOperators['in'], value: ids },
        {
          key: 'platform_account',
          operator: QueryOperators['=='],
          value: platformAccount,
        },
      ],
    });
    return new Map(customers.map((customer) => [customer.id, customer]));
  }

  /**
   * Update a customer.
   * Emits an 'customer.updated' event if EventService is configured.
   *
   * @param id - The Customer ID
   * @param input - The fields to update
   * @returns The updated Customer
   */
  async UpdateCustomer(
    id: string,
    input: UpdateCustomerInput
  ): Promise<CustomerType> {
    const validatedUpdate = ValidateUpdate(UpdateCustomerSchema, input);

    // Nested fields (address, cash_balance, etc.) need the previous customer
    // to merge against, so we fetch it upfront rather than only for the event.
    const previousCustomer = await this.GetCustomer(id);
    if (!previousCustomer) {
      throw new AppError(
        ERRORS.CUSTOMER_NOT_FOUND.message,
        ERRORS.CUSTOMER_NOT_FOUND.status,
        ERRORS.CUSTOMER_NOT_FOUND.type
      );
    }

    const updatePayload = this.BuildUpdatePayload(
      previousCustomer,
      validatedUpdate
    );

    await this.db.Update<CustomerType>('Customers', id, updatePayload);

    const customer = await this.GetCustomer(id);
    if (!customer) {
      throw new AppError(
        ERRORS.CUSTOMER_NOT_FOUND.message,
        ERRORS.CUSTOMER_NOT_FOUND.status,
        ERRORS.CUSTOMER_NOT_FOUND.type
      );
    }

    // Emit customer.updated event
    if (this.eventService) {
      const previousAttributes = ExtractChangedFields(
        previousCustomer as unknown as Record<string, unknown>,
        updatePayload as Record<string, unknown>
      );

      await this.eventService.Emit(
        'customer.updated',
        customer.platform_account,
        customer,
        {
          previousAttributes,
        }
      );
    }

    return customer;
  }

  /**
   * Builds the partial document to persist for an update, translating the
   * update schema's nested shapes (address, cash_balance, invoice_settings,
   * shipping, tax) into the fuller shapes stored on the Customer object.
   * Fields not provided in the input are left untouched by merging against
   * the previous customer.
   */
  private BuildUpdatePayload(
    previousCustomer: CustomerType,
    input: UpdateCustomerInput
  ): Partial<CustomerType> {
    const {
      address,
      cash_balance,
      invoice_settings,
      shipping,
      source,
      tax,
      ...rest
    } = input;

    const payload: Partial<CustomerType> = { ...rest };

    if (address !== undefined) {
      payload.address = ToCustomerAddress(address);
    }

    if (shipping !== undefined) {
      payload.shipping = {
        address: ToCustomerAddress(shipping.address),
        name: shipping.name,
        phone: shipping.phone ?? null,
      };
    }

    if (source !== undefined) {
      payload.default_source = source;
    }

    const requestedReconciliationMode =
      cash_balance?.settings?.reconciliation_mode;
    if (requestedReconciliationMode !== undefined) {
      const usingMerchantDefault =
        requestedReconciliationMode === 'merchant_default';
      payload.cash_balance = {
        ...previousCustomer.cash_balance,
        settings: {
          reconciliation_mode: usingMerchantDefault
            ? 'automatic'
            : requestedReconciliationMode,
          using_merchant_default: usingMerchantDefault,
        },
      };
    }

    if (invoice_settings !== undefined) {
      payload.invoice_settings = {
        custom_fields:
          invoice_settings.custom_fields ??
          previousCustomer.invoice_settings.custom_fields,
        default_payment_method:
          invoice_settings.default_payment_method ??
          previousCustomer.invoice_settings.default_payment_method,
        footer:
          invoice_settings.footer ?? previousCustomer.invoice_settings.footer,
        rendering_options: invoice_settings.rendering_options
          ? {
              amount_tax_display:
                invoice_settings.rendering_options.amount_tax_display ?? null,
              template: invoice_settings.rendering_options.template ?? null,
            }
          : previousCustomer.invoice_settings.rendering_options,
      };
    }

    if (tax !== undefined) {
      payload.tax = {
        ...previousCustomer.tax,
        ip_address: tax.ip_address ?? previousCustomer.tax.ip_address,
      };
    }

    return payload;
  }

  /**
   * Delete a customer.
   * Emits an 'customer.deleted' event if EventService is configured.
   *
   * @param id - The customer ID
   * @returns Deletion confirmation object
   */
  async DeleteCustomer(id: string): Promise<CustomerDeleted> {
    // Get the customer before deletion for the event
    const customer = await this.GetCustomer(id);

    if (!customer) {
      throw new AppError(
        ERRORS.CUSTOMER_NOT_FOUND.message,
        ERRORS.CUSTOMER_NOT_FOUND.status,
        ERRORS.CUSTOMER_NOT_FOUND.type
      );
    }

    await this.db.Delete('Customers', id);

    // Emit customer.deleted event
    if (this.eventService && customer) {
      await this.eventService.Emit(
        'customer.deleted',
        customer.platform_account,
        customer
      );
    }

    return {
      id,
      object: 'customer',
      deleted: true,
    };
  }

  /**
   * List customers
   */
  async ListCustomers(
    options: ListOptions & ListCustomersFiltersInput
  ): Promise<ListResult<CustomerType>> {
    const { email, test_clock, ...listOptions } = options;

    // Build filters
    const filters: Record<string, unknown> = {};
    if (email !== undefined) filters.email = email;
    if (test_clock !== undefined) filters.test_clock = test_clock;

    return this.listHelper.List({
      ...listOptions,
      filters: { ...listOptions.filters, ...filters },
    });
  }
}
