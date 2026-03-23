import { ExternalWalletModule } from '../modules/ExternalWallet';
import { Database } from '../modules/Database';
import { ExternalWallet } from '@zoneless/shared-types';
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
jest.mock('../modules/SanctionsScreening', () => ({
  SanctionsScreeningModule: jest.fn().mockImplementation(() => ({
    CheckWalletAddress: jest
      .fn()
      .mockResolvedValue({ isSanctioned: false, source: 'ofac' }),
  })),
}));

const VALID_WALLET = 'B62qkR4YsHxFMi3hUgSbLZKEM9TDJFKvJPaRN3T7efgh';
const VALID_WALLET_2 = 'B62qkR4YsHxFMi3hUgSbLZKEM9TDJFKvJPaRN3T71234';

describe('ExternalWalletModule', () => {
  let module: ExternalWalletModule;
  let mockDb: jest.Mocked<Database>;

  beforeEach(() => {
    jest.clearAllMocks();
    ResetIdCounter();
    mockDb = CreateMockDatabase();
    module = new ExternalWalletModule(mockDb);
  });

  describe('ExternalWalletObject', () => {
    it('should create a wallet object with correct defaults', () => {
      const wallet = module.ExternalWalletObject(
        'acct_z_1',
        'acct_z_platform',
        {
          wallet_address: VALID_WALLET,
        }
      );

      expect(wallet.object).toBe('wallet');
      expect(wallet.account).toBe('acct_z_1');
      expect(wallet.platform_account).toBe('acct_z_platform');
      expect(wallet.wallet_address).toBe(VALID_WALLET);
      expect(wallet.network).toBe('solana');
      expect(wallet.currency).toBe('usdc');
      expect(wallet.status).toBe('new');
      expect(wallet.last4).toBe('efgh');
      expect(wallet.available_payout_methods).toEqual(['standard', 'instant']);
    });

    it('should use the last 4 characters of the wallet address', () => {
      const wallet = module.ExternalWalletObject(
        'acct_z_1',
        'acct_z_platform',
        { wallet_address: VALID_WALLET_2 }
      );

      expect(wallet.last4).toBe('1234');
    });
  });

  describe('CreateExternalWallet', () => {
    it('should screen, persist, and return the wallet', async () => {
      mockDb.Get = jest.fn().mockResolvedValue({
        id: 'acct_z_1',
        platform_account: 'acct_z_platform',
      });

      const wallet = await module.CreateExternalWallet('acct_z_1', {
        wallet_address: VALID_WALLET,
      });

      expect(wallet.object).toBe('wallet');
      expect(wallet.wallet_address).toBe(VALID_WALLET);
      expect(mockDb.Set).toHaveBeenCalledWith(
        'ExternalWallets',
        wallet.id,
        expect.objectContaining({
          wallet_address: VALID_WALLET,
        })
      );
    });

    it('should throw when account is not found', async () => {
      await expect(
        module.CreateExternalWallet('nonexistent', {
          wallet_address: VALID_WALLET,
        })
      ).rejects.toThrow('Account not found');
    });
  });

  describe('GetExternalWallet', () => {
    it('should return the wallet when found', async () => {
      const mockWallet = {
        id: 'wa_z_1',
        object: 'wallet',
      } as ExternalWallet;
      mockDb.Get = jest.fn().mockResolvedValue(mockWallet);

      const result = await module.GetExternalWallet('wa_z_1');
      expect(result).toEqual(mockWallet);
    });

    it('should return null when not found', async () => {
      const result = await module.GetExternalWallet('nonexistent');
      expect(result).toBeNull();
    });
  });

  describe('DeleteExternalWallet', () => {
    it('should archive the wallet (soft delete)', async () => {
      mockDb.Get = jest.fn().mockResolvedValue({
        id: 'wa_z_1',
        object: 'wallet',
        account: 'acct_z_1',
      });

      const result = await module.DeleteExternalWallet('wa_z_1');

      expect(mockDb.Update).toHaveBeenCalledWith('ExternalWallets', 'wa_z_1', {
        status: 'archived',
      });
      expect(result).toEqual({
        id: 'wa_z_1',
        object: 'wallet',
        deleted: true,
      });
    });

    it('should throw when wallet not found', async () => {
      await expect(module.DeleteExternalWallet('nonexistent')).rejects.toThrow(
        'External wallet not found'
      );
    });
  });

  describe('GetExternalWalletsByAccount', () => {
    it('should exclude archived wallets by default', async () => {
      const wallets = [
        { id: 'wa_z_1', status: 'new' },
        { id: 'wa_z_2', status: 'verified' },
      ] as ExternalWallet[];
      mockDb.Find2Custom = jest.fn().mockResolvedValue(wallets);

      const result = await module.GetExternalWalletsByAccount('acct_z_1');

      expect(result).toHaveLength(2);
      expect(mockDb.Find2Custom).toHaveBeenCalledWith(
        'ExternalWallets',
        'account',
        '==',
        'acct_z_1',
        'status',
        '!=',
        'archived'
      );
    });

    it('should include archived wallets when requested', async () => {
      const wallets = [
        { id: 'wa_z_1', status: 'new' },
        { id: 'wa_z_2', status: 'archived' },
      ] as ExternalWallet[];
      mockDb.Find = jest.fn().mockResolvedValue(wallets);

      const result = await module.GetExternalWalletsByAccount('acct_z_1', true);

      expect(result).toHaveLength(2);
      expect(mockDb.Find).toHaveBeenCalledWith(
        'ExternalWallets',
        'account',
        'acct_z_1'
      );
    });
  });
});
