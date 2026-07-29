import { PayoutModule } from '../modules/Payout';
import { Database } from '../modules/Database';
import { Payout } from '@zoneless/shared-types';
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
jest.mock('../modules/chains/Solana', () => ({
  Solana: jest.fn().mockImplementation(() => ({
    CheckWalletExists: jest.fn().mockResolvedValue(true),
    GetUSDCBalance: jest.fn().mockResolvedValue(100),
    GetSOLBalance: jest.fn().mockResolvedValue(1),
    BuildBatchPayoutTransaction: jest.fn().mockResolvedValue({
      unsigned_transaction: 'base64tx',
      estimated_fee_lamports: 5000,
      blockhash: 'blockhash123',
      last_valid_block_height: 100000,
      recipients_count: 1,
    }),
    GetCheckoutFeePayerPublicKey: jest.fn().mockReturnValue('platform_wallet'),
    SignAndSimulatePayoutTransaction: jest
      .fn()
      .mockResolvedValue('signed_base64tx'),
    BroadcastSignedTransaction: jest.fn().mockResolvedValue({
      status: 'paid',
      signature: 'sig123',
      viewer_url: 'https://solscan.io/tx/sig123',
    }),
  })),
}));

describe('PayoutModule', () => {
  let module: PayoutModule;
  let mockDb: jest.Mocked<Database>;

  beforeEach(() => {
    jest.clearAllMocks();
    ResetIdCounter();
    mockDb = CreateMockDatabase();
    module = new PayoutModule(mockDb);
  });

  describe('PayoutObject', () => {
    it('should build a payout with correct fields', () => {
      const payout = module.PayoutObject({
        account: 'acct_z_seller',
        platformAccountId: 'acct_z_platform',
        amount: 5000,
        currency: 'usdc',
        destination: 'wa_z_1',
        description: 'Weekly payout',
        method: 'instant',
        metadata: {},
      });

      expect(payout.object).toBe('payout');
      expect(payout.amount).toBe(5000);
      expect(payout.currency).toBe('usdc');
      expect(payout.account).toBe('acct_z_seller');
      expect(payout.platform_account).toBe('acct_z_platform');
      expect(payout.destination).toBe('wa_z_1');
      expect(payout.status).toBe('pending');
      expect(payout.method).toBe('instant');
      expect(payout.type).toBe('wallet');
      expect(payout.source_type).toBe('wallet');
      expect(payout.id).toMatch(/^po_z_test/);
    });

    it('should default to instant method', () => {
      const payout = module.PayoutObject({
        account: 'acct_z_1',
        platformAccountId: 'acct_z_platform',
        amount: 100,
        currency: 'usdc',
        destination: 'wa_z_1',
      });

      expect(payout.method).toBe('instant');
    });

    it('should default automatic to false', () => {
      const payout = module.PayoutObject({
        account: 'acct_z_1',
        platformAccountId: 'acct_z_platform',
        amount: 100,
        currency: 'usdc',
        destination: 'wa_z_1',
      });

      expect(payout.automatic).toBe(false);
    });
  });

  describe('GetPayout', () => {
    it('should return the payout when found', async () => {
      const mockPayout = { id: 'po_z_1', object: 'payout' } as Payout;
      mockDb.Get = jest.fn().mockResolvedValue(mockPayout);

      const result = await module.GetPayout('po_z_1');
      expect(result).toEqual(mockPayout);
    });

    it('should return null when not found', async () => {
      const result = await module.GetPayout('nonexistent');
      expect(result).toBeNull();
    });
  });

  describe('UpdatePayout', () => {
    it('should update payout metadata', async () => {
      const existingPayout = {
        id: 'po_z_1',
        object: 'payout',
        account: 'acct_z_1',
        metadata: {},
      } as Payout;
      mockDb.Get = jest.fn().mockResolvedValue(existingPayout);

      const result = await module.UpdatePayout('po_z_1', {
        metadata: { tracking: '12345' },
      });

      expect(mockDb.Update).toHaveBeenCalledWith(
        'Payouts',
        'po_z_1',
        expect.objectContaining({ metadata: { tracking: '12345' } })
      );
      expect(result).toEqual(existingPayout);
    });

    it('should throw when payout not found', async () => {
      await expect(
        module.UpdatePayout('nonexistent', { metadata: {} })
      ).rejects.toThrow('Payout not found');
    });
  });

  describe('CancelPayout', () => {
    it('should cancel a pending payout and refund the balance', async () => {
      const pendingPayout = {
        id: 'po_z_1',
        object: 'payout',
        status: 'pending',
        amount: 1000,
        currency: 'usdc',
        account: 'acct_z_1',
        balance_transaction: 'txn_z_1',
      } as Payout;

      const balance = {
        id: 'bal_z_1',
        available: [{ amount: 0, currency: 'usdc' }],
        pending: [],
      };

      mockDb.Get = jest
        .fn()
        .mockResolvedValueOnce(pendingPayout) // GetPayout
        .mockResolvedValue(pendingPayout); // subsequent gets
      mockDb.Find = jest.fn().mockResolvedValue([balance]);

      const result = await module.CancelPayout('po_z_1');

      expect(mockDb.Update).toHaveBeenCalledWith(
        'Payouts',
        'po_z_1',
        { status: 'canceled' },
        expect.anything()
      );
    });

    it('should throw when payout not found', async () => {
      await expect(module.CancelPayout('nonexistent')).rejects.toThrow(
        'Payout not found'
      );
    });

    it('should throw when payout is not pending', async () => {
      const paidPayout = {
        id: 'po_z_1',
        status: 'paid',
      } as Payout;
      mockDb.Get = jest.fn().mockResolvedValue(paidPayout);

      await expect(module.CancelPayout('po_z_1')).rejects.toThrow(
        'Payout cannot be canceled'
      );
    });
  });

  describe('CreateAndProcessDashboardPayout', () => {
    const payout = {
      id: 'po_z_1',
      object: 'payout',
      account: 'acct_z_seller',
      platform_account: 'acct_z_platform',
      amount: 1000,
      currency: 'usdc',
      destination: 'wa_z_1',
      status: 'pending',
    } as Payout;

    const input = {
      amount: 1000,
      currency: 'usdc',
      destination: 'wa_z_1',
    };

    it('rejects a signer mismatch before creating the payout', async () => {
      jest
        .spyOn(module as any, 'GetPlatformWalletPublicKey')
        .mockResolvedValue('different_wallet');
      const createSpy = jest.spyOn(module, 'CreatePayout');

      await expect(
        module.CreateAndProcessDashboardPayout(
          'acct_z_platform',
          'acct_z_seller',
          input
        )
      ).rejects.toThrow(
        'TRANSACTION_FEE_PAYER_KEY environment variable must match the platform payout wallet'
      );
      expect(createSpy).not.toHaveBeenCalled();
    });

    it('reuses the build and broadcast flow for a dashboard payout', async () => {
      jest
        .spyOn(module as any, 'GetPlatformWalletPublicKey')
        .mockResolvedValue('platform_wallet');
      jest.spyOn(module, 'CreatePayout').mockResolvedValue(payout);
      jest.spyOn(module, 'BuildPayoutsBatch').mockResolvedValue({
        object: 'payout_batch_build',
        unsigned_transaction: 'base64tx',
        estimated_fee_lamports: 5000,
        blockhash: 'blockhash123',
        last_valid_block_height: 100000,
        payouts: [payout],
        total_amount: 1000,
        recipients_count: 1,
      });
      const broadcastSpy = jest
        .spyOn(module, 'BroadcastPayoutsBatch')
        .mockResolvedValue({
          object: 'payout_batch_broadcast',
          signature: 'sig123',
          status: 'paid',
          viewer_url: 'https://solscan.io/tx/sig123',
          payouts: [{ ...payout, status: 'paid' }],
        });

      const result = await module.CreateAndProcessDashboardPayout(
        'acct_z_platform',
        'acct_z_seller',
        input
      );

      expect(result.status).toBe('paid');
      expect(broadcastSpy).toHaveBeenCalledWith('acct_z_platform', {
        signed_transaction: 'signed_base64tx',
        payouts: ['po_z_1'],
        blockhash: 'blockhash123',
        last_valid_block_height: 100000,
      });
    });

    it('fails and refunds a payout when signing or simulation fails', async () => {
      jest
        .spyOn(module as any, 'GetPlatformWalletPublicKey')
        .mockResolvedValue('platform_wallet');
      jest.spyOn(module, 'CreatePayout').mockResolvedValue(payout);
      jest.spyOn(module, 'BuildPayoutsBatch').mockResolvedValue({
        object: 'payout_batch_build',
        unsigned_transaction: 'base64tx',
        estimated_fee_lamports: 5000,
        blockhash: 'blockhash123',
        last_valid_block_height: 100000,
        payouts: [payout],
        total_amount: 1000,
        recipients_count: 1,
      });
      (module as any).solana.SignAndSimulatePayoutTransaction.mockRejectedValue(
        new Error('Simulation failed')
      );
      const processingPayout = { ...payout, status: 'processing' } as Payout;
      const failedPayout = {
        ...payout,
        status: 'failed',
        failure_message: 'Simulation failed',
      } as Payout;
      jest
        .spyOn(module, 'GetPayout')
        .mockResolvedValueOnce(processingPayout)
        .mockResolvedValueOnce(failedPayout);
      const failSpy = jest
        .spyOn(module as any, 'MarkPayoutFailed')
        .mockResolvedValue(undefined);

      const result = await module.CreateAndProcessDashboardPayout(
        'acct_z_platform',
        'acct_z_seller',
        input
      );

      expect(failSpy).toHaveBeenCalledWith(
        processingPayout,
        'blockchain_error',
        'Simulation failed'
      );
      expect(result.status).toBe('failed');
      expect(result.payouts).toEqual([failedPayout]);
    });
  });
});
