/**
 * @fileOverview Methods for Payment Links
 *
 * @module PaymentLink
 */

import { Database } from './Database';
import { EventService } from './EventService';
import { ExtractChangedFields } from './Event';
import { GenerateId, GenerateUrlSlug } from '../utils/IdGenerator';
import {
  CheckoutSessionLineItem,
  PaymentLink as PaymentLinkType,
  Price as PriceType,
} from '@zoneless/shared-types';
import { ValidateUpdate } from './Util';
import type { PriceModule } from './Price';
import type { ProductModule } from './Product';
import type { CheckoutSessionModule } from './CheckoutSession';
import {
  CreatePaymentLinkSchema,
  CreatePaymentLinkInput,
  UpdatePaymentLinkSchema,
  UpdatePaymentLinkInput,
  ListPaymentLinksFiltersInput,
  CreatePriceInput,
  CreateCheckoutSessionInput,
} from '@zoneless/shared-schemas';
import { ListHelper, ListOptions, ListResult } from '../utils/ListHelper';
import { Now } from '../utils/Timestamp';
import { GetAppConfig } from './AppConfig';
import { AppError } from '../utils/AppError';
import { ERRORS } from '../utils/Errors';

type LineItemInput = NonNullable<CreatePaymentLinkInput['line_items']>[number];
type UpdateLineItemInput = NonNullable<
  UpdatePaymentLinkInput['line_items']
>[number];
type PriceDataInput = NonNullable<LineItemInput['price_data']>;

export class PaymentLinkModule {
  private readonly db: Database;
  private readonly eventService: EventService | null;
  private readonly listHelper: ListHelper<PaymentLinkType>;
  private readonly priceModule: PriceModule | null;
  private readonly productModule: ProductModule | null;
  private readonly checkoutSessionModule: CheckoutSessionModule | null;

  constructor(
    db: Database,
    eventService?: EventService,
    priceModule?: PriceModule,
    productModule?: ProductModule,
    checkoutSessionModule?: CheckoutSessionModule
  ) {
    this.db = db;
    this.eventService = eventService || null;
    this.priceModule = priceModule || null;
    this.productModule = productModule || null;
    this.checkoutSessionModule = checkoutSessionModule || null;
    this.listHelper = new ListHelper<PaymentLinkType>(db, {
      collection: 'PaymentLinks',
      orderByField: 'created',
      orderDirection: 'desc',
      urlPath: '/v1/payment_links',
      accountField: 'platform_account',
    });
  }

  /**
   * Create a new payment link.
   */
  async CreatePaymentLink(
    platformAccountId: string,
    input: CreatePaymentLinkInput
  ): Promise<PaymentLinkType> {
    const validatedInput = ValidateUpdate(CreatePaymentLinkSchema, input);

    const lineItems = await Promise.all(
      validatedInput.line_items.map((item) =>
        this.BuildLineItem(platformAccountId, item)
      )
    );

    const paymentLink = this.PaymentLinkObject(
      platformAccountId,
      validatedInput,
      lineItems
    );

    await this.db.Set('PaymentLinks', paymentLink.id, paymentLink);

    if (this.eventService) {
      await this.eventService.Emit(
        'payment_link.created',
        paymentLink.platform_account,
        paymentLink
      );
    }

    return paymentLink;
  }

  PaymentLinkObject(
    platformAccountId: string,
    input: CreatePaymentLinkInput,
    lineItems: CheckoutSessionLineItem[]
  ): PaymentLinkType {
    const id = GenerateId('plink_z');
    const livemode = GetAppConfig().livemode;
    const urlSlug = GenerateUrlSlug(livemode);
    const currency = input.currency ?? lineItems[0]?.currency ?? 'usdc';

    return {
      id,
      object: 'payment_link',
      active: true,
      created: Now(),
      after_completion: input.after_completion
        ? {
            type: input.after_completion.type,
            hosted_confirmation: input.after_completion.hosted_confirmation
              ? {
                  custom_message:
                    input.after_completion.hosted_confirmation.custom_message ??
                    null,
                }
              : input.after_completion.type === 'hosted_confirmation'
              ? { custom_message: null }
              : null,
            redirect: input.after_completion.redirect
              ? { url: input.after_completion.redirect.url }
              : null,
          }
        : {
            type: 'hosted_confirmation',
            hosted_confirmation: { custom_message: null },
            redirect: null,
          },
      allow_promotion_codes: input.allow_promotion_codes ?? false,
      application: null,
      application_fee_amount: input.application_fee_amount ?? null,
      application_fee_percent: input.application_fee_percent ?? null,
      automatic_tax: {
        enabled: input.automatic_tax?.enabled ?? false,
        liability: input.automatic_tax?.liability
          ? {
              type: input.automatic_tax.liability.type,
              account: input.automatic_tax.liability.account ?? null,
            }
          : null,
      },
      billing_address_collection: input.billing_address_collection ?? 'auto',
      consent_collection: input.consent_collection
        ? {
            payment_method_reuse_agreement: input.consent_collection
              .payment_method_reuse_agreement
              ? {
                  position:
                    input.consent_collection.payment_method_reuse_agreement
                      .position,
                }
              : null,
            promotions: input.consent_collection.promotions ?? null,
            terms_of_service: input.consent_collection.terms_of_service ?? null,
          }
        : null,
      currency,
      custom_fields: (input.custom_fields ?? []).map((field) => ({
        dropdown: field.dropdown
          ? {
              default_value: field.dropdown.default_value ?? null,
              options: field.dropdown.options,
            }
          : null,
        key: field.key,
        label: { custom: field.label.custom, type: 'custom' as const },
        numeric: field.numeric
          ? {
              default_value: field.numeric.default_value ?? null,
              maximum_length: field.numeric.maximum_length ?? null,
              minimum_length: field.numeric.minimum_length ?? null,
            }
          : null,
        optional: field.optional ?? false,
        text: field.text
          ? {
              default_value: field.text.default_value ?? null,
              maximum_length: field.text.maximum_length ?? null,
              minimum_length: field.text.minimum_length ?? null,
            }
          : null,
        type: field.type,
      })),
      custom_text: {
        after_submit: input.custom_text?.after_submit
          ? { message: input.custom_text.after_submit.message }
          : null,
        shipping_address: input.custom_text?.shipping_address
          ? { message: input.custom_text.shipping_address.message }
          : null,
        submit: input.custom_text?.submit
          ? { message: input.custom_text.submit.message }
          : null,
        terms_of_service_acceptance: input.custom_text
          ?.terms_of_service_acceptance
          ? { message: input.custom_text.terms_of_service_acceptance.message }
          : null,
      },
      customer_creation: input.customer_creation ?? 'if_required',
      inactive_message: input.inactive_message ?? null,
      invoice_creation: input.invoice_creation
        ? {
            enabled: input.invoice_creation.enabled,
            invoice_data: input.invoice_creation.invoice_data
              ? {
                  account_tax_ids:
                    input.invoice_creation.invoice_data.account_tax_ids ?? null,
                  custom_fields:
                    input.invoice_creation.invoice_data.custom_fields ?? null,
                  description:
                    input.invoice_creation.invoice_data.description ?? null,
                  footer: input.invoice_creation.invoice_data.footer ?? null,
                  issuer: input.invoice_creation.invoice_data.issuer
                    ? {
                        type: input.invoice_creation.invoice_data.issuer.type,
                        account:
                          input.invoice_creation.invoice_data.issuer.account ??
                          null,
                      }
                    : null,
                  metadata: input.invoice_creation.invoice_data.metadata ?? {},
                  rendering_options: input.invoice_creation.invoice_data
                    .rendering_options
                    ? {
                        amount_tax_display:
                          input.invoice_creation.invoice_data.rendering_options
                            .amount_tax_display ?? null,
                        template:
                          input.invoice_creation.invoice_data.rendering_options
                            .template ?? null,
                      }
                    : null,
                }
              : null,
          }
        : {
            enabled: false,
            invoice_data: {
              account_tax_ids: null,
              custom_fields: null,
              description: null,
              footer: null,
              issuer: null,
              metadata: {},
              rendering_options: null,
            },
          },
      line_items: {
        object: 'list',
        data: lineItems,
        has_more: false,
        url: `/v1/payment_links/${id}/line_items`,
      },
      livemode,
      managed_payments: input.managed_payments
        ? { enabled: input.managed_payments.enabled ?? false }
        : null,
      metadata: input.metadata ?? {},
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
      on_behalf_of: input.on_behalf_of ?? null,
      optional_items: input.optional_items ?? null,
      payment_intent_data: input.payment_intent_data
        ? {
            capture_method: input.payment_intent_data.capture_method ?? null,
            description: input.payment_intent_data.description ?? null,
            metadata: input.payment_intent_data.metadata ?? {},
            setup_future_usage:
              input.payment_intent_data.setup_future_usage ?? null,
            statement_descriptor:
              input.payment_intent_data.statement_descriptor ?? null,
            statement_descriptor_suffix:
              input.payment_intent_data.statement_descriptor_suffix ?? null,
            transfer_group: input.payment_intent_data.transfer_group ?? null,
          }
        : null,
      payment_method_collection: input.payment_method_collection ?? 'always',
      payment_method_options: input.payment_method_options
        ? {
            card: input.payment_method_options.card
              ? {
                  restrictions: input.payment_method_options.card.restrictions
                    ? {
                        brands_blocked:
                          input.payment_method_options.card.restrictions
                            .brands_blocked ?? [],
                      }
                    : null,
                }
              : null,
          }
        : null,
      payment_method_types: input.payment_method_types ?? null,
      phone_number_collection: {
        enabled: input.phone_number_collection?.enabled ?? false,
      },
      restrictions: input.restrictions
        ? {
            completed_sessions: {
              count: 0,
              limit: input.restrictions.completed_sessions.limit,
            },
          }
        : null,
      shipping_address_collection: input.shipping_address_collection ?? null,
      shipping_options: (input.shipping_options ?? []).map((option) => ({
        shipping_amount: 0,
        shipping_rate: option.shipping_rate ?? '',
      })),
      submit_type: input.submit_type ?? 'auto',
      subscription_data: input.subscription_data
        ? {
            description: input.subscription_data.description ?? null,
            invoice_settings: {
              issuer: {
                type:
                  input.subscription_data.invoice_settings?.issuer?.type ??
                  'self',
                account:
                  input.subscription_data.invoice_settings?.issuer?.account ??
                  null,
              },
            },
            metadata: input.subscription_data.metadata ?? {},
            trial_period_days:
              input.subscription_data.trial_period_days ?? null,
            trial_settings: input.subscription_data.trial_settings
              ? {
                  end_behavior: {
                    missing_payment_method:
                      input.subscription_data.trial_settings.end_behavior
                        .missing_payment_method,
                  },
                }
              : null,
          }
        : null,
      tax_id_collection: {
        enabled: input.tax_id_collection?.enabled ?? false,
      },
      transfer_data: input.transfer_data
        ? {
            amount: input.transfer_data.amount ?? null,
            destination: input.transfer_data.destination,
          }
        : null,
      url: `${GetAppConfig().paymentLinkUrl}/b/${urlSlug}`,
      url_slug: urlSlug,
      platform_account: platformAccountId,
    };
  }

  async GetPaymentLink(id: string): Promise<PaymentLinkType | null> {
    return this.db.Get<PaymentLinkType>('PaymentLinks', id);
  }

  /**
   * Look up a payment link by its opaque public URL slug.
   */
  async GetPaymentLinkByUrlSlug(
    urlSlug: string
  ): Promise<PaymentLinkType | null> {
    const links = await this.db.FindCustom<PaymentLinkType>(
      'PaymentLinks',
      'url_slug',
      '==',
      urlSlug
    );
    return links?.[0] ?? null;
  }

  async UpdatePaymentLink(
    id: string,
    input: UpdatePaymentLinkInput
  ): Promise<PaymentLinkType> {
    const validatedUpdate = ValidateUpdate(UpdatePaymentLinkSchema, input);
    const previous = this.eventService ? await this.GetPaymentLink(id) : null;
    if (!previous && this.eventService) {
      throw new AppError(
        ERRORS.PAYMENT_LINK_NOT_FOUND.message,
        ERRORS.PAYMENT_LINK_NOT_FOUND.status,
        ERRORS.PAYMENT_LINK_NOT_FOUND.type
      );
    }

    const existing = previous ?? (await this.GetPaymentLink(id));
    if (!existing) {
      throw new AppError(
        ERRORS.PAYMENT_LINK_NOT_FOUND.message,
        ERRORS.PAYMENT_LINK_NOT_FOUND.status,
        ERRORS.PAYMENT_LINK_NOT_FOUND.type
      );
    }

    const updatePayload: Partial<PaymentLinkType> = {};

    if (validatedUpdate.active !== undefined) {
      updatePayload.active = validatedUpdate.active;
    }
    if (validatedUpdate.after_completion !== undefined) {
      updatePayload.after_completion = {
        type: validatedUpdate.after_completion.type,
        hosted_confirmation: validatedUpdate.after_completion
          .hosted_confirmation
          ? {
              custom_message:
                validatedUpdate.after_completion.hosted_confirmation
                  .custom_message ?? null,
            }
          : validatedUpdate.after_completion.type === 'hosted_confirmation'
          ? { custom_message: null }
          : null,
        redirect: validatedUpdate.after_completion.redirect
          ? { url: validatedUpdate.after_completion.redirect.url }
          : null,
      };
    }
    if (validatedUpdate.allow_promotion_codes !== undefined) {
      updatePayload.allow_promotion_codes =
        validatedUpdate.allow_promotion_codes;
    }
    if (validatedUpdate.automatic_tax !== undefined) {
      updatePayload.automatic_tax = {
        enabled: validatedUpdate.automatic_tax.enabled,
        liability: validatedUpdate.automatic_tax.liability
          ? {
              type: validatedUpdate.automatic_tax.liability.type,
              account: validatedUpdate.automatic_tax.liability.account ?? null,
            }
          : null,
      };
    }
    if (validatedUpdate.billing_address_collection !== undefined) {
      updatePayload.billing_address_collection =
        validatedUpdate.billing_address_collection;
    }
    if (validatedUpdate.custom_fields !== undefined) {
      updatePayload.custom_fields = validatedUpdate.custom_fields.map(
        (field) => ({
          dropdown: field.dropdown
            ? {
                default_value: field.dropdown.default_value ?? null,
                options: field.dropdown.options,
              }
            : null,
          key: field.key,
          label: { custom: field.label.custom, type: 'custom' as const },
          numeric: field.numeric
            ? {
                default_value: field.numeric.default_value ?? null,
                maximum_length: field.numeric.maximum_length ?? null,
                minimum_length: field.numeric.minimum_length ?? null,
              }
            : null,
          optional: field.optional ?? false,
          text: field.text
            ? {
                default_value: field.text.default_value ?? null,
                maximum_length: field.text.maximum_length ?? null,
                minimum_length: field.text.minimum_length ?? null,
              }
            : null,
          type: field.type,
        })
      );
    }
    if (validatedUpdate.custom_text !== undefined) {
      updatePayload.custom_text = {
        after_submit: validatedUpdate.custom_text.after_submit
          ? { message: validatedUpdate.custom_text.after_submit.message }
          : null,
        shipping_address: validatedUpdate.custom_text.shipping_address
          ? { message: validatedUpdate.custom_text.shipping_address.message }
          : null,
        submit: validatedUpdate.custom_text.submit
          ? { message: validatedUpdate.custom_text.submit.message }
          : null,
        terms_of_service_acceptance: validatedUpdate.custom_text
          .terms_of_service_acceptance
          ? {
              message:
                validatedUpdate.custom_text.terms_of_service_acceptance.message,
            }
          : null,
      };
    }
    if (validatedUpdate.customer_creation !== undefined) {
      updatePayload.customer_creation = validatedUpdate.customer_creation;
    }
    if (validatedUpdate.inactive_message !== undefined) {
      updatePayload.inactive_message = validatedUpdate.inactive_message;
    }
    if (validatedUpdate.invoice_creation !== undefined) {
      updatePayload.invoice_creation = {
        enabled: validatedUpdate.invoice_creation.enabled,
        invoice_data: validatedUpdate.invoice_creation.invoice_data
          ? {
              account_tax_ids:
                validatedUpdate.invoice_creation.invoice_data.account_tax_ids ??
                null,
              custom_fields:
                validatedUpdate.invoice_creation.invoice_data.custom_fields ??
                null,
              description:
                validatedUpdate.invoice_creation.invoice_data.description ??
                null,
              footer:
                validatedUpdate.invoice_creation.invoice_data.footer ?? null,
              issuer: validatedUpdate.invoice_creation.invoice_data.issuer
                ? {
                    type: validatedUpdate.invoice_creation.invoice_data.issuer
                      .type,
                    account:
                      validatedUpdate.invoice_creation.invoice_data.issuer
                        .account ?? null,
                  }
                : null,
              metadata:
                validatedUpdate.invoice_creation.invoice_data.metadata ?? {},
              rendering_options: validatedUpdate.invoice_creation.invoice_data
                .rendering_options
                ? {
                    amount_tax_display:
                      validatedUpdate.invoice_creation.invoice_data
                        .rendering_options.amount_tax_display ?? null,
                    template:
                      validatedUpdate.invoice_creation.invoice_data
                        .rendering_options.template ?? null,
                  }
                : null,
            }
          : null,
      };
    }
    if (validatedUpdate.line_items !== undefined) {
      updatePayload.line_items = {
        object: 'list',
        data: await this.BuildUpdatedLineItems(
          existing,
          validatedUpdate.line_items
        ),
        has_more: false,
        url: `/v1/payment_links/${id}/line_items`,
      };
    }
    if (validatedUpdate.metadata !== undefined) {
      updatePayload.metadata = validatedUpdate.metadata;
    }
    if (validatedUpdate.name_collection !== undefined) {
      updatePayload.name_collection = {
        business: validatedUpdate.name_collection.business
          ? {
              enabled: validatedUpdate.name_collection.business.enabled,
              optional:
                validatedUpdate.name_collection.business.optional ?? false,
            }
          : null,
        individual: validatedUpdate.name_collection.individual
          ? {
              enabled: validatedUpdate.name_collection.individual.enabled,
              optional:
                validatedUpdate.name_collection.individual.optional ?? false,
            }
          : null,
      };
    }
    if (validatedUpdate.optional_items !== undefined) {
      updatePayload.optional_items = validatedUpdate.optional_items;
    }
    if (validatedUpdate.payment_intent_data !== undefined) {
      updatePayload.payment_intent_data = {
        capture_method: existing.payment_intent_data?.capture_method ?? null,
        description: validatedUpdate.payment_intent_data.description ?? null,
        metadata: validatedUpdate.payment_intent_data.metadata ?? {},
        setup_future_usage:
          existing.payment_intent_data?.setup_future_usage ?? null,
        statement_descriptor:
          validatedUpdate.payment_intent_data.statement_descriptor ?? null,
        statement_descriptor_suffix:
          validatedUpdate.payment_intent_data.statement_descriptor_suffix ??
          null,
        transfer_group:
          validatedUpdate.payment_intent_data.transfer_group ?? null,
      };
    }
    if (validatedUpdate.payment_method_collection !== undefined) {
      updatePayload.payment_method_collection =
        validatedUpdate.payment_method_collection;
    }
    if (validatedUpdate.payment_method_options !== undefined) {
      updatePayload.payment_method_options = {
        card: validatedUpdate.payment_method_options.card
          ? {
              restrictions: validatedUpdate.payment_method_options.card
                .restrictions
                ? {
                    brands_blocked:
                      validatedUpdate.payment_method_options.card.restrictions
                        .brands_blocked ?? [],
                  }
                : null,
            }
          : null,
      };
    }
    if (validatedUpdate.payment_method_types !== undefined) {
      updatePayload.payment_method_types = validatedUpdate.payment_method_types;
    }
    if (validatedUpdate.phone_number_collection !== undefined) {
      updatePayload.phone_number_collection = {
        enabled: validatedUpdate.phone_number_collection.enabled,
      };
    }
    if (validatedUpdate.restrictions !== undefined) {
      updatePayload.restrictions = {
        completed_sessions: {
          count: existing.restrictions?.completed_sessions.count ?? 0,
          limit: validatedUpdate.restrictions.completed_sessions.limit,
        },
      };
    }
    if (validatedUpdate.shipping_address_collection !== undefined) {
      updatePayload.shipping_address_collection =
        validatedUpdate.shipping_address_collection;
    }
    if (validatedUpdate.submit_type !== undefined) {
      updatePayload.submit_type = validatedUpdate.submit_type;
    }
    if (validatedUpdate.subscription_data !== undefined) {
      updatePayload.subscription_data = {
        description: existing.subscription_data?.description ?? null,
        invoice_settings: {
          issuer: {
            type:
              validatedUpdate.subscription_data.invoice_settings?.issuer
                ?.type ??
              existing.subscription_data?.invoice_settings.issuer.type ??
              'self',
            account:
              validatedUpdate.subscription_data.invoice_settings?.issuer
                ?.account ??
              existing.subscription_data?.invoice_settings.issuer.account ??
              null,
          },
        },
        metadata: validatedUpdate.subscription_data.metadata ?? {},
        trial_period_days:
          validatedUpdate.subscription_data.trial_period_days ?? null,
        trial_settings: validatedUpdate.subscription_data.trial_settings
          ? {
              end_behavior: {
                missing_payment_method:
                  validatedUpdate.subscription_data.trial_settings.end_behavior
                    .missing_payment_method,
              },
            }
          : null,
      };
    }
    if (validatedUpdate.tax_id_collection !== undefined) {
      updatePayload.tax_id_collection = {
        enabled: validatedUpdate.tax_id_collection.enabled,
      };
    }

    await this.db.Update<PaymentLinkType>('PaymentLinks', id, updatePayload);

    const paymentLink = await this.GetPaymentLink(id);
    if (!paymentLink) {
      throw new Error('Payment link not found after update');
    }

    if (this.eventService && previous) {
      const previousAttributes = ExtractChangedFields(
        previous as unknown as Record<string, unknown>,
        updatePayload as Record<string, unknown>
      );
      await this.eventService.Emit(
        'payment_link.updated',
        paymentLink.platform_account,
        paymentLink,
        { previousAttributes }
      );
    }

    return paymentLink;
  }

  async ListPaymentLinks(
    options: ListOptions & ListPaymentLinksFiltersInput
  ): Promise<ListResult<PaymentLinkType>> {
    const { active, ...listOptions } = options;
    const filters: Record<string, unknown> = {};
    if (active !== undefined) filters.active = active;

    return this.listHelper.List({
      ...listOptions,
      filters: { ...listOptions.filters, ...filters },
    });
  }

  ListLineItems(
    paymentLink: PaymentLinkType,
    options: { limit?: number; startingAfter?: string; endingBefore?: string }
  ): ListResult<CheckoutSessionLineItem> {
    const { limit = 10, startingAfter, endingBefore } = options;
    const effectiveLimit = Math.min(limit, 100);
    const items = paymentLink.line_items?.data ?? [];

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
      url: `/v1/payment_links/${paymentLink.id}/line_items`,
    };
  }

  /**
   * Open a payment link: validate it is usable, create a Checkout Session from
   * the template, and return that session for hosted checkout.
   *
   * @param urlSlug - Opaque `url_slug` from the shareable URL
   */
  async OpenPaymentLink(urlSlug: string) {
    if (!this.checkoutSessionModule) {
      throw new AppError(
        'CheckoutSessionModule not configured',
        ERRORS.INVALID_REQUEST.status,
        ERRORS.INVALID_REQUEST.type
      );
    }

    const paymentLink = await this.GetPaymentLinkByUrlSlug(urlSlug);
    if (!paymentLink) {
      throw new AppError(
        ERRORS.PAYMENT_LINK_NOT_FOUND.message,
        ERRORS.PAYMENT_LINK_NOT_FOUND.status,
        ERRORS.PAYMENT_LINK_NOT_FOUND.type
      );
    }

    if (!paymentLink.active) {
      throw new AppError(
        paymentLink.inactive_message ?? ERRORS.PAYMENT_LINK_INACTIVE.message,
        ERRORS.PAYMENT_LINK_INACTIVE.status,
        ERRORS.PAYMENT_LINK_INACTIVE.type
      );
    }

    const completed = paymentLink.restrictions?.completed_sessions;
    if (completed && completed.count >= completed.limit) {
      throw new AppError(
        paymentLink.inactive_message ??
          'This payment link has reached its completion limit',
        ERRORS.PAYMENT_LINK_INACTIVE.status,
        ERRORS.PAYMENT_LINK_INACTIVE.type
      );
    }

    const sessionInput = this.ToCheckoutSessionInput(paymentLink);
    return this.checkoutSessionModule.CreateCheckoutSession(
      paymentLink.platform_account,
      sessionInput,
      { payment_link: paymentLink.id }
    );
  }

  /**
   * Increment completed_sessions.count after a linked Checkout Session completes.
   */
  async RecordCompletedSession(paymentLinkId: string): Promise<void> {
    const paymentLink = await this.GetPaymentLink(paymentLinkId);
    if (!paymentLink?.restrictions?.completed_sessions) return;

    await this.db.Update<PaymentLinkType>('PaymentLinks', paymentLinkId, {
      restrictions: {
        completed_sessions: {
          count: paymentLink.restrictions.completed_sessions.count + 1,
          limit: paymentLink.restrictions.completed_sessions.limit,
        },
      },
    });
  }

  private ToCheckoutSessionInput(
    paymentLink: PaymentLinkType
  ): CreateCheckoutSessionInput {
    const lineItems = (paymentLink.line_items?.data ?? []).map((item) => {
      const priceId =
        typeof item.price === 'string' ? item.price : item.price?.id;
      if (!priceId) {
        throw new AppError(
          'Payment link line item is missing a price',
          ERRORS.INVALID_REQUEST.status,
          ERRORS.INVALID_REQUEST.type
        );
      }
      return {
        price: priceId,
        quantity: item.quantity ?? 1,
      };
    });

    const hasRecurring = (paymentLink.line_items?.data ?? []).some((item) => {
      const price = typeof item.price === 'string' ? null : item.price;
      return price?.type === 'recurring' || !!price?.recurring;
    });

    const successUrl =
      paymentLink.after_completion.type === 'redirect'
        ? paymentLink.after_completion.redirect?.url
        : undefined;

    return {
      mode: hasRecurring ? 'subscription' : 'payment',
      line_items: lineItems,
      allow_promotion_codes: paymentLink.allow_promotion_codes,
      automatic_tax: {
        enabled: paymentLink.automatic_tax.enabled,
        liability: paymentLink.automatic_tax.liability
          ? {
              type: paymentLink.automatic_tax.liability.type,
              account: paymentLink.automatic_tax.liability.account ?? undefined,
            }
          : undefined,
      },
      billing_address_collection: paymentLink.billing_address_collection,
      consent_collection: paymentLink.consent_collection
        ? {
            payment_method_reuse_agreement: paymentLink.consent_collection
              .payment_method_reuse_agreement
              ? {
                  position:
                    paymentLink.consent_collection
                      .payment_method_reuse_agreement.position,
                }
              : undefined,
            promotions: paymentLink.consent_collection.promotions ?? undefined,
            terms_of_service:
              paymentLink.consent_collection.terms_of_service ?? undefined,
          }
        : undefined,
      currency: paymentLink.currency,
      custom_fields: paymentLink.custom_fields.map((field) => ({
        key: field.key,
        label: { custom: field.label.custom ?? '', type: 'custom' as const },
        type: field.type,
        dropdown: field.dropdown
          ? {
              options: field.dropdown.options,
              default_value: field.dropdown.default_value ?? undefined,
            }
          : undefined,
        numeric: field.numeric
          ? {
              default_value: field.numeric.default_value ?? undefined,
              maximum_length: field.numeric.maximum_length ?? undefined,
              minimum_length: field.numeric.minimum_length ?? undefined,
            }
          : undefined,
        optional: field.optional,
        text: field.text
          ? {
              default_value: field.text.default_value ?? undefined,
              maximum_length: field.text.maximum_length ?? undefined,
              minimum_length: field.text.minimum_length ?? undefined,
            }
          : undefined,
      })),
      custom_text: {
        after_submit: paymentLink.custom_text.after_submit ?? undefined,
        shipping_address: paymentLink.custom_text.shipping_address ?? undefined,
        submit: paymentLink.custom_text.submit ?? undefined,
        terms_of_service_acceptance:
          paymentLink.custom_text.terms_of_service_acceptance ?? undefined,
      },
      customer_creation: paymentLink.customer_creation,
      invoice_creation: paymentLink.invoice_creation
        ? {
            enabled: paymentLink.invoice_creation.enabled,
            invoice_data: paymentLink.invoice_creation.invoice_data
              ? {
                  account_tax_ids:
                    paymentLink.invoice_creation.invoice_data.account_tax_ids ??
                    undefined,
                  custom_fields:
                    paymentLink.invoice_creation.invoice_data.custom_fields ??
                    undefined,
                  description:
                    paymentLink.invoice_creation.invoice_data.description ??
                    undefined,
                  footer:
                    paymentLink.invoice_creation.invoice_data.footer ??
                    undefined,
                  issuer: paymentLink.invoice_creation.invoice_data.issuer
                    ? {
                        type: paymentLink.invoice_creation.invoice_data.issuer
                          .type,
                        account:
                          paymentLink.invoice_creation.invoice_data.issuer
                            .account ?? undefined,
                      }
                    : undefined,
                  metadata:
                    paymentLink.invoice_creation.invoice_data.metadata ??
                    undefined,
                  rendering_options: paymentLink.invoice_creation.invoice_data
                    .rendering_options
                    ? {
                        amount_tax_display:
                          (paymentLink.invoice_creation.invoice_data
                            .rendering_options.amount_tax_display as
                            | 'exclude_tax'
                            | 'include_inclusive_tax'
                            | undefined) ?? undefined,
                        template:
                          paymentLink.invoice_creation.invoice_data
                            .rendering_options.template ?? undefined,
                      }
                    : undefined,
                }
              : undefined,
          }
        : undefined,
      managed_payments: paymentLink.managed_payments ?? undefined,
      metadata: paymentLink.metadata,
      name_collection: paymentLink.name_collection
        ? {
            business: paymentLink.name_collection.business ?? undefined,
            individual: paymentLink.name_collection.individual ?? undefined,
          }
        : undefined,
      optional_items:
        (paymentLink.optional_items as
          | CreateCheckoutSessionInput['optional_items']
          | null) ?? undefined,
      payment_intent_data: paymentLink.payment_intent_data
        ? {
            capture_method:
              paymentLink.payment_intent_data.capture_method ?? undefined,
            description:
              paymentLink.payment_intent_data.description ?? undefined,
            metadata: paymentLink.payment_intent_data.metadata,
            setup_future_usage:
              paymentLink.payment_intent_data.setup_future_usage ?? undefined,
            statement_descriptor:
              paymentLink.payment_intent_data.statement_descriptor ?? undefined,
            statement_descriptor_suffix:
              paymentLink.payment_intent_data.statement_descriptor_suffix ??
              undefined,
            transfer_group:
              paymentLink.payment_intent_data.transfer_group ?? undefined,
          }
        : undefined,
      payment_method_collection: paymentLink.payment_method_collection,
      payment_method_types:
        (paymentLink.payment_method_types as 'crypto'[] | null) ?? undefined,
      phone_number_collection: paymentLink.phone_number_collection,
      shipping_address_collection:
        paymentLink.shipping_address_collection ?? undefined,
      shipping_options: paymentLink.shipping_options
        .filter((option) => !!option.shipping_rate)
        .map((option) => ({ shipping_rate: option.shipping_rate })),
      submit_type: paymentLink.submit_type,
      subscription_data: paymentLink.subscription_data
        ? {
            description: paymentLink.subscription_data.description ?? undefined,
            invoice_settings: {
              issuer: {
                type: paymentLink.subscription_data.invoice_settings.issuer
                  .type,
                account:
                  paymentLink.subscription_data.invoice_settings.issuer
                    .account ?? undefined,
              },
            },
            metadata: paymentLink.subscription_data.metadata,
            trial_period_days:
              paymentLink.subscription_data.trial_period_days ?? undefined,
            trial_settings: paymentLink.subscription_data.trial_settings
              ? {
                  end_behavior: {
                    missing_payment_method:
                      paymentLink.subscription_data.trial_settings.end_behavior
                        .missing_payment_method,
                  },
                }
              : undefined,
          }
        : undefined,
      tax_id_collection: {
        enabled: paymentLink.tax_id_collection.enabled,
      },
      success_url: successUrl,
      ui_mode: 'hosted_page',
    };
  }

  private async BuildLineItem(
    platformAccountId: string,
    input: LineItemInput,
    id: string = GenerateId('li_z')
  ): Promise<CheckoutSessionLineItem> {
    const price = await this.ResolvePrice(platformAccountId, input);
    const description = await this.GetProductName(price);
    return this.LineItemObject(id, price, input.quantity, {}, description);
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

  private async BuildUpdatedLineItems(
    paymentLink: PaymentLinkType,
    inputItems: UpdateLineItemInput[]
  ): Promise<CheckoutSessionLineItem[]> {
    const existingById = new Map(
      (paymentLink.line_items?.data ?? []).map((item) => [item.id, item])
    );

    return Promise.all(
      inputItems.map(async (input) => {
        const existing = existingById.get(input.id);
        if (!existing) {
          throw new AppError(
            `No such line item on this Payment Link: '${input.id}'`,
            ERRORS.INVALID_REQUEST.status,
            ERRORS.INVALID_REQUEST.type
          );
        }

        const quantity = input.quantity ?? existing.quantity ?? 1;
        return this.LineItemObject(
          existing.id,
          existing.price as PriceType,
          quantity,
          existing.metadata,
          existing.description
        );
      })
    );
  }

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

  private async GetProductName(price: PriceType): Promise<string | null> {
    if (typeof price.product !== 'string') {
      return price.product?.name ?? null;
    }
    if (!this.productModule) return null;
    const product = await this.productModule.GetProduct(price.product);
    return product?.name ?? null;
  }
}
