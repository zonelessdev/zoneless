/**
 * @fileOverview Methods for Checkout Sessions
 *
 *
 * @module CheckoutSession
 */

import { Database } from './Database';
import { EventService } from './EventService';
import { GenerateId, GenerateUrlSlug } from '../utils/IdGenerator';
import {
  CheckoutSession as CheckoutSessionType,
  CheckoutSessionCustomField,
  CheckoutSessionLineItem,
  Price as PriceType,
} from '@zoneless/shared-types';
import { ValidateUpdate } from './Util';
import type { PriceModule } from './Price';
import type { ProductModule } from './Product';
import type { CustomerModule } from './Customer';
import type { PaymentIntentModule } from './PaymentIntent';
import {
  CreateCheckoutSessionSchema,
  CreateCheckoutSessionFromPaymentLinkSchema,
  CreateCheckoutSessionInput,
  UpdateCheckoutSessionSchema,
  UpdateCheckoutSessionInput,
  ListCheckoutSessionsFiltersInput,
  CreatePriceInput,
  CreatePaymentIntentInput,
} from '@zoneless/shared-schemas';
import { ListHelper, ListOptions, ListResult } from '../utils/ListHelper';
import { Now } from '../utils/Timestamp';
import { GetAppConfig } from './AppConfig';
import { AppError } from '../utils/AppError';
import { ERRORS } from '../utils/Errors';

const DEFAULT_EXPIRY_SECONDS = 24 * 60 * 60; // Sessions expire after 24 hours by default

type LineItemInput = NonNullable<
  CreateCheckoutSessionInput['line_items']
>[number];
type UpdateLineItemInput = NonNullable<
  UpdateCheckoutSessionInput['line_items']
>[number];
type PriceDataInput = NonNullable<LineItemInput['price_data']>;
type ShippingOptionInput = NonNullable<
  CreateCheckoutSessionInput['shipping_options']
>[number];
type PaymentIntentDataInput = NonNullable<
  CreateCheckoutSessionInput['payment_intent_data']
>;

export class CheckoutSessionModule {
  private readonly db: Database;
  private readonly eventService: EventService | null;
  private readonly listHelper: ListHelper<CheckoutSessionType>;
  private readonly priceModule: PriceModule | null;
  private readonly productModule: ProductModule | null;
  private readonly customerModule: CustomerModule | null;
  private readonly paymentIntentModule: PaymentIntentModule | null;

  constructor(
    db: Database,
    eventService?: EventService,
    priceModule?: PriceModule,
    productModule?: ProductModule,
    customerModule?: CustomerModule,
    paymentIntentModule?: PaymentIntentModule
  ) {
    this.db = db;
    this.eventService = eventService || null;
    this.listHelper = new ListHelper<CheckoutSessionType>(db, {
      collection: 'CheckoutSessions',
      orderByField: 'created',
      orderDirection: 'desc',
      urlPath: '/v1/checkout/sessions',
      accountField: 'platform_account',
    });
    this.priceModule = priceModule || null;
    this.productModule = productModule || null;
    this.customerModule = customerModule || null;
    this.paymentIntentModule = paymentIntentModule || null;
  }

  /**
   * Create a new checkout session.
   *
   * For `payment` mode, creates a linked PaymentIntent (emitting
   * `payment_intent.created`) and stores its id on the session. No
   * `checkout.session.*` event is emitted on creation —
   * `checkout.session.completed` / async payment events come from the
   * payment flow; `checkout.session.expired` from ExpireCheckoutSession.
   *
   * @param platformAccountId - The platform account ID
   * @param input - The input data for the checkout session
   * @returns The created checkout session
   */
  async CreateCheckoutSession(
    platformAccountId: string,
    input: CreateCheckoutSessionInput,
    options?: { payment_link?: string }
  ): Promise<CheckoutSessionType> {
    const validatedInput = ValidateUpdate(
      options?.payment_link
        ? CreateCheckoutSessionFromPaymentLinkSchema
        : CreateCheckoutSessionSchema,
      input
    );

    if (validatedInput.customer && this.customerModule) {
      const customer = await this.customerModule.GetCustomer(
        validatedInput.customer
      );
      if (!customer || customer.platform_account !== platformAccountId) {
        throw new AppError(
          ERRORS.CUSTOMER_NOT_FOUND.message,
          ERRORS.CUSTOMER_NOT_FOUND.status,
          ERRORS.CUSTOMER_NOT_FOUND.type
        );
      }
    }

    const lineItems = await Promise.all(
      (validatedInput.line_items ?? []).map((item) =>
        this.BuildLineItem(platformAccountId, item)
      )
    );

    const session = this.CheckoutSessionObject(
      platformAccountId,
      validatedInput as CreateCheckoutSessionInput,
      lineItems,
      options?.payment_link ?? null
    );

    if (session.mode === 'payment' && this.paymentIntentModule) {
      const paymentIntent = await this.paymentIntentModule.CreatePaymentIntent(
        platformAccountId,
        this.BuildPaymentIntentCreateInput(session, validatedInput)
      );
      session.payment_intent = paymentIntent.id;
    }

    await this.db.Set('CheckoutSessions', session.id, session);

    return session;
  }

  CheckoutSessionObject(
    platformAccountId: string,
    input: CreateCheckoutSessionInput,
    lineItems: CheckoutSessionLineItem[],
    paymentLink: string | null = null
  ): CheckoutSessionType {
    const id = GenerateId('cs_z', 24);
    const livemode = GetAppConfig().livemode;
    const urlSlug = GenerateUrlSlug(livemode);
    const uiMode = input.ui_mode ?? 'hosted_page';
    const isEmbedded = uiMode === 'embedded_page' || uiMode === 'elements';
    const totals = this.ComputeTotals(lineItems);
    const isSetupMode = input.mode === 'setup';

    const session: CheckoutSessionType = {
      id,
      object: 'checkout.session',
      adaptive_pricing: input.adaptive_pricing
        ? { enabled: input.adaptive_pricing.enabled ?? false }
        : null,
      after_expiration: input.after_expiration
        ? {
            recovery: {
              allow_promotion_codes:
                input.after_expiration.recovery.allow_promotion_codes ?? false,
              enabled: input.after_expiration.recovery.enabled,
              expires_at: null,
              url: null,
            },
          }
        : null,
      allow_promotion_codes: input.allow_promotion_codes ?? null,
      amount_subtotal: isSetupMode ? null : totals.amount_subtotal,
      amount_total: isSetupMode ? null : totals.amount_total,
      automatic_tax: {
        enabled: input.automatic_tax?.enabled ?? false,
        liability: input.automatic_tax?.liability
          ? {
              account: input.automatic_tax.liability.account ?? null,
              type: input.automatic_tax.liability.type,
            }
          : null,
        provider: input.automatic_tax?.enabled ? 'zoneless' : null,
        status: null,
      },
      billing_address_collection: input.billing_address_collection ?? null,
      branding_settings: input.branding_settings
        ? {
            background_color: input.branding_settings.background_color ?? '',
            border_style: input.branding_settings.border_style ?? 'rounded',
            button_color: input.branding_settings.button_color ?? '',
            display_name: input.branding_settings.display_name ?? '',
            font_family: input.branding_settings.font_family ?? '',
            icon: this.ToBrandingImage(input.branding_settings.icon),
            logo: this.ToBrandingImage(input.branding_settings.logo),
          }
        : null,
      cancel_url: input.cancel_url ?? null,
      client_reference_id: input.client_reference_id ?? null,
      client_secret: isEmbedded ? GenerateId(`${id}_secret`, 26) : null,
      collected_information: null,
      consent: null,
      consent_collection: input.consent_collection
        ? {
            payment_method_reuse_agreement:
              input.consent_collection.payment_method_reuse_agreement ?? null,
            promotions: input.consent_collection.promotions ?? null,
            terms_of_service: input.consent_collection.terms_of_service ?? null,
          }
        : null,
      created: Now(),
      currency: input.currency ?? lineItems[0]?.currency ?? null,
      currency_conversion: null,
      custom_fields: this.ToCustomFields(input.custom_fields),
      custom_text: {
        after_submit: input.custom_text?.after_submit ?? null,
        shipping_address: input.custom_text?.shipping_address ?? null,
        submit: input.custom_text?.submit ?? null,
        terms_of_service_acceptance:
          input.custom_text?.terms_of_service_acceptance ?? null,
      },
      customer: input.customer ?? null,
      customer_account: input.customer_account ?? null,
      customer_creation: isSetupMode
        ? null
        : input.customer_creation ?? 'if_required',
      customer_details: input.customer_email
        ? {
            address: null,
            business_name: null,
            email: input.customer_email,
            individual_name: null,
            name: null,
            phone: null,
            tax_exempt: 'none',
            tax_ids: null,
          }
        : null,
      customer_email: input.customer_email ?? null,
      discounts:
        input.discounts?.map((discount) => ({
          coupon: discount.coupon ?? null,
          promotion_code: discount.promotion_code ?? null,
        })) ?? null,
      excluded_payment_method_types:
        input.excluded_payment_method_types ?? null,
      expires_at: input.expires_at ?? Now() + DEFAULT_EXPIRY_SECONDS,
      integration_identifier: input.integration_identifier ?? null,
      invoice: null,
      invoice_creation: input.invoice_creation
        ? {
            enabled: input.invoice_creation.enabled,
            invoice_data: {
              account_tax_ids:
                input.invoice_creation.invoice_data?.account_tax_ids ?? null,
              custom_fields:
                input.invoice_creation.invoice_data?.custom_fields ?? null,
              description:
                input.invoice_creation.invoice_data?.description ?? null,
              footer: input.invoice_creation.invoice_data?.footer ?? null,
              issuer: input.invoice_creation.invoice_data?.issuer
                ? {
                    account:
                      input.invoice_creation.invoice_data.issuer.account ??
                      null,
                    type: input.invoice_creation.invoice_data.issuer.type,
                  }
                : null,
              metadata: input.invoice_creation.invoice_data?.metadata ?? null,
              rendering_options: input.invoice_creation.invoice_data
                ?.rendering_options
                ? {
                    amount_tax_display:
                      input.invoice_creation.invoice_data.rendering_options
                        .amount_tax_display ?? null,
                    template:
                      input.invoice_creation.invoice_data.rendering_options
                        .template ?? null,
                  }
                : null,
            },
          }
        : null,
      line_items: {
        object: 'list',
        data: lineItems,
        has_more: false,
        url: `/v1/checkout/sessions/${id}/line_items`,
      },
      livemode,
      locale: input.locale ?? null,
      managed_payments: input.managed_payments
        ? { enabled: input.managed_payments.enabled ?? false }
        : null,
      metadata: input.metadata ?? {},
      mode: input.mode,
      name_collection: input.name_collection
        ? {
            business: input.name_collection.business
              ? {
                  enabled: input.name_collection.business.enabled,
                  optional: input.name_collection.business.optional ?? false,
                }
              : null,
            individual: input.name_collection.individual
              ? {
                  enabled: input.name_collection.individual.enabled,
                  optional: input.name_collection.individual.optional ?? false,
                }
              : null,
          }
        : null,
      optional_items: input.optional_items ?? null,
      origin_context: input.origin_context ?? null,
      payment_intent: null,
      payment_link: paymentLink,
      payment_method_collection: input.payment_method_collection ?? 'always',
      payment_method_configuration_details: null,
      payment_method_options: input.payment_method_options ?? {},
      payment_method_types: input.payment_method_types ?? ['crypto'],
      payment_status: isSetupMode ? 'no_payment_required' : 'unpaid',
      permissions: input.permissions
        ? {
            update_shipping_details:
              input.permissions.update_shipping_details ?? null,
          }
        : null,
      phone_number_collection: {
        enabled: input.phone_number_collection?.enabled ?? false,
      },
      presentment_details: null,
      recovered_from: null,
      redirect_on_completion: isEmbedded
        ? input.redirect_on_completion ?? 'always'
        : null,
      return_url: input.return_url ?? null,
      saved_payment_method_options: input.saved_payment_method_options
        ? {
            allow_redisplay_filters:
              input.saved_payment_method_options.allow_redisplay_filters ??
              null,
            payment_method_remove:
              input.saved_payment_method_options.payment_method_remove ?? null,
            payment_method_save:
              input.saved_payment_method_options.payment_method_save ?? null,
          }
        : null,
      setup_intent: null,
      shipping_address_collection: input.shipping_address_collection ?? null,
      shipping_cost: null,
      shipping_options: this.ToShippingOptions(input.shipping_options),
      status: 'open',
      submit_type: input.submit_type ?? null,
      subscription: null,
      success_url: input.success_url ?? null,
      tax_id_collection: input.tax_id_collection
        ? {
            enabled: input.tax_id_collection.enabled,
            required: input.tax_id_collection.required ?? 'never',
          }
        : null,
      total_details: isSetupMode
        ? null
        : {
            amount_discount: 0,
            amount_shipping: 0,
            amount_tax: 0,
            breakdown: null,
          },
      ui_mode: uiMode,
      url:
        uiMode === 'hosted_page'
          ? `${GetAppConfig().checkoutUrl}/c/${urlSlug}`
          : null,
      url_slug: urlSlug,
      wallet_options: input.wallet_options
        ? {
            link: input.wallet_options.link
              ? { display: input.wallet_options.link.display ?? 'auto' }
              : null,
          }
        : null,
      platform_account: platformAccountId,
    };
    return session;
  }

  /**
   * Get a checkout session by its ID.
   *
   * @param id - The checkout session ID
   * @returns The CheckoutSession if found, null otherwise
   */
  async GetCheckoutSession(id: string): Promise<CheckoutSessionType | null> {
    return this.db.Get<CheckoutSessionType>('CheckoutSessions', id);
  }

  /**
   * Look up a checkout session by its opaque public URL slug.
   */
  async GetCheckoutSessionByUrlSlug(
    urlSlug: string
  ): Promise<CheckoutSessionType | null> {
    const sessions = await this.db.FindCustom<CheckoutSessionType>(
      'CheckoutSessions',
      'url_slug',
      '==',
      urlSlug
    );
    return sessions?.[0] ?? null;
  }

  /**
   * Update a checkout session. Only sessions with an `open` status can be
   * updated. Line items are replaced as a whole: retain by `id`, update by
   * `id` + fields, add with `price`/`price_data`, and remove by omission.
   *
   * @param id - The checkout session ID
   * @param input - The fields to update
   * @returns The updated CheckoutSession
   */
  async UpdateCheckoutSession(
    id: string,
    input: UpdateCheckoutSessionInput
  ): Promise<CheckoutSessionType> {
    const validatedUpdate = ValidateUpdate(UpdateCheckoutSessionSchema, input);

    const previousSession = await this.GetCheckoutSession(id);
    if (!previousSession) {
      throw new AppError(
        ERRORS.CHECKOUT_SESSION_NOT_FOUND.message,
        ERRORS.CHECKOUT_SESSION_NOT_FOUND.status,
        ERRORS.CHECKOUT_SESSION_NOT_FOUND.type
      );
    }

    if (previousSession.status !== 'open') {
      throw new AppError(
        'Only Checkout Sessions with an `open` status can be updated',
        ERRORS.INVALID_REQUEST.status,
        ERRORS.INVALID_REQUEST.type
      );
    }

    const updatePayload: Partial<CheckoutSessionType> = {};

    if (validatedUpdate.metadata !== undefined) {
      updatePayload.metadata = validatedUpdate.metadata;
    }

    if (validatedUpdate.shipping_options !== undefined) {
      updatePayload.shipping_options = this.ToShippingOptions(
        validatedUpdate.shipping_options
      );
    }

    if (validatedUpdate.collected_information !== undefined) {
      updatePayload.collected_information = {
        business_name:
          previousSession.collected_information?.business_name ?? null,
        individual_name:
          previousSession.collected_information?.individual_name ?? null,
        shipping_details: validatedUpdate.collected_information.shipping_details
          ? {
              address: {
                city:
                  validatedUpdate.collected_information.shipping_details.address
                    .city ?? null,
                country:
                  validatedUpdate.collected_information.shipping_details.address
                    .country,
                line1:
                  validatedUpdate.collected_information.shipping_details.address
                    .line1,
                line2:
                  validatedUpdate.collected_information.shipping_details.address
                    .line2 ?? null,
                postal_code:
                  validatedUpdate.collected_information.shipping_details.address
                    .postal_code ?? null,
                state:
                  validatedUpdate.collected_information.shipping_details.address
                    .state ?? null,
              },
              name: validatedUpdate.collected_information.shipping_details.name,
            }
          : previousSession.collected_information?.shipping_details ?? null,
      };
    }

    if (validatedUpdate.line_items !== undefined) {
      const lineItems = await this.BuildUpdatedLineItems(
        previousSession,
        validatedUpdate.line_items
      );
      const totals = this.ComputeTotals(lineItems);
      updatePayload.line_items = {
        ...previousSession.line_items,
        object: 'list',
        data: lineItems,
        has_more: false,
        url: `/v1/checkout/sessions/${id}/line_items`,
      };
      updatePayload.amount_subtotal = totals.amount_subtotal;
      updatePayload.amount_total = totals.amount_total;

      // Keep the linked PaymentIntent amount in sync (Stripe does the same).
      if (
        previousSession.payment_intent &&
        this.paymentIntentModule &&
        totals.amount_total !== previousSession.amount_total
      ) {
        await this.paymentIntentModule.UpdatePaymentIntent(
          previousSession.payment_intent,
          { amount: totals.amount_total }
        );
      }
    }

    await this.db.Update<CheckoutSessionType>(
      'CheckoutSessions',
      id,
      updatePayload
    );

    const session = await this.GetCheckoutSession(id);
    if (!session) {
      throw new AppError(
        ERRORS.CHECKOUT_SESSION_NOT_FOUND.message,
        ERRORS.CHECKOUT_SESSION_NOT_FOUND.status,
        ERRORS.CHECKOUT_SESSION_NOT_FOUND.type
      );
    }

    return session;
  }

  /**
   * Expire a checkout session. Only sessions with an `open` status can be
   * expired. Cancels any linked PaymentIntent (emitting
   * `payment_intent.canceled`) and emits `checkout.session.expired` if
   * EventService is configured.
   *
   * @param id - The checkout session ID
   * @returns The expired CheckoutSession
   */
  async ExpireCheckoutSession(id: string): Promise<CheckoutSessionType> {
    const previousSession = await this.GetCheckoutSession(id);
    if (!previousSession) {
      throw new AppError(
        ERRORS.CHECKOUT_SESSION_NOT_FOUND.message,
        ERRORS.CHECKOUT_SESSION_NOT_FOUND.status,
        ERRORS.CHECKOUT_SESSION_NOT_FOUND.type
      );
    }

    if (previousSession.status !== 'open') {
      throw new AppError(
        'Only Checkout Sessions with an `open` status can be expired',
        ERRORS.INVALID_REQUEST.status,
        ERRORS.INVALID_REQUEST.type
      );
    }

    if (previousSession.payment_intent && this.paymentIntentModule) {
      await this.paymentIntentModule.CancelPaymentIntent(
        previousSession.payment_intent,
        { cancellation_reason: 'abandoned' }
      );
    }

    // The session url is only present while the session is active.
    await this.db.Update<CheckoutSessionType>('CheckoutSessions', id, {
      status: 'expired',
      url: null,
    });

    const session = await this.GetCheckoutSession(id);
    if (!session) {
      throw new AppError(
        ERRORS.CHECKOUT_SESSION_NOT_FOUND.message,
        ERRORS.CHECKOUT_SESSION_NOT_FOUND.status,
        ERRORS.CHECKOUT_SESSION_NOT_FOUND.type
      );
    }

    if (this.eventService) {
      await this.eventService.Emit(
        'checkout.session.expired',
        session.platform_account,
        session
      );
    }

    return session;
  }

  /**
   * Complete a checkout session after a verified payment. Only sessions with
   * an `open` status can be completed. Records the on-chain payment details
   * and emits a 'checkout.session.completed' event if EventService is
   * configured.
   *
   * @param id - The checkout session ID
   * @param paymentDetails - The verified on-chain payment details
   * @returns The completed CheckoutSession
   */
  async CompleteCheckoutSession(
    id: string,
    paymentDetails: {
      transaction_signature: string;
      payer_wallet: string | null;
    }
  ): Promise<CheckoutSessionType> {
    const previousSession = await this.GetCheckoutSession(id);
    if (!previousSession) {
      throw new AppError(
        ERRORS.CHECKOUT_SESSION_NOT_FOUND.message,
        ERRORS.CHECKOUT_SESSION_NOT_FOUND.status,
        ERRORS.CHECKOUT_SESSION_NOT_FOUND.type
      );
    }

    if (previousSession.status !== 'open') {
      throw new AppError(
        'Only Checkout Sessions with an `open` status can be completed',
        ERRORS.INVALID_REQUEST.status,
        ERRORS.INVALID_REQUEST.type
      );
    }

    // The session url is only present while the session is active.
    await this.db.Update<CheckoutSessionType>('CheckoutSessions', id, {
      status: 'complete',
      payment_status: 'paid',
      url: null,
      payment_details: paymentDetails,
    });

    const session = await this.GetCheckoutSession(id);
    if (!session) {
      throw new AppError(
        ERRORS.CHECKOUT_SESSION_NOT_FOUND.message,
        ERRORS.CHECKOUT_SESSION_NOT_FOUND.status,
        ERRORS.CHECKOUT_SESSION_NOT_FOUND.type
      );
    }

    if (this.eventService) {
      await this.eventService.Emit(
        'checkout.session.completed',
        session.platform_account,
        session
      );
    }

    return session;
  }

  /**
   * Record the customer's email on an open checkout session. Collected on
   * the hosted checkout page before payment.
   *
   * @param id - The checkout session ID
   * @param email - The customer's email address
   */
  async SetCustomerEmail(id: string, email: string): Promise<void> {
    const session = await this.GetCheckoutSession(id);
    if (!session || session.status !== 'open') return;

    await this.db.Update<CheckoutSessionType>('CheckoutSessions', id, {
      customer_email: email,
      customer_details: {
        address: session.customer_details?.address ?? null,
        business_name: session.customer_details?.business_name ?? null,
        email,
        individual_name: session.customer_details?.individual_name ?? null,
        name: session.customer_details?.name ?? null,
        phone: session.customer_details?.phone ?? null,
        tax_exempt: session.customer_details?.tax_exempt ?? 'none',
        tax_ids: session.customer_details?.tax_ids ?? null,
      },
    });
  }

  /**
   * Find the checkout session that recorded a given payment transaction
   * signature. Used to prevent the same on-chain payment from completing
   * more than one session.
   *
   * @param signature - The Solana transaction signature
   * @returns The CheckoutSession if one recorded this signature, null otherwise
   */
  async GetCheckoutSessionByTransactionSignature(
    signature: string
  ): Promise<CheckoutSessionType | null> {
    const sessions = await this.db.FindCustom<CheckoutSessionType>(
      'CheckoutSessions',
      'payment_details.transaction_signature',
      '==',
      signature
    );
    return sessions?.[0] ?? null;
  }

  /**
   * List checkout sessions
   */
  async ListCheckoutSessions(
    options: ListOptions & ListCheckoutSessionsFiltersInput
  ): Promise<ListResult<CheckoutSessionType>> {
    const {
      customer,
      customer_account,
      customer_details,
      payment_intent,
      payment_link,
      status,
      subscription,
      ...listOptions
    } = options;

    // Build filters
    const filters: Record<string, unknown> = {};
    if (customer !== undefined) filters.customer = customer;
    if (customer_account !== undefined)
      filters.customer_account = customer_account;
    if (customer_details?.email !== undefined)
      filters['customer_details.email'] = customer_details.email;
    if (payment_intent !== undefined) filters.payment_intent = payment_intent;
    if (payment_link !== undefined) filters.payment_link = payment_link;
    if (status !== undefined) filters.status = status;
    if (subscription !== undefined) filters.subscription = subscription;

    return this.listHelper.List({
      ...listOptions,
      filters: { ...listOptions.filters, ...filters },
    });
  }

  /**
   * List the line items of a checkout session with cursor-based pagination.
   * Line items are embedded on the session, so pagination is done in memory.
   *
   * @param session - The checkout session
   * @param options - Pagination options
   * @returns Paginated list of line items
   */
  ListLineItems(
    session: CheckoutSessionType,
    options: { limit?: number; startingAfter?: string; endingBefore?: string }
  ): ListResult<CheckoutSessionLineItem> {
    const { limit = 10, startingAfter, endingBefore } = options;
    const effectiveLimit = Math.min(limit, 100);
    const items = session.line_items?.data ?? [];

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
      url: `/v1/checkout/sessions/${session.id}/line_items`,
    };
  }

  /**
   * Builds a line item from create/update input, resolving `price` to an
   * existing Price or creating one from `price_data`.
   */
  private async BuildLineItem(
    platformAccountId: string,
    input: LineItemInput,
    id: string = GenerateId('li_z')
  ): Promise<CheckoutSessionLineItem> {
    const price = await this.ResolvePrice(platformAccountId, input);
    const description = await this.GetProductName(price);

    return this.LineItemObject(
      id,
      price,
      input.quantity ?? 1,
      input.metadata ?? {},
      description
    );
  }

  private LineItemObject(
    id: string,
    price: PriceType,
    quantity: number,
    metadata: Record<string, string>,
    description: string | null
  ): CheckoutSessionLineItem {
    const amount = (price.unit_amount ?? 0) * quantity;
    return {
      id,
      object: 'item',
      amount_discount: 0,
      amount_subtotal: amount,
      amount_tax: 0,
      amount_total: amount,
      currency: price.currency,
      description,
      discounts: null,
      metadata,
      price,
      quantity,
      taxes: null,
    };
  }

  /**
   * Applies update semantics for line items: entries with an `id` retain or
   * update the existing line item, entries without one are added, and
   * existing line items omitted from the input are removed.
   */
  private async BuildUpdatedLineItems(
    session: CheckoutSessionType,
    inputItems: UpdateLineItemInput[]
  ): Promise<CheckoutSessionLineItem[]> {
    const existingById = new Map(
      (session.line_items?.data ?? []).map((item) => [item.id, item])
    );

    return Promise.all(
      inputItems.map(async (input) => {
        if (!input.id) {
          return this.BuildLineItem(session.platform_account, input);
        }

        const existing = existingById.get(input.id);
        if (!existing) {
          throw new AppError(
            `No such line item on this Checkout Session: '${input.id}'`,
            ERRORS.INVALID_REQUEST.status,
            ERRORS.INVALID_REQUEST.type
          );
        }

        if (input.price || input.price_data) {
          return this.BuildLineItem(
            session.platform_account,
            { ...input, quantity: input.quantity ?? existing.quantity ?? 1 },
            existing.id
          );
        }

        return this.LineItemObject(
          existing.id,
          existing.price as PriceType,
          input.quantity ?? existing.quantity ?? 1,
          input.metadata ?? existing.metadata,
          existing.description
        );
      })
    );
  }

  /**
   * Resolves a line item's price: fetches an existing Price by id, or creates
   * one from inline `price_data`.
   */
  private async ResolvePrice(
    platformAccountId: string,
    input: { price?: string; price_data?: PriceDataInput }
  ): Promise<PriceType> {
    if (!this.priceModule) {
      throw new AppError(
        'PriceModule not configured',
        ERRORS.INVALID_REQUEST.status,
        ERRORS.INVALID_REQUEST.type
      );
    }

    if (input.price) {
      const price = await this.priceModule.GetPrice(input.price);
      if (!price || price.platform_account !== platformAccountId) {
        throw new AppError(
          ERRORS.PRICE_NOT_FOUND.message,
          ERRORS.PRICE_NOT_FOUND.status,
          ERRORS.PRICE_NOT_FOUND.type
        );
      }
      return price;
    }

    return this.priceModule.CreatePrice(
      platformAccountId,
      this.ToCreatePriceInput(input.price_data!)
    );
  }

  private ToCreatePriceInput(priceData: PriceDataInput): CreatePriceInput {
    return {
      currency: priceData.currency,
      product: priceData.product,
      product_data: priceData.product_data
        ? {
            name: priceData.product_data.name,
            metadata: priceData.product_data.metadata,
            tax_code: priceData.product_data.tax_code,
            unit_label: priceData.product_data.unit_label,
          }
        : undefined,
      recurring: priceData.recurring,
      tax_behavior: priceData.tax_behavior,
      unit_amount:
        priceData.unit_amount ?? parseInt(priceData.unit_amount_decimal!, 10),
      unit_amount_decimal: priceData.unit_amount_decimal,
    };
  }

  /** Line item descriptions default to the product name. */
  private async GetProductName(price: PriceType): Promise<string | null> {
    if (typeof price.product !== 'string') {
      return price.product?.name ?? null;
    }
    if (!this.productModule) return null;
    const product = await this.productModule.GetProduct(price.product);
    return product?.name ?? null;
  }

  private ComputeTotals(lineItems: CheckoutSessionLineItem[]): {
    amount_subtotal: number;
    amount_total: number;
  } {
    const amountSubtotal = lineItems.reduce(
      (sum, item) => sum + item.amount_subtotal,
      0
    );
    const amountTotal = lineItems.reduce(
      (sum, item) => sum + item.amount_total,
      0
    );
    return { amount_subtotal: amountSubtotal, amount_total: amountTotal };
  }

  private ToCustomFields(
    input: CreateCheckoutSessionInput['custom_fields']
  ): CheckoutSessionCustomField[] {
    return (input ?? []).map((field) => ({
      dropdown: field.dropdown
        ? {
            default_value: field.dropdown.default_value ?? null,
            options: field.dropdown.options,
            value: null,
          }
        : null,
      key: field.key,
      label: { custom: field.label.custom, type: 'custom' },
      numeric: field.numeric
        ? {
            default_value: field.numeric.default_value ?? null,
            maximum_length: field.numeric.maximum_length ?? null,
            minimum_length: field.numeric.minimum_length ?? null,
            value: null,
          }
        : null,
      optional: field.optional ?? false,
      text: field.text
        ? {
            default_value: field.text.default_value ?? null,
            maximum_length: field.text.maximum_length ?? null,
            minimum_length: field.text.minimum_length ?? null,
            value: null,
          }
        : null,
      type: field.type,
    }));
  }

  /**
   * Maps shipping option inputs to the stored shape. Inline
   * `shipping_rate_data` gets a generated shipping rate id and its fixed
   * amount; referenced rates carry an amount of 0 until a ShippingRate
   * module exists to resolve them.
   */
  private ToShippingOptions(
    input: ShippingOptionInput[] | undefined
  ): CheckoutSessionType['shipping_options'] {
    return (input ?? []).map((option) => ({
      shipping_amount: option.shipping_rate_data?.fixed_amount?.amount ?? 0,
      shipping_rate: option.shipping_rate ?? GenerateId('shr_z'),
    }));
  }

  private ToBrandingImage(
    input: { type: 'file' | 'url'; file?: string; url?: string } | undefined
  ): { file: string | null; type: 'file' | 'url'; url: string | null } | null {
    if (!input) return null;
    return {
      file: input.file ?? null,
      type: input.type,
      url: input.url ?? null,
    };
  }

  /**
   * Maps Checkout Session fields (plus optional `payment_intent_data`) into
   * the create payload for the linked PaymentIntent.
   */
  private BuildPaymentIntentCreateInput(
    session: CheckoutSessionType,
    input: CreateCheckoutSessionInput
  ): CreatePaymentIntentInput {
    const paymentIntentData: PaymentIntentDataInput =
      input.payment_intent_data ?? {};

    return {
      amount: session.amount_total!,
      currency: session.currency ?? 'usdc',
      customer: session.customer ?? undefined,
      customer_account: session.customer_account ?? undefined,
      payment_method_types: ['crypto'],
      receipt_email:
        paymentIntentData.receipt_email ?? session.customer_email ?? undefined,
      application_fee_amount: paymentIntentData.application_fee_amount,
      capture_method: paymentIntentData.capture_method,
      description: paymentIntentData.description,
      metadata: paymentIntentData.metadata,
      on_behalf_of: paymentIntentData.on_behalf_of,
      setup_future_usage: paymentIntentData.setup_future_usage,
      shipping: paymentIntentData.shipping,
      statement_descriptor: paymentIntentData.statement_descriptor,
      statement_descriptor_suffix:
        paymentIntentData.statement_descriptor_suffix,
      transfer_data: paymentIntentData.transfer_data,
      transfer_group: paymentIntentData.transfer_group,
    };
  }
}
