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
} from '@zoneless/shared-types';
import { ValidateUpdate } from './Util';
import {
  CreateCustomerSchema,
  CreateCustomerInput,
} from '@zoneless/shared-schemas';
import { Now } from '../utils/Timestamp';
import { GetAppConfig } from './AppConfig';

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

  constructor(db: Database, eventService?: EventService) {
    this.db = db;
    this.eventService = eventService || null;
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
        data: [],
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
}
