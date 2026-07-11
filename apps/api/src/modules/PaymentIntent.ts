/**
 * @fileOverview Methods for PaymentIntents
 *
 * A PaymentIntent tracks the lifecycle of a payment, from creation through
 * confirmation and capture. In Zoneless this maps to a USDC transfer on Solana.
 *
 * @module PaymentIntent
 * @see https://docs.stripe.com/api/payment_intents
 */

import { Database } from './Database';
import { EventService } from './EventService';
import { AccountModule } from './Account';
import type { CustomerModule } from './Customer';
import { GenerateId } from '../utils/IdGenerator';
import {
  EventType,
  PaymentIntent as PaymentIntentType,
  PaymentIntentAmountDetails,
  PaymentIntentAmountDetailsLineItem,
  QueryOperators,
  INCOMPLETE_PAYMENT_INTENT_STATUSES,
} from '@zoneless/shared-types';
import { ValidateUpdate } from './Util';
import { ExtractChangedFields } from './Event';
import {
  CreatePaymentIntentSchema,
  CreatePaymentIntentInput,
  UpdatePaymentIntentSchema,
  UpdatePaymentIntentInput,
  CancelPaymentIntentSchema,
  CancelPaymentIntentInput,
  ListPaymentIntentsFiltersInput,
} from '@zoneless/shared-schemas';
import { ListHelper, ListOptions, ListResult } from '../utils/ListHelper';
import { Now } from '../utils/Timestamp';
import { GetAppConfig } from './AppConfig';
import { AppError } from '../utils/AppError';
import { ERRORS } from '../utils/Errors';
import { GetPlatformAccountId } from './PlatformAccess';

/** Statuses that still allow property updates without confirming. */
const UPDATABLE_STATUSES: ReadonlySet<PaymentIntentType['status']> = new Set([
  'requires_payment_method',
  'requires_confirmation',
  'requires_action',
]);

/** Statuses in which a PaymentIntent may be canceled. */
const CANCELABLE_STATUSES: ReadonlySet<PaymentIntentType['status']> = new Set([
  'requires_payment_method',
  'requires_capture',
  'requires_confirmation',
  'requires_action',
  'processing',
]);

/** Statuses from which a PaymentIntent may enter `requires_confirmation`. */
const REQUIRES_CONFIRMATION_FROM: ReadonlySet<PaymentIntentType['status']> =
  new Set(['requires_payment_method']);

/** Statuses from which a PaymentIntent may enter `requires_action`. */
const REQUIRES_ACTION_FROM: ReadonlySet<PaymentIntentType['status']> = new Set([
  'requires_payment_method',
  'requires_confirmation',
]);

/** Statuses from which a PaymentIntent may enter `processing`. */
const PROCESSING_FROM: ReadonlySet<PaymentIntentType['status']> = new Set([
  'requires_payment_method',
  'requires_confirmation',
  'requires_action',
]);

/** Statuses from which a PaymentIntent may succeed or fail. */
const TERMINAL_ATTEMPT_FROM: ReadonlySet<PaymentIntentType['status']> = new Set(
  [
    'requires_payment_method',
    'requires_confirmation',
    'requires_action',
    'processing',
  ]
);

export type PaymentIntentLastPaymentError = NonNullable<
  PaymentIntentType['last_payment_error']
>;
export type PaymentIntentNextAction = NonNullable<
  PaymentIntentType['next_action']
>;

type AddressInput = NonNullable<
  NonNullable<CreatePaymentIntentInput['shipping']>['address']
>;
type ShippingInput = NonNullable<CreatePaymentIntentInput['shipping']>;
type AmountDetailsInput = NonNullable<
  CreatePaymentIntentInput['amount_details']
>;
type AmountDetailsLineItemInput = NonNullable<
  AmountDetailsInput['line_items']
>[number];

/**
 * Fills in missing address fields with null to satisfy the PaymentIntent
 * shipping address shape (all fields nullable but required).
 */
function ToPaymentIntentAddress(input: AddressInput): {
  city: string | null;
  country: string | null;
  line1: string | null;
  line2: string | null;
  postal_code: string | null;
  state: string | null;
} {
  return {
    city: input.city ?? null,
    country: input.country ?? null,
    line1: input.line1 ?? null,
    line2: input.line2 ?? null,
    postal_code: input.postal_code ?? null,
    state: input.state ?? null,
  };
}

function ToPaymentIntentShipping(
  input: ShippingInput
): NonNullable<PaymentIntentType['shipping']> {
  return {
    address: ToPaymentIntentAddress(input.address),
    carrier: input.carrier ?? null,
    name: input.name,
    phone: input.phone ?? null,
    tracking_number: input.tracking_number ?? null,
  };
}

function ToAmountDetailsLineItem(
  input: AmountDetailsLineItemInput
): PaymentIntentAmountDetailsLineItem {
  return {
    id: GenerateId('uli_z'),
    object: 'payment_intent_amount_details_line_item',
    discount_amount: input.discount_amount ?? null,
    payment_method_options: null,
    product_code: input.product_code ?? null,
    product_name: input.product_name,
    quantity: input.quantity,
    tax: input.tax ? { total_tax_amount: input.tax.total_tax_amount } : null,
    unit_cost: input.unit_cost,
    unit_of_measure: input.unit_of_measure ?? null,
  };
}

function ToAmountDetails(
  input?: AmountDetailsInput
): PaymentIntentAmountDetails {
  if (!input) {
    return { tip: {} };
  }

  const { line_items, ...rest } = input;
  return {
    tip: {},
    ...rest,
    ...(line_items !== undefined
      ? { line_items: line_items.map(ToAmountDetailsLineItem) }
      : {}),
  };
}

export class PaymentIntentModule {
  private readonly db: Database;
  private readonly eventService: EventService | null;
  private readonly listHelper: ListHelper<PaymentIntentType>;
  private readonly accountModule: AccountModule;
  private readonly customerModule: CustomerModule | null;

  constructor(
    db: Database,
    eventService?: EventService,
    customerModule?: CustomerModule
  ) {
    this.db = db;
    this.eventService = eventService || null;
    this.listHelper = new ListHelper<PaymentIntentType>(db, {
      collection: 'PaymentIntents',
      orderByField: 'created',
      orderDirection: 'desc',
      urlPath: '/v1/payment_intents',
      accountField: 'platform_account',
    });
    this.accountModule = new AccountModule(db);
    this.customerModule = customerModule || null;
  }

  /**
   * Create a new PaymentIntent.
   *
   * @param platformAccountId - The platform account ID
   * @param input - The input data for the PaymentIntent
   * @returns The created PaymentIntent
   */
  async CreatePaymentIntent(
    platformAccountId: string,
    input: CreatePaymentIntentInput
  ): Promise<PaymentIntentType> {
    const validatedInput = ValidateUpdate(CreatePaymentIntentSchema, input);

    this.AssertCreateConstraints(validatedInput);

    if (validatedInput.customer && this.customerModule) {
      await this.AssertCustomerBelongsToPlatform(
        validatedInput.customer,
        platformAccountId
      );
    }

    if (validatedInput.on_behalf_of) {
      await this.AssertConnectedAccount(
        validatedInput.on_behalf_of,
        platformAccountId
      );
    }

    if (validatedInput.transfer_data?.destination) {
      await this.AssertConnectedAccount(
        validatedInput.transfer_data.destination,
        platformAccountId
      );
    }

    const paymentIntent = this.PaymentIntentObject(
      platformAccountId,
      validatedInput
    );

    await this.db.Set('PaymentIntents', paymentIntent.id, paymentIntent);

    if (this.eventService) {
      await this.eventService.Emit(
        'payment_intent.created',
        paymentIntent.platform_account,
        paymentIntent
      );
    }

    return paymentIntent;
  }

  /**
   * Build a PaymentIntent object from create input without persisting it.
   */
  PaymentIntentObject(
    platformAccountId: string,
    input: CreatePaymentIntentInput
  ): PaymentIntentType {
    const id = GenerateId('pi_z');
    const clientSecret = GenerateId(`${id}_secret`, 24);
    const hasPaymentMethod = Boolean(input.payment_method);

    const paymentIntent: PaymentIntentType = {
      id,
      object: 'payment_intent',
      amount: input.amount,
      amount_capturable: 0,
      amount_details: ToAmountDetails(input.amount_details),
      amount_received: 0,
      application: null,
      application_fee_amount: input.application_fee_amount ?? null,
      automatic_payment_methods: input.automatic_payment_methods
        ? {
            enabled: input.automatic_payment_methods.enabled,
            allow_redirects:
              input.automatic_payment_methods.allow_redirects ?? null,
          }
        : null,
      canceled_at: null,
      cancellation_reason: null,
      capture_method: input.capture_method ?? 'automatic_async',
      client_secret: clientSecret,
      confirmation_method: input.confirmation_method ?? 'automatic',
      created: Now(),
      currency: input.currency,
      customer: input.customer ?? null,
      customer_account: input.customer_account ?? null,
      description: input.description ?? null,
      excluded_payment_method_types:
        input.excluded_payment_method_types ?? null,
      hooks: input.hooks
        ? {
            inputs: input.hooks.inputs
              ? {
                  tax: input.hooks.inputs.tax
                    ? { calculation: input.hooks.inputs.tax.calculation }
                    : null,
                }
              : null,
          }
        : null,
      last_payment_error: null,
      latest_charge: null,
      livemode: GetAppConfig().livemode,
      managed_payments: null,
      metadata: input.metadata ?? {},
      next_action: null,
      on_behalf_of: input.on_behalf_of ?? null,
      payment_details: input.payment_details
        ? {
            customer_reference:
              input.payment_details.customer_reference ?? null,
            order_reference: input.payment_details.order_reference ?? null,
          }
        : null,
      payment_method: input.payment_method ?? null,
      payment_method_configuration_details: input.payment_method_configuration
        ? {
            id: input.payment_method_configuration,
            parent: null,
          }
        : null,
      payment_method_options: input.payment_method_options
        ? {
            crypto: input.payment_method_options.crypto
              ? {
                  setup_future_usage:
                    input.payment_method_options.crypto.setup_future_usage ??
                    null,
                }
              : null,
          }
        : null,
      payment_method_types: input.payment_method_types ?? ['crypto'],
      presentment_details: null,
      processing: null,
      receipt_email: input.receipt_email ?? null,
      review: null,
      setup_future_usage: input.setup_future_usage ?? null,
      shared_payment_granted_token: null,
      shipping: input.shipping ? ToPaymentIntentShipping(input.shipping) : null,
      statement_descriptor: input.statement_descriptor ?? null,
      statement_descriptor_suffix: input.statement_descriptor_suffix ?? null,
      status: hasPaymentMethod
        ? 'requires_confirmation'
        : 'requires_payment_method',
      transfer_data: input.transfer_data
        ? {
            amount: input.transfer_data.amount ?? null,
            description: input.transfer_data.description ?? null,
            destination: input.transfer_data.destination,
            metadata: input.transfer_data.metadata ?? null,
            payment_data: input.transfer_data.payment_data
              ? {
                  description:
                    input.transfer_data.payment_data.description ?? null,
                  metadata: input.transfer_data.payment_data.metadata ?? null,
                }
              : null,
          }
        : null,
      transfer_group: input.transfer_group ?? null,
      platform_account: platformAccountId,
    };

    return paymentIntent;
  }

  /**
   * Update a PaymentIntent without confirming.
   * Emits a 'payment_intent.updated' event if EventService is configured.
   *
   * @param id - The PaymentIntent ID
   * @param input - The fields to update
   * @returns The updated PaymentIntent
   */
  async UpdatePaymentIntent(
    id: string,
    input: UpdatePaymentIntentInput
  ): Promise<PaymentIntentType> {
    const validatedUpdate = ValidateUpdate(UpdatePaymentIntentSchema, input);

    const previousPaymentIntent = await this.GetPaymentIntent(id);
    if (!previousPaymentIntent) {
      throw new AppError(
        ERRORS.PAYMENT_INTENT_NOT_FOUND.message,
        ERRORS.PAYMENT_INTENT_NOT_FOUND.status,
        ERRORS.PAYMENT_INTENT_NOT_FOUND.type
      );
    }

    this.AssertUpdateConstraints(previousPaymentIntent, validatedUpdate);

    if (validatedUpdate.customer && this.customerModule) {
      await this.AssertCustomerBelongsToPlatform(
        validatedUpdate.customer,
        previousPaymentIntent.platform_account
      );
    }

    const updatePayload = this.BuildUpdatePayload(
      previousPaymentIntent,
      validatedUpdate
    );

    if (Object.keys(updatePayload).length > 0) {
      await this.db.Update<PaymentIntentType>(
        'PaymentIntents',
        id,
        updatePayload
      );
    }

    const paymentIntent = await this.GetPaymentIntent(id);
    if (!paymentIntent) {
      throw new AppError(
        ERRORS.PAYMENT_INTENT_NOT_FOUND.message,
        ERRORS.PAYMENT_INTENT_NOT_FOUND.status,
        ERRORS.PAYMENT_INTENT_NOT_FOUND.type
      );
    }

    if (this.eventService) {
      const previousAttributes = ExtractChangedFields(
        previousPaymentIntent as unknown as Record<string, unknown>,
        updatePayload as Record<string, unknown>
      );

      await this.eventService.Emit(
        'payment_intent.updated',
        paymentIntent.platform_account,
        paymentIntent,
        { previousAttributes }
      );
    }

    return paymentIntent;
  }

  /**
   * Get a PaymentIntent by its ID.
   *
   * @param id - The PaymentIntent ID
   * @returns The PaymentIntent if found, null otherwise
   */
  async GetPaymentIntent(id: string): Promise<PaymentIntentType | null> {
    return this.db.Get<PaymentIntentType>('PaymentIntents', id);
  }

  /**
   * Retrieve a PaymentIntent, optionally verifying its client_secret.
   * When `client_secret` is supplied (e.g. client-side retrieve), it must match.
   *
   * @param id - The PaymentIntent ID
   * @param clientSecret - Optional client secret to verify
   * @returns The PaymentIntent if found
   */
  async RetrievePaymentIntent(
    id: string,
    clientSecret?: string
  ): Promise<PaymentIntentType> {
    const paymentIntent = await this.GetPaymentIntent(id);
    if (!paymentIntent) {
      throw new AppError(
        ERRORS.PAYMENT_INTENT_NOT_FOUND.message,
        ERRORS.PAYMENT_INTENT_NOT_FOUND.status,
        ERRORS.PAYMENT_INTENT_NOT_FOUND.type
      );
    }

    if (clientSecret !== undefined) {
      this.AssertClientSecret(paymentIntent, clientSecret);
    }

    return paymentIntent;
  }

  /**
   * Cancel a PaymentIntent.
   * Emits a 'payment_intent.canceled' event if EventService is configured.
   *
   * @param id - The PaymentIntent ID
   * @param input - Optional cancellation reason
   * @returns The canceled PaymentIntent
   * @see https://docs.stripe.com/api/payment_intents/cancel
   */
  async CancelPaymentIntent(
    id: string,
    input: CancelPaymentIntentInput = {}
  ): Promise<PaymentIntentType> {
    const validatedInput = ValidateUpdate(CancelPaymentIntentSchema, input);

    return this.ApplyStatusTransition(id, {
      eventType: 'payment_intent.canceled',
      allowedFromStatuses: CANCELABLE_STATUSES,
      invalidTransitionMessage: (status) =>
        `PaymentIntent cannot be canceled because it has status: ${status}`,
      updatePayload: {
        status: 'canceled',
        canceled_at: Now(),
        cancellation_reason: validatedInput.cancellation_reason ?? null,
        next_action: null,
        // Stripe refunds remaining capturable amount; until charges exist we zero it.
        amount_capturable: 0,
      },
    });
  }

  /**
   * Mark a PaymentIntent as ready to confirm after the customer has provided
   * payment details (e.g. connected a wallet). Mirrors Stripe's transition
   * into `requires_confirmation`. Stripe has no dedicated webhook for this
   * status, so we emit `payment_intent.updated` with `previous_attributes`.
   * Idempotent when already in `requires_confirmation`.
   */
  async MarkRequiresConfirmation(
    id: string,
    options: { paymentMethod?: string | null } = {}
  ): Promise<PaymentIntentType> {
    const previous = await this.RequirePaymentIntent(id);

    if (previous.status === 'requires_confirmation') {
      if (options.paymentMethod !== undefined) {
        await this.db.Update<PaymentIntentType>('PaymentIntents', id, {
          payment_method: options.paymentMethod,
          last_payment_error: null,
        });
        return (await this.GetPaymentIntent(id))!;
      }
      return previous;
    }

    const updatePayload: Partial<PaymentIntentType> = {
      status: 'requires_confirmation',
      next_action: null,
      last_payment_error: null,
    };
    if (options.paymentMethod !== undefined) {
      updatePayload.payment_method = options.paymentMethod;
    }

    return this.ApplyStatusTransition(id, {
      eventType: 'payment_intent.updated',
      allowedFromStatuses: REQUIRES_CONFIRMATION_FROM,
      updatePayload,
      previousAttributes: ExtractChangedFields(
        previous as unknown as Record<string, unknown>,
        updatePayload as Record<string, unknown>
      ),
    });
  }

  /**
   * Mark a PaymentIntent as requiring additional customer action (e.g. 3DS)
   * and emit `payment_intent.requires_action`. Not used by the standard USDC
   * wallet checkout path — that uses `requires_confirmation` instead.
   * Idempotent when already in `requires_action`: updates `next_action`
   * without re-emitting.
   */
  async MarkRequiresAction(
    id: string,
    nextAction: PaymentIntentNextAction
  ): Promise<PaymentIntentType> {
    const previous = await this.RequirePaymentIntent(id);

    if (previous.status === 'requires_action') {
      await this.db.Update<PaymentIntentType>('PaymentIntents', id, {
        next_action: nextAction,
        last_payment_error: null,
      });
      return (await this.GetPaymentIntent(id))!;
    }

    return this.ApplyStatusTransition(id, {
      eventType: 'payment_intent.requires_action',
      allowedFromStatuses: REQUIRES_ACTION_FROM,
      updatePayload: {
        status: 'requires_action',
        next_action: nextAction,
        last_payment_error: null,
      },
    });
  }

  /**
   * Mark a PaymentIntent as processing (on-chain confirmation in flight)
   * and emit `payment_intent.processing`. Idempotent when already processing.
   */
  async MarkProcessing(id: string): Promise<PaymentIntentType> {
    const previous = await this.RequirePaymentIntent(id);
    if (previous.status === 'processing') {
      return previous;
    }

    return this.ApplyStatusTransition(id, {
      eventType: 'payment_intent.processing',
      allowedFromStatuses: PROCESSING_FROM,
      updatePayload: {
        status: 'processing',
        next_action: null,
        last_payment_error: null,
      },
    });
  }

  /**
   * Mark a PaymentIntent as succeeded and emit `payment_intent.succeeded`.
   * Idempotent when already succeeded.
   */
  async MarkSucceeded(
    id: string,
    options: { amountReceived?: number; latestCharge?: string | null } = {}
  ): Promise<PaymentIntentType> {
    const previous = await this.RequirePaymentIntent(id);
    if (previous.status === 'succeeded') {
      return previous;
    }

    return this.ApplyStatusTransition(id, {
      eventType: 'payment_intent.succeeded',
      allowedFromStatuses: TERMINAL_ATTEMPT_FROM,
      updatePayload: {
        status: 'succeeded',
        amount_received: options.amountReceived ?? previous.amount,
        latest_charge: options.latestCharge ?? previous.latest_charge,
        next_action: null,
        last_payment_error: null,
      },
    });
  }

  /**
   * Record a failed payment attempt: set `last_payment_error`, return the
   * PaymentIntent to `requires_payment_method` so the customer can retry,
   * and emit `payment_intent.payment_failed`.
   */
  async MarkPaymentFailed(
    id: string,
    lastPaymentError: PaymentIntentLastPaymentError
  ): Promise<PaymentIntentType> {
    return this.ApplyStatusTransition(id, {
      eventType: 'payment_intent.payment_failed',
      allowedFromStatuses: TERMINAL_ATTEMPT_FROM,
      updatePayload: {
        status: 'requires_payment_method',
        last_payment_error: lastPaymentError,
        next_action: null,
      },
    });
  }

  /**
   * Persist a status transition and emit the corresponding lifecycle event.
   * Shared by cancel / requires_confirmation / requires_action / processing /
   * succeeded / payment_failed.
   */
  private async ApplyStatusTransition(
    id: string,
    options: {
      eventType: EventType;
      allowedFromStatuses: ReadonlySet<PaymentIntentType['status']>;
      updatePayload: Partial<PaymentIntentType>;
      previousAttributes?: Record<string, unknown>;
      invalidTransitionMessage?: (
        status: PaymentIntentType['status']
      ) => string;
    }
  ): Promise<PaymentIntentType> {
    const previousPaymentIntent = await this.RequirePaymentIntent(id);

    if (!options.allowedFromStatuses.has(previousPaymentIntent.status)) {
      throw new AppError(
        options.invalidTransitionMessage?.(previousPaymentIntent.status) ??
          `PaymentIntent cannot transition to '${options.updatePayload.status}' from status '${previousPaymentIntent.status}'.`,
        ERRORS.INVALID_REQUEST.status,
        ERRORS.INVALID_REQUEST.type
      );
    }

    await this.db.Update<PaymentIntentType>(
      'PaymentIntents',
      id,
      options.updatePayload
    );

    const paymentIntent = await this.RequirePaymentIntent(id);

    if (this.eventService) {
      if (options.previousAttributes) {
        await this.eventService.Emit(
          options.eventType,
          paymentIntent.platform_account,
          paymentIntent,
          { previousAttributes: options.previousAttributes }
        );
      } else {
        await this.eventService.Emit(
          options.eventType,
          paymentIntent.platform_account,
          paymentIntent
        );
      }
    }

    return paymentIntent;
  }

  private async RequirePaymentIntent(id: string): Promise<PaymentIntentType> {
    const paymentIntent = await this.GetPaymentIntent(id);
    if (!paymentIntent) {
      throw new AppError(
        ERRORS.PAYMENT_INTENT_NOT_FOUND.message,
        ERRORS.PAYMENT_INTENT_NOT_FOUND.status,
        ERRORS.PAYMENT_INTENT_NOT_FOUND.type
      );
    }
    return paymentIntent;
  }

  /**
   * Verify a client_secret matches the PaymentIntent.
   * Used when retrieving with a publishable key / client-side credentials.
   */
  AssertClientSecret(
    paymentIntent: PaymentIntentType,
    clientSecret: string
  ): void {
    if (paymentIntent.client_secret !== clientSecret) {
      throw new AppError(
        ERRORS.PAYMENT_INTENT_NOT_FOUND.message,
        ERRORS.PAYMENT_INTENT_NOT_FOUND.status,
        ERRORS.PAYMENT_INTENT_NOT_FOUND.type
      );
    }
  }

  /**
   * Batch-load PaymentIntents by id, scoped to a single platform account.
   * Used by the expansion engine and other modules.
   */
  async BatchGet(
    ids: string[],
    platformAccount: string
  ): Promise<Map<string, PaymentIntentType>> {
    if (ids.length === 0) return new Map();
    const paymentIntents = await this.db.Query<PaymentIntentType>({
      collection: 'PaymentIntents',
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
    return new Map(
      paymentIntents.map((paymentIntent) => [paymentIntent.id, paymentIntent])
    );
  }

  /**
   * List PaymentIntents with cursor-based pagination.
   */
  async ListPaymentIntents(
    options: ListOptions & ListPaymentIntentsFiltersInput
  ): Promise<ListResult<PaymentIntentType>> {
    const { customer, customer_account, status, ...listOptions } = options;

    const filters: Record<string, unknown> = {};
    if (customer !== undefined) filters.customer = customer;
    if (customer_account !== undefined) {
      filters.customer_account = customer_account;
    }
    if (status === 'incomplete') {
      filters.status = {
        operator: QueryOperators['in'],
        value: INCOMPLETE_PAYMENT_INTENT_STATUSES,
      };
    } else if (status !== undefined) {
      filters.status = status;
    }

    return this.listHelper.List({
      ...listOptions,
      filters: { ...listOptions.filters, ...filters },
    });
  }

  /**
   * List amount_details line items for a PaymentIntent with cursor-based
   * pagination. Line items are embedded on the PaymentIntent, so pagination
   * is done in memory (same pattern as CheckoutSession.ListLineItems).
   *
   * @param paymentIntent - The PaymentIntent
   * @param options - Pagination options
   * @returns Paginated list of line items
   */
  ListAmountDetailsLineItems(
    paymentIntent: PaymentIntentType,
    options: { limit?: number; startingAfter?: string; endingBefore?: string }
  ): ListResult<PaymentIntentAmountDetailsLineItem> {
    const { limit = 10, startingAfter, endingBefore } = options;
    const effectiveLimit = Math.min(limit, 100);
    const items = paymentIntent.amount_details?.line_items ?? [];

    let start = 0;
    let end = items.length;
    if (startingAfter) {
      const index = items.findIndex((item) => item.id === startingAfter);
      if (index === -1) {
        throw new AppError(
          'Invalid starting_after ID',
          ERRORS.INVALID_REQUEST.status,
          ERRORS.INVALID_REQUEST.type
        );
      }
      start = index + 1;
    }
    if (endingBefore) {
      const index = items.findIndex((item) => item.id === endingBefore);
      if (index === -1) {
        throw new AppError(
          'Invalid ending_before ID',
          ERRORS.INVALID_REQUEST.status,
          ERRORS.INVALID_REQUEST.type
        );
      }
      end = index;
    }

    const page = items.slice(start, end).slice(0, effectiveLimit);
    const hasMore = start + page.length < end;

    return {
      object: 'list',
      data: page,
      has_more: hasMore,
      url: `/v1/payment_intents/${paymentIntent.id}/amount_details_line_items`,
    };
  }

  /**
   * Builds the partial document to persist for an update, translating nested
   * schema shapes into the fuller shapes stored on the PaymentIntent object.
   */
  private BuildUpdatePayload(
    previous: PaymentIntentType,
    input: UpdatePaymentIntentInput
  ): Partial<PaymentIntentType> {
    const {
      amount_details,
      hooks,
      payment_details,
      payment_method,
      payment_method_configuration,
      payment_method_options,
      shipping,
      transfer_data,
      expand: _expand,
      payment_method_data: _paymentMethodData,
      ...rest
    } = input;

    const payload: Partial<PaymentIntentType> = { ...rest };

    if (amount_details !== undefined) {
      payload.amount_details = ToAmountDetails(amount_details);
    }

    if (hooks !== undefined) {
      payload.hooks = {
        inputs: hooks.inputs
          ? {
              tax: hooks.inputs.tax
                ? { calculation: hooks.inputs.tax.calculation }
                : null,
            }
          : null,
      };
    }

    if (payment_details !== undefined) {
      payload.payment_details = {
        customer_reference: payment_details.customer_reference ?? null,
        order_reference: payment_details.order_reference ?? null,
      };
    }

    if (payment_method !== undefined) {
      // Empty string unsets the payment method (Stripe-compatible).
      payload.payment_method = payment_method === '' ? null : payment_method;
      payload.status =
        payload.payment_method === null
          ? 'requires_payment_method'
          : 'requires_confirmation';
    }

    if (payment_method_configuration !== undefined) {
      payload.payment_method_configuration_details = {
        id: payment_method_configuration,
        parent: null,
      };
    }

    if (payment_method_options !== undefined) {
      payload.payment_method_options = {
        ...(previous.payment_method_options ?? {}),
        crypto: payment_method_options.crypto
          ? {
              setup_future_usage:
                payment_method_options.crypto.setup_future_usage ?? null,
            }
          : previous.payment_method_options?.crypto ?? null,
      };
    }

    if (shipping !== undefined) {
      payload.shipping = ToPaymentIntentShipping(shipping);
    }

    if (transfer_data !== undefined) {
      if (!previous.transfer_data) {
        throw new AppError(
          'transfer_data can only be updated when it was set at creation time. Destination cannot be added later.',
          ERRORS.INVALID_REQUEST.status,
          ERRORS.INVALID_REQUEST.type
        );
      }
      payload.transfer_data = {
        amount:
          transfer_data.amount !== undefined
            ? transfer_data.amount
            : previous.transfer_data.amount,
        description:
          transfer_data.description !== undefined
            ? transfer_data.description
            : previous.transfer_data.description,
        destination: previous.transfer_data.destination,
        metadata:
          transfer_data.metadata !== undefined
            ? transfer_data.metadata
            : previous.transfer_data.metadata,
        payment_data:
          transfer_data.payment_data !== undefined
            ? {
                description: transfer_data.payment_data.description ?? null,
                metadata: transfer_data.payment_data.metadata ?? null,
              }
            : previous.transfer_data.payment_data,
      };
    }

    return payload;
  }

  /**
   * Reject create-time parameters that require flows not yet implemented,
   * and enforce Stripe-compatible amount constraints.
   */
  private AssertCreateConstraints(input: CreatePaymentIntentInput): void {
    if (input.confirm) {
      throw new AppError(
        'Confirming a PaymentIntent at creation time is not yet supported. Create the PaymentIntent, then confirm it separately.',
        ERRORS.INVALID_REQUEST.status,
        ERRORS.INVALID_REQUEST.type
      );
    }

    if (input.payment_method_data) {
      throw new AppError(
        'Creating a PaymentMethod via payment_method_data is not yet supported. Pass an existing payment_method ID instead.',
        ERRORS.INVALID_REQUEST.status,
        ERRORS.INVALID_REQUEST.type
      );
    }

    if (input.confirmation_token) {
      throw new AppError(
        'confirmation_token is not yet supported.',
        ERRORS.INVALID_REQUEST.status,
        ERRORS.INVALID_REQUEST.type
      );
    }

    this.AssertAmountConstraints(input.amount, input);
    this.AssertSupportedCurrency(input.currency);
  }

  private AssertUpdateConstraints(
    previous: PaymentIntentType,
    input: UpdatePaymentIntentInput
  ): void {
    if (!UPDATABLE_STATUSES.has(previous.status)) {
      throw new AppError(
        `PaymentIntent cannot be updated in status '${previous.status}'.`,
        ERRORS.INVALID_REQUEST.status,
        ERRORS.INVALID_REQUEST.type
      );
    }

    if (input.payment_method_data) {
      throw new AppError(
        'Creating a PaymentMethod via payment_method_data is not yet supported. Pass an existing payment_method ID instead.',
        ERRORS.INVALID_REQUEST.status,
        ERRORS.INVALID_REQUEST.type
      );
    }

    if (input.currency !== undefined) {
      this.AssertSupportedCurrency(input.currency);
    }

    if (
      input.transfer_group !== undefined &&
      previous.transfer_group !== null
    ) {
      throw new AppError(
        'transfer_group can only be set if it has not already been set on the PaymentIntent.',
        ERRORS.INVALID_REQUEST.status,
        ERRORS.INVALID_REQUEST.type
      );
    }

    const effectiveAmount = input.amount ?? previous.amount;
    this.AssertAmountConstraints(effectiveAmount, {
      application_fee_amount:
        input.application_fee_amount ??
        previous.application_fee_amount ??
        undefined,
      transfer_data: {
        amount:
          input.transfer_data?.amount ??
          previous.transfer_data?.amount ??
          undefined,
      },
    });
  }

  private AssertAmountConstraints(
    amount: number,
    input: {
      application_fee_amount?: number | null;
      transfer_data?: { amount?: number | null } | null;
    }
  ): void {
    if (
      input.application_fee_amount !== undefined &&
      input.application_fee_amount !== null &&
      input.application_fee_amount > amount
    ) {
      throw new AppError(
        'application_fee_amount cannot exceed the PaymentIntent amount.',
        ERRORS.INVALID_REQUEST.status,
        ERRORS.INVALID_REQUEST.type
      );
    }

    if (
      input.transfer_data?.amount !== undefined &&
      input.transfer_data.amount !== null &&
      input.transfer_data.amount > amount
    ) {
      throw new AppError(
        'transfer_data[amount] cannot exceed the PaymentIntent amount.',
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

  private async AssertConnectedAccount(
    accountId: string,
    platformAccountId: string
  ): Promise<void> {
    const account = await this.accountModule.GetAccount(accountId);
    if (!account || GetPlatformAccountId(account) !== platformAccountId) {
      throw new AppError(
        `${ERRORS.NO_SUCH_CONNECTED_ACCOUNT.message}: '${accountId}'`,
        ERRORS.NO_SUCH_CONNECTED_ACCOUNT.status,
        ERRORS.NO_SUCH_CONNECTED_ACCOUNT.type
      );
    }
  }
}
