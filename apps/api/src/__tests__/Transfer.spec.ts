import { TransferModule } from '../modules/Transfer';
import { Database } from '../modules/Database';
import { Transfer } from '@zoneless/shared-types';
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

describe('TransferModule', () => {
  let module: TransferModule;
  let mockDb: jest.Mocked<Database>;

  beforeEach(() => {
    jest.clearAllMocks();
    ResetIdCounter();
    mockDb = CreateMockDatabase();
    module = new TransferModule(mockDb);
  });

  describe('TransferObject', () => {
    it('should build a transfer with correct fields', () => {
      const transfer = module.TransferObject({
        amount: 5000,
        currency: 'USDC',
        sourceAccount: 'acct_z_platform',
        platformAccountId: 'acct_z_platform',
        destination: 'acct_z_seller',
        description: 'Marketplace sale payout',
        metadata: { order_id: '42' },
        sourceTransaction: null,
        sourceType: 'wallet',
        transferGroup: 'order_42',
      });

      expect(transfer.object).toBe('transfer');
      expect(transfer.amount).toBe(5000);
      expect(transfer.currency).toBe('usdc');
      expect(transfer.destination).toBe('acct_z_seller');
      expect(transfer.account).toBe('acct_z_platform');
      expect(transfer.platform_account).toBe('acct_z_platform');
      expect(transfer.description).toBe('Marketplace sale payout');
      expect(transfer.metadata).toEqual({ order_id: '42' });
      expect(transfer.transfer_group).toBe('order_42');
      expect(transfer.source_type).toBe('wallet');
      expect(transfer.reversed).toBe(false);
      expect(transfer.amount_reversed).toBe(0);
      expect(transfer.id).toMatch(/^tr_z_test/);
    });

    it('should lowercase the currency', () => {
      const transfer = module.TransferObject({
        amount: 100,
        currency: 'USDC',
        sourceAccount: 'acct_z_1',
        platformAccountId: 'acct_z_1',
        destination: 'acct_z_2',
        description: null,
        metadata: {},
        sourceTransaction: null,
        sourceType: 'wallet',
        transferGroup: null,
      });

      expect(transfer.currency).toBe('usdc');
    });

    it('should initialise reversals as an empty list', () => {
      const transfer = module.TransferObject({
        amount: 100,
        currency: 'usdc',
        sourceAccount: 'acct_z_1',
        platformAccountId: 'acct_z_1',
        destination: 'acct_z_2',
        description: null,
        metadata: {},
        sourceTransaction: null,
        sourceType: 'wallet',
        transferGroup: null,
      });

      expect(transfer.reversals).toEqual({
        object: 'list',
        data: [],
        has_more: false,
        url: `/v1/transfers/${transfer.id}/reversals`,
      });
    });
  });

  describe('GetTransfer', () => {
    it('should return the transfer when found', async () => {
      const mockTransfer = {
        id: 'tr_z_1',
        object: 'transfer',
      } as Transfer;
      mockDb.Get = jest.fn().mockResolvedValue(mockTransfer);

      const result = await module.GetTransfer('tr_z_1');
      expect(result).toEqual(mockTransfer);
    });

    it('should return null when not found', async () => {
      const result = await module.GetTransfer('nonexistent');
      expect(result).toBeNull();
    });
  });

  describe('UpdateTransfer', () => {
    it('should update description and metadata', async () => {
      const existingTransfer = {
        id: 'tr_z_1',
        object: 'transfer',
        description: 'old',
        metadata: {},
        account: 'acct_z_1',
      } as Transfer;
      mockDb.Get = jest.fn().mockResolvedValue(existingTransfer);

      const result = await module.UpdateTransfer('tr_z_1', {
        description: 'Updated description',
        metadata: { note: 'updated' },
      });

      expect(mockDb.Update).toHaveBeenCalledWith(
        'Transfers',
        'tr_z_1',
        expect.objectContaining({
          description: 'Updated description',
          metadata: { note: 'updated' },
        })
      );
      expect(result).toEqual(existingTransfer);
    });

    it('should throw when transfer not found', async () => {
      await expect(
        module.UpdateTransfer('nonexistent', { description: 'test' })
      ).rejects.toThrow('Transfer not found');
    });
  });

  describe('CreateTransfer', () => {
    it('should reject self-transfers', async () => {
      await expect(
        module.CreateTransfer('acct_z_1', {
          amount: 1000,
          currency: 'usdc',
          destination: 'acct_z_1',
        })
      ).rejects.toThrow('Cannot transfer to the same account');
    });

    it('should reject when destination account not found', async () => {
      mockDb.Get = jest.fn().mockResolvedValue(null);

      await expect(
        module.CreateTransfer('acct_z_platform', {
          amount: 1000,
          currency: 'usdc',
          destination: 'acct_z_missing',
        })
      ).rejects.toThrow('No such connected account');
    });
  });
});
