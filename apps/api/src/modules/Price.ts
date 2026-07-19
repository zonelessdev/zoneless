/**
 * @fileOverview Methods for Prices
 *
 *
 * @module Price
 */

import { Database } from './Database';
import { EventService } from './EventService';
import { GenerateId } from '../utils/IdGenerator';
import {
  Price as PriceType,
  QueryOperators,
  RecurringInterval,
} from '@zoneless/shared-types';
import { ValidateUpdate } from './Util';
import { ExtractChangedFields } from './Event';
import { Solana } from './chains/Solana';
import { ExternalWalletModule } from './ExternalWallet';
import type { ProductModule } from './Product';
import {
  CreatePriceSchema,
  CreatePriceInput,
  UpdatePriceSchema,
  UpdatePriceInput,
  ListPricesFiltersInput,
} from '@zoneless/shared-schemas';
import { ListHelper, ListOptions, ListResult } from '../utils/ListHelper';
import { Now } from '../utils/Timestamp';
import { GetAppConfig } from './AppConfig';
import { AppError } from '../utils/AppError';
import { ERRORS } from '../utils/Errors';
import { RecurringIntervalToHours } from '../utils/RecurringInterval';
export class PriceModule {
  private readonly db: Database;
  private readonly eventService: EventService | null;
  private readonly listHelper: ListHelper<PriceType>;
  private readonly productModule: ProductModule | null;

  constructor(
    db: Database,
    eventService?: EventService,
    productModule?: ProductModule
  ) {
    this.db = db;
    this.eventService = eventService || null;
    this.listHelper = new ListHelper<PriceType>(db, {
      collection: 'Prices',
      orderByField: 'created',
      orderDirection: 'desc',
      urlPath: '/v1/prices',
      accountField: 'platform_account',
    });
    this.productModule = productModule || null;
  }

  /**
   * Create a new price.
   *
   * @param platformAccountId - The platform account ID
   * @param input - The input data for the price
   * @returns The created price
   */
  async CreatePrice(
    platformAccountId: string,
    input: CreatePriceInput,
    skipProductCheck: boolean = false
  ): Promise<PriceType> {
    const validatedInput = ValidateUpdate(CreatePriceSchema, input);

    const price = this.PriceObject(platformAccountId, validatedInput);

    if (!validatedInput.product && !validatedInput.product_data) {
      throw new AppError(
        'product id or product_data is required',
        ERRORS.INVALID_REQUEST.status,
        ERRORS.INVALID_REQUEST.type
      );
    } else if (validatedInput.product_data) {
      if (!this.productModule) {
        throw new AppError(
          'ProductModule not configured',
          ERRORS.INVALID_REQUEST.status,
          ERRORS.INVALID_REQUEST.type
        );
      }
      //Create a product from the product_data supplied and link it to the price.
      const product = await this.productModule.CreateProduct(
        platformAccountId,
        validatedInput.product_data
      );
      price.product = product.id;
    } else if (validatedInput.product && !skipProductCheck) {
      //Skip this check if creating a price via the product module, as the product is not yet created.
      if (!this.productModule) {
        throw new AppError(
          'ProductModule not configured',
          ERRORS.INVALID_REQUEST.status,
          ERRORS.INVALID_REQUEST.type
        );
      }
      //Get the product from the database and link it to the price.
      const product = await this.productModule.GetProduct(
        validatedInput.product
      );
      if (!product) {
        throw new AppError(
          ERRORS.PRODUCT_NOT_FOUND.message,
          ERRORS.PRODUCT_NOT_FOUND.status,
          ERRORS.PRODUCT_NOT_FOUND.type
        );
      }
      price.product = product.id;
    }

    if (
      price.type === 'recurring' &&
      price.recurring &&
      process.env.NODE_ENV !== 'test'
    ) {
      const solana = new Solana();
      const amount = price.unit_amount as number;
      const periodHours = this.PeriodToHours(
        price.recurring.interval,
        price.recurring.interval_count
      );
      const destinationAddress = await this.GetPlatformWalletPublicKey(
        price.platform_account
      );
      const pullerAddress = solana.GetPlanOwnerPublicKey();
      const planPda = await solana.CreateSubscriptionPlan(
        price.id,
        periodHours,
        amount,
        destinationAddress,
        pullerAddress
      );
      price.subscription_plan_pda = planPda;
    }

    await this.db.Set('Prices', price.id, price);

    if (this.eventService) {
      await this.eventService.Emit(
        'price.created',
        price.platform_account,
        price
      );
    }
    return price;
  }

  /**
   * Gets the platform's wallet public key from ExternalWallet.
   * Used for building batch payout transactions.
   *
   * @param platformAccountId - The platform account ID
   * @returns The platform's wallet public key
   */
  private async GetPlatformWalletPublicKey(
    platformAccountId: string
  ): Promise<string> {
    const externalWalletModule = new ExternalWalletModule(this.db);
    const wallets = await externalWalletModule.GetExternalWalletsByAccount(
      platformAccountId
    );
    const platformWallet =
      wallets.find((w) => w.default_for_currency) || wallets[0];
    if (!platformWallet) {
      throw new AppError(
        'Platform wallet not found. Please set up your wallet first.',
        400,
        'invalid_request_error'
      );
    }
    return platformWallet.wallet_address;
  }

  PeriodToHours(period: RecurringInterval, intervalCount = 1): number {
    return RecurringIntervalToHours(period, intervalCount);
  }

  /**
   * Get a price by its ID.
   *
   * @param id - The price ID
   * @returns The Price if found, null otherwise
   */
  async GetPrice(id: string): Promise<PriceType | null> {
    return this.db.Get<PriceType>('Prices', id);
  }

  /**
   * Batch-load prices by id, scoped to a single platform account.
   * Used by the expansion engine to avoid N+1 lookups.
   */
  async BatchGet(
    ids: string[],
    platformAccount: string
  ): Promise<Map<string, PriceType>> {
    if (ids.length === 0) return new Map();
    const prices = await this.db.Query<PriceType>({
      collection: 'Prices',
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
    return new Map(prices.map((price) => [price.id, price]));
  }

  /**
   * Update a price.
   * Emits an 'price.updated' event if EventService is configured.
   *
   * @param id - The Price ID
   * @param input - The fields to update
   * @returns The updated Price
   */
  async UpdatePrice(id: string, input: UpdatePriceInput): Promise<PriceType> {
    const validatedUpdate = ValidateUpdate(UpdatePriceSchema, input);

    // Get previous state for the event (before update)
    const previousPrice = this.eventService ? await this.GetPrice(id) : null;

    await this.db.Update<PriceType>(
      'Prices',
      id,
      validatedUpdate as Partial<PriceType>
    ); // TODO: Remove partial casting.

    const price = await this.GetPrice(id);
    if (!price) {
      throw new AppError(
        ERRORS.PRICE_NOT_FOUND.message,
        ERRORS.PRICE_NOT_FOUND.status,
        ERRORS.PRICE_NOT_FOUND.type
      );
    }

    // Emit price.updated event
    if (this.eventService && previousPrice) {
      const previousAttributes = ExtractChangedFields(
        previousPrice as unknown as Record<string, unknown>,
        validatedUpdate as Record<string, unknown>
      );

      await this.eventService.Emit(
        'price.updated',
        price.platform_account,
        price,
        {
          previousAttributes,
        }
      );
    }

    return price;
  }

  /**
   * List prices
   */
  async ListPrices(
    options: ListOptions & ListPricesFiltersInput
  ): Promise<ListResult<PriceType>> {
    const {
      active,
      currency,
      product,
      type,
      lookup_keys,
      recurring,
      ...listOptions
    } = options;

    // Build filters
    const filters: Record<string, unknown> = {};
    if (active !== undefined) filters.active = active;
    if (currency !== undefined) filters.currency = currency;
    if (product !== undefined) filters.product = product;
    if (type !== undefined) filters.type = type;
    if (lookup_keys?.length) {
      filters.lookup_key = {
        operator: QueryOperators['in'],
        value: lookup_keys,
      };
    }
    if (recurring !== undefined) {
      if (recurring.interval) {
        filters['recurring.interval'] = recurring.interval;
      }
      if (recurring.meter) {
        filters['recurring.meter'] = recurring.meter;
      }
      if (recurring.usage_type) {
        filters['recurring.usage_type'] = recurring.usage_type;
      }
    }

    return this.listHelper.List({
      ...listOptions,
      filters: { ...listOptions.filters, ...filters },
    });
  }

  PriceObject(platformAccountId: string, input: CreatePriceInput): PriceType {
    let price: PriceType = {
      id: GenerateId('price_z'),
      active: true,
      currency: 'usdc',
      metadata: input.metadata ?? {},
      nickname: input.nickname ?? null,
      product: input.product ?? null,
      tax_behavior: input.tax_behavior ?? 'unspecified',
      unit_amount: input.unit_amount,
      object: 'price',
      billing_scheme: input.billing_scheme ?? 'per_unit',
      currency_options: (input.currency_options as any) ?? null, // TODO: Remove any - should be validated by Zod though.
      created: Now(),
      custom_unit_amount: input.custom_unit_amount ?? null,
      livemode: GetAppConfig().livemode,
      lookup_key: input.lookup_key ?? null,
      tiers: (input.tiers as any) ?? null, // TODO: Remove any - should be validated by Zod though.
      tiers_mode: input.tiers_mode ?? null,
      transform_quantity: input.transform_quantity ?? null,
      unit_amount_decimal:
        input.unit_amount_decimal ?? input.unit_amount.toString(),
      platform_account: platformAccountId,
      subscription_plan_pda: null,
      recurring: null,
      type: 'one_time',
    };

    if (input.recurring) {
      price.recurring = {
        interval: input.recurring.interval,
        interval_count: input.recurring.interval_count ?? 1,
        trial_period_days: input.recurring.trial_period_days ?? null,
        usage_type: input.recurring.usage_type ?? 'licensed',
        meter: input.recurring.meter ?? null,
      };
      price.type = 'recurring';
    } else {
      price.recurring = null;
      price.type = 'one_time';
    }
    return price;
  }
}
