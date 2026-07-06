import { CustomerModule } from '../modules/Customer';
import { Database } from '../modules/Database';
import { Customer } from '@zoneless/shared-types';
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
});
