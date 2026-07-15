import { InvoiceItemModule } from '../modules/InvoiceItem';
import { Database } from '../modules/Database';
import { EventService } from '../modules/EventService';
import { CustomerModule } from '../modules/Customer';
import { PriceModule } from '../modules/Price';
import { InvoiceItem, QueryOperators } from '@zoneless/shared-types';
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

describe('InvoiceItemModule', () => {
  let module: InvoiceItemModule;
  let mockDb: jest.Mocked<Database>;
  let eventService: jest.Mocked<EventService>;
  let customerModule: jest.Mocked<CustomerModule>;
  let priceModule: jest.Mocked<PriceModule>;

  beforeEach(() => {
    jest.clearAllMocks();
    ResetIdCounter();
    mockDb = CreateMockDatabase();
    eventService = {
      Emit: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<EventService>;
    customerModule = {
      GetCustomer: jest.fn().mockResolvedValue({
        id: 'cus_z_1',
        platform_account: 'acct_z_platform',
      }),
    } as unknown as jest.Mocked<CustomerModule>;
    priceModule = {
      GetPrice: jest.fn().mockResolvedValue({
        id: 'price_z_1',
        platform_account: 'acct_z_platform',
        product: 'prod_z_1',
        unit_amount: 1099,
        unit_amount_decimal: '1099',
        currency: 'usdc',
      }),
      CreatePrice: jest.fn(),
    } as unknown as jest.Mocked<PriceModule>;
    module = new InvoiceItemModule(
      mockDb,
      eventService,
      customerModule,
      priceModule
    );
  });

  describe('InvoiceItemObject', () => {
    it('should create an invoice item with sensible defaults', () => {
      const invoiceItem = module.InvoiceItemObject(
        'acct_z_platform',
        { customer: 'cus_z_1', amount: 1099 },
        {
          amount: 1099,
          currency: 'usdc',
          pricing: {
            price_details: null,
            type: 'price_details',
            unit_amount_decimal: '1099',
          },
        }
      );

      expect(invoiceItem.object).toBe('invoiceitem');
      expect(invoiceItem.customer).toBe('cus_z_1');
      expect(invoiceItem.amount).toBe(1099);
      expect(invoiceItem.currency).toBe('usdc');
      expect(invoiceItem.platform_account).toBe('acct_z_platform');
      expect(invoiceItem.date).toBe(GetFixedTimestamp());
      expect(invoiceItem.created).toBe(GetFixedTimestamp());
      expect(invoiceItem.quantity).toBe(1);
      expect(invoiceItem.quantity_decimal).toBe('1');
      expect(invoiceItem.discountable).toBe(true);
      expect(invoiceItem.proration).toBe(false);
      expect(invoiceItem.invoice).toBeNull();
      expect(invoiceItem.livemode).toBe(false);
      expect(invoiceItem.metadata).toEqual({});
      expect(invoiceItem.period).toEqual({
        start: GetFixedTimestamp(),
        end: GetFixedTimestamp(),
      });
    });

    it('should default discountable to false for negative amounts', () => {
      const invoiceItem = module.InvoiceItemObject(
        'acct_z_platform',
        { customer: 'cus_z_1', amount: -500 },
        {
          amount: -500,
          currency: 'usdc',
          pricing: {
            price_details: null,
            type: 'price_details',
            unit_amount_decimal: '-500',
          },
        }
      );

      expect(invoiceItem.discountable).toBe(false);
      expect(invoiceItem.net_amount).toBe(-500);
    });
  });

  describe('CreateInvoiceItem', () => {
    it('should persist the invoice item and emit invoiceitem.created', async () => {
      const invoiceItem = await module.CreateInvoiceItem('acct_z_platform', {
        customer: 'cus_z_1',
        amount: 1099,
      });

      expect(mockDb.Set).toHaveBeenCalledWith(
        'InvoiceItems',
        invoiceItem.id,
        invoiceItem
      );
      expect(eventService.Emit).toHaveBeenCalledWith(
        'invoiceitem.created',
        'acct_z_platform',
        invoiceItem
      );
      expect(customerModule.GetCustomer).toHaveBeenCalledWith('cus_z_1');
    });

    it('should resolve amount from pricing.price', async () => {
      const invoiceItem = await module.CreateInvoiceItem('acct_z_platform', {
        customer: 'cus_z_1',
        pricing: { price: 'price_z_1' },
        quantity: 2,
      });

      expect(priceModule.GetPrice).toHaveBeenCalledWith('price_z_1');
      expect(invoiceItem.amount).toBe(2198);
      expect(invoiceItem.quantity).toBe(2);
      expect(invoiceItem.pricing).toEqual({
        price_details: {
          price: 'price_z_1',
          product: 'prod_z_1',
        },
        type: 'price_details',
        unit_amount_decimal: '1099',
      });
    });

    it('should reject customers that do not belong to the platform', async () => {
      customerModule.GetCustomer = jest.fn().mockResolvedValue({
        id: 'cus_z_1',
        platform_account: 'acct_z_other',
      });

      await expect(
        module.CreateInvoiceItem('acct_z_platform', {
          customer: 'cus_z_1',
          amount: 100,
        })
      ).rejects.toThrow('Customer not found');
    });

    it('should reject unsupported currencies', async () => {
      await expect(
        module.CreateInvoiceItem('acct_z_platform', {
          customer: 'cus_z_1',
          amount: 100,
          currency: 'usd',
        })
      ).rejects.toThrow("Currency 'usd' is not supported");
    });
  });

  describe('UpdateInvoiceItem', () => {
    it('should update metadata without emitting an updated event', async () => {
      const existing = {
        id: 'ii_z_1',
        object: 'invoiceitem',
        platform_account: 'acct_z_platform',
        amount: 1099,
        quantity: 1,
        discountable: true,
        metadata: {},
        pricing: {
          price_details: null,
          type: 'price_details',
          unit_amount_decimal: '1099',
        },
        date: GetFixedTimestamp(),
        created: GetFixedTimestamp(),
      } as InvoiceItem;
      mockDb.Get = jest.fn().mockResolvedValue(existing);

      const result = await module.UpdateInvoiceItem('ii_z_1', {
        metadata: { order_id: '6735' },
      });

      expect(mockDb.Update).toHaveBeenCalledWith(
        'InvoiceItems',
        'ii_z_1',
        expect.objectContaining({ metadata: { order_id: '6735' } })
      );
      expect(eventService.Emit).not.toHaveBeenCalled();
      expect(result).toEqual(existing);
    });

    it('should throw when invoice item not found', async () => {
      await expect(
        module.UpdateInvoiceItem('nonexistent', { metadata: {} })
      ).rejects.toThrow('Invoice item not found');
    });
  });

  describe('GetInvoiceItem', () => {
    it('should return the invoice item when found', async () => {
      const mockItem = { id: 'ii_z_1', object: 'invoiceitem' } as InvoiceItem;
      mockDb.Get = jest.fn().mockResolvedValue(mockItem);

      const result = await module.GetInvoiceItem('ii_z_1');
      expect(result).toEqual(mockItem);
    });

    it('should return null when not found', async () => {
      const result = await module.GetInvoiceItem('nonexistent');
      expect(result).toBeNull();
    });
  });

  describe('DeleteInvoiceItem', () => {
    it('should delete and emit invoiceitem.deleted', async () => {
      const existing = {
        id: 'ii_z_1',
        object: 'invoiceitem',
        platform_account: 'acct_z_platform',
      } as InvoiceItem;
      mockDb.Get = jest.fn().mockResolvedValue(existing);

      const result = await module.DeleteInvoiceItem('ii_z_1');

      expect(mockDb.Delete).toHaveBeenCalledWith('InvoiceItems', 'ii_z_1');
      expect(eventService.Emit).toHaveBeenCalledWith(
        'invoiceitem.deleted',
        'acct_z_platform',
        existing
      );
      expect(result).toEqual({
        id: 'ii_z_1',
        object: 'invoiceitem',
        deleted: true,
      });
    });

    it('should throw when invoice item not found', async () => {
      await expect(module.DeleteInvoiceItem('nonexistent')).rejects.toThrow(
        'Invoice item not found'
      );
    });
  });

  describe('ListInvoiceItems', () => {
    it('should pass account and filters to ListHelper', async () => {
      const listSpy = jest
        .spyOn(ListHelper.prototype, 'List')
        .mockResolvedValue({
          object: 'list',
          data: [],
          has_more: false,
          url: '/v1/invoiceitems',
        });

      await module.ListInvoiceItems({
        account: 'acct_z_platform',
        limit: 25,
        customer: 'cus_z_1',
        pending: true,
      });

      expect(listSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          account: 'acct_z_platform',
          limit: 25,
          filters: expect.objectContaining({
            customer: 'cus_z_1',
            invoice: null,
          }),
        })
      );
    });

    it('should filter non-pending items when pending is false', async () => {
      const listSpy = jest
        .spyOn(ListHelper.prototype, 'List')
        .mockResolvedValue({
          object: 'list',
          data: [],
          has_more: false,
          url: '/v1/invoiceitems',
        });

      await module.ListInvoiceItems({
        account: 'acct_z_platform',
        pending: false,
      });

      expect(listSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          filters: expect.objectContaining({
            invoice: {
              operator: QueryOperators['!='],
              value: null,
            },
          }),
        })
      );
    });
  });
});
