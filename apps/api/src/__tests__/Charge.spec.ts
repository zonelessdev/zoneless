import { ChargeModule } from '../modules/Charge';
import { Database } from '../modules/Database';
import { CustomerModule } from '../modules/Customer';
import { AccountModule } from '../modules/Account';
import { EventService } from '../modules/EventService';
import { AppError } from '../utils/AppError';
import { ListHelper } from '../utils/ListHelper';
import {
  CreateMockDatabase,
  DeterministicId,
  ResetIdCounter,
  GetFixedTimestamp,
} from './Setup';

const mockDashboardUrl = 'http://localhost:4200';

jest.mock('../modules/Database');
jest.mock('../utils/IdGenerator', () => ({
  GenerateId: jest.fn((prefix: string) => DeterministicId(prefix)),
}));
jest.mock('../utils/Timestamp', () => ({
  Now: jest.fn(() => GetFixedTimestamp()),
}));
jest.mock('../modules/AppConfig', () => ({
  GetAppConfig: jest.fn(() => ({
    dashboardUrl: mockDashboardUrl,
    livemode: false,
    appSecret: 'test-secret',
  })),
}));

describe('ChargeModule', () => {
  let module: ChargeModule;
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
    module = new ChargeModule(
      mockDb,
      eventService,
      mockCustomerModule as unknown as CustomerModule
    );
  });

  describe('ChargeObject', () => {
    it('should create a captured Charge with sensible defaults', () => {
      const charge = module.ChargeObject('acct_z_platform', {
        amount: 2000,
        currency: 'usdc',
        source: 'pm_z_wallet',
      });

      expect(charge.object).toBe('charge');
      expect(charge.platform_account).toBe('acct_z_platform');
      expect(charge.amount).toBe(2000);
      expect(charge.amount_captured).toBe(2000);
      expect(charge.amount_refunded).toBe(0);
      expect(charge.application).toBeNull();
      expect(charge.application_fee).toBeNull();
      expect(charge.application_fee_amount).toBeNull();
      expect(charge.balance_transaction).toBeNull();
      expect(charge.billing_details).toEqual({
        address: {
          city: null,
          country: null,
          line1: null,
          line2: null,
          postal_code: null,
          state: null,
        },
        email: null,
        name: null,
        phone: null,
        tax_id: null,
      });
      expect(charge.captured).toBe(true);
      expect(charge.created).toBe(GetFixedTimestamp());
      expect(charge.currency).toBe('usdc');
      expect(charge.customer).toBeNull();
      expect(charge.description).toBeNull();
      expect(charge.disputed).toBe(false);
      expect(charge.fraud_details).toEqual({});
      expect(charge.livemode).toBe(false);
      expect(charge.metadata).toEqual({});
      expect(charge.paid).toBe(true);
      expect(charge.payment_intent).toBeNull();
      expect(charge.payment_method).toBe('pm_z_wallet');
      expect(charge.payment_method_details).toEqual({
        type: 'crypto',
        crypto: {
          buyer_address: null,
          fingerprint: null,
          network: 'solana',
          token_currency: 'usdc',
          transaction_hash: null,
        },
      });
      expect(charge.receipt_number).toBe(`rcpt_${charge.id}`);
      expect(charge.receipt_url).toBe(
        `${mockDashboardUrl}/v1/receipts/${charge.id}`
      );
      expect(charge.refunded).toBe(false);
      expect(charge.refunds).toEqual({
        object: 'list',
        data: [],
        has_more: false,
        url: `/v1/charges/${charge.id}/refunds`,
      });
      expect(charge.status).toBe('succeeded');
      expect(charge.transfer_data).toBeNull();
      expect(charge.transfer_group).toBeNull();
      expect(charge.id).toMatch(/^ch_z_test/);
    });

    it('should create an uncaptured Charge when capture is false', () => {
      const charge = module.ChargeObject('acct_z_platform', {
        amount: 2000,
        currency: 'usdc',
        source: 'pm_z_wallet',
        capture: false,
      });

      expect(charge.captured).toBe(false);
      expect(charge.amount_captured).toBe(0);
      expect(charge.status).toBe('pending');
      expect(charge.paid).toBe(true);
      expect(charge.outcome?.seller_message).toBe('Payment authorized.');
    });

    it('should accept provided input fields', () => {
      const charge = module.ChargeObject('acct_z_platform', {
        amount: 5000,
        currency: 'usdc',
        application_fee_amount: 100,
        customer: 'cus_z_1',
        description: 'Test charge',
        metadata: { order_id: '123' },
        receipt_email: 'buyer@example.com',
        source: 'pm_z_wallet',
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
        transfer_data: {
          destination: 'acct_z_seller',
          amount: 4500,
        },
      });

      expect(charge.amount).toBe(5000);
      expect(charge.application_fee_amount).toBe(100);
      expect(charge.customer).toBe('cus_z_1');
      expect(charge.description).toBe('Test charge');
      expect(charge.metadata).toEqual({ order_id: '123' });
      expect(charge.receipt_email).toBe('buyer@example.com');
      expect(charge.shipping).toEqual({
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
      expect(charge.statement_descriptor).toBe('ZONELESS');
      expect(charge.transfer_group).toBe('group_1');
      expect(charge.transfer_data).toEqual({
        amount: 4500,
        destination: 'acct_z_seller',
      });
    });
  });

  describe('CreateCharge', () => {
    it('should persist the Charge and emit charge.succeeded when captured', async () => {
      const charge = await module.CreateCharge('acct_z_platform', {
        amount: 2000,
        currency: 'usdc',
        source: 'pm_z_wallet',
      });

      expect(mockDb.Set).toHaveBeenCalledTimes(1);
      expect(mockDb.Set).toHaveBeenCalledWith('Charges', charge.id, charge);
      expect(charge.status).toBe('succeeded');
      expect(charge.captured).toBe(true);
      expect(charge.receipt_number).toEqual(expect.any(String));
      expect(charge.receipt_number).toBe(`rcpt_${charge.id}`);
      expect(charge.receipt_url).toBe(
        `${mockDashboardUrl}/v1/receipts/${charge.id}`
      );
      expect(eventService.Emit).toHaveBeenCalledWith(
        'charge.succeeded',
        'acct_z_platform',
        charge
      );
    });

    it('should emit charge.pending when capture is false', async () => {
      const charge = await module.CreateCharge('acct_z_platform', {
        amount: 2000,
        currency: 'usdc',
        source: 'pm_z_wallet',
        capture: false,
      });

      expect(charge.status).toBe('pending');
      expect(charge.captured).toBe(false);
      expect(eventService.Emit).toHaveBeenCalledWith(
        'charge.pending',
        'acct_z_platform',
        charge
      );
    });

    it('should default currency to usdc when omitted', async () => {
      const charge = await module.CreateCharge('acct_z_platform', {
        amount: 2000,
        source: 'pm_z_wallet',
      } as Parameters<ChargeModule['CreateCharge']>[1]);

      expect(charge.currency).toBe('usdc');
    });

    it('should reject unsupported currencies', async () => {
      await expect(
        module.CreateCharge('acct_z_platform', {
          amount: 2000,
          currency: 'usd',
          source: 'pm_z_wallet',
        })
      ).rejects.toBeInstanceOf(AppError);
    });

    it('should reject when neither source nor customer is provided', async () => {
      await expect(
        module.CreateCharge('acct_z_platform', {
          amount: 2000,
          currency: 'usdc',
        })
      ).rejects.toThrow(/source or a customer/);
    });

    it('should reject application_fee_amount greater than amount', async () => {
      await expect(
        module.CreateCharge('acct_z_platform', {
          amount: 100,
          currency: 'usdc',
          source: 'pm_z_wallet',
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
        module.CreateCharge('acct_z_platform', {
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

      const charge = await module.CreateCharge('acct_z_platform', {
        amount: 2000,
        currency: 'usdc',
        customer: 'cus_z_1',
      });

      expect(charge.customer).toBe('cus_z_1');
      expect(mockCustomerModule.GetCustomer).toHaveBeenCalledWith('cus_z_1');
    });

    it('should validate transfer_data destination is a connected account', async () => {
      jest.spyOn(AccountModule.prototype, 'GetAccount').mockResolvedValue(null);

      await expect(
        module.CreateCharge('acct_z_platform', {
          amount: 2000,
          currency: 'usdc',
          source: 'pm_z_wallet',
          transfer_data: { destination: 'acct_z_missing' },
        })
      ).rejects.toThrow(/No such connected account/);
    });
  });

  describe('GetCharge', () => {
    it('should return the Charge from the database', async () => {
      const stored = module.ChargeObject('acct_z_platform', {
        amount: 2000,
        currency: 'usdc',
        source: 'pm_z_wallet',
      });
      mockDb.Get.mockResolvedValue(stored);

      const result = await module.GetCharge(stored.id);

      expect(mockDb.Get).toHaveBeenCalledWith('Charges', stored.id);
      expect(result).toEqual(stored);
    });
  });

  describe('RetrieveCharge', () => {
    it('should return the Charge when found', async () => {
      const stored = module.ChargeObject('acct_z_platform', {
        amount: 2000,
        currency: 'usdc',
        source: 'pm_z_wallet',
      });
      mockDb.Get.mockResolvedValue(stored);

      const result = await module.RetrieveCharge(stored.id);

      expect(result).toEqual(stored);
    });

    it('should throw when the Charge does not exist', async () => {
      mockDb.Get.mockResolvedValue(null);

      await expect(module.RetrieveCharge('ch_z_missing')).rejects.toThrow(
        /Charge not found/
      );
    });
  });

  describe('UpdateCharge', () => {
    function SeedCharge(
      overrides: Partial<ReturnType<ChargeModule['ChargeObject']>> = {}
    ) {
      const stored = {
        ...module.ChargeObject('acct_z_platform', {
          amount: 2000,
          currency: 'usdc',
          source: 'pm_z_wallet',
        }),
        ...overrides,
      };
      mockDb.Get.mockResolvedValue(stored);
      return stored;
    }

    it('should update metadata and emit charge.updated', async () => {
      const stored = SeedCharge();
      const updated = {
        ...stored,
        metadata: { shipping: 'express' },
      };
      mockDb.Get.mockResolvedValueOnce(stored).mockResolvedValueOnce(updated);

      const result = await module.UpdateCharge(stored.id, {
        metadata: { shipping: 'express' },
      });

      expect(mockDb.Update).toHaveBeenCalledWith(
        'Charges',
        stored.id,
        expect.objectContaining({ metadata: { shipping: 'express' } })
      );
      expect(result.metadata).toEqual({ shipping: 'express' });
      expect(eventService.Emit).toHaveBeenCalledWith(
        'charge.updated',
        'acct_z_platform',
        updated,
        expect.objectContaining({
          previousAttributes: expect.any(Object),
        })
      );
    });

    it('should update description and receipt_email', async () => {
      const stored = SeedCharge();
      const updated = {
        ...stored,
        description: 'Updated',
        receipt_email: 'new@example.com',
      };
      mockDb.Get.mockResolvedValueOnce(stored).mockResolvedValueOnce(updated);

      await module.UpdateCharge(stored.id, {
        description: 'Updated',
        receipt_email: 'new@example.com',
      });

      expect(mockDb.Update).toHaveBeenCalledWith(
        'Charges',
        stored.id,
        expect.objectContaining({
          description: 'Updated',
          receipt_email: 'new@example.com',
        })
      );
    });

    it('should update fraud_details.user_report', async () => {
      const stored = SeedCharge({ fraud_details: {} });
      const updated = {
        ...stored,
        fraud_details: { user_report: 'fraudulent' as const },
      };
      mockDb.Get.mockResolvedValueOnce(stored).mockResolvedValueOnce(updated);

      await module.UpdateCharge(stored.id, {
        fraud_details: { user_report: 'fraudulent' },
      });

      expect(mockDb.Update).toHaveBeenCalledWith(
        'Charges',
        stored.id,
        expect.objectContaining({
          fraud_details: { user_report: 'fraudulent' },
        })
      );
    });

    it('should reject changing customer once set', async () => {
      SeedCharge({ customer: 'cus_z_existing' });

      await expect(
        module.UpdateCharge('ch_z_test001', {
          customer: 'cus_z_other',
        })
      ).rejects.toThrow(/customer can only be set/);
    });

    it('should reject changing transfer_group once set', async () => {
      SeedCharge({ transfer_group: 'group_1' });

      await expect(
        module.UpdateCharge('ch_z_test001', {
          transfer_group: 'group_2',
        })
      ).rejects.toThrow(/transfer_group/);
    });

    it('should throw when Charge does not exist', async () => {
      mockDb.Get.mockResolvedValue(null);

      await expect(
        module.UpdateCharge('ch_z_missing', {
          metadata: { order_id: '1' },
        })
      ).rejects.toThrow(/Charge not found/);
    });

    it('should validate the customer belongs to the platform', async () => {
      SeedCharge({ customer: null });
      mockCustomerModule.GetCustomer.mockResolvedValue({
        id: 'cus_z_1',
        platform_account: 'acct_z_other',
      } as never);

      await expect(
        module.UpdateCharge('ch_z_test001', {
          customer: 'cus_z_1',
        })
      ).rejects.toThrow(/Customer not found/);
    });
  });

  describe('CaptureCharge', () => {
    function SeedUncapturedCharge(
      overrides: Partial<ReturnType<ChargeModule['ChargeObject']>> = {}
    ) {
      const stored = {
        ...module.ChargeObject('acct_z_platform', {
          amount: 2000,
          currency: 'usdc',
          source: 'pm_z_wallet',
          capture: false,
        }),
        ...overrides,
      };
      return stored;
    }

    it('should capture an uncaptured Charge and emit charge.captured', async () => {
      const stored = SeedUncapturedCharge();
      const captured = {
        ...stored,
        captured: true,
        amount_captured: 2000,
        status: 'succeeded' as const,
      };
      mockDb.Get.mockResolvedValueOnce(stored).mockResolvedValueOnce(captured);

      const result = await module.CaptureCharge(stored.id);

      expect(mockDb.Update).toHaveBeenCalledWith(
        'Charges',
        stored.id,
        expect.objectContaining({
          captured: true,
          amount_captured: 2000,
          status: 'succeeded',
          paid: true,
        })
      );
      expect(result.captured).toBe(true);
      expect(eventService.Emit).toHaveBeenCalledWith(
        'charge.captured',
        'acct_z_platform',
        captured
      );
    });

    it('should support partial capture via amount', async () => {
      const stored = SeedUncapturedCharge();
      const captured = {
        ...stored,
        captured: true,
        amount_captured: 1500,
        status: 'succeeded' as const,
      };
      mockDb.Get.mockResolvedValueOnce(stored).mockResolvedValueOnce(captured);

      await module.CaptureCharge(stored.id, { amount: 1500 });

      expect(mockDb.Update).toHaveBeenCalledWith(
        'Charges',
        stored.id,
        expect.objectContaining({
          amount_captured: 1500,
        })
      );
    });

    it('should reject capturing an already captured Charge', async () => {
      const stored = module.ChargeObject('acct_z_platform', {
        amount: 2000,
        currency: 'usdc',
        source: 'pm_z_wallet',
      });
      mockDb.Get.mockResolvedValue(stored);

      await expect(module.CaptureCharge(stored.id)).rejects.toThrow(
        /already been captured/
      );
    });

    it('should reject capture amount greater than authorized amount', async () => {
      const stored = SeedUncapturedCharge();
      mockDb.Get.mockResolvedValue(stored);

      await expect(
        module.CaptureCharge(stored.id, { amount: 5000 })
      ).rejects.toThrow(/cannot exceed the authorized/);
    });

    it('should throw when Charge does not exist', async () => {
      mockDb.Get.mockResolvedValue(null);

      await expect(module.CaptureCharge('ch_z_missing')).rejects.toThrow(
        /Charge not found/
      );
    });
  });

  describe('ListCharges', () => {
    it('should pass account and Charge filters to ListHelper', async () => {
      const listSpy = jest
        .spyOn(ListHelper.prototype, 'List')
        .mockResolvedValue({
          object: 'list',
          data: [],
          has_more: false,
          url: '/v1/charges',
        });

      await module.ListCharges({
        account: 'acct_z_platform',
        limit: 25,
        customer: 'cus_z_1',
        payment_intent: 'pi_z_1',
        transfer_group: 'group_1',
      });

      expect(listSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          account: 'acct_z_platform',
          limit: 25,
          filters: expect.objectContaining({
            customer: 'cus_z_1',
            payment_intent: 'pi_z_1',
            transfer_group: 'group_1',
          }),
        })
      );

      listSpy.mockRestore();
    });

    it('should omit undefined filters', async () => {
      const listSpy = jest
        .spyOn(ListHelper.prototype, 'List')
        .mockResolvedValue({
          object: 'list',
          data: [],
          has_more: false,
          url: '/v1/charges',
        });

      await module.ListCharges({ account: 'acct_z_platform' });

      expect(listSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          filters: {},
        })
      );

      listSpy.mockRestore();
    });
  });

  describe('MarkFailed', () => {
    it('should mark a Charge as failed and emit charge.failed', async () => {
      const stored = module.ChargeObject('acct_z_platform', {
        amount: 2000,
        currency: 'usdc',
        source: 'pm_z_wallet',
        capture: false,
      });
      const failed = {
        ...stored,
        status: 'failed' as const,
        paid: false,
        failure_code: 'insufficient_funds',
        failure_message: 'Not enough USDC',
      };
      mockDb.Get.mockResolvedValueOnce(stored).mockResolvedValueOnce(failed);

      const result = await module.MarkFailed(stored.id, {
        failureCode: 'insufficient_funds',
        failureMessage: 'Not enough USDC',
      });

      expect(mockDb.Update).toHaveBeenCalledWith(
        'Charges',
        stored.id,
        expect.objectContaining({
          status: 'failed',
          paid: false,
          failure_code: 'insufficient_funds',
          failure_message: 'Not enough USDC',
        })
      );
      expect(result.status).toBe('failed');
      expect(eventService.Emit).toHaveBeenCalledWith(
        'charge.failed',
        'acct_z_platform',
        failed
      );
    });

    it('should be idempotent when already failed', async () => {
      const stored = {
        ...module.ChargeObject('acct_z_platform', {
          amount: 2000,
          currency: 'usdc',
          source: 'pm_z_wallet',
        }),
        status: 'failed' as const,
        paid: false,
      };
      mockDb.Get.mockResolvedValue(stored);

      const result = await module.MarkFailed(stored.id);

      expect(mockDb.Update).not.toHaveBeenCalled();
      expect(eventService.Emit).not.toHaveBeenCalled();
      expect(result).toEqual(stored);
    });
  });

  describe('MarkExpired', () => {
    it('should expire an uncaptured Charge and emit charge.expired', async () => {
      const stored = module.ChargeObject('acct_z_platform', {
        amount: 2000,
        currency: 'usdc',
        source: 'pm_z_wallet',
        capture: false,
      });
      const expired = {
        ...stored,
        status: 'failed' as const,
        paid: false,
        failure_code: 'expired_uncaptured_charge',
      };
      mockDb.Get.mockResolvedValueOnce(stored).mockResolvedValueOnce(expired);

      const result = await module.MarkExpired(stored.id);

      expect(mockDb.Update).toHaveBeenCalledWith(
        'Charges',
        stored.id,
        expect.objectContaining({
          status: 'failed',
          failure_code: 'expired_uncaptured_charge',
        })
      );
      expect(result.status).toBe('failed');
      expect(eventService.Emit).toHaveBeenCalledWith(
        'charge.expired',
        'acct_z_platform',
        expired
      );
    });

    it('should reject expiring a captured Charge', async () => {
      const stored = module.ChargeObject('acct_z_platform', {
        amount: 2000,
        currency: 'usdc',
        source: 'pm_z_wallet',
      });
      mockDb.Get.mockResolvedValue(stored);

      await expect(module.MarkExpired(stored.id)).rejects.toThrow(
        /Cannot expire a captured charge/
      );
    });
  });

  describe('MarkRefunded', () => {
    it('should mark a full refund and emit charge.refunded', async () => {
      const stored = module.ChargeObject('acct_z_platform', {
        amount: 2000,
        currency: 'usdc',
        source: 'pm_z_wallet',
      });
      const refunded = {
        ...stored,
        amount_refunded: 2000,
        refunded: true,
      };
      mockDb.Get.mockResolvedValueOnce(stored).mockResolvedValueOnce(refunded);

      const result = await module.MarkRefunded(stored.id, 2000);

      expect(mockDb.Update).toHaveBeenCalledWith(
        'Charges',
        stored.id,
        expect.objectContaining({
          amount_refunded: 2000,
          refunded: true,
        })
      );
      expect(result.refunded).toBe(true);
      expect(eventService.Emit).toHaveBeenCalledWith(
        'charge.refunded',
        'acct_z_platform',
        refunded
      );
    });

    it('should mark a partial refund without setting refunded=true', async () => {
      const stored = module.ChargeObject('acct_z_platform', {
        amount: 2000,
        currency: 'usdc',
        source: 'pm_z_wallet',
      });
      const refunded = {
        ...stored,
        amount_refunded: 500,
        refunded: false,
      };
      mockDb.Get.mockResolvedValueOnce(stored).mockResolvedValueOnce(refunded);

      await module.MarkRefunded(stored.id, 500);

      expect(mockDb.Update).toHaveBeenCalledWith(
        'Charges',
        stored.id,
        expect.objectContaining({
          amount_refunded: 500,
          refunded: false,
        })
      );
    });

    it('should reject refund amounts outside the charge amount', async () => {
      const stored = module.ChargeObject('acct_z_platform', {
        amount: 2000,
        currency: 'usdc',
        source: 'pm_z_wallet',
      });
      mockDb.Get.mockResolvedValue(stored);

      await expect(module.MarkRefunded(stored.id, 5000)).rejects.toThrow(
        /between 0 and the charge amount/
      );
    });
  });

  describe('CreateFromPaymentAttempt', () => {
    it('should create a succeeded Charge linked to a PaymentIntent', async () => {
      const charge = await module.CreateFromPaymentAttempt('acct_z_platform', {
        amount: 1000,
        currency: 'usdc',
        payment_intent: 'pi_z_1',
        payment_method: 'PayerWallet111',
        customer: 'cus_z_1',
        crypto: {
          buyer_address: 'PayerWallet111',
          transaction_hash: 'sig_abc',
        },
        outcome: 'succeeded',
      });

      expect(mockDb.Set).toHaveBeenCalledWith('Charges', charge.id, charge);
      expect(charge.status).toBe('succeeded');
      expect(charge.captured).toBe(true);
      expect(charge.payment_intent).toBe('pi_z_1');
      expect(charge.receipt_number).toBe(`rcpt_${charge.id}`);
      expect(charge.receipt_url).toBe(
        `${mockDashboardUrl}/v1/receipts/${charge.id}`
      );
      expect(charge.payment_method_details).toEqual({
        type: 'crypto',
        crypto: {
          buyer_address: 'PayerWallet111',
          fingerprint: null,
          network: 'solana',
          token_currency: 'usdc',
          transaction_hash: 'sig_abc',
        },
      });
      expect(eventService.Emit).toHaveBeenCalledWith(
        'charge.succeeded',
        'acct_z_platform',
        charge
      );
    });

    it('should create a failed Charge and emit charge.failed', async () => {
      const charge = await module.CreateFromPaymentAttempt('acct_z_platform', {
        amount: 1000,
        currency: 'usdc',
        payment_intent: 'pi_z_1',
        payment_method: 'PayerWallet111',
        crypto: {
          buyer_address: null,
          transaction_hash: 'sig_bad',
        },
        outcome: 'failed',
        failure_code: 'payment_intent_payment_attempt_failed',
        failure_message: 'Amount mismatch',
      });

      expect(charge.status).toBe('failed');
      expect(charge.paid).toBe(false);
      expect(charge.captured).toBe(false);
      expect(charge.failure_message).toBe('Amount mismatch');
      expect(eventService.Emit).toHaveBeenCalledWith(
        'charge.failed',
        'acct_z_platform',
        charge
      );
    });
  });

  describe('AttachBalanceTransaction', () => {
    it('should link a balance transaction to the Charge', async () => {
      const stored = module.ChargeObject('acct_z_platform', {
        amount: 2000,
        currency: 'usdc',
        source: 'pm_z_wallet',
      });
      const updated = {
        ...stored,
        balance_transaction: 'txn_z_1',
      };
      mockDb.Get.mockResolvedValue(updated);

      const result = await module.AttachBalanceTransaction(
        stored.id,
        'txn_z_1'
      );

      expect(mockDb.Update).toHaveBeenCalledWith('Charges', stored.id, {
        balance_transaction: 'txn_z_1',
      });
      expect(result.balance_transaction).toBe('txn_z_1');
    });
  });
});
