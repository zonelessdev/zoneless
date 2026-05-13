/**
 * @fileOverview Methods for Products
 *
 *
 * @module Product
 */

import { Database } from './Database';
import { EventService } from './EventService';
import { GenerateId } from '../utils/IdGenerator';
import { ExtractChangedFields } from './Event';
import {
  Product as ProductType,
  ProductDeleted,
  QueryOperators,
} from '@zoneless/shared-types';
import { ValidateUpdate } from './Util';
import {
  CreateProductSchema,
  CreateProductInput,
  UpdateProductSchema,
  UpdateProductInput,
  ListProductsFiltersInput,
} from '../schemas/ProductSchema';
import { ListHelper, ListOptions, ListResult } from '../utils/ListHelper';
import { Now } from '../utils/Timestamp';
import { GetAppConfig } from './AppConfig';
import type { PriceModule } from './Price';
import { AppError } from '../utils/AppError';
import { ERRORS } from '../utils/Errors';

export class ProductModule {
  private readonly db: Database;
  private readonly eventService: EventService | null;
  private readonly listHelper: ListHelper<ProductType>;
  private readonly priceModule: PriceModule;

  constructor(
    db: Database,
    eventService?: EventService,
    priceModule?: PriceModule
  ) {
    this.db = db;
    this.eventService = eventService || null;
    this.listHelper = new ListHelper<ProductType>(db, {
      collection: 'Products',
      orderByField: 'created',
      orderDirection: 'desc',
      urlPath: '/v1/products',
      accountField: 'platform_account',
    });
    this.priceModule = priceModule || null;
  }

  /**
   * Create a new product.
   *
   * @param platformAccountId - The platform account ID
   * @param input - The input data for the product
   * @returns The created product
   */
  async CreateProduct(
    platformAccountId: string,
    input: CreateProductInput
  ): Promise<ProductType> {
    const validatedInput = ValidateUpdate(CreateProductSchema, input);

    const product = this.ProductObject(platformAccountId, validatedInput);

    if (validatedInput.default_price_data) {
      validatedInput.default_price_data.product = product.id; //Put the product id here so CreatePrice doesn't return an erro.
      const price = await this.priceModule.CreatePrice(
        platformAccountId,
        validatedInput.default_price_data,
        true
      ); //Skip product check as the product is not yet created.
      product.default_price = price.id;
    }

    await this.db.Set('Products', product.id, product);

    if (this.eventService) {
      await this.eventService.Emit(
        'product.created',
        product.platform_account,
        product
      );
    }
    return product;
  }

  ProductObject(
    platformAccountId: string,
    input: CreateProductInput
  ): ProductType {
    const product: ProductType = {
      id: GenerateId('prod_z'),
      object: 'product',
      active: input.active ?? true,
      created: Now(),
      default_price: null,
      description: input.description ?? null,
      images: input.images ?? [],
      marketing_features: input.marketing_features ?? [],
      livemode: GetAppConfig().livemode,
      metadata: input.metadata ?? {},
      name: input.name,
      package_dimensions: input.package_dimensions ?? null,
      shippable: input.shippable ?? null,
      statement_descriptor: input.statement_descriptor ?? null,
      tax_code: input.tax_code ?? null,
      unit_label: input.unit_label ?? null,
      updated: Now(),
      url: input.url ?? null,
      platform_account: platformAccountId,
    };
    return product;
  }

  /**
   * Get a product by its ID.
   *
   * @param id - The product ID
   * @returns The Product if found, null otherwise
   */
  async GetProduct(id: string): Promise<ProductType | null> {
    return this.db.Get<ProductType>('Products', id);
  }

  /**
   * Update a product.
   * Emits an 'product.updated' event if EventService is configured.
   *
   * @param id - The Product ID
   * @param input - The fields to update
   * @returns The updated Product
   */
  async UpdateProduct(
    id: string,
    input: UpdateProductInput
  ): Promise<ProductType> {
    const validatedUpdate = ValidateUpdate(UpdateProductSchema, input);

    // Get previous state for the event (before update)
    const previousProduct = this.eventService
      ? await this.GetProduct(id)
      : null;

    await this.db.Update<ProductType>('Products', id, validatedUpdate);

    const product = await this.GetProduct(id);
    if (!product) {
      throw new Error('Product not found after update');
    }

    // Emit product.updated event
    if (this.eventService && previousProduct) {
      const previousAttributes = ExtractChangedFields(
        previousProduct as unknown as Record<string, unknown>,
        validatedUpdate as Record<string, unknown>
      );

      await this.eventService.Emit(
        'product.updated',
        product.platform_account,
        product,
        {
          previousAttributes,
        }
      );
    }

    return product;
  }

  /**
   * Delete a product.
   * Emits an 'product.deleted' event if EventService is configured.
   *
   * @param id - The product ID
   * @returns Deletion confirmation object
   */
  async DeleteProduct(id: string): Promise<ProductDeleted> {
    // Get the product before deletion for the event
    const product = await this.GetProduct(id);

    if (!product) {
      throw new AppError(
        ERRORS.PRODUCT_NOT_FOUND.message,
        ERRORS.PRODUCT_NOT_FOUND.status,
        ERRORS.PRODUCT_NOT_FOUND.type
      );
    }

    await this.db.Delete('Products', id);

    // Emit product.deleted event
    if (this.eventService && product) {
      await this.eventService.Emit(
        'product.deleted',
        product.platform_account,
        product
      );
    }

    return {
      id,
      object: 'product',
      deleted: true,
    };
  }

  /**
   * List products
   */
  async ListProducts(
    options: ListOptions & ListProductsFiltersInput
  ): Promise<ListResult<ProductType>> {
    const { active, shippable, ids, url, ...listOptions } = options;

    // Build filters
    const filters: Record<string, unknown> = {};
    if (active !== undefined) filters.active = active;
    if (shippable !== undefined) filters.shippable = shippable;
    if (ids?.length) {
      filters.id = {
        operator: QueryOperators['in'],
        value: ids,
      };
    }
    if (url) filters.url = url;

    return this.listHelper.List({
      ...listOptions,
      filters: { ...listOptions.filters, ...filters },
    });
  }
}
