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
});
