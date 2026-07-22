/**
 * @fileOverview Methods for Invoices
 *
 * Invoices are statements of amounts owed by a customer. They contain invoice
 * items (and later, subscription line items / prorations). Settled in USDC.
 * Finalizing a charge_automatically invoice creates a PaymentIntent; paying
 * collects via Solana subscription pull (or paid_out_of_band).
 *
 * @module Invoice
 * @see https://docs.stripe.com/api/invoices
 */

import { Database } from './Database';
import { EventService } from './EventService';
import { ExtractChangedFields } from './Event';
import type { CustomerModule } from './Customer';
import type { InvoiceItemModule } from './InvoiceItem';
import type { PaymentIntentModule } from './PaymentIntent';
import type { ChargeModule } from './Charge';
import type { PriceModule } from './Price';
import { BalanceModule } from './Balance';
import { BalanceTransactionModule } from './BalanceTransaction';
import { Solana, SolanaExplorerUrl } from './chains/Solana';
import { GenerateId } from '../utils/IdGenerator';
import {
  BalanceTransaction as BalanceTransactionType,
  Customer as CustomerType,
  Invoice as InvoiceType,
  InvoiceBillingReason,
  InvoiceDeleted,
  InvoiceItem as InvoiceItemType,
  InvoiceLineItem,
  InvoicePayment,
  InvoiceStatus,
  Price as PriceType,
  QueryOperators,
  Subscription as SubscriptionType,
  SubscriptionItem as SubscriptionItemType,
} from '@zoneless/shared-types';
import { StripUndefined, ValidateUpdate, ExpandableId } from './Util';
import {
  CreateInvoiceSchema,
  CreateInvoiceInput,
  UpdateInvoiceSchema,
  UpdateInvoiceInput,
  FinalizeInvoiceSchema,
  FinalizeInvoiceInput,
  PayInvoiceSchema,
  PayInvoiceInput,
  ListInvoicesFiltersInput,
} from '@zoneless/shared-schemas';
import { ListHelper, ListOptions, ListResult } from '../utils/ListHelper';
import { Now } from '../utils/Timestamp';
import { GetAppConfig } from './AppConfig';
import { AppError } from '../utils/AppError';
import { ERRORS } from '../utils/Errors';
import { Logger } from '../utils/Logger';
import { ClientSession } from 'mongoose';

/** Fields that may only be changed while the invoice is a draft. */
const DRAFT_ONLY_UPDATE_FIELDS = new Set([
  'collection_method',
  'days_until_due',
  'due_date',
  'application_fee_amount',
  'account_tax_ids',
  'default_tax_rates',
  'shipping_cost',
  'transfer_data',
  'automatically_finalizes_at',
]);

/** Max automatic payment attempts before the invoice is exhausted. */
export const INVOICE_MAX_PAYMENT_ATTEMPTS = 4;

const SECONDS_PER_DAY = 24 * 60 * 60;

/** Delays after attempts 1, 2, and 3 before the next retry. */
const RETRY_DELAYS_SECONDS = [
  1 * SECONDS_PER_DAY,
  3 * SECONDS_PER_DAY,
  5 * SECONDS_PER_DAY,
];

/**
 * When Solana rejects because this period's allowance is already used, the
 * next billing run should be allowed to retry immediately (period may have
 * rolled). A multi-minute backoff made manual catch-up look permanently stuck
 * on `skipped`.
 */
const PERIOD_ALLOWANCE_RETRY_SECONDS = 0;

const PERIOD_ALLOWANCE_ALREADY_COLLECTED =
  /period allowance already collected|exceeds period limit/i;

export class InvoiceModule {
  private readonly db: Database;
  private readonly eventService: EventService | null;
  private readonly listHelper: ListHelper<InvoiceType>;
  private readonly customerModule: CustomerModule | null;
  private readonly invoiceItemModule: InvoiceItemModule | null;
  private readonly paymentIntentModule: PaymentIntentModule | null;
  private readonly chargeModule: ChargeModule | null;
  private readonly priceModule: PriceModule | null;
  private readonly balanceModule: BalanceModule;
  private readonly balanceTransactionModule: BalanceTransactionModule;
  private readonly solana: Solana;

  constructor(
    db: Database,
    eventService?: EventService,
    customerModule?: CustomerModule,
    invoiceItemModule?: InvoiceItemModule,
    paymentIntentModule?: PaymentIntentModule,
    chargeModule?: ChargeModule,
    priceModule?: PriceModule,
    solana?: Solana
  ) {
    this.db = db;
    this.eventService = eventService || null;
    this.listHelper = new ListHelper<InvoiceType>(db, {
      collection: 'Invoices',
      orderByField: 'created',
      orderDirection: 'desc',
      urlPath: '/v1/invoices',
      accountField: 'platform_account',
    });
    this.customerModule = customerModule || null;
    this.invoiceItemModule = invoiceItemModule || null;
    this.paymentIntentModule = paymentIntentModule || null;
    this.chargeModule = chargeModule || null;
    this.priceModule = priceModule || null;
    this.balanceModule = new BalanceModule(db);
    this.balanceTransactionModule = new BalanceTransactionModule(db);
    this.solana = solana || new Solana();
  }

  /**
   * Create a new draft invoice.
   * Emits `invoice.created` when EventService is configured.
   */
  async CreateInvoice(
    platformAccountId: string,
    input: CreateInvoiceInput
  ): Promise<InvoiceType> {
    const validatedInput = ValidateUpdate(CreateInvoiceSchema, input);

    if (validatedInput.currency) {
      this.AssertSupportedCurrency(validatedInput.currency);
    }

    let invoice: InvoiceType;

    if (validatedInput.from_invoice) {
      invoice = await this.CreateRevisionInvoice(
        platformAccountId,
        validatedInput
      );
    } else {
      const customer = await this.RequireCustomer(
        validatedInput.customer!,
        platformAccountId
      );
      invoice = this.InvoiceObject(platformAccountId, validatedInput, customer);

      const behavior =
        validatedInput.pending_invoice_items_behavior ?? 'exclude';
      if (behavior === 'include' && this.invoiceItemModule) {
        await this.IncludePendingInvoiceItems(
          platformAccountId,
          customer.id,
          invoice
        );
      }
    }

    await this.db.Set('Invoices', invoice.id, invoice);

    if (this.eventService) {
      await this.eventService.Emit(
        'invoice.created',
        invoice.platform_account,
        invoice
      );
    }

    return invoice;
  }

  /**
   * Build an Invoice object from create input without persisting it.
   */
  InvoiceObject(
    platformAccountId: string,
    input: CreateInvoiceInput,
    customer: CustomerType
  ): InvoiceType {
    const now = Now();
    const id = GenerateId('in_z');
    const collectionMethod = input.collection_method ?? 'charge_automatically';

    const invoice: InvoiceType = {
      id,
      object: 'invoice',
      account_country: null,
      account_name: null,
      account_tax_ids: input.account_tax_ids ?? null,
      amount_due: 0,
      amount_overpaid: 0,
      amount_paid: 0,
      amount_paid_off_stripe: 0,
      amount_remaining: 0,
      amount_shipping: 0,
      application: null,
      attempt_count: 0,
      attempted: false,
      auto_advance: input.auto_advance ?? false,
      automatic_tax: {
        disabled_reason: null,
        enabled: input.automatic_tax?.enabled ?? false,
        liability: input.automatic_tax?.liability
          ? {
              type: input.automatic_tax.liability.type,
              account: input.automatic_tax.liability.account ?? null,
            }
          : null,
        provider: null,
        status: null,
      },
      automatically_finalizes_at: input.automatically_finalizes_at ?? null,
      billing_reason: 'manual',
      collection_method: collectionMethod,
      confirmation_secret: null,
      created: now,
      currency: 'usdc',
      custom_fields: input.custom_fields ?? null,
      customer: customer.id,
      customer_account: input.customer_account ?? null,
      customer_address: customer.address,
      customer_email: customer.email,
      customer_name: customer.name,
      customer_phone: customer.phone,
      customer_shipping: customer.shipping,
      customer_tax_exempt: customer.tax_exempt,
      customer_tax_ids: this.SnapshotCustomerTaxIds(customer),
      default_payment_method: input.default_payment_method ?? null,
      default_source: input.default_source ?? null,
      default_tax_rates: [],
      description: input.description ?? null,
      discounts: this.MapDiscountIds(input.discounts),
      due_date:
        collectionMethod === 'send_invoice'
          ? this.ResolveDueDate(input, now)
          : null,
      effective_at: input.effective_at ?? null,
      ending_balance: null,
      footer: input.footer ?? null,
      from_invoice: null,
      hosted_invoice_url: null,
      invoice_pdf: null,
      issuer: input.issuer
        ? {
            type: input.issuer.type,
            account: input.issuer.account ?? null,
          }
        : { type: 'self', account: null },
      last_finalization_error: null,
      latest_revision: null,
      lines: this.EmptyLinesList(id),
      livemode: GetAppConfig().livemode,
      metadata: input.metadata ?? {},
      next_payment_attempt:
        collectionMethod === 'charge_automatically' ? null : null,
      number: input.number ?? null,
      on_behalf_of: input.on_behalf_of ?? null,
      parent: input.subscription
        ? {
            type: 'subscription_details',
            quote_details: null,
            subscription_details: {
              metadata: null,
              subscription: input.subscription,
              subscription_proration_date: null,
            },
          }
        : null,
      payment_settings: {
        default_mandate: input.payment_settings?.default_mandate ?? null,
        payment_method_options:
          input.payment_settings?.payment_method_options ?? null,
        payment_method_types:
          input.payment_settings?.payment_method_types ?? null,
      },
      payments: this.EmptyPaymentsList(id),
      period_end: now,
      period_start: now,
      post_payment_credit_notes_amount: 0,
      pre_payment_credit_notes_amount: 0,
      receipt_number: null,
      rendering: input.rendering
        ? {
            amount_tax_display: input.rendering.amount_tax_display ?? null,
            pdf: input.rendering.pdf
              ? { page_size: input.rendering.pdf.page_size ?? null }
              : null,
            template: input.rendering.template ?? null,
            template_version: input.rendering.template_version ?? null,
          }
        : null,
      shipping_cost: null,
      shipping_details: input.shipping_details
        ? {
            address: {
              city: input.shipping_details.address.city ?? null,
              country: input.shipping_details.address.country ?? null,
              line1: input.shipping_details.address.line1 ?? null,
              line2: input.shipping_details.address.line2 ?? null,
              postal_code: input.shipping_details.address.postal_code ?? null,
              state: input.shipping_details.address.state ?? null,
            },
            name: input.shipping_details.name,
            phone: input.shipping_details.phone ?? null,
          }
        : null,
      starting_balance: customer.balance ?? 0,
      statement_descriptor: input.statement_descriptor ?? null,
      status: 'draft',
      status_transitions: {
        finalized_at: null,
        marked_uncollectible_at: null,
        paid_at: null,
        voided_at: null,
      },
      subtotal: 0,
      subtotal_excluding_tax: 0,
      test_clock: null,
      threshold_reason: null,
      total: 0,
      total_discount_amounts: [],
      total_excluding_tax: 0,
      total_pretax_credit_amounts: [],
      total_taxes: [],
      transfer_data: input.transfer_data
        ? {
            destination: input.transfer_data.destination,
            amount: input.transfer_data.amount ?? null,
          }
        : null,
      webhooks_delivered_at: now,
      platform_account: platformAccountId,
    };

    return invoice;
  }

  async GetInvoice(id: string): Promise<InvoiceType | null> {
    return this.db.Get<InvoiceType>('Invoices', id);
  }

  async BatchGet(
    ids: string[],
    platformAccount: string
  ): Promise<Map<string, InvoiceType>> {
    if (ids.length === 0) return new Map();
    const invoices = await this.db.Query<InvoiceType>({
      collection: 'Invoices',
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
    return new Map(invoices.map((invoice) => [invoice.id, invoice]));
  }

  /**
   * Update an invoice.
   * Emits `invoice.updated` with previous attributes when EventService is configured.
   */
  async UpdateInvoice(
    id: string,
    input: UpdateInvoiceInput
  ): Promise<InvoiceType> {
    const validatedUpdate = ValidateUpdate(UpdateInvoiceSchema, input);
    const previous = await this.RequireInvoice(id);

    this.AssertDraftOnlyUpdates(previous, validatedUpdate);

    const updatePayload = this.BuildUpdatePayload(previous, validatedUpdate);

    if (Object.keys(updatePayload).length > 0) {
      await this.db.Update<InvoiceType>('Invoices', id, updatePayload);
    }

    const invoice = await this.RequireInvoice(id);

    if (this.eventService) {
      const previousAttributes = ExtractChangedFields(
        previous as unknown as Record<string, unknown>,
        updatePayload as Record<string, unknown>
      );
      await this.eventService.Emit(
        'invoice.updated',
        invoice.platform_account,
        invoice,
        { previousAttributes }
      );
    }

    return invoice;
  }

  /**
   * Delete a draft invoice.
   * Emits `invoice.deleted` when EventService is configured.
   */
  async DeleteInvoice(id: string): Promise<InvoiceDeleted> {
    const invoice = await this.RequireInvoice(id);
    this.AssertStatus(invoice, ['draft'], 'delete');

    await this.db.Delete('Invoices', id);

    if (this.eventService) {
      await this.eventService.Emit(
        'invoice.deleted',
        invoice.platform_account,
        invoice
      );
    }

    return { id, object: 'invoice', deleted: true };
  }

  /**
   * Finalize a draft invoice (draft → open).
   * For charge_automatically invoices with amount_due > 0, creates a
   * PaymentIntent and default InvoicePayment, and sets confirmation_secret.
   * Emits `invoice.finalized`.
   */
  async FinalizeInvoice(
    id: string,
    input: FinalizeInvoiceInput = {}
  ): Promise<InvoiceType> {
    const validatedInput = ValidateUpdate(FinalizeInvoiceSchema, input);
    const previous = await this.RequireInvoice(id);
    this.AssertStatus(previous, ['draft'], 'finalize');

    const now = Now();
    const updatePayload: Partial<InvoiceType> = {
      status: 'open',
      auto_advance:
        validatedInput.auto_advance !== undefined
          ? validatedInput.auto_advance
          : previous.auto_advance,
      ending_balance: previous.starting_balance,
      number: previous.number ?? this.GenerateInvoiceNumber(previous),
      status_transitions: {
        ...previous.status_transitions,
        finalized_at: now,
      },
      effective_at: previous.effective_at ?? now,
      last_finalization_error: null,
    };

    if (
      previous.collection_method === 'charge_automatically' &&
      previous.amount_due > 0
    ) {
      const paymentIntent = await this.CreateInvoicePaymentIntent(previous);
      const invoicePayment = this.BuildDefaultInvoicePayment(
        previous,
        paymentIntent.id,
        paymentIntent.amount
      );
      updatePayload.confirmation_secret = {
        type: 'payment_intent',
        client_secret: paymentIntent.client_secret!,
      };
      updatePayload.payments = {
        object: 'list',
        data: [invoicePayment],
        has_more: false,
        total_count: 1,
        url: `/v1/invoices/${previous.id}/payments`,
      };
      if (previous.collection_method === 'charge_automatically') {
        updatePayload.next_payment_attempt = now;
      }
    }

    await this.db.Update<InvoiceType>('Invoices', id, updatePayload);
    const invoice = await this.RequireInvoice(id);

    if (this.eventService) {
      await this.eventService.Emit(
        'invoice.finalized',
        invoice.platform_account,
        invoice
      );
    }

    return invoice;
  }

  /**
   * Mark an open invoice as uncollectible.
   * Emits `invoice.marked_uncollectible`.
   */
  async MarkInvoiceUncollectible(id: string): Promise<InvoiceType> {
    const previous = await this.RequireInvoice(id);
    this.AssertStatus(previous, ['open'], 'mark uncollectible');

    const now = Now();
    await this.db.Update<InvoiceType>('Invoices', id, {
      status: 'uncollectible',
      next_payment_attempt: null,
      status_transitions: {
        ...previous.status_transitions,
        marked_uncollectible_at: now,
      },
    });

    const invoice = await this.RequireInvoice(id);

    if (this.eventService) {
      await this.eventService.Emit(
        'invoice.marked_uncollectible',
        invoice.platform_account,
        invoice
      );
    }

    return invoice;
  }

  /**
   * Pay an invoice.
   * Supports `paid_out_of_band`, zero-amount invoices, and automatic Solana
   * subscription collection (or `settlement_signature` when already collected).
   * Emits `invoice.paid` / `invoice.payment_succeeded` on success, or
   * `invoice.payment_failed` on failure.
   */
  async PayInvoice(
    id: string,
    input: PayInvoiceInput = {}
  ): Promise<InvoiceType> {
    const validatedInput = ValidateUpdate(PayInvoiceSchema, input);
    const previous = await this.RequireInvoice(id);
    this.AssertStatus(previous, ['open', 'uncollectible'], 'pay');

    if (validatedInput.paid_out_of_band) {
      return this.MarkInvoicePaid(previous, {
        amountPaidOffStripe: previous.amount_due,
      });
    }

    if (previous.amount_due === 0) {
      return this.MarkInvoicePaid(previous, { amountPaidOffStripe: 0 });
    }

    const paymentIntentId = this.GetDefaultPaymentIntentId(previous);
    if (!paymentIntentId) {
      throw new AppError(
        'Invoice has no PaymentIntent. Finalize the invoice before paying, or pass `paid_out_of_band=true`.',
        ERRORS.INVALID_REQUEST.status,
        ERRORS.INVALID_REQUEST.type
      );
    }

    try {
      const settlement = await this.SettleInvoicePayment(
        previous,
        validatedInput.settlement_signature
      );

      if (this.chargeModule && this.paymentIntentModule) {
        const charge = await this.chargeModule.CreateFromPaymentAttempt(
          previous.platform_account,
          {
            amount: previous.amount_due,
            currency: previous.currency,
            payment_intent: paymentIntentId,
            payment_method:
              previous.default_payment_method ??
              settlement.subscriberWallet ??
              null,
            customer: ExpandableId(previous.customer),
            description: previous.description,
            metadata: previous.metadata ?? {},
            crypto: {
              buyer_address: settlement.subscriberWallet,
              transaction_hash: settlement.signature,
            },
            outcome: 'succeeded',
          }
        );

        await this.paymentIntentModule.MarkSucceeded(paymentIntentId, {
          amountReceived: previous.amount_due,
          latestCharge: charge.id,
        });

        await this.SyncInvoicePaymentPaid(
          previous,
          paymentIntentId,
          charge.id,
          previous.amount_due
        );

        const balanceTransaction = await this.RecordPaymentOnLedger(
          previous,
          settlement.subscriberWallet,
          settlement.signature
        );
        await this.chargeModule.AttachBalanceTransaction(
          charge.id,
          balanceTransaction.id
        );
      }

      return this.MarkInvoicePaid(previous, {
        amountPaidOffStripe: 0,
        paymentIntentId,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      Logger.warn('Invoice payment failed', {
        invoiceId: previous.id,
        error: message,
      });

      if (this.paymentIntentModule) {
        try {
          await this.paymentIntentModule.MarkPaymentFailed(paymentIntentId, {
            advice_code: null,
            charge: null,
            code: 'payment_intent_payment_attempt_failed',
            decline_code: null,
            doc_url: null,
            message,
            network_advice_code: null,
            network_decline_code: null,
            param: null,
            payment_method: null,
            payment_method_type: 'crypto',
            source: null,
            type: 'invalid_request_error',
          });
        } catch {
          // Best-effort PI failure update
        }
      }

      return this.RecordInvoicePaymentFailure(previous, message);
    }
  }

  /**
   * Void a finalized invoice.
   * Emits `invoice.voided`.
   */
  async VoidInvoice(id: string): Promise<InvoiceType> {
    const previous = await this.RequireInvoice(id);
    this.AssertStatus(previous, ['open', 'uncollectible'], 'void');

    const now = Now();
    await this.db.Update<InvoiceType>('Invoices', id, {
      status: 'void',
      next_payment_attempt: null,
      status_transitions: {
        ...previous.status_transitions,
        voided_at: now,
      },
    });

    const invoice = await this.RequireInvoice(id);

    if (this.eventService) {
      await this.eventService.Emit(
        'invoice.voided',
        invoice.platform_account,
        invoice
      );
    }

    return invoice;
  }

  async ListInvoices(
    options: ListOptions & ListInvoicesFiltersInput
  ): Promise<ListResult<InvoiceType>> {
    const {
      collection_method,
      customer,
      customer_account,
      status,
      subscription,
      ...listOptions
    } = options;

    const filters: Record<string, unknown> = {};
    if (collection_method !== undefined) {
      filters.collection_method = collection_method;
    }
    if (customer !== undefined) filters.customer = customer;
    if (customer_account !== undefined) {
      filters.customer_account = customer_account;
    }
    if (status !== undefined) filters.status = status;
    if (subscription !== undefined) {
      filters['parent.subscription_details.subscription'] = subscription;
    }

    return this.listHelper.List({
      ...listOptions,
      filters: { ...listOptions.filters, ...filters },
    });
  }

  /**
   * Create an invoice for a subscription, attach line items from subscription
   * prices, optionally finalize, and optionally collect payment via Solana
   * (or record an already-collected `settlementSignature`).
   */
  async CreateSubscriptionInvoice(
    platformAccountId: string,
    options: {
      customer: string;
      subscription: string;
      collection_method: 'charge_automatically' | 'send_invoice';
      billing_reason: InvoiceBillingReason;
      days_until_due?: number;
      default_payment_method?: string | null;
      description?: string | null;
      lineItems: Array<{
        price: string;
        quantity: number;
        period?: { start: number; end: number };
        description?: string;
        subscription_item?: string;
      }>;
      finalize?: boolean;
      collect?: boolean;
      /** Skip on-chain collect; record this signature as settlement. */
      settlementSignature?: string;
    }
  ): Promise<InvoiceType> {
    if (!this.invoiceItemModule) {
      throw new AppError(
        'InvoiceItemModule not configured',
        ERRORS.INVALID_REQUEST.status,
        ERRORS.INVALID_REQUEST.type
      );
    }

    let invoice = await this.CreateInvoice(platformAccountId, {
      customer: options.customer,
      subscription: options.subscription,
      collection_method: options.collection_method,
      currency: 'usdc',
      days_until_due: options.days_until_due,
      default_payment_method: options.default_payment_method ?? undefined,
      description: options.description ?? undefined,
      pending_invoice_items_behavior: 'exclude',
    });

    const periodStart =
      options.lineItems[0]?.period?.start ?? invoice.period_start;
    const periodEnd = options.lineItems[0]?.period?.end ?? invoice.period_end;

    await this.db.Update<InvoiceType>('Invoices', invoice.id, {
      billing_reason: options.billing_reason,
      period_start: periodStart,
      period_end: periodEnd,
    });

    const createdItems: InvoiceItemType[] = [];
    for (const line of options.lineItems) {
      const item = await this.invoiceItemModule.CreateInvoiceItem(
        platformAccountId,
        {
          customer: options.customer,
          invoice: invoice.id,
          subscription: options.subscription,
          pricing: { price: line.price },
          quantity: line.quantity,
          description: line.description,
          period: line.period,
          currency: 'usdc',
        }
      );

      if (line.subscription_item) {
        await this.db.Update<InvoiceItemType>('InvoiceItems', item.id, {
          parent: {
            type: 'subscription_details',
            subscription_details: {
              subscription: options.subscription,
              subscription_item: line.subscription_item,
            },
          },
        });
        const refreshed = await this.invoiceItemModule.GetInvoiceItem(item.id);
        if (refreshed) {
          createdItems.push(refreshed);
          continue;
        }
      }
      createdItems.push(item);
    }

    invoice = await this.ApplyInvoiceItemsAsLines(invoice.id, createdItems);

    if (options.finalize) {
      invoice = await this.FinalizeInvoice(invoice.id, {
        auto_advance: options.collect ?? false,
      });
    }

    if (options.collect && invoice.status === 'open') {
      invoice = await this.PayInvoice(invoice.id, {
        settlement_signature: options.settlementSignature,
      });
    }

    return invoice;
  }

  /**
   * Replace an invoice's line items from invoice items and persist totals.
   */
  async ApplyInvoiceItemsAsLines(
    invoiceId: string,
    items: InvoiceItemType[]
  ): Promise<InvoiceType> {
    const invoice = await this.RequireInvoice(invoiceId);
    const sorted = [...items].sort((a, b) => b.created - a.created);
    const lineItems = sorted.map((item) =>
      this.BuildLineItemFromInvoiceItem(item, invoice.id)
    );

    invoice.lines = {
      object: 'list',
      data: lineItems,
      has_more: false,
      total_count: lineItems.length,
      url: `/v1/invoices/${invoice.id}/lines`,
    };
    this.RecalculateAmounts(invoice);

    await this.db.Update<InvoiceType>('Invoices', invoice.id, {
      lines: invoice.lines,
      subtotal: invoice.subtotal,
      subtotal_excluding_tax: invoice.subtotal_excluding_tax,
      total: invoice.total,
      total_excluding_tax: invoice.total_excluding_tax,
      amount_due: invoice.amount_due,
      amount_remaining: invoice.amount_remaining,
      amount_shipping: invoice.amount_shipping,
    });

    return this.RequireInvoice(invoiceId);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Pending invoice items / line items
  // ─────────────────────────────────────────────────────────────────────────

  private async IncludePendingInvoiceItems(
    platformAccountId: string,
    customerId: string,
    invoice: InvoiceType
  ): Promise<void> {
    const pending = await this.invoiceItemModule!.ListAllPendingInvoiceItems(
      platformAccountId,
      customerId
    );

    if (pending.length === 0) {
      return;
    }

    await this.invoiceItemModule!.AttachInvoiceItems(
      pending.map((item) => item.id),
      invoice.id
    );

    // Pending items are included in reverse chronological order (Stripe).
    const sorted = [...pending].sort((a, b) => b.created - a.created);
    const lineItems = sorted.map((item) =>
      this.BuildLineItemFromInvoiceItem(item, invoice.id)
    );

    invoice.lines = {
      object: 'list',
      data: lineItems,
      has_more: false,
      total_count: lineItems.length,
      url: `/v1/invoices/${invoice.id}/lines`,
    };

    this.RecalculateAmounts(invoice);
  }

  BuildLineItemFromInvoiceItem(
    item: InvoiceItemType,
    invoiceId: string
  ): InvoiceLineItem {
    const discounts = Array.isArray(item.discounts)
      ? item.discounts.map((discount) =>
          typeof discount === 'string' ? discount : discount.id
        )
      : [];

    return {
      id: GenerateId('il_z'),
      object: 'line_item',
      amount: item.amount,
      currency: 'usdc',
      description: item.description,
      discount_amounts: null,
      discountable: item.discountable,
      discounts,
      invoice: invoiceId,
      livemode: item.livemode,
      metadata: item.metadata ?? {},
      parent: {
        type: 'invoice_item_details',
        invoice_item_details: {
          invoice_item: item.id,
          proration: item.proration,
          proration_details: null,
          subscription:
            item.parent?.type === 'subscription_details'
              ? item.parent.subscription_details?.subscription ?? null
              : null,
        },
        subscription_item_details: null,
      },
      period: item.period,
      pretax_credit_amounts: null,
      pricing: item.pricing,
      quantity: item.quantity,
      quantity_decimal: item.quantity_decimal,
      subtotal: item.amount,
      taxes: null,
    };
  }

  RecalculateAmounts(invoice: InvoiceType): void {
    const subtotal = invoice.lines.data.reduce(
      (sum, line) => sum + line.amount,
      0
    );
    invoice.subtotal = subtotal;
    invoice.subtotal_excluding_tax = subtotal;
    invoice.total = subtotal;
    invoice.total_excluding_tax = subtotal;
    invoice.amount_due = subtotal;
    invoice.amount_remaining = subtotal - invoice.amount_paid;
    invoice.amount_shipping = 0;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Revision / helpers
  // ─────────────────────────────────────────────────────────────────────────

  private async CreateRevisionInvoice(
    platformAccountId: string,
    input: CreateInvoiceInput
  ): Promise<InvoiceType> {
    const sourceId = input.from_invoice!.invoice;
    const source = await this.RequireInvoice(sourceId);

    if (source.platform_account !== platformAccountId) {
      throw new AppError(
        ERRORS.INVOICE_NOT_FOUND.message,
        ERRORS.INVOICE_NOT_FOUND.status,
        ERRORS.INVOICE_NOT_FOUND.type
      );
    }

    const now = Now();
    const id = GenerateId('in_z');
    const customerId =
      typeof source.customer === 'string'
        ? source.customer
        : source.customer.id;

    const invoice: InvoiceType = {
      ...source,
      id,
      created: now,
      status: 'draft',
      billing_reason: 'manual',
      from_invoice: {
        action: 'revision',
        invoice: sourceId,
      },
      number: null,
      hosted_invoice_url: null,
      invoice_pdf: null,
      confirmation_secret: null,
      ending_balance: null,
      attempted: false,
      attempt_count: 0,
      amount_paid: 0,
      amount_paid_off_stripe: 0,
      amount_overpaid: 0,
      receipt_number: null,
      last_finalization_error: null,
      latest_revision: null,
      webhooks_delivered_at: now,
      period_start: now,
      period_end: now,
      status_transitions: {
        finalized_at: null,
        marked_uncollectible_at: null,
        paid_at: null,
        voided_at: null,
      },
      lines: {
        object: 'list',
        data: source.lines.data.map((line) => ({
          ...line,
          id: GenerateId('il_z'),
          invoice: id,
        })),
        has_more: false,
        total_count: source.lines.total_count,
        url: `/v1/invoices/${id}/lines`,
      },
      payments: this.EmptyPaymentsList(id),
      customer: customerId,
      metadata: input.metadata ?? source.metadata,
      description: input.description ?? source.description,
      auto_advance: input.auto_advance ?? source.auto_advance,
      platform_account: platformAccountId,
    };

    this.RecalculateAmounts(invoice);
    invoice.amount_remaining = invoice.amount_due;

    return invoice;
  }

  private BuildUpdatePayload(
    existing: InvoiceType,
    input: UpdateInvoiceInput
  ): Partial<InvoiceType> {
    const payload: Partial<InvoiceType> = {};

    if (input.account_tax_ids !== undefined) {
      payload.account_tax_ids = input.account_tax_ids;
    }
    if (input.auto_advance !== undefined) {
      payload.auto_advance = input.auto_advance;
    }
    if (input.automatic_tax !== undefined) {
      payload.automatic_tax = {
        disabled_reason: existing.automatic_tax.disabled_reason,
        enabled: input.automatic_tax.enabled,
        liability: input.automatic_tax.liability
          ? {
              type: input.automatic_tax.liability.type,
              account: input.automatic_tax.liability.account ?? null,
            }
          : existing.automatic_tax.liability,
        provider: existing.automatic_tax.provider,
        status: existing.automatic_tax.status,
      };
    }
    if (input.automatically_finalizes_at !== undefined) {
      payload.automatically_finalizes_at = input.automatically_finalizes_at;
    }
    if (input.collection_method !== undefined) {
      payload.collection_method = input.collection_method;
    }
    if (input.custom_fields !== undefined) {
      payload.custom_fields =
        input.custom_fields === '' ? null : input.custom_fields;
    }
    if (input.days_until_due !== undefined && existing.created) {
      payload.due_date = existing.created + input.days_until_due * 86400;
    }
    if (input.default_payment_method !== undefined) {
      payload.default_payment_method = input.default_payment_method;
    }
    if (input.default_source !== undefined) {
      payload.default_source = input.default_source;
    }
    if (input.default_tax_rates !== undefined) {
      // Tax rate objects are not resolved on write until a TaxRate module exists.
      if (input.default_tax_rates === '') {
        payload.default_tax_rates = [];
      }
    }
    if (input.description !== undefined) {
      payload.description = input.description;
    }
    if (input.discounts !== undefined) {
      payload.discounts =
        input.discounts === '' ? [] : this.MapDiscountIds(input.discounts);
    }
    if (input.due_date !== undefined) {
      payload.due_date = input.due_date;
    }
    if (input.effective_at !== undefined) {
      payload.effective_at = input.effective_at;
    }
    if (input.footer !== undefined) {
      payload.footer = input.footer;
    }
    if (input.issuer !== undefined) {
      payload.issuer = {
        type: input.issuer.type,
        account: input.issuer.account ?? null,
      };
    }
    if (input.metadata !== undefined) {
      payload.metadata = input.metadata;
    }
    if (input.number !== undefined) {
      payload.number = input.number;
    }
    if (input.on_behalf_of !== undefined) {
      payload.on_behalf_of = input.on_behalf_of;
    }
    if (input.payment_settings !== undefined) {
      payload.payment_settings = {
        default_mandate:
          input.payment_settings.default_mandate ??
          existing.payment_settings.default_mandate,
        payment_method_options:
          input.payment_settings.payment_method_options ??
          existing.payment_settings.payment_method_options,
        payment_method_types:
          input.payment_settings.payment_method_types ??
          existing.payment_settings.payment_method_types,
      };
    }
    if (input.rendering !== undefined) {
      payload.rendering = {
        amount_tax_display: input.rendering.amount_tax_display ?? null,
        pdf: input.rendering.pdf
          ? { page_size: input.rendering.pdf.page_size ?? null }
          : null,
        template: input.rendering.template ?? null,
        template_version: input.rendering.template_version ?? null,
      };
    }
    if (input.shipping_details !== undefined) {
      payload.shipping_details = {
        address: {
          city: input.shipping_details.address.city ?? null,
          country: input.shipping_details.address.country ?? null,
          line1: input.shipping_details.address.line1 ?? null,
          line2: input.shipping_details.address.line2 ?? null,
          postal_code: input.shipping_details.address.postal_code ?? null,
          state: input.shipping_details.address.state ?? null,
        },
        name: input.shipping_details.name,
        phone: input.shipping_details.phone ?? null,
      };
    }
    if (input.statement_descriptor !== undefined) {
      payload.statement_descriptor = input.statement_descriptor;
    }
    if (input.transfer_data !== undefined) {
      payload.transfer_data =
        input.transfer_data === ''
          ? null
          : {
              destination: input.transfer_data.destination,
              amount: input.transfer_data.amount ?? null,
            };
    }

    return StripUndefined(
      payload as Record<string, unknown>
    ) as Partial<InvoiceType>;
  }

  private MapDiscountIds(discounts: unknown): string[] {
    if (!discounts || discounts === '' || !Array.isArray(discounts)) {
      return [];
    }
    return discounts
      .map(
        (discount: {
          coupon?: string;
          discount?: string;
          promotion_code?: string;
        }) => discount.discount ?? discount.coupon ?? discount.promotion_code
      )
      .filter((id): id is string => !!id);
  }

  private SnapshotCustomerTaxIds(
    customer: CustomerType
  ): InvoiceType['customer_tax_ids'] {
    if (!customer.tax_ids?.data?.length) {
      return [];
    }
    return customer.tax_ids.data.map((taxId) => ({
      type: taxId.type,
      value: taxId.value,
    }));
  }

  private ResolveDueDate(
    input: CreateInvoiceInput,
    now: number
  ): number | null {
    if (input.due_date !== undefined) {
      return input.due_date;
    }
    if (input.days_until_due !== undefined) {
      return now + input.days_until_due * 86400;
    }
    return null;
  }

  private EmptyLinesList(invoiceId: string): InvoiceType['lines'] {
    return {
      object: 'list',
      data: [],
      has_more: false,
      total_count: 0,
      url: `/v1/invoices/${invoiceId}/lines`,
    };
  }

  private EmptyPaymentsList(invoiceId: string): InvoiceType['payments'] {
    return {
      object: 'list',
      data: [],
      has_more: false,
      total_count: 0,
      url: `/v1/invoices/${invoiceId}/payments`,
    };
  }

  private GenerateInvoiceNumber(invoice: InvoiceType): string {
    const suffix = invoice.id
      .replace(/^in_z_?/, '')
      .slice(0, 8)
      .toUpperCase();
    return `${suffix}-0001`;
  }

  private AssertDraftOnlyUpdates(
    invoice: InvoiceType,
    update: UpdateInvoiceInput
  ): void {
    if (invoice.status === 'draft') {
      return;
    }
    const attempted = Object.keys(update).filter((key) =>
      DRAFT_ONLY_UPDATE_FIELDS.has(key)
    );
    if (attempted.length > 0) {
      throw new AppError(
        `Cannot update ${attempted.join(', ')} on a non-draft invoice`,
        ERRORS.INVALID_REQUEST.status,
        ERRORS.INVALID_REQUEST.type
      );
    }
  }

  private AssertStatus(
    invoice: InvoiceType,
    allowed: InvoiceStatus[],
    action: string
  ): void {
    if (!invoice.status || !allowed.includes(invoice.status)) {
      throw new AppError(
        `Cannot ${action} invoice with status '${
          invoice.status
        }'. Allowed: ${allowed.join(', ')}.`,
        ERRORS.INVALID_REQUEST.status,
        ERRORS.INVALID_REQUEST.type
      );
    }
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

  private async RequireInvoice(id: string): Promise<InvoiceType> {
    const invoice = await this.GetInvoice(id);
    if (!invoice) {
      throw new AppError(
        ERRORS.INVOICE_NOT_FOUND.message,
        ERRORS.INVOICE_NOT_FOUND.status,
        ERRORS.INVOICE_NOT_FOUND.type
      );
    }
    return invoice;
  }

  private async RequireCustomer(
    customerId: string,
    platformAccountId: string
  ): Promise<CustomerType> {
    if (!this.customerModule) {
      throw new AppError(
        'CustomerModule not configured',
        ERRORS.INVALID_REQUEST.status,
        ERRORS.INVALID_REQUEST.type
      );
    }
    const customer = await this.customerModule.GetCustomer(customerId);
    if (!customer || customer.platform_account !== platformAccountId) {
      throw new AppError(
        ERRORS.CUSTOMER_NOT_FOUND.message,
        ERRORS.CUSTOMER_NOT_FOUND.status,
        ERRORS.CUSTOMER_NOT_FOUND.type
      );
    }
    return customer;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Settlement helpers
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Credit the merchant platform balance after a successful on-chain invoice
   * settlement. Idempotent per invoice id (source).
   */
  private async RecordPaymentOnLedger(
    invoice: InvoiceType,
    payerWallet: string | null,
    signature: string
  ): Promise<BalanceTransactionType> {
    const existing = await this.db.Find2Custom<BalanceTransactionType>(
      'BalanceTransactions',
      'source',
      '==',
      invoice.id,
      'type',
      '==',
      'payment'
    );
    if (existing.length > 0) return existing[0];

    const merchantAccountId = invoice.platform_account;
    const timestamp = Now();
    const explorerUrl =
      signature && signature !== 'already_collected'
        ? SolanaExplorerUrl('tx', signature)
        : '';

    const balanceTransaction =
      this.balanceTransactionModule.BalanceTransactionObject({
        amount: invoice.amount_due,
        currency: invoice.currency,
        account: merchantAccountId,
        platformAccountId: merchantAccountId,
        type: 'payment',
        source: invoice.id,
        description: `Payment for Invoice ${invoice.id}`,
        metadata: {
          blockchain_tx: signature,
          network: 'solana',
          sender_address: payerWallet ?? '',
          explorer_url: explorerUrl,
        },
        status: 'available',
        available_on: timestamp,
      });

    const balanceData =
      (await this.balanceModule.GetBalance(merchantAccountId)) ??
      (await this.balanceModule.CreateBalance(merchantAccountId));

    await this.db.RunTransaction(async (mongoSession: ClientSession) => {
      await this.db.Set(
        'BalanceTransactions',
        balanceTransaction.id,
        balanceTransaction,
        mongoSession
      );

      const updatedBalance = this.balanceModule.UpdateBalance(
        balanceData,
        invoice.amount_due,
        balanceTransaction.currency,
        'available'
      );
      await this.db.Update(
        'Balances',
        updatedBalance.id,
        { available: updatedBalance.available },
        mongoSession
      );
    });

    Logger.info('Recorded invoice payment on ledger', {
      invoiceId: invoice.id,
      balanceTransactionId: balanceTransaction.id,
      amountCents: invoice.amount_due,
    });

    return balanceTransaction;
  }

  private async CreateInvoicePaymentIntent(invoice: InvoiceType) {
    if (!this.paymentIntentModule) {
      throw new AppError(
        'PaymentIntentModule not configured for invoice finalization',
        ERRORS.INTERNAL_ERROR.status,
        ERRORS.INTERNAL_ERROR.type
      );
    }

    const customerId = ExpandableId(invoice.customer)!;

    const subscriptionId = ExpandableId(
      invoice.parent?.subscription_details?.subscription
    );

    return this.paymentIntentModule.CreatePaymentIntent(
      invoice.platform_account,
      {
        amount: invoice.amount_due,
        currency: 'usdc',
        customer: customerId,
        description: invoice.description ?? `Invoice ${invoice.id}`,
        payment_method: invoice.default_payment_method ?? undefined,
        metadata: {
          invoice: invoice.id,
          ...(subscriptionId ? { subscription: subscriptionId } : {}),
        },
      }
    );
  }

  private BuildDefaultInvoicePayment(
    invoice: InvoiceType,
    paymentIntentId: string,
    amountRequested: number
  ): InvoicePayment {
    return {
      id: GenerateId('inpay_z'),
      object: 'invoice_payment',
      amount_paid: null,
      amount_requested: amountRequested,
      created: Now(),
      currency: 'usdc',
      invoice: invoice.id,
      is_default: true,
      livemode: GetAppConfig().livemode,
      payment: {
        charge: null,
        payment_intent: paymentIntentId,
        payment_record: null,
        type: 'payment_intent',
      },
      status: 'open',
      status_transitions: {
        canceled_at: null,
        paid_at: null,
      },
      platform_account: invoice.platform_account,
    };
  }

  private GetDefaultPaymentIntentId(invoice: InvoiceType): string | null {
    const defaultPayment = invoice.payments?.data?.find((p) => p.is_default);
    return ExpandableId(defaultPayment?.payment?.payment_intent ?? null);
  }

  private async SyncInvoicePaymentPaid(
    invoice: InvoiceType,
    paymentIntentId: string,
    chargeId: string,
    amountPaid: number
  ): Promise<void> {
    const payments = invoice.payments?.data ?? [];
    const updated = payments.map((payment) => {
      const pi = ExpandableId(payment.payment.payment_intent);
      if (pi !== paymentIntentId) return payment;
      return {
        ...payment,
        amount_paid: amountPaid,
        status: 'paid' as const,
        payment: {
          ...payment.payment,
          charge: chargeId,
          payment_intent: paymentIntentId,
          type: 'payment_intent' as const,
        },
        status_transitions: {
          ...payment.status_transitions,
          paid_at: Now(),
        },
      };
    });

    await this.db.Update<InvoiceType>('Invoices', invoice.id, {
      payments: {
        object: 'list',
        data: updated,
        has_more: false,
        total_count: updated.length,
        url: `/v1/invoices/${invoice.id}/payments`,
      },
    });
  }

  private async MarkInvoicePaid(
    previous: InvoiceType,
    options: {
      amountPaidOffStripe: number;
      paymentIntentId?: string;
    }
  ): Promise<InvoiceType> {
    const now = Now();
    await this.db.Update<InvoiceType>('Invoices', previous.id, {
      status: 'paid',
      attempted: true,
      attempt_count: previous.attempt_count + 1,
      amount_paid: previous.amount_due,
      amount_paid_off_stripe: options.amountPaidOffStripe,
      amount_remaining: 0,
      amount_overpaid: 0,
      next_payment_attempt: null,
      status_transitions: {
        ...previous.status_transitions,
        paid_at: now,
      },
    });

    const invoice = await this.RequireInvoice(previous.id);

    if (this.eventService) {
      await this.eventService.Emit(
        'invoice.paid',
        invoice.platform_account,
        invoice
      );
      await this.eventService.Emit(
        'invoice.payment_succeeded',
        invoice.platform_account,
        invoice
      );
    }

    return invoice;
  }

  private async RecordInvoicePaymentFailure(
    previous: InvoiceType,
    message: string
  ): Promise<InvoiceType> {
    const now = Now();
    const isPeriodAllowance = PERIOD_ALLOWANCE_ALREADY_COLLECTED.test(message);
    // Period-limit waits are not payment declines — don't burn retry budget.
    const attemptCount = isPeriodAllowance
      ? previous.attempt_count
      : previous.attempt_count + 1;
    const nextPaymentAttempt = isPeriodAllowance
      ? now + PERIOD_ALLOWANCE_RETRY_SECONDS
      : this.ComputeNextPaymentAttempt(attemptCount, now);

    await this.db.Update<InvoiceType>('Invoices', previous.id, {
      attempted: true,
      attempt_count: attemptCount,
      next_payment_attempt: nextPaymentAttempt,
      metadata: {
        ...(previous.metadata ?? {}),
        last_payment_error: message.slice(0, 500),
      },
    });

    const invoice = await this.RequireInvoice(previous.id);

    if (this.eventService) {
      await this.eventService.Emit(
        'invoice.payment_failed',
        invoice.platform_account,
        invoice
      );
    }

    return invoice;
  }

  ComputeNextPaymentAttempt(attemptCount: number, now: number): number | null {
    if (attemptCount >= INVOICE_MAX_PAYMENT_ATTEMPTS) {
      return null;
    }
    const delay = RETRY_DELAYS_SECONDS[attemptCount - 1];
    if (delay === undefined) {
      return null;
    }
    return now + delay;
  }

  private async SettleInvoicePayment(
    invoice: InvoiceType,
    settlementSignature?: string
  ): Promise<{ signature: string; subscriberWallet: string | null }> {
    if (settlementSignature) {
      return {
        signature: settlementSignature,
        subscriberWallet: invoice.default_payment_method,
      };
    }

    const subscriptionId = ExpandableId(
      invoice.parent?.subscription_details?.subscription
    );
    if (!subscriptionId) {
      throw new AppError(
        'Automatic collection requires a subscription invoice, paid_out_of_band, or settlement_signature',
        ERRORS.INVALID_REQUEST.status,
        ERRORS.INVALID_REQUEST.type
      );
    }

    const subscription = await this.db.Get<SubscriptionType>(
      'Subscriptions',
      subscriptionId
    );
    if (!subscription) {
      throw new AppError(
        ERRORS.SUBSCRIPTION_NOT_FOUND.message,
        ERRORS.SUBSCRIPTION_NOT_FOUND.status,
        ERRORS.SUBSCRIPTION_NOT_FOUND.type
      );
    }

    if (!subscription.subscription_delegation_pda) {
      throw new Error(
        'Subscription has no on-chain delegation PDA; cannot collect'
      );
    }

    const items = await this.db.Find<SubscriptionItemType>(
      'SubscriptionItems',
      'subscription',
      subscriptionId
    );
    if (items.length === 0) {
      throw new Error('Subscription has no items to collect');
    }

    const priceId = ExpandableId(items[0].price)!;
    const price = await this.ResolvePrice(
      subscription.platform_account,
      priceId
    );
    if (!price.subscription_plan_pda) {
      throw new Error('Subscription price has no on-chain plan PDA');
    }

    const subscriberWallet =
      subscription.default_payment_method ||
      invoice.default_payment_method ||
      subscription.metadata?.['wallet_address'] ||
      null;
    if (!subscriberWallet) {
      throw new Error('Subscription has no subscriber wallet for collection');
    }

    const amountCents = invoice.amount_due;
    const collection = await this.solana.CollectSubscriptionPayment({
      subscriberWallet,
      planPda: price.subscription_plan_pda,
      subscriptionPda: subscription.subscription_delegation_pda,
      amountCents,
    });

    // On-chain plans allow one pull per periodHours. Skipped Stripe cycles do
    // not stack — if we already pulled this Solana period, no USDC moves.
    // Treating that as success was marking invoices paid / advancing periods
    // with no wallet debit.
    if (collection.alreadyCollected) {
      Logger.warn('On-chain subscription period already collected', {
        invoiceId: invoice.id,
        subscriptionId,
        amountCents,
      });
      throw new Error(
        'On-chain subscription period allowance already collected; wait for the next Solana billing period before collecting again'
      );
    }

    return {
      signature: collection.signature,
      subscriberWallet,
    };
  }

  private async ResolvePrice(
    platformAccountId: string,
    priceId: string
  ): Promise<PriceType> {
    if (this.priceModule) {
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

    const price = await this.db.Get<PriceType>('Prices', priceId);
    if (!price || price.platform_account !== platformAccountId) {
      throw new AppError(
        ERRORS.PRICE_NOT_FOUND.message,
        ERRORS.PRICE_NOT_FOUND.status,
        ERRORS.PRICE_NOT_FOUND.type
      );
    }
    return price;
  }
}
