/**
 * @fileOverview Methods for Invoice Items
 *
 * Invoice Items represent the component lines of an invoice. They can be
 * created before an invoice is ready and attached to a customer's next invoice
 * or a specific draft invoice.
 *
 * @module InvoiceItem
 * @see https://docs.stripe.com/api/invoiceitems
 */

import { Database } from './Database';
import { EventService } from './EventService';
import type { CustomerModule } from './Customer';
import type { PriceModule } from './Price';
import { GenerateId } from '../utils/IdGenerator';
import {
  InvoiceItem as InvoiceItemType,
  InvoiceItemDeleted,
  InvoicePeriod,
  InvoicePricing,
  Price as PriceType,
  QueryOperators,
} from '@zoneless/shared-types';
import { StripUndefined, ValidateUpdate } from './Util';
import {
  CreateInvoiceItemSchema,
  CreateInvoiceItemInput,
  UpdateInvoiceItemSchema,
  UpdateInvoiceItemInput,
  ListInvoiceItemsFiltersInput,
} from '@zoneless/shared-schemas';
import { ListHelper, ListOptions, ListResult } from '../utils/ListHelper';
import { Now } from '../utils/Timestamp';
import { GetAppConfig } from './AppConfig';
import { AppError } from '../utils/AppError';
import { ERRORS } from '../utils/Errors';

type ResolvedPricing = {
  amount: number;
  currency: 'usdc';
  pricing: InvoicePricing | null;
};

export class InvoiceItemModule {
  private readonly db: Database;
  private readonly eventService: EventService | null;
  private readonly listHelper: ListHelper<InvoiceItemType>;
  private readonly customerModule: CustomerModule | null;
  private readonly priceModule: PriceModule | null;

  constructor(
    db: Database,
    eventService?: EventService,
    customerModule?: CustomerModule,
    priceModule?: PriceModule
  ) {
    this.db = db;
    this.eventService = eventService || null;
    this.listHelper = new ListHelper<InvoiceItemType>(db, {
      collection: 'InvoiceItems',
      orderByField: 'created',
      orderDirection: 'desc',
      urlPath: '/v1/invoiceitems',
      accountField: 'platform_account',
    });
    this.customerModule = customerModule || null;
    this.priceModule = priceModule || null;
  }

  /**
   * Create a new invoice item.
   * Emits `invoiceitem.created` when EventService is configured.
   */
  async CreateInvoiceItem(
    platformAccountId: string,
    input: CreateInvoiceItemInput
  ): Promise<InvoiceItemType> {
    const validatedInput = ValidateUpdate(CreateInvoiceItemSchema, input);

    if (validatedInput.customer && this.customerModule) {
      await this.AssertCustomerBelongsToPlatform(
        validatedInput.customer,
        platformAccountId
      );
    }

    if (validatedInput.currency) {
      this.AssertSupportedCurrency(validatedInput.currency);
    }

    const resolved = await this.ResolvePricing(
      platformAccountId,
      validatedInput
    );
    const invoiceItem = this.InvoiceItemObject(
      platformAccountId,
      validatedInput,
      resolved
    );

    await this.db.Set('InvoiceItems', invoiceItem.id, invoiceItem);

    if (this.eventService) {
      await this.eventService.Emit(
        'invoiceitem.created',
        invoiceItem.platform_account,
        invoiceItem
      );
    }

    return invoiceItem;
  }

  InvoiceItemObject(
    platformAccountId: string,
    input: CreateInvoiceItemInput,
    resolved: ResolvedPricing
  ): InvoiceItemType {
    const now = Now();
    const quantity = this.ResolveQuantity(
      input.quantity,
      input.quantity_decimal
    );
    const quantityDecimal = input.quantity_decimal ?? String(quantity);
    const amount = resolved.amount;
    const discountable = input.discountable ?? amount >= 0;

    return {
      id: GenerateId('ii_z'),
      object: 'invoiceitem',
      amount,
      currency: resolved.currency,
      customer: input.customer ?? null,
      customer_account: input.customer_account ?? null,
      date: now,
      created: now,
      description: input.description ?? null,
      discountable,
      discounts: this.MapDiscountIds(input.discounts),
      invoice: input.invoice ?? null,
      livemode: GetAppConfig().livemode,
      metadata: input.metadata ?? {},
      net_amount: discountable ? null : amount,
      parent: input.subscription
        ? {
            type: 'subscription_details',
            subscription_details: {
              subscription: input.subscription,
              subscription_item: null,
            },
          }
        : null,
      period: this.ResolvePeriod(input.period, now),
      pricing: resolved.pricing,
      proration: false,
      proration_details: null,
      quantity,
      quantity_decimal: quantityDecimal,
      tax_rates: input.tax_rates ?? [],
      test_clock: null,
      platform_account: platformAccountId,
    };
  }

  /**
   * Get an invoice item by its ID.
   */
  async GetInvoiceItem(id: string): Promise<InvoiceItemType | null> {
    return this.db.Get<InvoiceItemType>('InvoiceItems', id);
  }

  /**
   * Batch-load invoice items by id, scoped to a single platform account.
   * Used by the expansion engine.
   */
  async BatchGet(
    ids: string[],
    platformAccount: string
  ): Promise<Map<string, InvoiceItemType>> {
    if (ids.length === 0) return new Map();
    const items = await this.db.Query<InvoiceItemType>({
      collection: 'InvoiceItems',
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
    return new Map(items.map((item) => [item.id, item]));
  }

  /**
   * Update an invoice item.
   * Updating is only possible before the invoice it's attached to is closed.
   * Stripe does not emit an `invoiceitem.updated` event.
   */
  async UpdateInvoiceItem(
    id: string,
    input: UpdateInvoiceItemInput
  ): Promise<InvoiceItemType> {
    const validatedUpdate = ValidateUpdate(UpdateInvoiceItemSchema, input);
    const existing = await this.GetInvoiceItem(id);

    if (!existing) {
      throw new AppError(
        ERRORS.INVOICE_ITEM_NOT_FOUND.message,
        ERRORS.INVOICE_ITEM_NOT_FOUND.status,
        ERRORS.INVOICE_ITEM_NOT_FOUND.type
      );
    }

    const updatePayload = await this.BuildUpdatePayload(
      existing,
      validatedUpdate
    );

    await this.db.Update<InvoiceItemType>('InvoiceItems', id, updatePayload);

    const invoiceItem = await this.GetInvoiceItem(id);
    if (!invoiceItem) {
      throw new Error('Invoice item not found after update');
    }

    return invoiceItem;
  }

  /**
   * Delete an invoice item.
   * Emits `invoiceitem.deleted` when EventService is configured.
   */
  async DeleteInvoiceItem(id: string): Promise<InvoiceItemDeleted> {
    const invoiceItem = await this.GetInvoiceItem(id);

    if (!invoiceItem) {
      throw new AppError(
        ERRORS.INVOICE_ITEM_NOT_FOUND.message,
        ERRORS.INVOICE_ITEM_NOT_FOUND.status,
        ERRORS.INVOICE_ITEM_NOT_FOUND.type
      );
    }

    await this.db.Delete('InvoiceItems', id);

    if (this.eventService) {
      await this.eventService.Emit(
        'invoiceitem.deleted',
        invoiceItem.platform_account,
        invoiceItem
      );
    }

    return {
      id,
      object: 'invoiceitem',
      deleted: true,
    };
  }

  /**
   * List invoice items.
   */
  async ListInvoiceItems(
    options: ListOptions & ListInvoiceItemsFiltersInput
  ): Promise<ListResult<InvoiceItemType>> {
    const { customer, customer_account, invoice, pending, ...listOptions } =
      options;

    const filters: Record<string, unknown> = {};
    if (customer !== undefined) filters.customer = customer;
    if (customer_account !== undefined) {
      filters.customer_account = customer_account;
    }
    if (invoice !== undefined) filters.invoice = invoice;
    if (pending === true) {
      filters.invoice = null;
    } else if (pending === false) {
      filters.invoice = {
        operator: QueryOperators['!='],
        value: null,
      };
    }

    return this.listHelper.List({
      ...listOptions,
      filters: { ...listOptions.filters, ...filters },
    });
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Pricing / amount resolution
  // ─────────────────────────────────────────────────────────────────────────

  private async ResolvePricing(
    platformAccountId: string,
    input: Pick<
      CreateInvoiceItemInput,
      | 'amount'
      | 'currency'
      | 'price_data'
      | 'pricing'
      | 'quantity'
      | 'quantity_decimal'
      | 'unit_amount_decimal'
    >
  ): Promise<ResolvedPricing> {
    const quantity = this.ResolveQuantity(
      input.quantity,
      input.quantity_decimal
    );

    if (input.pricing?.price) {
      const price = await this.GetOwnedPrice(
        input.pricing.price,
        platformAccountId
      );
      return this.PricingFromPrice(price, quantity);
    }

    if (input.price_data) {
      return this.PricingFromPriceData(
        platformAccountId,
        input.price_data,
        quantity
      );
    }

    if (input.unit_amount_decimal !== undefined) {
      const unitAmount = ParseDecimalAmount(input.unit_amount_decimal);
      const amount = Math.round(unitAmount * quantity);
      return {
        amount,
        currency: 'usdc',
        pricing: {
          price_details: null,
          type: 'price_details',
          unit_amount_decimal: input.unit_amount_decimal,
        },
      };
    }

    if (input.amount !== undefined) {
      return {
        amount: input.amount,
        currency: 'usdc',
        pricing: {
          price_details: null,
          type: 'price_details',
          unit_amount_decimal: String(input.amount),
        },
      };
    }

    // Stripe allows creating pending items that inherit amount later; default to 0.
    return {
      amount: 0,
      currency: 'usdc',
      pricing: {
        price_details: null,
        type: 'price_details',
        unit_amount_decimal: '0',
      },
    };
  }

  private async PricingFromPrice(
    price: PriceType,
    quantity: number
  ): Promise<ResolvedPricing> {
    const unitAmount = price.unit_amount ?? 0;
    const unitAmountDecimal = price.unit_amount_decimal ?? String(unitAmount);
    const productId =
      typeof price.product === 'string' ? price.product : price.product?.id;

    if (!productId) {
      throw new AppError(
        'Price is missing a product',
        ERRORS.INVALID_REQUEST.status,
        ERRORS.INVALID_REQUEST.type
      );
    }

    return {
      amount: Math.round(unitAmount * quantity),
      currency: 'usdc',
      pricing: {
        price_details: {
          price: price.id,
          product: productId,
        },
        type: 'price_details',
        unit_amount_decimal: unitAmountDecimal,
      },
    };
  }

  private async PricingFromPriceData(
    platformAccountId: string,
    priceData: NonNullable<CreateInvoiceItemInput['price_data']>,
    quantity: number
  ): Promise<ResolvedPricing> {
    this.AssertSupportedCurrency(priceData.currency);

    const unitAmount =
      priceData.unit_amount ??
      Math.round(ParseDecimalAmount(priceData.unit_amount_decimal!));
    const unitAmountDecimal =
      priceData.unit_amount_decimal ?? String(unitAmount);

    if (!this.priceModule) {
      throw new AppError(
        'PriceModule not configured',
        ERRORS.INVALID_REQUEST.status,
        ERRORS.INVALID_REQUEST.type
      );
    }

    // CreatePriceSchema requires a positive unit_amount; free prices skip create.
    if (unitAmount > 0) {
      const price = await this.priceModule.CreatePrice(platformAccountId, {
        currency: priceData.currency,
        product: priceData.product,
        tax_behavior: priceData.tax_behavior,
        unit_amount: unitAmount,
        unit_amount_decimal: unitAmountDecimal,
      });
      return this.PricingFromPrice(price, quantity);
    }

    return {
      amount: 0,
      currency: 'usdc',
      pricing: {
        price_details: null,
        type: 'price_details',
        unit_amount_decimal: unitAmountDecimal,
      },
    };
  }

  private async BuildUpdatePayload(
    existing: InvoiceItemType,
    input: UpdateInvoiceItemInput
  ): Promise<Partial<InvoiceItemType>> {
    const payload: Partial<InvoiceItemType> = {};

    if (input.description !== undefined) {
      payload.description = input.description;
    }
    if (input.discountable !== undefined) {
      payload.discountable = input.discountable;
    }
    if (input.metadata !== undefined) {
      payload.metadata = input.metadata;
    }
    if (input.period !== undefined) {
      payload.period = this.ResolvePeriod(input.period, existing.date);
    }
    if (input.discounts !== undefined) {
      payload.discounts =
        input.discounts === '' ? [] : this.MapDiscountIds(input.discounts);
    }
    if (input.tax_rates !== undefined) {
      payload.tax_rates = input.tax_rates === '' ? [] : input.tax_rates;
    }

    const quantityChanged =
      input.quantity !== undefined || input.quantity_decimal !== undefined;
    const pricingChanged =
      input.amount !== undefined ||
      input.price_data !== undefined ||
      input.pricing !== undefined ||
      input.unit_amount_decimal !== undefined;

    if (quantityChanged) {
      const quantity = this.ResolveQuantity(
        input.quantity,
        input.quantity_decimal,
        existing.quantity
      );
      payload.quantity = quantity;
      payload.quantity_decimal = input.quantity_decimal ?? String(quantity);
    }

    if (pricingChanged || quantityChanged) {
      const quantity =
        payload.quantity ??
        this.ResolveQuantity(
          input.quantity,
          input.quantity_decimal,
          existing.quantity
        );

      if (
        input.pricing !== undefined ||
        input.price_data !== undefined ||
        input.unit_amount_decimal !== undefined ||
        input.amount !== undefined
      ) {
        const resolved = await this.ResolvePricing(existing.platform_account, {
          amount: input.amount,
          price_data: input.price_data,
          pricing: input.pricing,
          quantity,
          quantity_decimal: payload.quantity_decimal,
          unit_amount_decimal: input.unit_amount_decimal,
        });
        payload.amount = resolved.amount;
        payload.pricing = resolved.pricing;
      } else if (existing.pricing?.unit_amount_decimal) {
        const unitAmount = ParseDecimalAmount(
          existing.pricing.unit_amount_decimal
        );
        payload.amount = Math.round(unitAmount * quantity);
      } else if (input.quantity !== undefined || input.quantity_decimal) {
        // Recalculate from prior unit amount when only quantity changes
        const priorUnit =
          existing.quantity > 0
            ? existing.amount / existing.quantity
            : existing.amount;
        payload.amount = Math.round(priorUnit * quantity);
      }

      const discountable =
        input.discountable ?? payload.discountable ?? existing.discountable;
      const amount = payload.amount ?? existing.amount;
      payload.net_amount = discountable ? null : amount;
    } else if (input.discountable !== undefined) {
      payload.net_amount = input.discountable ? null : existing.amount;
    }

    return StripUndefined(
      payload as Record<string, unknown>
    ) as Partial<InvoiceItemType>;
  }

  private ResolveQuantity(
    quantity?: number,
    quantityDecimal?: string,
    fallback = 1
  ): number {
    if (quantityDecimal !== undefined) {
      return Math.trunc(ParseDecimalAmount(quantityDecimal));
    }
    if (quantity !== undefined) {
      return quantity;
    }
    return fallback;
  }

  private ResolvePeriod(
    period: CreateInvoiceItemInput['period'] | undefined,
    fallbackTimestamp: number
  ): InvoicePeriod {
    if (period) {
      return { start: period.start, end: period.end };
    }
    return { start: fallbackTimestamp, end: fallbackTimestamp };
  }

  private MapDiscountIds(
    discounts: CreateInvoiceItemInput['discounts']
  ): string[] {
    if (!discounts?.length) {
      return [];
    }
    return discounts
      .map((discount) => discount.discount)
      .filter((id): id is string => !!id);
  }

  private async GetOwnedPrice(
    priceId: string,
    platformAccountId: string
  ): Promise<PriceType> {
    if (!this.priceModule) {
      throw new AppError(
        'PriceModule not configured',
        ERRORS.INVALID_REQUEST.status,
        ERRORS.INVALID_REQUEST.type
      );
    }

    const price = await this.priceModule.GetPrice(priceId);
    if (!price || price.platform_account !== platformAccountId) {
      throw new AppError(
        ERRORS.PRICE_NOT_FOUND.message,
        ERRORS.PRICE_NOT_FOUND.status,
        ERRORS.PRICE_NOT_FOUND.type
      );
    }

    return price;
  }

  private AssertSupportedCurrency(currency: string): void {
    if (currency !== 'usdc') {
      throw new AppError(
        `Currency '${currency}' is not supported. Only 'usdc' is accepted.`,
        ERRORS.INVALID_REQUEST.status,
        ERRORS.INVALID_REQUEST.type
      );
    }
  }

  private async AssertCustomerBelongsToPlatform(
    customerId: string,
    platformAccountId: string
  ): Promise<void> {
    const customer = await this.customerModule!.GetCustomer(customerId);
    if (!customer || customer.platform_account !== platformAccountId) {
      throw new AppError(
        ERRORS.CUSTOMER_NOT_FOUND.message,
        ERRORS.CUSTOMER_NOT_FOUND.status,
        ERRORS.CUSTOMER_NOT_FOUND.type
      );
    }
  }
}

function ParseDecimalAmount(value: string): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    throw new AppError(
      `Invalid decimal amount: '${value}'`,
      ERRORS.VALIDATION_ERROR.status,
      ERRORS.VALIDATION_ERROR.type
    );
  }
  return parsed;
}
