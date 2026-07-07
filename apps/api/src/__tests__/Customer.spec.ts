import { CustomerModule } from '../modules/Customer';
import { Database } from '../modules/Database';
import { Customer } from '@zoneless/shared-types';
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

describe('CustomerModule', () => {
  let module: CustomerModule;
  let mockDb: jest.Mocked<Database>;

  beforeEach(() => {
    jest.clearAllMocks();
    ResetIdCounter();
    mockDb = CreateMockDatabase();
    module = new CustomerModule(mockDb);
  });

  describe('CustomerObject', () => {
    it('should create a customer with sensible defaults', () => {
      const customer = module.CustomerObject('acct_z_platform', {});

      expect(customer.object).toBe('customer');
      expect(customer.platform_account).toBe('acct_z_platform');
      expect(customer.address).toBeNull();
      expect(customer.balance).toBe(0);
      expect(customer.business_name).toBeNull();
      expect(customer.currency).toBeNull();
      expect(customer.customer_account).toBeNull();
      expect(customer.default_source).toBeNull();
      expect(customer.delinquent).toBe(false);
      expect(customer.description).toBeNull();
      expect(customer.discount).toBeNull();
      expect(customer.email).toBeNull();
      expect(customer.individual_name).toBeNull();
      expect(customer.invoice_credit_balance).toEqual({});
      expect(customer.invoice_prefix).toBeNull();
      expect(customer.livemode).toBe(false);
      expect(customer.metadata).toEqual({});
      expect(customer.name).toBeNull();
      expect(customer.next_invoice_sequence).toBeNull();
      expect(customer.phone).toBeNull();
      expect(customer.preferred_locales).toBeNull();
      expect(customer.shipping).toBeNull();
      expect(customer.tax_exempt).toBe('none');
      expect(customer.test_clock).toBeNull();

      expect(customer.invoice_settings).toEqual({
        custom_fields: null,
        default_payment_method: null,
        footer: null,
        rendering_options: null,
      });

      expect(customer.tax).toEqual({
        automatic_tax: 'not_collecting',
        ip_address: null,
        location: null,
        provider: 'zoneless',
      });

      expect(customer.cash_balance).toEqual({
        object: 'cash_balance',
        available: {},
        customer: customer.id,
        customer_account: null,
        livemode: false,
        settings: {
          reconciliation_mode: 'automatic',
          using_merchant_default: true,
        },
      });

      expect(customer.sources).toEqual({
        object: 'list',
        data: [],
        has_more: false,
        url: `/v1/customers/${customer.id}/sources`,
      });
      expect(customer.subscriptions).toEqual({
        object: 'list',
        data: [],
        has_more: false,
        url: `/v1/customers/${customer.id}/subscriptions`,
      });
      expect(customer.tax_ids).toEqual({
        object: 'list',
        data: [],
        has_more: false,
        url: `/v1/customers/${customer.id}/tax_ids`,
      });
    });

    it('should accept provided input fields', () => {
      const customer = module.CustomerObject('acct_z_platform', {
        address: {
          city: 'San Francisco',
          country: 'US',
        },
        balance: -500,
        business_name: 'Test Business',
        description: 'Test Description',
        email: 'test@example.com',
        individual_name: 'Test Individual',
        invoice_prefix: 'TESTPRE',
        invoice_settings: {
          footer: 'Thanks for your business',
          custom_fields: [{ name: 'PO Number', value: '12345' }],
          rendering_options: {
            amount_tax_display: 'exclude_tax',
            template: 'template_1',
          },
        },
        metadata: { external_id: '12345' },
        name: 'Test Customer',
        next_invoice_sequence: 10,
        payment_method: 'pm_z_1',
        phone: '+15555550100',
        preferred_locales: ['en', 'fr'],
        shipping: {
          address: { city: 'New York', country: 'US' },
          name: 'Shipping Name',
          phone: '+15555550199',
        },
        source: 'src_z_1',
        tax: { ip_address: '127.0.0.1' },
        tax_exempt: 'exempt',
        test_clock: 'clock_z_1',
      });

      expect(customer.address).toEqual({
        city: 'San Francisco',
        country: 'US',
        line1: null,
        line2: null,
        postal_code: null,
        state: null,
      });
      expect(customer.balance).toBe(-500);
      expect(customer.business_name).toBe('Test Business');
      expect(customer.description).toBe('Test Description');
      expect(customer.email).toBe('test@example.com');
      expect(customer.individual_name).toBe('Test Individual');
      expect(customer.invoice_prefix).toBe('TESTPRE');
      expect(customer.invoice_settings).toEqual({
        custom_fields: [{ name: 'PO Number', value: '12345' }],
        default_payment_method: 'pm_z_1',
        footer: 'Thanks for your business',
        rendering_options: {
          amount_tax_display: 'exclude_tax',
          template: 'template_1',
        },
      });
      expect(customer.metadata).toEqual({ external_id: '12345' });
      expect(customer.name).toBe('Test Customer');
      expect(customer.next_invoice_sequence).toBe(10);
      expect(customer.phone).toBe('+15555550100');
      expect(customer.preferred_locales).toEqual(['en', 'fr']);
      expect(customer.shipping).toEqual({
        address: {
          city: 'New York',
          country: 'US',
          line1: null,
          line2: null,
          postal_code: null,
          state: null,
        },
        name: 'Shipping Name',
        phone: '+15555550199',
      });
      expect(customer.default_source).toBe('src_z_1');
      expect(customer.tax.ip_address).toBe('127.0.0.1');
      expect(customer.tax_exempt).toBe('exempt');
      expect(customer.test_clock).toBe('clock_z_1');
    });

    it('should respect an explicit cash_balance reconciliation_mode', () => {
      const customer = module.CustomerObject('acct_z_platform', {
        cash_balance: {
          settings: { reconciliation_mode: 'manual' },
        },
      });

      expect(customer.cash_balance).toEqual(
        expect.objectContaining({
          settings: {
            reconciliation_mode: 'manual',
            using_merchant_default: false,
          },
        })
      );
    });

    it('should prefer invoice_settings.default_payment_method over payment_method', () => {
      const customer = module.CustomerObject('acct_z_platform', {
        payment_method: 'pm_z_legacy',
        invoice_settings: {
          default_payment_method: 'pm_z_preferred',
        },
      });

      expect(customer.invoice_settings.default_payment_method).toBe(
        'pm_z_preferred'
      );
    });
  });

  describe('CreateCustomer', () => {
    it('should persist the customer to the database', async () => {
      const customer = await module.CreateCustomer('acct_z_platform', {
        name: 'Test Customer',
        email: 'test@example.com',
      });

      expect(mockDb.Set).toHaveBeenCalledTimes(1);
      expect(mockDb.Set).toHaveBeenCalledWith(
        'Customers',
        customer.id,
        customer
      );
      expect(customer.name).toBe('Test Customer');
      expect(customer.email).toBe('test@example.com');
      expect(customer.platform_account).toBe('acct_z_platform');
    });

    it('should throw a validation error for invalid input', async () => {
      await expect(
        module.CreateCustomer('acct_z_platform', {
          email: 'not-an-email',
        })
      ).rejects.toThrow();
      expect(mockDb.Set).not.toHaveBeenCalled();
    });
  });

  describe('UpdateCustomer', () => {
    function BuildExistingCustomer(): Customer {
      return {
        id: 'cus_z_1',
        object: 'customer',
        address: null,
        balance: 0,
        business_name: null,
        cash_balance: {
          object: 'cash_balance',
          available: { usdc: 500 },
          customer: 'cus_z_1',
          customer_account: null,
          livemode: false,
          settings: {
            reconciliation_mode: 'automatic',
            using_merchant_default: true,
          },
        },
        created: 1700000000,
        currency: null,
        customer_account: null,
        default_source: null,
        delinquent: false,
        description: null,
        discount: null,
        email: 'existing@example.com',
        individual_name: null,
        invoice_credit_balance: {},
        invoice_prefix: null,
        invoice_settings: {
          custom_fields: [{ name: 'PO Number', value: '99999' }],
          default_payment_method: 'pm_z_old',
          footer: 'Old footer',
          rendering_options: null,
        },
        livemode: false,
        metadata: {},
        name: 'Existing Customer',
        next_invoice_sequence: null,
        phone: null,
        preferred_locales: null,
        shipping: null,
        sources: {
          object: 'list',
          data: [],
          has_more: false,
          url: '/v1/customers/cus_z_1/sources',
        },
        subscriptions: {
          object: 'list',
          data: [],
          has_more: false,
          url: '/v1/customers/cus_z_1/subscriptions',
        },
        tax: {
          automatic_tax: 'supported',
          ip_address: '1.1.1.1',
          location: { country: 'US', source: 'billing_address', state: 'CA' },
          provider: 'zoneless',
        },
        tax_exempt: 'none',
        tax_ids: {
          object: 'list',
          data: [],
          has_more: false,
          url: '/v1/customers/cus_z_1/tax_ids',
        },
        test_clock: null,
        platform_account: 'acct_z_1',
      };
    }

    it('should update customer metadata', async () => {
      const existingCustomer = BuildExistingCustomer();
      const updatedCustomer = {
        ...existingCustomer,
        metadata: { tracking_number: '12345' },
      };
      mockDb.Get = jest
        .fn()
        .mockResolvedValueOnce(existingCustomer)
        .mockResolvedValueOnce(updatedCustomer);

      const result = await module.UpdateCustomer('cus_z_1', {
        metadata: { tracking_number: '12345' },
      });

      expect(mockDb.Update).toHaveBeenCalledWith(
        'Customers',
        'cus_z_1',
        expect.objectContaining({ metadata: { tracking_number: '12345' } })
      );
      expect(result).toEqual(updatedCustomer);
    });

    it('should throw when customer not found', async () => {
      mockDb.Get = jest.fn().mockResolvedValue(null);

      await expect(
        module.UpdateCustomer('nonexistent', { metadata: {} })
      ).rejects.toThrow('Customer not found');
      expect(mockDb.Update).not.toHaveBeenCalled();
    });

    it('should fill missing address fields with null when updating the address', async () => {
      const existingCustomer = BuildExistingCustomer();
      mockDb.Get = jest
        .fn()
        .mockResolvedValueOnce(existingCustomer)
        .mockResolvedValueOnce(existingCustomer);

      await module.UpdateCustomer('cus_z_1', {
        address: { city: 'Los Angeles', country: 'US' },
      });

      expect(mockDb.Update).toHaveBeenCalledWith(
        'Customers',
        'cus_z_1',
        expect.objectContaining({
          address: {
            city: 'Los Angeles',
            country: 'US',
            line1: null,
            line2: null,
            postal_code: null,
            state: null,
          },
        })
      );
    });

    it('should replace shipping wholesale, filling missing address fields', async () => {
      const existingCustomer = BuildExistingCustomer();
      mockDb.Get = jest
        .fn()
        .mockResolvedValueOnce(existingCustomer)
        .mockResolvedValueOnce(existingCustomer);

      await module.UpdateCustomer('cus_z_1', {
        shipping: {
          address: { city: 'Chicago', country: 'US' },
          name: 'New Shipping Name',
        },
      });

      expect(mockDb.Update).toHaveBeenCalledWith(
        'Customers',
        'cus_z_1',
        expect.objectContaining({
          shipping: {
            address: {
              city: 'Chicago',
              country: 'US',
              line1: null,
              line2: null,
              postal_code: null,
              state: null,
            },
            name: 'New Shipping Name',
            phone: null,
          },
        })
      );
    });

    it('should preserve existing cash_balance fields while updating reconciliation_mode', async () => {
      const existingCustomer = BuildExistingCustomer();
      mockDb.Get = jest
        .fn()
        .mockResolvedValueOnce(existingCustomer)
        .mockResolvedValueOnce(existingCustomer);

      await module.UpdateCustomer('cus_z_1', {
        cash_balance: { settings: { reconciliation_mode: 'manual' } },
      });

      expect(mockDb.Update).toHaveBeenCalledWith(
        'Customers',
        'cus_z_1',
        expect.objectContaining({
          cash_balance: {
            ...existingCustomer.cash_balance,
            settings: {
              reconciliation_mode: 'manual',
              using_merchant_default: false,
            },
          },
        })
      );
    });

    it('should merge invoice_settings, keeping fields not provided', async () => {
      const existingCustomer = BuildExistingCustomer();
      mockDb.Get = jest
        .fn()
        .mockResolvedValueOnce(existingCustomer)
        .mockResolvedValueOnce(existingCustomer);

      await module.UpdateCustomer('cus_z_1', {
        invoice_settings: { footer: 'New footer' },
      });

      expect(mockDb.Update).toHaveBeenCalledWith(
        'Customers',
        'cus_z_1',
        expect.objectContaining({
          invoice_settings: {
            custom_fields: existingCustomer.invoice_settings.custom_fields,
            default_payment_method:
              existingCustomer.invoice_settings.default_payment_method,
            footer: 'New footer',
            rendering_options:
              existingCustomer.invoice_settings.rendering_options,
          },
        })
      );
    });

    it('should merge tax.ip_address, preserving other tax fields', async () => {
      const existingCustomer = BuildExistingCustomer();
      mockDb.Get = jest
        .fn()
        .mockResolvedValueOnce(existingCustomer)
        .mockResolvedValueOnce(existingCustomer);

      await module.UpdateCustomer('cus_z_1', {
        tax: { ip_address: '8.8.8.8' },
      });

      expect(mockDb.Update).toHaveBeenCalledWith(
        'Customers',
        'cus_z_1',
        expect.objectContaining({
          tax: { ...existingCustomer.tax, ip_address: '8.8.8.8' },
        })
      );
    });

    it('should set default_source when source is provided', async () => {
      const existingCustomer = BuildExistingCustomer();
      mockDb.Get = jest
        .fn()
        .mockResolvedValueOnce(existingCustomer)
        .mockResolvedValueOnce(existingCustomer);

      await module.UpdateCustomer('cus_z_1', { source: 'src_z_9' });

      expect(mockDb.Update).toHaveBeenCalledWith(
        'Customers',
        'cus_z_1',
        expect.objectContaining({ default_source: 'src_z_9' })
      );
    });
  });

  describe('GetCustomer', () => {
    it('should return the customer when found', async () => {
      const mockCustomer = { id: 'cus_z_1', object: 'customer' } as Customer;
      mockDb.Get = jest.fn().mockResolvedValue(mockCustomer);

      const result = await module.GetCustomer('cus_z_1');
      expect(result).toEqual(mockCustomer);
    });

    it('should return null when not found', async () => {
      const result = await module.GetCustomer('nonexistent');
      expect(result).toBeNull();
    });
  });

  describe('DeleteCustomer', () => {
    it('should delete the customer and return confirmation', async () => {
      mockDb.Get = jest
        .fn()
        .mockResolvedValue({ id: 'cus_z_1', object: 'customer' });

      const result = await module.DeleteCustomer('cus_z_1');

      expect(mockDb.Delete).toHaveBeenCalledWith('Customers', 'cus_z_1');
      expect(result).toEqual({
        id: 'cus_z_1',
        object: 'customer',
        deleted: true,
      });
    });

    it('should throw when customer not found', async () => {
      await expect(module.DeleteCustomer('nonexistent')).rejects.toThrow(
        'Customer not found'
      );
    });
  });

  describe('ListCustomers', () => {
    it('should pass account and customer filters to ListHelper', async () => {
      const listSpy = jest
        .spyOn(ListHelper.prototype, 'List')
        .mockResolvedValue({
          object: 'list',
          data: [],
          has_more: false,
          url: '/v1/customers',
        });
      await module.ListCustomers({
        account: 'acct_z_platform',
        limit: 25,
        email: 'test@example.com',
        test_clock: 'clock_z_1',
      });
      expect(listSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          account: 'acct_z_platform',
          limit: 25,
          filters: expect.objectContaining({
            email: 'test@example.com',
            test_clock: 'clock_z_1',
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
          url: '/v1/customers',
        });
      await module.ListCustomers({ account: 'acct_z_platform' });
      expect(listSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          filters: {},
        })
      );
      listSpy.mockRestore();
    });
  });
});
