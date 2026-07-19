import { PriceModule } from '../modules/Price';
import { Database } from '../modules/Database';
import { Price, Product, QueryOperators } from '@zoneless/shared-types';
import { ProductModule } from '../modules/Product';
import { ListHelper } from '../utils/ListHelper';
import {
  CreateMockDatabase,
  DeterministicId,
  ResetIdCounter,
  GetFixedTimestamp,
} from './Setup';

jest.mock('../modules/Database');
jest.mock('../utils/IdGenerator', () => ({
  GenerateId: jest.fn((prefix: string) => DeterministicId(prefix)),
}));
jest.mock('../utils/Timestamp', () => ({
  Now: jest.fn(() => GetFixedTimestamp()),
}));
jest.mock('../modules/AppConfig', () => ({
  GetAppConfig: jest.fn(() => ({
    dashboardUrl: 'http://localhost:4200',
    livemode: false,
    appSecret: 'test-secret',
  })),
}));

describe('PriceModule', () => {
  let module: PriceModule;
  let mockDb: jest.Mocked<Database>;
  let productModule: ProductModule;
  beforeEach(() => {
    jest.clearAllMocks();
    ResetIdCounter();
    mockDb = CreateMockDatabase();
    productModule = new ProductModule(mockDb);
    module = new PriceModule(mockDb, null, productModule);
  });

  describe('PeriodToHours', () => {
    it('should convert each recurring interval to hours', () => {
      expect(module.PeriodToHours('hour')).toBe(1);
      expect(module.PeriodToHours('day')).toBe(24);
      expect(module.PeriodToHours('week')).toBe(168);
      expect(module.PeriodToHours('month')).toBe(720);
      expect(module.PeriodToHours('year')).toBe(8760);
    });

    it('should multiply by interval_count', () => {
      expect(module.PeriodToHours('hour', 3)).toBe(3);
      expect(module.PeriodToHours('day', 2)).toBe(48);
    });
  });

  describe('PriceObject', () => {
    it('should create a price with sensible defaults', () => {
      const price = module.PriceObject('acct_z_platform', {
        unit_amount: 1000,
        currency: 'usdc',
        product: 'prod_z_1',
        tax_behavior: 'exclusive',
        billing_scheme: 'per_unit',
        currency_options: {
          usdc: {
            unit_amount: 1000,
          },
        },
      });

      expect(price.object).toBe('price');
      expect(price.unit_amount).toBe(1000);
      expect(price.currency).toBe('usdc');
      expect(price.product).toBe('prod_z_1');
      expect(price.tax_behavior).toBe('exclusive');
      expect(price.billing_scheme).toBe('per_unit');
      expect(price.currency_options).toEqual({ usdc: { unit_amount: 1000 } });
      expect(price.subscription_plan_pda).toBeNull();
    });

    it('should accept provided input fields', () => {
      const price = module.PriceObject('acct_z_platform', {
        unit_amount: 1000,
        currency: 'usdc',
        product: 'prod_z_1',
        tax_behavior: 'exclusive',
        billing_scheme: 'per_unit',
        currency_options: {
          usdc: {
            unit_amount: 1000,
          },
        },
      });

      expect(price.unit_amount).toBe(1000);
      expect(price.currency).toBe('usdc');
      expect(price.product).toBe('prod_z_1');
      expect(price.tax_behavior).toBe('exclusive');
      expect(price.billing_scheme).toBe('per_unit');
      expect(price.currency_options).toEqual({ usdc: { unit_amount: 1000 } });
    });
  });

  describe('CreatePrice', () => {
    it('should persist the price to the database', async () => {
      const product = await productModule.CreateProduct('acct_z_platform', {
        name: 'Test Product',
      });
      mockDb.Get.mockResolvedValueOnce(product);
      const price = await module.CreatePrice('acct_z_platform', {
        unit_amount: 1000,
        currency: 'usdc',
        product: product.id,
        tax_behavior: 'exclusive',
        billing_scheme: 'per_unit',
        currency_options: {
          usdc: {
            unit_amount: 1000,
          },
        },
      });
      expect(mockDb.Set).toHaveBeenCalledTimes(2);
      expect(mockDb.Set).toHaveBeenCalledWith('Products', product.id, product);
      expect(mockDb.Set).toHaveBeenCalledWith('Prices', price.id, price);
    });
  });

  describe('UpdatePrice', () => {
    it('should update price metadata', async () => {
      const existingPrice = {
        id: 'price_z_1',
        object: 'price',
        platform_account: 'acct_z_1',
        metadata: {},
      } as Price;
      mockDb.Get = jest.fn().mockResolvedValue(existingPrice);

      const result = await module.UpdatePrice('price_z_1', {
        metadata: { tracking_number: '12345' },
      });

      expect(mockDb.Update).toHaveBeenCalledWith(
        'Prices',
        'price_z_1',
        expect.objectContaining({ metadata: { tracking_number: '12345' } })
      );
      expect(result).toEqual(existingPrice);
    });

    it('should throw when price not found', async () => {
      await expect(
        module.UpdatePrice('nonexistent', { metadata: {} })
      ).rejects.toThrow('Price not found');
    });
  });

  describe('GetPrice', () => {
    it('should return the price when found', async () => {
      const mockPrice = { id: 'price_z_1', object: 'price' } as Price;
      mockDb.Get = jest.fn().mockResolvedValue(mockPrice);

      const result = await module.GetPrice('price_z_1');
      expect(result).toEqual(mockPrice);
    });

    it('should return null when not found', async () => {
      const result = await module.GetPrice('nonexistent');
      expect(result).toBeNull();
    });
  });

  describe('ListPrices', () => {
    it('should pass account and price filters to ListHelper', async () => {
      const listSpy = jest
        .spyOn(ListHelper.prototype, 'List')
        .mockResolvedValue({
          object: 'list',
          data: [],
          has_more: false,
          url: '/v1/prices',
        });
      await module.ListPrices({
        account: 'acct_z_platform',
        limit: 25,
        active: true,
        currency: 'usdc',
        product: 'prod_z_1',
        type: 'recurring',
        lookup_keys: ['lookup_key_1', 'lookup_key_2'],
        recurring: {
          interval: 'day',
          meter: 'meter_1',
          usage_type: 'metered',
        },
      });
      expect(listSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          account: 'acct_z_platform',
          limit: 25,
          filters: expect.objectContaining({
            active: true,
            currency: 'usdc',
            product: 'prod_z_1',
            type: 'recurring',
            lookup_key: {
              operator: QueryOperators['in'],
              value: ['lookup_key_1', 'lookup_key_2'],
            },
            'recurring.interval': 'day',
            'recurring.meter': 'meter_1',
            'recurring.usage_type': 'metered',
          }),
        })
      );
      listSpy.mockRestore();
    });
    it('should omit optional filters when not provided', async () => {
      const listSpy = jest
        .spyOn(ListHelper.prototype, 'List')
        .mockResolvedValue({
          object: 'list',
          data: [],
          has_more: false,
          url: '/v1/prices',
        });
      await module.ListPrices({ account: 'acct_z_platform' });
      expect(listSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          filters: {},
        })
      );
      listSpy.mockRestore();
    });
  });
});
