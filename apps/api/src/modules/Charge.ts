/**
 * @fileOverview Methods for Charges
 *
 * A Charge represents a single attempt to move money into a platform account.
 * PaymentIntent confirmation is the preferred way to create Charges; this
 * module also supports the legacy Charges API for Stripe API compatibility.
 *
 * @module Charge
 * @see https://docs.stripe.com/api/charges
 */

import { Database } from './Database';
import { EventService } from './EventService';
import { AccountModule } from './Account';
import type { CustomerModule } from './Customer';
import { GenerateId } from '../utils/IdGenerator';
import {
  Charge as ChargeType,
  ChargeBillingDetails,
  EventType,
  QueryOperators,
} from '@zoneless/shared-types';
import { ValidateUpdate } from './Util';
import { ExtractChangedFields } from './Event';
import {
  CreateChargeSchema,
  CreateChargeInput,
  UpdateChargeSchema,
  UpdateChargeInput,
  CaptureChargeSchema,
  CaptureChargeInput,
  ListChargesFiltersInput,
} from '@zoneless/shared-schemas';
import { ListHelper, ListOptions, ListResult } from '../utils/ListHelper';
import { Now } from '../utils/Timestamp';
import { GetAppConfig } from './AppConfig';
import { AppError } from '../utils/AppError';
import { ERRORS } from '../utils/Errors';
import { GetPlatformAccountId } from './PlatformAccess';
import { BuildChargeReceiptNumber, BuildChargeReceiptUrl } from './Receipt';

type AddressInput = NonNullable<
  NonNullable<CreateChargeInput['shipping']>['address']
>;
type ShippingInput = NonNullable<CreateChargeInput['shipping']>;

/**
 * Fills in missing address fields with null to satisfy the Charge shipping
 * address shape (all fields nullable but required).
 */
function ToChargeAddress(input: AddressInput): {
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

function ToChargeShipping(
  input: ShippingInput
): NonNullable<ChargeType['shipping']> {
  return {
    address: ToChargeAddress(input.address),
    carrier: input.carrier ?? null,
    name: input.name,
    phone: input.phone ?? null,
    tracking_number: input.tracking_number ?? null,
  };
}

function EmptyBillingDetails(): ChargeBillingDetails {
  return {
    address: {
      city: null,
      country: null,
      line1: null,
      line2: null,
      postal_code: null,
      state: null,
    },
    email: null,
    name: null,
    phone: null,
    tax_id: null,
  };
}

function EmptyRefundsList(
  chargeId: string
): NonNullable<ChargeType['refunds']> {
  return {
    object: 'list',
    data: [],
    has_more: false,
    url: `/v1/charges/${chargeId}/refunds`,
  };
}

/**
 * Internal input for Charges created from a PaymentIntent payment attempt
 * (e.g. hosted checkout confirmation). Not part of the public Charges API.
 */
export interface CreateChargeFromPaymentAttemptInput {
  amount: number;
  currency: string;
  payment_intent: string;
  payment_method: string | null;
  customer?: string | null;
  description?: string | null;
  metadata?: Record<string, string>;
  receipt_email?: string | null;
  application_fee_amount?: number | null;
  transfer_data?: {
    amount: number | null;
    destination: string;
  } | null;
  transfer_group?: string | null;
  crypto: {
    buyer_address: string | null;
    transaction_hash: string | null;
  };
  outcome: 'succeeded' | 'failed';
  failure_code?: string | null;
  failure_message?: string | null;
}

export class ChargeModule {
  private readonly db: Database;
  private readonly eventService: EventService | null;
  private readonly listHelper: ListHelper<ChargeType>;
  private readonly accountModule: AccountModule;
  private readonly customerModule: CustomerModule | null;

  constructor(
    db: Database,
    eventService?: EventService,
    customerModule?: CustomerModule
  ) {
    this.db = db;
    this.eventService = eventService || null;
    this.listHelper = new ListHelper<ChargeType>(db, {
      collection: 'Charges',
      orderByField: 'created',
      orderDirection: 'desc',
      urlPath: '/v1/charges',
      accountField: 'platform_account',
    });
    this.accountModule = new AccountModule(db);
    this.customerModule = customerModule || null;
  }

  /**
   * Create a new Charge.
   * Emits `charge.succeeded` when captured, or `charge.pending` when held.
   *
   * @param platformAccountId - The platform account ID
   * @param input - The input data for the Charge
   * @returns The created Charge
   */
  async CreateCharge(
    platformAccountId: string,
    input: CreateChargeInput
  ): Promise<ChargeType> {
    const validatedInput = ValidateUpdate(CreateChargeSchema, input);

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

    const charge = this.ChargeObject(platformAccountId, validatedInput);

    await this.db.Set('Charges', charge.id, charge);

    if (this.eventService) {
      const eventType: EventType = charge.captured
        ? 'charge.succeeded'
        : 'charge.pending';
      await this.eventService.Emit(eventType, charge.platform_account, charge);
    }

    return charge;
  }

  /**
   * Create a Charge from a PaymentIntent payment attempt (hosted checkout).
   * Emits `charge.succeeded` or `charge.failed` based on `outcome`.
   *
   * Used when confirming a checkout payment on-chain — Stripe creates the
   * Charge as part of PaymentIntent confirmation, not via POST /v1/charges.
   */
  async CreateFromPaymentAttempt(
    platformAccountId: string,
    input: CreateChargeFromPaymentAttemptInput
  ): Promise<ChargeType> {
    const id = GenerateId('ch_z');
    const succeeded = input.outcome === 'succeeded';

    const charge: ChargeType = {
      id,
      object: 'charge',
      amount: input.amount,
      amount_captured: succeeded ? input.amount : 0,
      amount_refunded: 0,
      application: null,
      application_fee: null,
      application_fee_amount: input.application_fee_amount ?? null,
      balance_transaction: null,
      billing_details: EmptyBillingDetails(),
      calculated_statement_descriptor: null,
      captured: succeeded,
      created: Now(),
      currency: input.currency,
      customer: input.customer ?? null,
      description: input.description ?? null,
      disputed: false,
      failure_balance_transaction: null,
      failure_code: succeeded ? null : input.failure_code ?? null,
      failure_message: succeeded ? null : input.failure_message ?? null,
      fraud_details: {},
      livemode: GetAppConfig().livemode,
      metadata: input.metadata ?? {},
      on_behalf_of: null,
      outcome: succeeded
        ? {
            advice_code: null,
            network_advice_code: null,
            network_decline_code: null,
            network_status: 'approved_by_network',
            reason: null,
            risk_level: 'normal',
            risk_score: null,
            rule: null,
            seller_message: 'Payment complete.',
            type: 'authorized',
          }
        : {
            advice_code: null,
            network_advice_code: null,
            network_decline_code: null,
            network_status: 'declined_by_network',
            reason: input.failure_code ?? null,
            risk_level: null,
            risk_score: null,
            rule: null,
            seller_message: input.failure_message ?? 'Payment failed.',
            type: 'issuer_declined',
          },
      paid: succeeded,
      payment_intent: input.payment_intent,
      payment_method: input.payment_method,
      payment_method_details: {
        type: 'crypto',
        crypto: {
          buyer_address: input.crypto.buyer_address,
          fingerprint: null,
          network: 'solana',
          token_currency: 'usdc',
          transaction_hash: input.crypto.transaction_hash,
        },
      },
      presentment_details: null,
      radar_options: null,
      receipt_email: input.receipt_email ?? null,
      receipt_number: BuildChargeReceiptNumber(id),
      receipt_url: BuildChargeReceiptUrl(id),
      refunded: false,
      refunds: EmptyRefundsList(id),
      review: null,
      shipping: null,
      source_transfer: null,
      statement_descriptor: null,
      statement_descriptor_suffix: null,
      status: succeeded ? 'succeeded' : 'failed',
      transfer: null,
      transfer_data: input.transfer_data ?? null,
      transfer_group: input.transfer_group ?? null,
      platform_account: platformAccountId,
    };

    await this.db.Set('Charges', charge.id, charge);

    if (this.eventService) {
      await this.eventService.Emit(
        succeeded ? 'charge.succeeded' : 'charge.failed',
        charge.platform_account,
        charge
      );
    }

    return charge;
  }

  /**
   * Link a balance transaction to a Charge after ledger recording.
   */
  async AttachBalanceTransaction(
    id: string,
    balanceTransactionId: string
  ): Promise<ChargeType> {
    await this.db.Update<ChargeType>('Charges', id, {
      balance_transaction: balanceTransactionId,
    });
    return this.RequireCharge(id);
  }

  /**
   * Build a Charge object from create input without persisting it.
   */
  ChargeObject(
    platformAccountId: string,
    input: CreateChargeInput
  ): ChargeType {
    const id = GenerateId('ch_z');
    const capture = input.capture !== false;
    const paymentMethod = input.source ?? null;

    const charge: ChargeType = {
      id,
      object: 'charge',
      amount: input.amount,
      amount_captured: capture ? input.amount : 0,
      amount_refunded: 0,
      application: null,
      application_fee: null,
      application_fee_amount: input.application_fee_amount ?? null,
      balance_transaction: null,
      billing_details: EmptyBillingDetails(),
      calculated_statement_descriptor: input.statement_descriptor ?? null,
      captured: capture,
      created: Now(),
      currency: input.currency,
      customer: input.customer ?? null,
      description: input.description ?? null,
      disputed: false,
      failure_balance_transaction: null,
      failure_code: null,
      failure_message: null,
      fraud_details: {},
      livemode: GetAppConfig().livemode,
      metadata: input.metadata ?? {},
      on_behalf_of: input.on_behalf_of ?? null,
      outcome: capture
        ? {
            advice_code: null,
            network_advice_code: null,
            network_decline_code: null,
            network_status: 'approved_by_network',
            reason: null,
            risk_level: 'normal',
            risk_score: null,
            rule: null,
            seller_message: 'Payment complete.',
            type: 'authorized',
          }
        : {
            advice_code: null,
            network_advice_code: null,
            network_decline_code: null,
            network_status: 'approved_by_network',
            reason: null,
            risk_level: 'normal',
            risk_score: null,
            rule: null,
            seller_message: 'Payment authorized.',
            type: 'authorized',
          },
      paid: true,
      payment_intent: null,
      payment_method: paymentMethod,
      payment_method_details: paymentMethod
        ? {
            type: 'crypto',
            crypto: {
              buyer_address: null,
              fingerprint: null,
              network: 'solana',
              token_currency: 'usdc',
              transaction_hash: null,
            },
          }
        : null,
      presentment_details: null,
      radar_options: input.radar_options
        ? { session: input.radar_options.session ?? null }
        : null,
      receipt_email: input.receipt_email ?? null,
      receipt_number: BuildChargeReceiptNumber(id),
      receipt_url: BuildChargeReceiptUrl(id),
      refunded: false,
      refunds: EmptyRefundsList(id),
      review: null,
      shipping: input.shipping ? ToChargeShipping(input.shipping) : null,
      source_transfer: null,
      statement_descriptor: input.statement_descriptor ?? null,
      statement_descriptor_suffix: input.statement_descriptor_suffix ?? null,
      status: capture ? 'succeeded' : 'pending',
      transfer: null,
      transfer_data: input.transfer_data
        ? {
            amount: input.transfer_data.amount ?? null,
            destination: input.transfer_data.destination,
          }
        : null,
      transfer_group: input.transfer_group ?? null,
      platform_account: platformAccountId,
    };

    return charge;
  }

  /**
   * Update a Charge.
   * Emits a `charge.updated` event if EventService is configured.
   *
   * @param id - The Charge ID
   * @param input - The fields to update
   * @returns The updated Charge
   */
  async UpdateCharge(
    id: string,
    input: UpdateChargeInput
  ): Promise<ChargeType> {
    const validatedUpdate = ValidateUpdate(UpdateChargeSchema, input);

    const previousCharge = await this.GetCharge(id);
    if (!previousCharge) {
      throw new AppError(
        ERRORS.CHARGE_NOT_FOUND.message,
        ERRORS.CHARGE_NOT_FOUND.status,
        ERRORS.CHARGE_NOT_FOUND.type
      );
    }

    this.AssertUpdateConstraints(previousCharge, validatedUpdate);

    if (validatedUpdate.customer && this.customerModule) {
      await this.AssertCustomerBelongsToPlatform(
        validatedUpdate.customer,
        previousCharge.platform_account
      );
    }

    const updatePayload = this.BuildUpdatePayload(
      previousCharge,
      validatedUpdate
    );

    if (Object.keys(updatePayload).length > 0) {
      await this.db.Update<ChargeType>('Charges', id, updatePayload);
    }

    const charge = await this.GetCharge(id);
    if (!charge) {
      throw new AppError(
        ERRORS.CHARGE_NOT_FOUND.message,
        ERRORS.CHARGE_NOT_FOUND.status,
        ERRORS.CHARGE_NOT_FOUND.type
      );
    }

    if (this.eventService) {
      const previousAttributes = ExtractChangedFields(
        previousCharge as unknown as Record<string, unknown>,
        updatePayload as Record<string, unknown>
      );

      await this.eventService.Emit(
        'charge.updated',
        charge.platform_account,
        charge,
        { previousAttributes }
      );
    }

    return charge;
  }

  /**
   * Capture an uncaptured Charge.
   * Emits `charge.captured` (and `charge.updated` is not emitted separately).
   *
   * @param id - The Charge ID
   * @param input - Optional capture parameters
   * @returns The captured Charge
   */
  async CaptureCharge(
    id: string,
    input: CaptureChargeInput = {}
  ): Promise<ChargeType> {
    const validatedInput = ValidateUpdate(CaptureChargeSchema, input);

    const previousCharge = await this.RequireCharge(id);

    if (previousCharge.captured) {
      throw new AppError(
        'Charge has already been captured.',
        ERRORS.INVALID_REQUEST.status,
        ERRORS.INVALID_REQUEST.type
      );
    }

    if (previousCharge.status === 'failed') {
      throw new AppError(
        'Cannot capture a failed charge.',
        ERRORS.INVALID_REQUEST.status,
        ERRORS.INVALID_REQUEST.type
      );
    }

    const captureAmount = validatedInput.amount ?? previousCharge.amount;
    if (captureAmount > previousCharge.amount) {
      throw new AppError(
        'Capture amount cannot exceed the authorized charge amount.',
        ERRORS.INVALID_REQUEST.status,
        ERRORS.INVALID_REQUEST.type
      );
    }

    if (
      validatedInput.application_fee_amount !== undefined &&
      validatedInput.application_fee_amount > captureAmount
    ) {
      throw new AppError(
        'application_fee_amount cannot exceed the capture amount.',
        ERRORS.INVALID_REQUEST.status,
        ERRORS.INVALID_REQUEST.type
      );
    }

    if (
      validatedInput.transfer_data?.amount !== undefined &&
      validatedInput.transfer_data.amount > captureAmount
    ) {
      throw new AppError(
        'transfer_data[amount] cannot exceed the capture amount.',
        ERRORS.INVALID_REQUEST.status,
        ERRORS.INVALID_REQUEST.type
      );
    }

    if (
      validatedInput.transfer_group !== undefined &&
      previousCharge.transfer_group !== null
    ) {
      throw new AppError(
        'transfer_group can only be set if it has not already been set on the Charge.',
        ERRORS.INVALID_REQUEST.status,
        ERRORS.INVALID_REQUEST.type
      );
    }

    const updatePayload: Partial<ChargeType> = {
      captured: true,
      amount_captured: captureAmount,
      paid: true,
      status: 'succeeded',
      outcome: {
        advice_code: null,
        network_advice_code: null,
        network_decline_code: null,
        network_status: 'approved_by_network',
        reason: null,
        risk_level: previousCharge.outcome?.risk_level ?? 'normal',
        risk_score: previousCharge.outcome?.risk_score ?? null,
        rule: previousCharge.outcome?.rule ?? null,
        seller_message: 'Payment complete.',
        type: 'authorized',
      },
    };

    if (validatedInput.application_fee_amount !== undefined) {
      updatePayload.application_fee_amount =
        validatedInput.application_fee_amount;
    }
    if (validatedInput.receipt_email !== undefined) {
      updatePayload.receipt_email = validatedInput.receipt_email;
    }
    if (validatedInput.statement_descriptor !== undefined) {
      updatePayload.statement_descriptor = validatedInput.statement_descriptor;
      updatePayload.calculated_statement_descriptor =
        validatedInput.statement_descriptor;
    }
    if (validatedInput.statement_descriptor_suffix !== undefined) {
      updatePayload.statement_descriptor_suffix =
        validatedInput.statement_descriptor_suffix;
    }
    if (validatedInput.transfer_group !== undefined) {
      updatePayload.transfer_group = validatedInput.transfer_group;
    }
    if (
      validatedInput.transfer_data?.amount !== undefined &&
      previousCharge.transfer_data
    ) {
      updatePayload.transfer_data = {
        ...previousCharge.transfer_data,
        amount: validatedInput.transfer_data.amount,
      };
    }

    await this.db.Update<ChargeType>('Charges', id, updatePayload);

    const charge = await this.RequireCharge(id);

    if (this.eventService) {
      await this.eventService.Emit(
        'charge.captured',
        charge.platform_account,
        charge
      );
    }

    return charge;
  }

  /**
   * Get a Charge by its ID.
   */
  async GetCharge(id: string): Promise<ChargeType | null> {
    return this.db.Get<ChargeType>('Charges', id);
  }

  /**
   * Retrieve a Charge by ID, throwing if not found.
   */
  async RetrieveCharge(id: string): Promise<ChargeType> {
    return this.RequireCharge(id);
  }

  /**
   * List Charges with cursor-based pagination.
   */
  async ListCharges(
    options: ListOptions & ListChargesFiltersInput
  ): Promise<ListResult<ChargeType>> {
    const { customer, payment_intent, transfer_group, ...listOptions } =
      options;

    const filters: Record<string, unknown> = {};
    if (customer !== undefined) filters.customer = customer;
    if (payment_intent !== undefined) filters.payment_intent = payment_intent;
    if (transfer_group !== undefined) filters.transfer_group = transfer_group;

    return this.listHelper.List({
      ...listOptions,
      filters: { ...listOptions.filters, ...filters },
    });
  }

  /**
   * Batch-load Charges by id, scoped to a single platform account.
   */
  async BatchGet(
    ids: string[],
    platformAccount: string
  ): Promise<Map<string, ChargeType>> {
    if (ids.length === 0) return new Map();
    const charges = await this.db.Query<ChargeType>({
      collection: 'Charges',
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
    return new Map(charges.map((charge) => [charge.id, charge]));
  }

  /**
   * Mark a Charge as failed. Emits `charge.failed`.
   */
  async MarkFailed(
    id: string,
    options: {
      failureCode?: string | null;
      failureMessage?: string | null;
    } = {}
  ): Promise<ChargeType> {
    const previous = await this.RequireCharge(id);

    if (previous.status === 'failed') {
      return previous;
    }

    const updatePayload: Partial<ChargeType> = {
      status: 'failed',
      paid: false,
      captured: false,
      amount_captured: 0,
      failure_code: options.failureCode ?? null,
      failure_message: options.failureMessage ?? null,
      outcome: {
        advice_code: null,
        network_advice_code: null,
        network_decline_code: null,
        network_status: 'declined_by_network',
        reason: options.failureCode ?? null,
        risk_level: previous.outcome?.risk_level ?? null,
        risk_score: previous.outcome?.risk_score ?? null,
        rule: previous.outcome?.rule ?? null,
        seller_message: options.failureMessage ?? 'Payment failed.',
        type: 'issuer_declined',
      },
    };

    await this.db.Update<ChargeType>('Charges', id, updatePayload);
    const charge = await this.RequireCharge(id);

    if (this.eventService) {
      await this.eventService.Emit(
        'charge.failed',
        charge.platform_account,
        charge
      );
    }

    return charge;
  }

  /**
   * Mark an uncaptured Charge as expired. Emits `charge.expired`.
   */
  async MarkExpired(id: string): Promise<ChargeType> {
    const previous = await this.RequireCharge(id);

    if (previous.captured) {
      throw new AppError(
        'Cannot expire a captured charge.',
        ERRORS.INVALID_REQUEST.status,
        ERRORS.INVALID_REQUEST.type
      );
    }

    const updatePayload: Partial<ChargeType> = {
      status: 'failed',
      paid: false,
      failure_code: 'expired_uncaptured_charge',
      failure_message: 'The authorization for this charge has expired.',
    };

    await this.db.Update<ChargeType>('Charges', id, updatePayload);
    const charge = await this.RequireCharge(id);

    if (this.eventService) {
      await this.eventService.Emit(
        'charge.expired',
        charge.platform_account,
        charge
      );
    }

    return charge;
  }

  /**
   * Mark a Charge as refunded (full or partial). Emits `charge.refunded`.
   */
  async MarkRefunded(id: string, amountRefunded: number): Promise<ChargeType> {
    const previous = await this.RequireCharge(id);

    if (amountRefunded < 0 || amountRefunded > previous.amount) {
      throw new AppError(
        'Refund amount must be between 0 and the charge amount.',
        ERRORS.INVALID_REQUEST.status,
        ERRORS.INVALID_REQUEST.type
      );
    }

    const updatePayload: Partial<ChargeType> = {
      amount_refunded: amountRefunded,
      refunded: amountRefunded >= previous.amount_captured,
    };

    await this.db.Update<ChargeType>('Charges', id, updatePayload);
    const charge = await this.RequireCharge(id);

    if (this.eventService) {
      await this.eventService.Emit(
        'charge.refunded',
        charge.platform_account,
        charge
      );
    }

    return charge;
  }

  private async RequireCharge(id: string): Promise<ChargeType> {
    const charge = await this.GetCharge(id);
    if (!charge) {
      throw new AppError(
        ERRORS.CHARGE_NOT_FOUND.message,
        ERRORS.CHARGE_NOT_FOUND.status,
        ERRORS.CHARGE_NOT_FOUND.type
      );
    }
    return charge;
  }

  private BuildUpdatePayload(
    previous: ChargeType,
    input: UpdateChargeInput
  ): Partial<ChargeType> {
    const { shipping, fraud_details, expand: _expand, ...rest } = input;

    const payload: Partial<ChargeType> = { ...rest };

    if (shipping !== undefined) {
      payload.shipping = ToChargeShipping(shipping);
    }

    if (fraud_details !== undefined) {
      payload.fraud_details = {
        ...(previous.fraud_details ?? {}),
        user_report: fraud_details.user_report,
      };
    }

    return payload;
  }

  private AssertCreateConstraints(input: CreateChargeInput): void {
    if (!input.source && !input.customer) {
      throw new AppError(
        'Must provide either a source or a customer to create a charge.',
        ERRORS.INVALID_REQUEST.status,
        ERRORS.INVALID_REQUEST.type
      );
    }

    this.AssertSupportedCurrency(input.currency);
    this.AssertAmountConstraints(input.amount, input);
  }

  private AssertUpdateConstraints(
    previous: ChargeType,
    input: UpdateChargeInput
  ): void {
    if (
      input.customer !== undefined &&
      previous.customer !== null &&
      input.customer !== previous.customer
    ) {
      throw new AppError(
        'customer can only be set if there is no existing associated customer with this charge.',
        ERRORS.INVALID_REQUEST.status,
        ERRORS.INVALID_REQUEST.type
      );
    }

    if (
      input.transfer_group !== undefined &&
      previous.transfer_group !== null
    ) {
      throw new AppError(
        'transfer_group can only be set if it has not already been set on the Charge.',
        ERRORS.INVALID_REQUEST.status,
        ERRORS.INVALID_REQUEST.type
      );
    }
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
        'application_fee_amount cannot exceed the Charge amount.',
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
        'transfer_data[amount] cannot exceed the Charge amount.',
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
