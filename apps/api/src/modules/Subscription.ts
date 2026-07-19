/**
 * @fileOverview Methods for Subscriptions
 *
 * Stripe-compatible subscription CRUD and lifecycle actions. Nested subscription
 * items are persisted in `SubscriptionItems`. Billing runs through invoices:
 * create → line items → finalize → collect via PaymentIntent / Solana USDC.
 *
 * @module Subscription
 * @see https://docs.stripe.com/api/subscriptions
 */

import { Database } from './Database';
import { EventService } from './EventService';
import { CustomerModule } from './Customer';
import { PriceModule } from './Price';
import type { InvoiceModule } from './Invoice';
import { GenerateId } from '../utils/IdGenerator';
import { StripUndefined, ValidateUpdate } from './Util';
import { ExtractChangedFields } from './Event';
import { ListHelper, ListOptions, ListResult } from '../utils/ListHelper';
import { Now } from '../utils/Timestamp';
import { GetAppConfig } from './AppConfig';
import { AppError } from '../utils/AppError';
import { ERRORS } from '../utils/Errors';
import {
  Customer as CustomerType,
  Invoice as InvoiceType,
  Price as PriceType,
  QueryOperators,
  Subscription as SubscriptionType,
  SubscriptionItem as SubscriptionItemType,
  SubscriptionItemList,
  SubscriptionStatus,
} from '@zoneless/shared-types';
import {
  CancelSubscriptionInput,
  CancelSubscriptionSchema,
  CreateSubscriptionInput,
  CreateSubscriptionSchema,
  ListSubscriptionsFiltersInput,
  MigrateSubscriptionInput,
  MigrateSubscriptionSchema,
  ResumeSubscriptionInput,
  ResumeSubscriptionSchema,
  SubscriptionCreateItemSchema,
  SubscriptionUpdateItemSchema,
  UpdateSubscriptionInput,
  UpdateSubscriptionSchema,
} from '@zoneless/shared-schemas';
import { z } from 'zod';
import {
  AddRecurringInterval,
  SECONDS_PER_DAY,
} from '../utils/RecurringInterval';

type CreateItemInput = z.infer<typeof SubscriptionCreateItemSchema>;
type UpdateItemInput = z.infer<typeof SubscriptionUpdateItemSchema>;

const THREE_DAYS_SECONDS = 3 * SECONDS_PER_DAY;

export class SubscriptionModule {
  private readonly db: Database;
  private readonly eventService: EventService | null;
  private readonly customerModule: CustomerModule | null;
  private readonly priceModule: PriceModule | null;
  private readonly invoiceModule: InvoiceModule | null;
  private readonly listHelper: ListHelper<SubscriptionType>;

  constructor(
    db: Database,
    eventService?: EventService,
    customerModule?: CustomerModule,
    priceModule?: PriceModule,
    invoiceModule?: InvoiceModule
  ) {
    this.db = db;
    this.eventService = eventService || null;
    this.customerModule = customerModule || null;
    this.priceModule = priceModule || null;
    this.invoiceModule = invoiceModule || null;
    this.listHelper = new ListHelper<SubscriptionType>(db, {
      collection: 'Subscriptions',
      orderByField: 'created',
      orderDirection: 'desc',
      urlPath: '/v1/subscriptions',
      accountField: 'platform_account',
    });
  }

  /**
   * Create a subscription on an existing customer.
   * Creates the first invoice (unless trialing), finalizes it, and collects
   * payment when `collection_method=charge_automatically` (out-of-band until
   * PaymentIntent / Solana settlement is wired).
   * Emits `customer.subscription.created`.
   */
  async CreateSubscription(
    platformAccountId: string,
    input: CreateSubscriptionInput,
    options?: { settlementSignature?: string }
  ): Promise<SubscriptionType> {
    const validatedInput = ValidateUpdate(CreateSubscriptionSchema, input);

    if (validatedInput.currency) {
      this.AssertSupportedCurrency(validatedInput.currency);
    }

    const customer = await this.RequireCustomer(
      validatedInput.customer!,
      platformAccountId
    );

    const now = Now();
    const startDate = validatedInput.backdate_start_date ?? now;
    const billingCycleAnchor = validatedInput.billing_cycle_anchor ?? startDate;

    const trial = this.ResolveTrial(validatedInput, now, billingCycleAnchor);
    const id = GenerateId('sub_z');
    const collectionMethod =
      validatedInput.collection_method ?? 'charge_automatically';
    const paymentBehavior =
      validatedInput.payment_behavior ?? 'allow_incomplete';

    const items = await this.CreateItemsForSubscription(
      platformAccountId,
      id,
      validatedInput.items,
      billingCycleAnchor
    );

    // Persist first so the invoice can reference the subscription id.
    let status: SubscriptionStatus = trial.trial_end
      ? 'trialing'
      : paymentBehavior === 'default_incomplete' &&
        collectionMethod === 'charge_automatically'
      ? 'incomplete'
      : 'active';

    const subscription = this.SubscriptionObject(
      platformAccountId,
      id,
      validatedInput,
      customer,
      items,
      {
        now,
        startDate,
        billingCycleAnchor,
        status,
        trialStart: trial.trial_start,
        trialEnd: trial.trial_end,
      }
    );

    await this.db.Set('Subscriptions', subscription.id, subscription);

    let latestInvoiceId: string | null = null;

    if (!trial.trial_end) {
      try {
        const invoice = await this.CreateAndProcessInvoice(
          platformAccountId,
          subscription,
          items,
          'subscription_create',
          {
            finalize: true,
            collect:
              collectionMethod === 'charge_automatically' &&
              paymentBehavior !== 'default_incomplete',
            settlementSignature: options?.settlementSignature,
          }
        );
        latestInvoiceId = invoice.id;

        if (collectionMethod === 'charge_automatically') {
          if (invoice.status === 'paid') {
            status = 'active';
          } else if (paymentBehavior === 'error_if_incomplete') {
            await this.RollbackCreatedSubscription(id, items, invoice.id);
            throw new AppError(
              'Payment for the subscription invoice failed',
              402,
              'card_error'
            );
          } else {
            status = 'incomplete';
          }
        }
      } catch (error) {
        if (error instanceof AppError && error.statusCode === 402) {
          throw error;
        }
        // Invoice creation failure should not leave an orphaned incomplete sub
        // without an invoice when payment was required.
        if (
          collectionMethod === 'charge_automatically' &&
          paymentBehavior === 'error_if_incomplete'
        ) {
          await this.RollbackCreatedSubscription(id, items);
          throw error;
        }
        throw error;
      }

      if (latestInvoiceId || status !== subscription.status) {
        await this.db.Update<SubscriptionType>('Subscriptions', id, {
          latest_invoice: latestInvoiceId,
          status,
        });
      }
    }

    const created = await this.GetSubscription(id);
    if (!created) {
      throw new AppError(
        ERRORS.SUBSCRIPTION_NOT_FOUND.message,
        ERRORS.SUBSCRIPTION_NOT_FOUND.status,
        ERRORS.SUBSCRIPTION_NOT_FOUND.type
      );
    }

    if (this.eventService) {
      await this.eventService.Emit(
        'customer.subscription.created',
        created.platform_account,
        created
      );

      if (this.ShouldEmitTrialWillEnd(trial.trial_end, now)) {
        await this.eventService.Emit(
          'customer.subscription.trial_will_end',
          created.platform_account,
          created
        );
      }
    }

    return created;
  }

  /**
   * Retrieve a subscription by ID, attaching its items list.
   */
  async GetSubscription(id: string): Promise<SubscriptionType | null> {
    const subscription = await this.db.Get<SubscriptionType>(
      'Subscriptions',
      id
    );
    if (!subscription) {
      return null;
    }
    subscription.items = await this.LoadItemsList(id);
    return subscription;
  }

  /**
   * Batch-load subscriptions by id, scoped to a single platform account.
   */
  async BatchGet(
    ids: string[],
    platformAccount: string
  ): Promise<Map<string, SubscriptionType>> {
    if (ids.length === 0) return new Map();
    const subscriptions = await this.db.Query<SubscriptionType>({
      collection: 'Subscriptions',
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

    const result = new Map<string, SubscriptionType>();
    for (const subscription of subscriptions) {
      subscription.items = await this.LoadItemsList(subscription.id);
      result.set(subscription.id, subscription);
    }
    return result;
  }

  /**
   * Update a subscription.
   * Emits `customer.subscription.updated` (and `paused` when status becomes paused).
   */
  async UpdateSubscription(
    id: string,
    input: UpdateSubscriptionInput
  ): Promise<SubscriptionType> {
    const validatedInput = ValidateUpdate(UpdateSubscriptionSchema, input);
    const previous = await this.RequireSubscription(id);

    if (validatedInput.items) {
      await this.ApplyItemUpdates(
        previous.platform_account,
        id,
        validatedInput.items,
        previous.billing_cycle_anchor
      );
    }

    const updatePayload = this.BuildUpdatePayload(previous, validatedInput);
    const now = Now();

    if (
      validatedInput.trial_end !== undefined &&
      this.ShouldEmitTrialWillEnd(
        typeof validatedInput.trial_end === 'number'
          ? validatedInput.trial_end
          : now,
        now
      )
    ) {
      // Emit after persist below
    }

    // pending_if_incomplete: stub pending update path (no real payment yet)
    if (
      validatedInput.payment_behavior === 'pending_if_incomplete' &&
      Object.keys(updatePayload).length > 0
    ) {
      // TODO: Solana USDC — hold updates until invoice payment succeeds
      updatePayload.pending_update = {
        billing_cycle_anchor: null,
        discount: null,
        discounts: null,
        expires_at: now + SECONDS_PER_DAY,
        metadata: null,
        subscription_items: null,
        trial_end: null,
        trial_from_plan: null,
      };
    }

    await this.db.Update<SubscriptionType>('Subscriptions', id, updatePayload);

    const subscription = await this.GetSubscription(id);
    if (!subscription) {
      throw new AppError(
        ERRORS.SUBSCRIPTION_NOT_FOUND.message,
        ERRORS.SUBSCRIPTION_NOT_FOUND.status,
        ERRORS.SUBSCRIPTION_NOT_FOUND.type
      );
    }

    if (this.eventService) {
      const previousAttributes = ExtractChangedFields(
        previous as unknown as Record<string, unknown>,
        updatePayload as Record<string, unknown>
      );
      await this.eventService.Emit(
        'customer.subscription.updated',
        subscription.platform_account,
        subscription,
        { previousAttributes }
      );

      if (previous.status !== 'paused' && subscription.status === 'paused') {
        await this.eventService.Emit(
          'customer.subscription.paused',
          subscription.platform_account,
          subscription
        );
      }

      if (
        validatedInput.trial_end !== undefined &&
        this.ShouldEmitTrialWillEnd(subscription.trial_end, now)
      ) {
        await this.eventService.Emit(
          'customer.subscription.trial_will_end',
          subscription.platform_account,
          subscription
        );
      }
    }

    return subscription;
  }

  /**
   * List subscriptions for a platform account.
   */
  async ListSubscriptions(
    options: ListOptions & ListSubscriptionsFiltersInput
  ): Promise<ListResult<SubscriptionType>> {
    const {
      automatic_tax,
      collection_method,
      customer,
      customer_account,
      price,
      status,
      test_clock,
      ...listOptions
    } = options;

    const filters: Record<string, unknown> = {};
    if (collection_method !== undefined) {
      filters.collection_method = collection_method;
    }
    if (customer !== undefined) {
      filters.customer = customer;
    }
    if (customer_account !== undefined) {
      filters.customer_account = customer_account;
    }
    if (test_clock !== undefined) {
      filters.test_clock = test_clock;
    }
    if (automatic_tax?.enabled !== undefined) {
      filters['automatic_tax.enabled'] = automatic_tax.enabled;
    }
    if (status !== undefined && status !== 'all' && status !== 'ended') {
      filters.status = status;
    } else if (status === 'ended') {
      // ended = canceled + incomplete_expired (approximate Stripe semantics)
      filters.status = {
        operator: QueryOperators['in'],
        value: ['canceled', 'incomplete_expired'],
      };
    } else if (status === undefined) {
      // Default: exclude canceled
      filters.status = {
        operator: QueryOperators['in'],
        value: [
          'incomplete',
          'incomplete_expired',
          'trialing',
          'active',
          'past_due',
          'unpaid',
          'paused',
        ],
      };
    }

    const result = await this.listHelper.List({
      ...listOptions,
      filters: {
        ...listOptions.filters,
        ...filters,
      },
    });

    // Optional price filter (subscription contains the price via items)
    if (price) {
      const filtered: SubscriptionType[] = [];
      for (const subscription of result.data) {
        const items = await this.LoadItemsList(subscription.id);
        subscription.items = items;
        const hasPrice = items.data.some((item) => {
          const itemPrice =
            typeof item.price === 'string' ? item.price : item.price.id;
          return itemPrice === price;
        });
        if (hasPrice) {
          filtered.push(subscription);
        }
      }
      return {
        ...result,
        data: filtered,
      };
    }

    for (const subscription of result.data) {
      subscription.items = await this.LoadItemsList(subscription.id);
    }

    return result;
  }

  /**
   * Cancel a subscription immediately.
   * Emits `customer.subscription.deleted`.
   */
  async CancelSubscription(
    id: string,
    input: CancelSubscriptionInput = {}
  ): Promise<SubscriptionType> {
    const validatedInput = ValidateUpdate(CancelSubscriptionSchema, input);
    const previous = await this.RequireSubscription(id);
    const now = Now();

    // TODO: Solana USDC — cancel on-chain delegation / subscription PDA

    let latestInvoiceId =
      typeof previous.latest_invoice === 'string'
        ? previous.latest_invoice
        : previous.latest_invoice?.id ?? null;

    if (validatedInput.invoice_now) {
      const items = previous.items.data;
      const invoice = await this.CreateAndProcessInvoice(
        previous.platform_account,
        previous,
        items,
        'subscription_update',
        {
          finalize: true,
          collect: previous.collection_method === 'charge_automatically',
        }
      );
      latestInvoiceId = invoice.id;
    }
    // TODO: prorate — generate proration credits when enabled
    void validatedInput.prorate;

    const updatePayload: Partial<SubscriptionType> = {
      status: 'canceled',
      canceled_at: now,
      ended_at: now,
      cancel_at_period_end: false,
      latest_invoice: latestInvoiceId,
      cancellation_details: {
        comment: validatedInput.cancellation_details?.comment ?? null,
        feedback: validatedInput.cancellation_details?.feedback ?? null,
        reason: 'cancellation_requested',
      },
    };

    await this.db.Update<SubscriptionType>('Subscriptions', id, updatePayload);

    const subscription = await this.GetSubscription(id);
    if (!subscription) {
      throw new AppError(
        ERRORS.SUBSCRIPTION_NOT_FOUND.message,
        ERRORS.SUBSCRIPTION_NOT_FOUND.status,
        ERRORS.SUBSCRIPTION_NOT_FOUND.type
      );
    }

    if (this.eventService) {
      const previousAttributes = ExtractChangedFields(
        previous as unknown as Record<string, unknown>,
        updatePayload as Record<string, unknown>
      );
      await this.eventService.Emit(
        'customer.subscription.updated',
        subscription.platform_account,
        subscription,
        { previousAttributes }
      );
      await this.eventService.Emit(
        'customer.subscription.deleted',
        subscription.platform_account,
        subscription
      );
    }

    return subscription;
  }

  /**
   * Migrate a subscription's billing_mode to flexible.
   */
  async MigrateSubscription(
    id: string,
    input: MigrateSubscriptionInput
  ): Promise<SubscriptionType> {
    const validatedInput = ValidateUpdate(MigrateSubscriptionSchema, input);
    const previous = await this.RequireSubscription(id);
    const now = Now();

    const updatePayload: Partial<SubscriptionType> = {
      billing_mode: {
        type: 'flexible',
        flexible: {
          proration_discounts:
            validatedInput.billing_mode.flexible?.proration_discounts ??
            'included',
        },
        updated_at: now,
      },
    };

    await this.db.Update<SubscriptionType>('Subscriptions', id, updatePayload);

    const subscription = await this.GetSubscription(id);
    if (!subscription) {
      throw new AppError(
        ERRORS.SUBSCRIPTION_NOT_FOUND.message,
        ERRORS.SUBSCRIPTION_NOT_FOUND.status,
        ERRORS.SUBSCRIPTION_NOT_FOUND.type
      );
    }

    if (this.eventService) {
      const previousAttributes = ExtractChangedFields(
        previous as unknown as Record<string, unknown>,
        updatePayload as Record<string, unknown>
      );
      await this.eventService.Emit(
        'customer.subscription.updated',
        subscription.platform_account,
        subscription,
        { previousAttributes }
      );
    }

    return subscription;
  }

  /**
   * Resume a paused subscription.
   * Emits `customer.subscription.resumed`.
   */
  async ResumeSubscription(
    id: string,
    input: ResumeSubscriptionInput = {}
  ): Promise<SubscriptionType> {
    const validatedInput = ValidateUpdate(ResumeSubscriptionSchema, input);
    const previous = await this.RequireSubscription(id);

    if (previous.status !== 'paused') {
      throw new AppError(
        'Only paused subscriptions can be resumed',
        ERRORS.INVALID_REQUEST.status,
        ERRORS.INVALID_REQUEST.type
      );
    }

    if (previous.collection_method !== 'charge_automatically') {
      throw new AppError(
        'Resume is only available for subscriptions with collection_method=charge_automatically',
        ERRORS.INVALID_REQUEST.status,
        ERRORS.INVALID_REQUEST.type
      );
    }

    const now = Now();
    const billingCycleAnchor =
      validatedInput.billing_cycle_anchor === 'unchanged'
        ? previous.billing_cycle_anchor
        : now;

    // TODO: proration_behavior / proration_date — create proration invoice items
    void validatedInput.proration_behavior;
    void validatedInput.proration_date;

    const items = previous.items.data;
    const invoice = await this.CreateAndProcessInvoice(
      previous.platform_account,
      previous,
      items,
      'subscription_update',
      {
        finalize: true,
        collect: true,
      }
    );

    const updatePayload: Partial<SubscriptionType> = {
      status: invoice.status === 'paid' ? 'active' : 'paused',
      billing_cycle_anchor: billingCycleAnchor,
      pause_collection: null,
      latest_invoice: invoice.id,
    };

    await this.db.Update<SubscriptionType>('Subscriptions', id, updatePayload);

    const subscription = await this.GetSubscription(id);
    if (!subscription) {
      throw new AppError(
        ERRORS.SUBSCRIPTION_NOT_FOUND.message,
        ERRORS.SUBSCRIPTION_NOT_FOUND.status,
        ERRORS.SUBSCRIPTION_NOT_FOUND.type
      );
    }

    if (this.eventService) {
      const previousAttributes = ExtractChangedFields(
        previous as unknown as Record<string, unknown>,
        updatePayload as Record<string, unknown>
      );
      await this.eventService.Emit(
        'customer.subscription.updated',
        subscription.platform_account,
        subscription,
        { previousAttributes }
      );
      if (subscription.status === 'active') {
        await this.eventService.Emit(
          'customer.subscription.resumed',
          subscription.platform_account,
          subscription
        );
      }
    }

    return subscription;
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Object builders
  // ───────────────────────────────────────────────────────────────────────────

  private SubscriptionObject(
    platformAccountId: string,
    id: string,
    input: CreateSubscriptionInput,
    customer: CustomerType,
    items: SubscriptionItemType[],
    timing: {
      now: number;
      startDate: number;
      billingCycleAnchor: number;
      status: SubscriptionStatus;
      trialStart: number | null;
      trialEnd: number | null;
    }
  ): SubscriptionType {
    const collectionMethod = input.collection_method ?? 'charge_automatically';

    return {
      id,
      object: 'subscription',
      application: null,
      application_fee_percent: input.application_fee_percent ?? null,
      automatic_tax: {
        disabled_reason: null,
        enabled: input.automatic_tax?.enabled ?? false,
        liability: input.automatic_tax?.liability
          ? {
              type: input.automatic_tax.liability.type,
              account: input.automatic_tax.liability.account ?? null,
            }
          : null,
      },
      billing_cycle_anchor: timing.billingCycleAnchor,
      billing_cycle_anchor_config: input.billing_cycle_anchor_config
        ? {
            day_of_month: input.billing_cycle_anchor_config.day_of_month,
            hour: input.billing_cycle_anchor_config.hour ?? null,
            minute: input.billing_cycle_anchor_config.minute ?? null,
            month: input.billing_cycle_anchor_config.month ?? null,
            second: input.billing_cycle_anchor_config.second ?? null,
          }
        : null,
      billing_mode: {
        type: input.billing_mode?.type ?? 'flexible',
        flexible: {
          proration_discounts:
            input.billing_mode?.flexible?.proration_discounts ?? 'included',
        },
        updated_at: null,
      },
      billing_schedules: [],
      billing_thresholds: input.billing_thresholds
        ? {
            amount_gte: input.billing_thresholds.amount_gte ?? null,
            reset_billing_cycle_anchor:
              input.billing_thresholds.reset_billing_cycle_anchor ?? null,
          }
        : null,
      cancel_at: typeof input.cancel_at === 'number' ? input.cancel_at : null,
      cancel_at_period_end: input.cancel_at_period_end ?? false,
      canceled_at: null,
      cancellation_details: null,
      collection_method: collectionMethod,
      created: timing.now,
      currency: 'usdc',
      customer: customer.id,
      customer_account: input.customer_account ?? null,
      days_until_due:
        collectionMethod === 'send_invoice'
          ? input.days_until_due ?? null
          : null,
      default_payment_method: input.default_payment_method ?? null,
      default_source: input.default_source ?? null,
      default_tax_rates: input.default_tax_rates
        ? (input.default_tax_rates as never)
        : null,
      description: input.description ?? null,
      discounts: input.discounts
        ? input.discounts.map((discount) =>
            discount.discount
              ? discount.discount
              : discount.coupon ?? discount.promotion_code ?? ''
          )
        : [],
      ended_at: null,
      invoice_settings: {
        account_tax_ids: input.invoice_settings?.account_tax_ids ?? null,
        custom_fields: input.invoice_settings?.custom_fields ?? null,
        description: input.invoice_settings?.description ?? null,
        footer: input.invoice_settings?.footer ?? null,
        issuer: input.invoice_settings?.issuer
          ? {
              type: input.invoice_settings.issuer.type,
              account: input.invoice_settings.issuer.account ?? null,
            }
          : { type: 'self', account: null },
      },
      items: this.ToItemsList(id, items),
      latest_invoice: null,
      livemode: GetAppConfig().livemode,
      managed_payments: null,
      metadata: input.metadata ?? {},
      next_pending_invoice_item_invoice: null,
      on_behalf_of: input.on_behalf_of ?? null,
      pause_collection: null,
      payment_settings: input.payment_settings
        ? {
            payment_method_options:
              input.payment_settings.payment_method_options ?? null,
            payment_method_types:
              input.payment_settings.payment_method_types ?? null,
            save_default_payment_method:
              input.payment_settings.save_default_payment_method ?? 'off',
          }
        : {
            payment_method_options: null,
            payment_method_types: null,
            save_default_payment_method: 'off',
          },
      pending_invoice_item_interval: input.pending_invoice_item_interval
        ? {
            interval: input.pending_invoice_item_interval.interval,
            interval_count:
              input.pending_invoice_item_interval.interval_count ?? 1,
          }
        : null,
      pending_setup_intent: null,
      pending_update: null,
      presentment_details: null,
      schedule: null,
      start_date: timing.startDate,
      status: timing.status,
      test_clock: null,
      transfer_data: input.transfer_data
        ? {
            destination: input.transfer_data.destination,
            amount_percent: input.transfer_data.amount_percent ?? null,
          }
        : null,
      trial_end: timing.trialEnd,
      trial_settings: input.trial_settings
        ? {
            end_behavior: {
              missing_payment_method:
                input.trial_settings.end_behavior.missing_payment_method,
            },
          }
        : {
            end_behavior: { missing_payment_method: 'create_invoice' },
          },
      trial_start: timing.trialStart,
      platform_account: platformAccountId,
      subscription_delegation_pda: null,
      billing_lock_until: null,
    };
  }

  private BuildUpdatePayload(
    existing: SubscriptionType,
    input: UpdateSubscriptionInput
  ): Partial<SubscriptionType> {
    const payload: Partial<SubscriptionType> = {};

    if (input.application_fee_percent !== undefined) {
      payload.application_fee_percent = input.application_fee_percent;
    }
    if (input.automatic_tax !== undefined) {
      payload.automatic_tax = {
        disabled_reason: null,
        enabled: input.automatic_tax.enabled,
        liability: input.automatic_tax.liability
          ? {
              type: input.automatic_tax.liability.type,
              account: input.automatic_tax.liability.account ?? null,
            }
          : existing.automatic_tax.liability,
      };
    }
    if (input.billing_cycle_anchor === 'now') {
      payload.billing_cycle_anchor = Now();
    }
    if (input.billing_thresholds !== undefined) {
      payload.billing_thresholds =
        input.billing_thresholds === ''
          ? null
          : {
              amount_gte: input.billing_thresholds.amount_gte ?? null,
              reset_billing_cycle_anchor:
                input.billing_thresholds.reset_billing_cycle_anchor ?? null,
            };
    }
    if (input.cancel_at !== undefined) {
      payload.cancel_at =
        typeof input.cancel_at === 'number' ? input.cancel_at : null;
    }
    if (input.cancel_at_period_end !== undefined) {
      payload.cancel_at_period_end = input.cancel_at_period_end;
    }
    if (input.cancellation_details !== undefined) {
      payload.cancellation_details = {
        comment: input.cancellation_details.comment ?? null,
        feedback: input.cancellation_details.feedback ?? null,
        reason: existing.cancellation_details?.reason ?? null,
      };
    }
    if (input.collection_method !== undefined) {
      payload.collection_method = input.collection_method;
    }
    if (input.days_until_due !== undefined) {
      payload.days_until_due = input.days_until_due;
    }
    if (input.default_payment_method !== undefined) {
      payload.default_payment_method = input.default_payment_method;
    }
    if (input.default_source !== undefined) {
      payload.default_source = input.default_source;
    }
    if (input.default_tax_rates !== undefined) {
      payload.default_tax_rates =
        input.default_tax_rates === ''
          ? null
          : (input.default_tax_rates as never);
    }
    if (input.description !== undefined) {
      payload.description = input.description;
    }
    if (input.discounts !== undefined) {
      payload.discounts =
        input.discounts === ''
          ? []
          : input.discounts.map(
              (discount) =>
                discount.discount ??
                discount.coupon ??
                discount.promotion_code ??
                ''
            );
    }
    if (input.invoice_settings !== undefined) {
      payload.invoice_settings = {
        account_tax_ids:
          input.invoice_settings.account_tax_ids ??
          existing.invoice_settings.account_tax_ids,
        custom_fields:
          input.invoice_settings.custom_fields ??
          existing.invoice_settings.custom_fields,
        description:
          input.invoice_settings.description ??
          existing.invoice_settings.description,
        footer:
          input.invoice_settings.footer ?? existing.invoice_settings.footer,
        issuer: input.invoice_settings.issuer
          ? {
              type: input.invoice_settings.issuer.type,
              account: input.invoice_settings.issuer.account ?? null,
            }
          : existing.invoice_settings.issuer,
      };
    }
    if (input.metadata !== undefined) {
      payload.metadata = { ...existing.metadata, ...input.metadata };
    }
    if (input.on_behalf_of !== undefined) {
      payload.on_behalf_of = input.on_behalf_of;
    }
    if (input.pause_collection !== undefined) {
      payload.pause_collection =
        input.pause_collection === ''
          ? null
          : {
              behavior: input.pause_collection.behavior,
              resumes_at: input.pause_collection.resumes_at ?? null,
            };
    }
    if (input.payment_settings !== undefined) {
      payload.payment_settings = {
        payment_method_options:
          input.payment_settings.payment_method_options ?? null,
        payment_method_types:
          input.payment_settings.payment_method_types ?? null,
        save_default_payment_method:
          input.payment_settings.save_default_payment_method ??
          existing.payment_settings?.save_default_payment_method ??
          'off',
      };
    }
    if (input.pending_invoice_item_interval !== undefined) {
      payload.pending_invoice_item_interval = {
        interval: input.pending_invoice_item_interval.interval,
        interval_count: input.pending_invoice_item_interval.interval_count ?? 1,
      };
    }
    if (input.transfer_data !== undefined) {
      payload.transfer_data =
        input.transfer_data === ''
          ? null
          : {
              destination: input.transfer_data.destination,
              amount_percent: input.transfer_data.amount_percent ?? null,
            };
    }
    if (input.trial_end !== undefined) {
      if (input.trial_end === 'now') {
        payload.trial_end = Now();
        if (existing.status === 'trialing') {
          payload.status = 'active';
        }
      } else {
        payload.trial_end = input.trial_end;
        payload.trial_start = existing.trial_start ?? Now();
        payload.status = 'trialing';
      }
    }
    if (input.trial_settings !== undefined) {
      payload.trial_settings = {
        end_behavior: {
          missing_payment_method:
            input.trial_settings.end_behavior.missing_payment_method,
        },
      };
    }

    return StripUndefined(
      payload as Record<string, unknown>
    ) as Partial<SubscriptionType>;
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Subscription items
  // ───────────────────────────────────────────────────────────────────────────

  private async CreateItemsForSubscription(
    platformAccountId: string,
    subscriptionId: string,
    itemsInput: CreateItemInput[],
    periodStart: number
  ): Promise<SubscriptionItemType[]> {
    const items: SubscriptionItemType[] = [];
    for (const itemInput of itemsInput) {
      const item = await this.CreateSubscriptionItem(
        platformAccountId,
        subscriptionId,
        itemInput,
        periodStart
      );
      items.push(item);
    }
    return items;
  }

  private async CreateSubscriptionItem(
    platformAccountId: string,
    subscriptionId: string,
    itemInput: CreateItemInput | UpdateItemInput,
    periodStart: number
  ): Promise<SubscriptionItemType> {
    const price = await this.ResolvePrice(platformAccountId, itemInput);
    const periodEnd = AddRecurringInterval(
      periodStart,
      price.recurring?.interval ?? 'month',
      price.recurring?.interval_count ?? 1
    );

    const billingThresholds =
      'billing_thresholds' in itemInput &&
      itemInput.billing_thresholds !== undefined &&
      itemInput.billing_thresholds !== ''
        ? { usage_gte: itemInput.billing_thresholds.usage_gte }
        : null;

    const discountsInput = itemInput.discounts;
    const discounts =
      discountsInput === undefined || discountsInput === ''
        ? []
        : discountsInput.map(
            (discount) =>
              discount.discount ??
              discount.coupon ??
              discount.promotion_code ??
              ''
          );

    const taxRatesInput = itemInput.tax_rates;
    const taxRates =
      taxRatesInput === undefined || taxRatesInput === '' ? [] : taxRatesInput;

    const item: SubscriptionItemType = {
      id: GenerateId('si_z'),
      object: 'subscription_item',
      billed_until: null,
      billing_thresholds: billingThresholds,
      created: Now(),
      current_period_end: periodEnd,
      current_period_start: periodStart,
      discounts,
      metadata: itemInput.metadata ?? {},
      price: price.id,
      quantity: itemInput.quantity ?? 1,
      subscription: subscriptionId,
      tax_rates: taxRates,
      platform_account: platformAccountId,
    };

    await this.db.Set('SubscriptionItems', item.id, item);
    return item;
  }

  private async ApplyItemUpdates(
    platformAccountId: string,
    subscriptionId: string,
    itemsInput: UpdateItemInput[],
    periodStart: number
  ): Promise<void> {
    for (const itemInput of itemsInput) {
      if (itemInput.deleted) {
        if (!itemInput.id) {
          throw new AppError(
            '`id` is required when `deleted` is true',
            ERRORS.VALIDATION_ERROR.status,
            ERRORS.VALIDATION_ERROR.type
          );
        }
        // TODO: clear_usage for metered items when usage records exist
        void itemInput.clear_usage;
        await this.db.Delete('SubscriptionItems', itemInput.id);
        continue;
      }

      if (!itemInput.id) {
        await this.CreateSubscriptionItem(
          platformAccountId,
          subscriptionId,
          itemInput,
          periodStart
        );
        continue;
      }

      const existing = await this.db.Get<SubscriptionItemType>(
        'SubscriptionItems',
        itemInput.id
      );
      if (!existing || existing.subscription !== subscriptionId) {
        throw new AppError(
          'Subscription item not found',
          ERRORS.INVALID_REQUEST.status,
          ERRORS.INVALID_REQUEST.type
        );
      }

      const payload: Partial<SubscriptionItemType> = {};
      if (itemInput.metadata !== undefined) {
        payload.metadata = { ...existing.metadata, ...itemInput.metadata };
      }
      if (itemInput.quantity !== undefined) {
        payload.quantity = itemInput.quantity;
      }
      if (itemInput.billing_thresholds !== undefined) {
        payload.billing_thresholds =
          itemInput.billing_thresholds === ''
            ? null
            : { usage_gte: itemInput.billing_thresholds.usage_gte };
      }
      if (itemInput.discounts !== undefined) {
        payload.discounts =
          itemInput.discounts === ''
            ? []
            : itemInput.discounts.map(
                (discount) =>
                  discount.discount ??
                  discount.coupon ??
                  discount.promotion_code ??
                  ''
              );
      }
      if (itemInput.tax_rates !== undefined) {
        payload.tax_rates =
          itemInput.tax_rates === '' ? [] : itemInput.tax_rates;
      }
      if (itemInput.price || itemInput.price_data) {
        const price = await this.ResolvePrice(platformAccountId, itemInput);
        payload.price = price.id;
        if (itemInput.quantity === undefined) {
          payload.quantity = 1;
        }
      }

      await this.db.Update<SubscriptionItemType>(
        'SubscriptionItems',
        itemInput.id,
        payload
      );
    }
  }

  private async ResolvePrice(
    platformAccountId: string,
    itemInput: CreateItemInput | UpdateItemInput
  ): Promise<PriceType> {
    if (!this.priceModule) {
      throw new AppError(
        'PriceModule not configured',
        ERRORS.INVALID_REQUEST.status,
        ERRORS.INVALID_REQUEST.type
      );
    }

    if (itemInput.price) {
      const price = await this.priceModule.GetPrice(itemInput.price);
      if (!price || price.platform_account !== platformAccountId) {
        throw new AppError(
          ERRORS.PRICE_NOT_FOUND.message,
          ERRORS.PRICE_NOT_FOUND.status,
          ERRORS.PRICE_NOT_FOUND.type
        );
      }
      if (price.type !== 'recurring' || !price.recurring) {
        throw new AppError(
          'Subscription items require a recurring price',
          ERRORS.INVALID_REQUEST.status,
          ERRORS.INVALID_REQUEST.type
        );
      }
      return price;
    }

    if (!itemInput.price_data) {
      throw new AppError(
        'Either `price` or `price_data` is required',
        ERRORS.VALIDATION_ERROR.status,
        ERRORS.VALIDATION_ERROR.type
      );
    }

    this.AssertSupportedCurrency(itemInput.price_data.currency);

    const unitAmount =
      itemInput.price_data.unit_amount ??
      Math.round(Number(itemInput.price_data.unit_amount_decimal));

    return this.priceModule.CreatePrice(platformAccountId, {
      currency: itemInput.price_data.currency,
      product: itemInput.price_data.product,
      tax_behavior: itemInput.price_data.tax_behavior,
      unit_amount: Math.max(unitAmount, 1),
      unit_amount_decimal: itemInput.price_data.unit_amount_decimal,
      recurring: {
        interval: itemInput.price_data.recurring.interval,
        interval_count: itemInput.price_data.recurring.interval_count,
      },
    });
  }

  private async LoadItemsList(
    subscriptionId: string
  ): Promise<SubscriptionItemList> {
    const items = await this.db.Query<SubscriptionItemType>({
      collection: 'SubscriptionItems',
      method: 'READ',
      parameters: [
        {
          key: 'subscription',
          operator: QueryOperators['=='],
          value: subscriptionId,
        },
      ],
    });
    items.sort((a, b) => a.created - b.created);
    return this.ToItemsList(subscriptionId, items);
  }

  private ToItemsList(
    subscriptionId: string,
    items: SubscriptionItemType[]
  ): SubscriptionItemList {
    return {
      object: 'list',
      data: items,
      has_more: false,
      url: `/v1/subscription_items?subscription=${subscriptionId}`,
    };
  }

  private async DeleteItems(ids: string[]): Promise<void> {
    for (const id of ids) {
      await this.db.Delete('SubscriptionItems', id);
    }
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Trials / periods
  // ───────────────────────────────────────────────────────────────────────────

  private ResolveTrial(
    input: CreateSubscriptionInput,
    now: number,
    billingCycleAnchor: number
  ): { trial_start: number | null; trial_end: number | null } {
    if (input.trial_end !== undefined) {
      if (input.trial_end === 'now') {
        return { trial_start: null, trial_end: null };
      }
      return { trial_start: now, trial_end: input.trial_end };
    }
    if (input.trial_period_days !== undefined && input.trial_period_days > 0) {
      return {
        trial_start: now,
        trial_end: now + input.trial_period_days * SECONDS_PER_DAY,
      };
    }
    void billingCycleAnchor;
    void input.trial_from_plan;
    return { trial_start: null, trial_end: null };
  }

  private ShouldEmitTrialWillEnd(
    trialEnd: number | null,
    now: number
  ): boolean {
    if (trialEnd === null) {
      return false;
    }
    return trialEnd - now <= THREE_DAYS_SECONDS;
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Invoicing
  // ───────────────────────────────────────────────────────────────────────────

  private async CreateAndProcessInvoice(
    platformAccountId: string,
    subscription: SubscriptionType,
    items: SubscriptionItemType[],
    billingReason:
      | 'subscription_create'
      | 'subscription_update'
      | 'subscription_cycle',
    options: {
      finalize: boolean;
      collect: boolean;
      settlementSignature?: string;
    }
  ): Promise<InvoiceType> {
    if (!this.invoiceModule) {
      throw new AppError(
        'InvoiceModule not configured',
        ERRORS.INVALID_REQUEST.status,
        ERRORS.INVALID_REQUEST.type
      );
    }

    const customerId =
      typeof subscription.customer === 'string'
        ? subscription.customer
        : subscription.customer.id;

    const lineItems = items.map((item) => {
      const priceId =
        typeof item.price === 'string' ? item.price : item.price.id;
      return {
        price: priceId,
        quantity: item.quantity ?? 1,
        period: {
          start: item.current_period_start,
          end: item.current_period_end,
        },
        subscription_item: item.id,
      };
    });

    return this.invoiceModule.CreateSubscriptionInvoice(platformAccountId, {
      customer: customerId,
      subscription: subscription.id,
      collection_method: subscription.collection_method,
      billing_reason: billingReason,
      days_until_due: subscription.days_until_due ?? undefined,
      default_payment_method: subscription.default_payment_method,
      description: subscription.description,
      lineItems,
      finalize: options.finalize,
      collect: options.collect,
      settlementSignature: options.settlementSignature,
    });
  }

  /**
   * Create and optionally collect a subscription_cycle invoice for renewals.
   */
  async CreateCycleInvoice(
    platformAccountId: string,
    subscriptionId: string,
    options: { finalize?: boolean; collect?: boolean } = {}
  ): Promise<InvoiceType> {
    const subscription = await this.RequireSubscription(subscriptionId);
    const items = subscription.items.data;
    return this.CreateAndProcessInvoice(
      platformAccountId,
      subscription,
      items,
      'subscription_cycle',
      {
        finalize: options.finalize ?? true,
        collect: options.collect ?? true,
      }
    );
  }

  /**
   * Advance each subscription item into the next billing period after a
   * successful cycle payment. Clears the billing lock and sets status active.
   */
  async AdvanceSubscriptionPeriod(
    subscriptionId: string,
    latestInvoiceId?: string
  ): Promise<SubscriptionType> {
    const subscription = await this.RequireSubscription(subscriptionId);

    for (const item of subscription.items.data) {
      const price = await this.ResolvePrice(subscription.platform_account, {
        price: typeof item.price === 'string' ? item.price : item.price.id,
      } as CreateItemInput);
      const periodStart = item.current_period_end;
      const periodEnd = AddRecurringInterval(
        periodStart,
        price.recurring?.interval ?? 'month',
        price.recurring?.interval_count ?? 1
      );
      await this.db.Update<SubscriptionItemType>('SubscriptionItems', item.id, {
        current_period_start: periodStart,
        current_period_end: periodEnd,
      });
    }

    return this.UpdateSubscriptionBillingState(subscription, {
      status: 'active',
      latestInvoiceId,
    });
  }

  /**
   * Mark a subscription past_due after a failed invoice payment attempt.
   */
  async MarkSubscriptionPastDue(
    subscriptionId: string,
    latestInvoiceId?: string
  ): Promise<SubscriptionType> {
    const previous = await this.RequireSubscription(subscriptionId);
    return this.UpdateSubscriptionBillingState(previous, {
      status: 'past_due',
      latestInvoiceId,
    });
  }

  /**
   * After payment retries are exhausted, mark the subscription unpaid.
   */
  async MarkSubscriptionUnpaid(
    subscriptionId: string,
    latestInvoiceId?: string
  ): Promise<SubscriptionType> {
    const previous = await this.RequireSubscription(subscriptionId);
    return this.UpdateSubscriptionBillingState(previous, {
      status: 'unpaid',
      latestInvoiceId,
    });
  }

  private async UpdateSubscriptionBillingState(
    previous: SubscriptionType,
    options: {
      status: SubscriptionStatus;
      latestInvoiceId?: string;
    }
  ): Promise<SubscriptionType> {
    const updatePayload: Partial<SubscriptionType> = {
      status: options.status,
      billing_lock_until: null,
    };
    if (options.latestInvoiceId) {
      updatePayload.latest_invoice = options.latestInvoiceId;
    }

    await this.db.Update<SubscriptionType>(
      'Subscriptions',
      previous.id,
      updatePayload
    );

    const updated = await this.RequireSubscription(previous.id);

    if (this.eventService) {
      await this.eventService.Emit(
        'customer.subscription.updated',
        updated.platform_account,
        updated,
        {
          previousAttributes: ExtractChangedFields(
            previous as unknown as Record<string, unknown>,
            updatePayload as Record<string, unknown>
          ),
        }
      );
    }

    return updated;
  }

  /**
   * Persist the on-chain subscription delegation PDA after a successful
   * hosted checkout subscribe.
   */
  async SetSubscriptionDelegationPda(
    id: string,
    subscriptionDelegationPda: string
  ): Promise<SubscriptionType> {
    await this.RequireSubscription(id);
    await this.db.Update<SubscriptionType>('Subscriptions', id, {
      subscription_delegation_pda: subscriptionDelegationPda,
    });
    return this.RequireSubscription(id);
  }

  /**
   * Atomically claim a subscription for billing work. Returns null if another
   * runner already holds the lock.
   */
  async ClaimForBilling(
    subscriptionId: string,
    lockUntil: number
  ): Promise<SubscriptionType | null> {
    const now = Now();
    const claimed = await this.db.FindOneAndUpdateByFilter<SubscriptionType>(
      'Subscriptions',
      {
        id: subscriptionId,
        $or: [
          { billing_lock_until: null },
          { billing_lock_until: { $exists: false } },
          { billing_lock_until: { $lte: now } },
        ],
      },
      { $set: { billing_lock_until: lockUntil } }
    );
    if (!claimed) {
      return null;
    }
    claimed.items = await this.LoadItemsList(subscriptionId);
    return claimed;
  }

  async ReleaseBillingLock(subscriptionId: string): Promise<void> {
    await this.db.Update<SubscriptionType>('Subscriptions', subscriptionId, {
      billing_lock_until: null,
    });
  }

  private async RollbackCreatedSubscription(
    subscriptionId: string,
    items: SubscriptionItemType[],
    invoiceId?: string
  ): Promise<void> {
    if (invoiceId && this.invoiceModule) {
      try {
        const invoice = await this.invoiceModule.GetInvoice(invoiceId);
        if (invoice?.status === 'draft') {
          await this.invoiceModule.DeleteInvoice(invoiceId);
        } else if (invoice?.status === 'open') {
          await this.invoiceModule.VoidInvoice(invoiceId);
        }
      } catch {
        // Best-effort cleanup
      }
    }
    await this.DeleteItems(items.map((item) => item.id));
    await this.db.Delete('Subscriptions', subscriptionId);
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Helpers
  // ───────────────────────────────────────────────────────────────────────────

  private AssertSupportedCurrency(currency: string): void {
    if (currency !== 'usdc') {
      throw new AppError(
        `Currency '${currency}' is not supported. Only 'usdc' is accepted.`,
        ERRORS.INVALID_REQUEST.status,
        ERRORS.INVALID_REQUEST.type
      );
    }
  }

  private async RequireSubscription(id: string): Promise<SubscriptionType> {
    const subscription = await this.GetSubscription(id);
    if (!subscription) {
      throw new AppError(
        ERRORS.SUBSCRIPTION_NOT_FOUND.message,
        ERRORS.SUBSCRIPTION_NOT_FOUND.status,
        ERRORS.SUBSCRIPTION_NOT_FOUND.type
      );
    }
    return subscription;
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
}
