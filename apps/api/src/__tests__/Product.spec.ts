import { ProductModule } from '../modules/Product';
import { Database } from '../modules/Database';
import { Product, QueryOperators } from '@zoneless/shared-types';
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

describe('ProductModule', () => {
  let module: ProductModule;
  let mockDb: jest.Mocked<Database>;

  beforeEach(() => {
    jest.clearAllMocks();
    ResetIdCounter();
    mockDb = CreateMockDatabase();
    module = new ProductModule(mockDb);
  });

  describe('ProductObject', () => {
    it('should create a product with sensible defaults', () => {
      const product = module.ProductObject('acct_z_platform', {
        name: 'Test Product',
      });

      expect(product.object).toBe('product');
      expect(product.name).toBe('Test Product');
      expect(product.platform_account).toBe('acct_z_platform');
      expect(product.description).toBeNull();
      expect(product.images).toEqual([]);
      expect(product.marketing_features).toEqual([]);
      expect(product.livemode).toBe(false);
      expect(product.metadata).toEqual({});
      expect(product.tax_code).toBeNull();
      expect(product.default_price).toBeNull();
      expect(product.unit_label).toBeNull();
      expect(product.url).toBeNull();
    });

    it('should accept provided input fields', () => {
      const product = module.ProductObject('acct_z_platform', {
        name: 'Test Product',
        description: 'Test Description',
        images: ['https://example.com/image.jpg'],
        marketing_features: [{ name: 'Feature 1' }],
        package_dimensions: { height: 10, length: 10, weight: 10, width: 10 },
        shippable: true,
        statement_descriptor: 'Test Statement Descriptor',
        tax_code: 'Test Tax Code',
        unit_label: 'Test Unit Label',
        url: 'https://example.com/product',
      });

      expect(product.name).toBe('Test Product');
      expect(product.description).toBe('Test Description');
      expect(product.images).toEqual(['https://example.com/image.jpg']);
      expect(product.marketing_features).toEqual([{ name: 'Feature 1' }]);
      expect(product.package_dimensions).toEqual({
        height: 10,
        length: 10,
        weight: 10,
        width: 10,
      });
      expect(product.shippable).toBe(true);
      expect(product.statement_descriptor).toBe('Test Statement Descriptor');
      expect(product.tax_code).toBe('Test Tax Code');
      expect(product.unit_label).toBe('Test Unit Label');
      expect(product.url).toBe('https://example.com/product');
    });
  });

  describe('CreateProduct', () => {
    it('should persist the product to the database', async () => {
      const product = await module.CreateProduct('acct_z_platform', {
        name: 'Test Product',
      });
      expect(mockDb.Set).toHaveBeenCalledTimes(1);
      expect(mockDb.Set).toHaveBeenCalledWith('Products', product.id, product);
    });
  });

  describe('UpdateProduct', () => {
    it('should update product metadata', async () => {
      const existingProduct = {
        id: 'prod_z_1',
        object: 'product',
        platform_account: 'acct_z_1',
        metadata: {},
      } as Product;
      mockDb.Get = jest.fn().mockResolvedValue(existingProduct);

      const result = await module.UpdateProduct('prod_z_1', {
        metadata: { tracking_number: '12345' },
      });

      expect(mockDb.Update).toHaveBeenCalledWith(
        'Products',
        'prod_z_1',
        expect.objectContaining({ metadata: { tracking_number: '12345' } })
      );
      expect(result).toEqual(existingProduct);
    });

    it('should throw when product not found', async () => {
      await expect(
        module.UpdateProduct('nonexistent', { metadata: {} })
      ).rejects.toThrow('Product not found');
    });
  });

  describe('GetProduct', () => {
    it('should return the product when found', async () => {
      const mockProduct = { id: 'prod_z_1', object: 'product' } as Product;
      mockDb.Get = jest.fn().mockResolvedValue(mockProduct);

      const result = await module.GetProduct('prod_z_1');
      expect(result).toEqual(mockProduct);
    });

    it('should return null when not found', async () => {
      const result = await module.GetProduct('nonexistent');
      expect(result).toBeNull();
    });
  });

  // -----------------------------------------------------------------------
  // DeleteProduct
  // -----------------------------------------------------------------------
  describe('DeleteProduct', () => {
    it('should delete the product and return confirmation', async () => {
      mockDb.Get = jest
        .fn()
        .mockResolvedValue({ id: 'prod_z_1', object: 'product' });

      const result = await module.DeleteProduct('prod_z_1');

      expect(mockDb.Delete).toHaveBeenCalledWith('Products', 'prod_z_1');
      expect(result).toEqual({
        id: 'prod_z_1',
        object: 'product',
        deleted: true,
      });
    });

    it('should throw when product not found', async () => {
      await expect(module.DeleteProduct('nonexistent')).rejects.toThrow(
        'Product not found'
      );
    });
  });

  // -----------------------------------------------------------------------
  // ListProducts
  // -----------------------------------------------------------------------
  describe('ListProducts', () => {
    it('should pass account and product filters to ListHelper', async () => {
      const listSpy = jest
        .spyOn(ListHelper.prototype, 'List')
        .mockResolvedValue({
          object: 'list',
          data: [],
          has_more: false,
          url: '/v1/products',
        });
      await module.ListProducts({
        account: 'acct_z_platform',
        limit: 25,
        active: true,
        shippable: false,
        ids: ['prod_z_1', 'prod_z_2'],
        url: 'https://example.com/p',
      });
      expect(listSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          account: 'acct_z_platform',
          limit: 25,
          filters: expect.objectContaining({
            active: true,
            shippable: false,
            url: 'https://example.com/p',
            id: {
              operator: QueryOperators['in'],
              value: ['prod_z_1', 'prod_z_2'],
            },
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
          url: '/v1/products',
        });
      await module.ListProducts({ account: 'acct_z_platform' });
      expect(listSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          filters: {},
        })
      );
      listSpy.mockRestore();
    });
    it('should not add ids filter when ids is empty', async () => {
      const listSpy = jest
        .spyOn(ListHelper.prototype, 'List')
        .mockResolvedValue({
          object: 'list',
          data: [],
          has_more: false,
          url: '/v1/products',
        });
      await module.ListProducts({ account: 'acct_z_platform', ids: [] });
      expect(listSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          filters: expect.not.objectContaining({ id: expect.anything() }),
        })
      );
      listSpy.mockRestore();
    });
  });
});
