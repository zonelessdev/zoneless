import { PaymentIntentModule } from '../modules/PaymentIntent';
import { Database } from '../modules/Database';
import { CustomerModule } from '../modules/Customer';
import { AccountModule } from '../modules/Account';
import { EventService } from '../modules/EventService';
import { AppError } from '../utils/AppError';
import { ListHelper } from '../utils/ListHelper';
import {
  PaymentIntent,
  PaymentIntentAmountDetailsLineItem,
  QueryOperators,
  INCOMPLETE_PAYMENT_INTENT_STATUSES,
} from '@zoneless/shared-types';
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

describe('PaymentIntentModule', () => {
  let module: PaymentIntentModule;
  let mockDb: jest.Mocked<Database>;
  let mockCustomerModule: jest.Mocked<Pick<CustomerModule, 'GetCustomer'>>;
  let eventService: jest.Mocked<EventService>;

  beforeEach(() => {
    jest.clearAllMocks();
    ResetIdCounter();
    mockDb = CreateMockDatabase();
    mockCustomerModule = {
      GetCustomer: jest.fn(),
    };
    eventService = {
      Emit: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<EventService>;
    module = new PaymentIntentModule(
      mockDb,
      eventService,
      mockCustomerModule as unknown as CustomerModule
    );
  });

  describe('PaymentIntentObject', () => {
    it('should create a PaymentIntent with sensible defaults', () => {
      const paymentIntent = module.PaymentIntentObject('acct_z_platform', {
        amount: 2000,
        currency: 'usdc',
      });

      expect(paymentIntent.object).toBe('payment_intent');
      expect(paymentIntent.platform_account).toBe('acct_z_platform');
      expect(paymentIntent.amount).toBe(2000);
      expect(paymentIntent.amount_capturable).toBe(0);
      expect(paymentIntent.amount_received).toBe(0);
      expect(paymentIntent.amount_details).toEqual({ tip: {} });
      expect(paymentIntent.application).toBeNull();
      expect(paymentIntent.application_fee_amount).toBeNull();
      expect(paymentIntent.automatic_payment_methods).toBeNull();
      expect(paymentIntent.canceled_at).toBeNull();
      expect(paymentIntent.cancellation_reason).toBeNull();
      expect(paymentIntent.capture_method).toBe('automatic_async');
      expect(paymentIntent.confirmation_method).toBe('automatic');
      expect(paymentIntent.currency).toBe('usdc');
      expect(paymentIntent.customer).toBeNull();
      expect(paymentIntent.customer_account).toBeNull();
      expect(paymentIntent.description).toBeNull();
      expect(paymentIntent.last_payment_error).toBeNull();
      expect(paymentIntent.latest_charge).toBeNull();
      expect(paymentIntent.livemode).toBe(false);
      expect(paymentIntent.metadata).toEqual({});
      expect(paymentIntent.next_action).toBeNull();
      expect(paymentIntent.on_behalf_of).toBeNull();
      expect(paymentIntent.payment_method).toBeNull();
      expect(paymentIntent.payment_method_types).toEqual(['crypto']);
      expect(paymentIntent.receipt_email).toBeNull();
      expect(paymentIntent.setup_future_usage).toBeNull();
      expect(paymentIntent.shipping).toBeNull();
      expect(paymentIntent.status).toBe('requires_payment_method');
      expect(paymentIntent.transfer_data).toBeNull();
      expect(paymentIntent.transfer_group).toBeNull();
      expect(paymentIntent.client_secret).toContain(paymentIntent.id);
      expect(paymentIntent.client_secret).toContain('secret');
    });

    it('should accept provided input fields', () => {
      const paymentIntent = module.PaymentIntentObject('acct_z_platform', {
        amount: 5000,
        currency: 'usdc',
        application_fee_amount: 100,
        automatic_payment_methods: {
          enabled: true,
          allow_redirects: 'never',
        },
        capture_method: 'manual',
        confirmation_method: 'manual',
        customer: 'cus_z_1',
        description: 'Test payment',
        metadata: { order_id: '123' },
        payment_method: 'pm_z_1',
        payment_method_types: ['crypto'],
        receipt_email: 'buyer@example.com',
        setup_future_usage: 'off_session',
        shipping: {
          address: {
            city: 'San Francisco',
            country: 'US',
            line1: '123 Market St',
          },
          name: 'Jane Doe',
          phone: '+14155552671',
        },
        statement_descriptor: 'ZONELESS',
        transfer_group: 'group_1',
      });

      expect(paymentIntent.amount).toBe(5000);
      expect(paymentIntent.application_fee_amount).toBe(100);
      expect(paymentIntent.automatic_payment_methods).toEqual({
        enabled: true,
        allow_redirects: 'never',
      });
      expect(paymentIntent.capture_method).toBe('manual');
      expect(paymentIntent.confirmation_method).toBe('manual');
      expect(paymentIntent.customer).toBe('cus_z_1');
      expect(paymentIntent.description).toBe('Test payment');
      expect(paymentIntent.metadata).toEqual({ order_id: '123' });
      expect(paymentIntent.payment_method).toBe('pm_z_1');
      expect(paymentIntent.status).toBe('requires_confirmation');
      expect(paymentIntent.receipt_email).toBe('buyer@example.com');
      expect(paymentIntent.setup_future_usage).toBe('off_session');
      expect(paymentIntent.shipping).toEqual({
        address: {
          city: 'San Francisco',
          country: 'US',
          line1: '123 Market St',
          line2: null,
          postal_code: null,
          state: null,
        },
        carrier: null,
        name: 'Jane Doe',
        phone: '+14155552671',
        tracking_number: null,
      });
      expect(paymentIntent.statement_descriptor).toBe('ZONELESS');
      expect(paymentIntent.transfer_group).toBe('group_1');
    });
  });

  describe('CreatePaymentIntent', () => {
    it('should persist the PaymentIntent to the database', async () => {
      const paymentIntent = await module.CreatePaymentIntent(
        'acct_z_platform',
        {
          amount: 2000,
          currency: 'usdc',
        }
      );

      expect(mockDb.Set).toHaveBeenCalledTimes(1);
      expect(mockDb.Set).toHaveBeenCalledWith(
        'PaymentIntents',
        paymentIntent.id,
        paymentIntent
      );
      expect(paymentIntent.status).toBe('requires_payment_method');
    });

    it('should default currency to usdc when omitted', async () => {
      const paymentIntent = await module.CreatePaymentIntent(
        'acct_z_platform',
        {
          amount: 2000,
        } as Parameters<PaymentIntentModule['CreatePaymentIntent']>[1]
      );

      expect(paymentIntent.currency).toBe('usdc');
    });

    it('should reject unsupported currencies', async () => {
      await expect(
        module.CreatePaymentIntent('acct_z_platform', {
          amount: 2000,
          currency: 'usd',
        })
      ).rejects.toBeInstanceOf(AppError);
    });

    it('should reject confirm=true until confirm is implemented', async () => {
      await expect(
        module.CreatePaymentIntent('acct_z_platform', {
          amount: 2000,
          currency: 'usdc',
          confirm: true,
        })
      ).rejects.toThrow(/not yet supported/);
    });

    it('should reject application_fee_amount greater than amount', async () => {
      await expect(
        module.CreatePaymentIntent('acct_z_platform', {
          amount: 100,
          currency: 'usdc',
          application_fee_amount: 200,
        })
      ).rejects.toThrow(/application_fee_amount/);
    });

    it('should validate the customer belongs to the platform', async () => {
      mockCustomerModule.GetCustomer.mockResolvedValue({
        id: 'cus_z_1',
        platform_account: 'acct_z_other',
      } as never);

      await expect(
        module.CreatePaymentIntent('acct_z_platform', {
          amount: 2000,
          currency: 'usdc',
          customer: 'cus_z_1',
        })
      ).rejects.toThrow(/Customer not found/);
    });

    it('should accept a customer on the same platform', async () => {
      mockCustomerModule.GetCustomer.mockResolvedValue({
        id: 'cus_z_1',
        platform_account: 'acct_z_platform',
      } as never);

      const paymentIntent = await module.CreatePaymentIntent(
        'acct_z_platform',
        {
          amount: 2000,
          currency: 'usdc',
          customer: 'cus_z_1',
        }
      );

      expect(paymentIntent.customer).toBe('cus_z_1');
      expect(mockCustomerModule.GetCustomer).toHaveBeenCalledWith('cus_z_1');
    });

    it('should validate transfer_data destination is a connected account', async () => {
      jest.spyOn(AccountModule.prototype, 'GetAccount').mockResolvedValue(null);

      await expect(
        module.CreatePaymentIntent('acct_z_platform', {
          amount: 2000,
          currency: 'usdc',
          transfer_data: { destination: 'acct_z_missing' },
        })
      ).rejects.toThrow(/No such connected account/);
    });
  });

  describe('GetPaymentIntent', () => {
    it('should return the PaymentIntent from the database', async () => {
      const stored = module.PaymentIntentObject('acct_z_platform', {
        amount: 2000,
        currency: 'usdc',
      });
      mockDb.Get.mockResolvedValue(stored);

      const result = await module.GetPaymentIntent(stored.id);

      expect(mockDb.Get).toHaveBeenCalledWith('PaymentIntents', stored.id);
      expect(result).toEqual(stored);
    });
  });

  describe('RetrievePaymentIntent', () => {
    it('should return the PaymentIntent without a client_secret', async () => {
      const stored = module.PaymentIntentObject('acct_z_platform', {
        amount: 2000,
        currency: 'usdc',
      });
      mockDb.Get.mockResolvedValue(stored);

      const result = await module.RetrievePaymentIntent(stored.id);

      expect(result).toEqual(stored);
    });

    it('should accept a matching client_secret', async () => {
      const stored = module.PaymentIntentObject('acct_z_platform', {
        amount: 2000,
        currency: 'usdc',
      });
      mockDb.Get.mockResolvedValue(stored);

      const result = await module.RetrievePaymentIntent(
        stored.id,
        stored.client_secret!
      );

      expect(result.id).toBe(stored.id);
    });

    it('should reject a mismatched client_secret', async () => {
      const stored = module.PaymentIntentObject('acct_z_platform', {
        amount: 2000,
        currency: 'usdc',
      });
      mockDb.Get.mockResolvedValue(stored);

      await expect(
        module.RetrievePaymentIntent(stored.id, 'wrong_secret')
      ).rejects.toThrow(/Payment intent not found/);
    });

    it('should throw when the PaymentIntent does not exist', async () => {
      mockDb.Get.mockResolvedValue(null);

      await expect(
        module.RetrievePaymentIntent('pi_z_missing')
      ).rejects.toThrow(/Payment intent not found/);
    });
  });

  describe('CancelPaymentIntent', () => {
    it('should cancel a PaymentIntent in requires_payment_method', async () => {
      const stored = module.PaymentIntentObject('acct_z_platform', {
        amount: 2000,
        currency: 'usdc',
      });
      const canceled = {
        ...stored,
        status: 'canceled' as const,
        canceled_at: GetFixedTimestamp(),
        cancellation_reason: null,
        next_action: null,
        amount_capturable: 0,
      };
      mockDb.Get.mockResolvedValueOnce(stored).mockResolvedValueOnce(canceled);

      const result = await module.CancelPaymentIntent(stored.id);

      expect(mockDb.Update).toHaveBeenCalledWith(
        'PaymentIntents',
        stored.id,
        expect.objectContaining({
          status: 'canceled',
          canceled_at: GetFixedTimestamp(),
          cancellation_reason: null,
          next_action: null,
          amount_capturable: 0,
        })
      );
      expect(result.status).toBe('canceled');
    });

    it('should persist the cancellation_reason', async () => {
      const stored = module.PaymentIntentObject('acct_z_platform', {
        amount: 2000,
        currency: 'usdc',
      });
      const canceled = {
        ...stored,
        status: 'canceled' as const,
        canceled_at: GetFixedTimestamp(),
        cancellation_reason: 'requested_by_customer' as const,
      };
      mockDb.Get.mockResolvedValueOnce(stored).mockResolvedValueOnce(canceled);

      await module.CancelPaymentIntent(stored.id, {
        cancellation_reason: 'requested_by_customer',
      });

      expect(mockDb.Update).toHaveBeenCalledWith(
        'PaymentIntents',
        stored.id,
        expect.objectContaining({
          cancellation_reason: 'requested_by_customer',
        })
      );
    });

    it('should allow canceling from requires_capture', async () => {
      const stored = {
        ...module.PaymentIntentObject('acct_z_platform', {
          amount: 2000,
          currency: 'usdc',
        }),
        status: 'requires_capture' as const,
        amount_capturable: 2000,
      };
      const canceled = {
        ...stored,
        status: 'canceled' as const,
        canceled_at: GetFixedTimestamp(),
        amount_capturable: 0,
      };
      mockDb.Get.mockResolvedValueOnce(stored).mockResolvedValueOnce(canceled);

      await module.CancelPaymentIntent(stored.id);

      expect(mockDb.Update).toHaveBeenCalledWith(
        'PaymentIntents',
        stored.id,
        expect.objectContaining({
          status: 'canceled',
          amount_capturable: 0,
        })
      );
    });

    it('should reject cancel when status is succeeded', async () => {
      const stored = {
        ...module.PaymentIntentObject('acct_z_platform', {
          amount: 2000,
          currency: 'usdc',
        }),
        status: 'succeeded' as const,
      };
      mockDb.Get.mockResolvedValue(stored);

      await expect(module.CancelPaymentIntent(stored.id)).rejects.toThrow(
        /cannot be canceled because it has status: succeeded/
      );
    });

    it('should reject cancel when already canceled', async () => {
      const stored = {
        ...module.PaymentIntentObject('acct_z_platform', {
          amount: 2000,
          currency: 'usdc',
        }),
        status: 'canceled' as const,
      };
      mockDb.Get.mockResolvedValue(stored);

      await expect(module.CancelPaymentIntent(stored.id)).rejects.toThrow(
        /cannot be canceled because it has status: canceled/
      );
    });

    it('should throw when PaymentIntent does not exist', async () => {
      mockDb.Get.mockResolvedValue(null);

      await expect(module.CancelPaymentIntent('pi_z_missing')).rejects.toThrow(
        /Payment intent not found/
      );
    });
  });

  describe('UpdatePaymentIntent', () => {
    function SeedPaymentIntent(
      overrides: Partial<
        ReturnType<PaymentIntentModule['PaymentIntentObject']>
      > = {}
    ) {
      const stored = {
        ...module.PaymentIntentObject('acct_z_platform', {
          amount: 2000,
          currency: 'usdc',
        }),
        ...overrides,
      };
      mockDb.Get.mockResolvedValue(stored);
      return stored;
    }

    it('should update metadata and persist the change', async () => {
      const stored = SeedPaymentIntent();
      const updated = {
        ...stored,
        metadata: { order_id: '6735' },
      };
      mockDb.Get.mockResolvedValueOnce(stored).mockResolvedValueOnce(updated);

      const result = await module.UpdatePaymentIntent(stored.id, {
        metadata: { order_id: '6735' },
      });

      expect(mockDb.Update).toHaveBeenCalledWith(
        'PaymentIntents',
        stored.id,
        expect.objectContaining({ metadata: { order_id: '6735' } })
      );
      expect(result.metadata).toEqual({ order_id: '6735' });
    });

    it('should update amount and description', async () => {
      const stored = SeedPaymentIntent();
      const updated = { ...stored, amount: 5000, description: 'Updated' };
      mockDb.Get.mockResolvedValueOnce(stored).mockResolvedValueOnce(updated);

      await module.UpdatePaymentIntent(stored.id, {
        amount: 5000,
        description: 'Updated',
      });

      expect(mockDb.Update).toHaveBeenCalledWith(
        'PaymentIntents',
        stored.id,
        expect.objectContaining({
          amount: 5000,
          description: 'Updated',
        })
      );
    });

    it('should set status to requires_confirmation when attaching a payment method', async () => {
      const stored = SeedPaymentIntent({ payment_method: null });
      const updated = {
        ...stored,
        payment_method: 'pm_z_1',
        status: 'requires_confirmation' as const,
      };
      mockDb.Get.mockResolvedValueOnce(stored).mockResolvedValueOnce(updated);

      await module.UpdatePaymentIntent(stored.id, {
        payment_method: 'pm_z_1',
      });

      expect(mockDb.Update).toHaveBeenCalledWith(
        'PaymentIntents',
        stored.id,
        expect.objectContaining({
          payment_method: 'pm_z_1',
          status: 'requires_confirmation',
        })
      );
    });

    it('should unset payment_method when an empty string is passed', async () => {
      const stored = SeedPaymentIntent({
        payment_method: 'pm_z_1',
        status: 'requires_confirmation',
      });
      const updated = {
        ...stored,
        payment_method: null,
        status: 'requires_payment_method' as const,
      };
      mockDb.Get.mockResolvedValueOnce(stored).mockResolvedValueOnce(updated);

      await module.UpdatePaymentIntent(stored.id, {
        payment_method: '',
      });

      expect(mockDb.Update).toHaveBeenCalledWith(
        'PaymentIntents',
        stored.id,
        expect.objectContaining({
          payment_method: null,
          status: 'requires_payment_method',
        })
      );
    });

    it('should reject updates when status is not updatable', async () => {
      SeedPaymentIntent({ status: 'succeeded' });

      await expect(
        module.UpdatePaymentIntent('pi_z_test001', {
          metadata: { order_id: '1' },
        })
      ).rejects.toThrow(/cannot be updated in status 'succeeded'/);
    });

    it('should reject unsupported currencies', async () => {
      SeedPaymentIntent();

      await expect(
        module.UpdatePaymentIntent('pi_z_test001', {
          currency: 'usd',
        })
      ).rejects.toThrow(/not supported/);
    });

    it('should reject application_fee_amount greater than amount', async () => {
      SeedPaymentIntent({ amount: 100 });

      await expect(
        module.UpdatePaymentIntent('pi_z_test001', {
          application_fee_amount: 200,
        })
      ).rejects.toThrow(/application_fee_amount/);
    });

    it('should reject changing transfer_group once set', async () => {
      SeedPaymentIntent({ transfer_group: 'group_1' });

      await expect(
        module.UpdatePaymentIntent('pi_z_test001', {
          transfer_group: 'group_2',
        })
      ).rejects.toThrow(/transfer_group/);
    });

    it('should reject payment_method_data', async () => {
      SeedPaymentIntent();

      await expect(
        module.UpdatePaymentIntent('pi_z_test001', {
          payment_method_data: { type: 'crypto' },
        })
      ).rejects.toThrow(/payment_method_data/);
    });

    it('should throw when PaymentIntent does not exist', async () => {
      mockDb.Get.mockResolvedValue(null);

      await expect(
        module.UpdatePaymentIntent('pi_z_missing', {
          metadata: { order_id: '1' },
        })
      ).rejects.toThrow(/Payment intent not found/);
    });

    it('should validate the customer belongs to the platform', async () => {
      SeedPaymentIntent();
      mockCustomerModule.GetCustomer.mockResolvedValue({
        id: 'cus_z_1',
        platform_account: 'acct_z_other',
      } as never);

      await expect(
        module.UpdatePaymentIntent('pi_z_test001', {
          customer: 'cus_z_1',
        })
      ).rejects.toThrow(/Customer not found/);
    });
  });

  describe('ListPaymentIntents', () => {
    it('should pass account and PaymentIntent filters to ListHelper', async () => {
      const listSpy = jest
        .spyOn(ListHelper.prototype, 'List')
        .mockResolvedValue({
          object: 'list',
          data: [],
          has_more: false,
          url: '/v1/payment_intents',
        });

      await module.ListPaymentIntents({
        account: 'acct_z_platform',
        limit: 25,
        customer: 'cus_z_1',
        customer_account: 'acct_z_customer',
        status: 'succeeded',
      });

      expect(listSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          account: 'acct_z_platform',
          limit: 25,
          filters: expect.objectContaining({
            customer: 'cus_z_1',
            customer_account: 'acct_z_customer',
            status: 'succeeded',
          }),
        })
      );
      listSpy.mockRestore();
    });

    it('should expand incomplete status into an in-filter', async () => {
      const listSpy = jest
        .spyOn(ListHelper.prototype, 'List')
        .mockResolvedValue({
          object: 'list',
          data: [],
          has_more: false,
          url: '/v1/payment_intents',
        });

      await module.ListPaymentIntents({
        account: 'acct_z_platform',
        status: 'incomplete',
      });

      expect(listSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          filters: expect.objectContaining({
            status: {
              operator: QueryOperators['in'],
              value: INCOMPLETE_PAYMENT_INTENT_STATUSES,
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
          url: '/v1/payment_intents',
        });

      await module.ListPaymentIntents({ account: 'acct_z_platform' });

      expect(listSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          filters: {},
        })
      );
      listSpy.mockRestore();
    });
  });

  describe('ListAmountDetailsLineItems', () => {
    function BuildLineItem(
      overrides: Partial<PaymentIntentAmountDetailsLineItem> = {}
    ): PaymentIntentAmountDetailsLineItem {
      return {
        id: 'uli_z_1',
        object: 'payment_intent_amount_details_line_item',
        discount_amount: null,
        payment_method_options: null,
        product_code: null,
        product_name: 'Product',
        quantity: 1,
        tax: null,
        unit_cost: 2000,
        unit_of_measure: null,
        ...overrides,
      };
    }

    function BuildPaymentIntentWithThreeItems(): PaymentIntent {
      return {
        ...module.PaymentIntentObject('acct_z_platform', {
          amount: 6000,
          currency: 'usdc',
        }),
        amount_details: {
          tip: {},
          line_items: [
            BuildLineItem({ id: 'uli_z_1', product_name: 'A' }),
            BuildLineItem({ id: 'uli_z_2', product_name: 'B' }),
            BuildLineItem({ id: 'uli_z_3', product_name: 'C' }),
          ],
        },
      };
    }

    it('should assign stable IDs to line items on create', () => {
      const paymentIntent = module.PaymentIntentObject('acct_z_platform', {
        amount: 2000,
        currency: 'usdc',
        amount_details: {
          line_items: [
            {
              product_name: 'Product 001',
              quantity: 1,
              unit_cost: 2000,
              discount_amount: 50,
              product_code: 'SKU001',
              tax: { total_tax_amount: 20 },
              unit_of_measure: 'each',
            },
          ],
        },
      });

      expect(paymentIntent.amount_details?.line_items).toEqual([
        expect.objectContaining({
          id: expect.stringMatching(/^uli_z_/),
          object: 'payment_intent_amount_details_line_item',
          product_name: 'Product 001',
          quantity: 1,
          unit_cost: 2000,
          discount_amount: 50,
          product_code: 'SKU001',
          tax: { total_tax_amount: 20 },
          unit_of_measure: 'each',
          payment_method_options: null,
        }),
      ]);
    });

    it('should return a page of line items with has_more', () => {
      const paymentIntent = BuildPaymentIntentWithThreeItems();

      const result = module.ListAmountDetailsLineItems(paymentIntent, {
        limit: 2,
      });

      expect(result.object).toBe('list');
      expect(result.data.map((item) => item.id)).toEqual([
        'uli_z_1',
        'uli_z_2',
      ]);
      expect(result.has_more).toBe(true);
      expect(result.url).toBe(
        `/v1/payment_intents/${paymentIntent.id}/amount_details_line_items`
      );
    });

    it('should paginate forwards with starting_after', () => {
      const paymentIntent = BuildPaymentIntentWithThreeItems();

      const result = module.ListAmountDetailsLineItems(paymentIntent, {
        startingAfter: 'uli_z_1',
      });

      expect(result.data.map((item) => item.id)).toEqual([
        'uli_z_2',
        'uli_z_3',
      ]);
      expect(result.has_more).toBe(false);
    });

    it('should paginate backwards with ending_before', () => {
      const paymentIntent = BuildPaymentIntentWithThreeItems();

      const result = module.ListAmountDetailsLineItems(paymentIntent, {
        endingBefore: 'uli_z_3',
      });

      expect(result.data.map((item) => item.id)).toEqual([
        'uli_z_1',
        'uli_z_2',
      ]);
      expect(result.has_more).toBe(false);
    });

    it('should return an empty list when there are no line items', () => {
      const paymentIntent = module.PaymentIntentObject('acct_z_platform', {
        amount: 2000,
        currency: 'usdc',
      });

      const result = module.ListAmountDetailsLineItems(paymentIntent, {});

      expect(result.data).toEqual([]);
      expect(result.has_more).toBe(false);
    });

    it('should throw on an invalid cursor', () => {
      const paymentIntent = BuildPaymentIntentWithThreeItems();

      expect(() =>
        module.ListAmountDetailsLineItems(paymentIntent, {
          startingAfter: 'uli_z_unknown',
        })
      ).toThrow('Invalid starting_after ID');
    });
  });

  describe('lifecycle transitions', () => {
    function StoredPaymentIntent(
      status: PaymentIntent['status'] = 'requires_payment_method'
    ): PaymentIntent {
      return {
        ...module.PaymentIntentObject('acct_z_platform', {
          amount: 2000,
          currency: 'usdc',
        }),
        status,
      };
    }

    it('should mark requires_confirmation and emit payment_intent.updated', async () => {
      const stored = StoredPaymentIntent();
      const updated = {
        ...stored,
        status: 'requires_confirmation' as const,
        payment_method: 'PayerWallet111',
        next_action: null,
      };
      mockDb.Get.mockResolvedValueOnce(stored)
        .mockResolvedValueOnce(stored)
        .mockResolvedValueOnce(updated);

      const result = await module.MarkRequiresConfirmation(stored.id, {
        paymentMethod: 'PayerWallet111',
      });

      expect(mockDb.Update).toHaveBeenCalledWith(
        'PaymentIntents',
        stored.id,
        expect.objectContaining({
          status: 'requires_confirmation',
          payment_method: 'PayerWallet111',
        })
      );
      expect(eventService.Emit).toHaveBeenCalledWith(
        'payment_intent.updated',
        'acct_z_platform',
        updated,
        expect.objectContaining({
          previousAttributes: expect.objectContaining({
            status: 'requires_payment_method',
          }),
        })
      );
      expect(result.status).toBe('requires_confirmation');
    });

    it('should be idempotent when already requires_confirmation', async () => {
      const stored = StoredPaymentIntent('requires_confirmation');
      mockDb.Get.mockResolvedValue(stored);

      const result = await module.MarkRequiresConfirmation(stored.id);

      expect(mockDb.Update).not.toHaveBeenCalled();
      expect(eventService.Emit).not.toHaveBeenCalled();
      expect(result).toEqual(stored);
    });

    it('should mark requires_action and emit payment_intent.requires_action', async () => {
      const stored = StoredPaymentIntent('requires_confirmation');
      const updated = {
        ...stored,
        status: 'requires_action' as const,
        next_action: { type: 'use_stripe_sdk' },
      };
      mockDb.Get.mockResolvedValueOnce(stored)
        .mockResolvedValueOnce(stored)
        .mockResolvedValueOnce(updated);

      const result = await module.MarkRequiresAction(stored.id, {
        type: 'use_stripe_sdk',
      });

      expect(mockDb.Update).toHaveBeenCalledWith(
        'PaymentIntents',
        stored.id,
        expect.objectContaining({
          status: 'requires_action',
          next_action: { type: 'use_stripe_sdk' },
        })
      );
      expect(eventService.Emit).toHaveBeenCalledWith(
        'payment_intent.requires_action',
        'acct_z_platform',
        updated
      );
      expect(result.status).toBe('requires_action');
    });

    it('should refresh next_action without re-emitting when already requires_action', async () => {
      const stored = StoredPaymentIntent('requires_action');
      const refreshed = {
        ...stored,
        next_action: { type: 'use_stripe_sdk', attempt: 2 },
      };
      mockDb.Get.mockResolvedValueOnce(stored).mockResolvedValueOnce(refreshed);

      await module.MarkRequiresAction(stored.id, {
        type: 'use_stripe_sdk',
        attempt: 2,
      });

      expect(mockDb.Update).toHaveBeenCalledWith(
        'PaymentIntents',
        stored.id,
        expect.objectContaining({
          next_action: { type: 'use_stripe_sdk', attempt: 2 },
        })
      );
      expect(eventService.Emit).not.toHaveBeenCalled();
    });

    it('should mark processing and emit payment_intent.processing', async () => {
      const stored = StoredPaymentIntent('requires_confirmation');
      const updated = {
        ...stored,
        status: 'processing' as const,
        next_action: null,
      };
      mockDb.Get.mockResolvedValueOnce(stored)
        .mockResolvedValueOnce(stored)
        .mockResolvedValueOnce(updated);

      const result = await module.MarkProcessing(stored.id);

      expect(mockDb.Update).toHaveBeenCalledWith(
        'PaymentIntents',
        stored.id,
        expect.objectContaining({ status: 'processing', next_action: null })
      );
      expect(eventService.Emit).toHaveBeenCalledWith(
        'payment_intent.processing',
        'acct_z_platform',
        updated
      );
      expect(result.status).toBe('processing');
    });

    it('should be idempotent when already processing', async () => {
      const stored = StoredPaymentIntent('processing');
      mockDb.Get.mockResolvedValue(stored);

      const result = await module.MarkProcessing(stored.id);

      expect(mockDb.Update).not.toHaveBeenCalled();
      expect(eventService.Emit).not.toHaveBeenCalled();
      expect(result).toEqual(stored);
    });

    it('should mark succeeded and emit payment_intent.succeeded', async () => {
      const stored = StoredPaymentIntent('processing');
      const updated = {
        ...stored,
        status: 'succeeded' as const,
        amount_received: 2000,
        latest_charge: 'sig_abc',
        next_action: null,
      };
      mockDb.Get.mockResolvedValueOnce(stored)
        .mockResolvedValueOnce(stored)
        .mockResolvedValueOnce(updated);

      const result = await module.MarkSucceeded(stored.id, {
        amountReceived: 2000,
        latestCharge: 'sig_abc',
      });

      expect(mockDb.Update).toHaveBeenCalledWith(
        'PaymentIntents',
        stored.id,
        expect.objectContaining({
          status: 'succeeded',
          amount_received: 2000,
          latest_charge: 'sig_abc',
        })
      );
      expect(eventService.Emit).toHaveBeenCalledWith(
        'payment_intent.succeeded',
        'acct_z_platform',
        updated
      );
      expect(result.status).toBe('succeeded');
    });

    it('should mark payment failed and emit payment_intent.payment_failed', async () => {
      const stored = StoredPaymentIntent('processing');
      const lastPaymentError = {
        advice_code: null,
        charge: null,
        code: 'payment_intent_payment_attempt_failed',
        decline_code: null,
        doc_url: null,
        message: 'Amount mismatch',
        network_advice_code: null,
        network_decline_code: null,
        param: null,
        payment_method: null,
        payment_method_type: 'crypto',
        source: null,
        type: 'invalid_request_error' as const,
      };
      const updated = {
        ...stored,
        status: 'requires_payment_method' as const,
        last_payment_error: lastPaymentError,
        next_action: null,
      };
      mockDb.Get.mockResolvedValueOnce(stored).mockResolvedValueOnce(updated);

      const result = await module.MarkPaymentFailed(
        stored.id,
        lastPaymentError
      );

      expect(mockDb.Update).toHaveBeenCalledWith(
        'PaymentIntents',
        stored.id,
        expect.objectContaining({
          status: 'requires_payment_method',
          last_payment_error: lastPaymentError,
        })
      );
      expect(eventService.Emit).toHaveBeenCalledWith(
        'payment_intent.payment_failed',
        'acct_z_platform',
        updated
      );
      expect(result.status).toBe('requires_payment_method');
    });

    it('should reject succeeded transition from canceled', async () => {
      const stored = StoredPaymentIntent('canceled');
      mockDb.Get.mockResolvedValue(stored);

      await expect(module.MarkSucceeded(stored.id)).rejects.toThrow(
        /cannot transition to 'succeeded' from status 'canceled'/
      );
      expect(eventService.Emit).not.toHaveBeenCalled();
    });
  });
});
