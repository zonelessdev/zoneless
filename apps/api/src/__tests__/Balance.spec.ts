import { BalanceModule } from '../modules/Balance';
import { Database } from '../modules/Database';
import { Balance } from '@zoneless/shared-types';
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

describe('BalanceModule', () => {
  let module: BalanceModule;
  let mockDb: jest.Mocked<Database>;

  beforeEach(() => {
    jest.clearAllMocks();
    ResetIdCounter();
    mockDb = CreateMockDatabase();
    module = new BalanceModule(mockDb);
  });

  describe('BalanceObject', () => {
    it('should create a balance with zero USDC available and pending', () => {
      const balance = module.BalanceObject('acct_z_1', 'acct_z_platform');

      expect(balance.object).toBe('balance');
      expect(balance.account).toBe('acct_z_1');
      expect(balance.platform_account).toBe('acct_z_platform');
      expect(balance.available).toEqual([{ amount: 0, currency: 'usdc' }]);
      expect(balance.pending).toEqual([{ amount: 0, currency: 'usdc' }]);
    });
  });

  describe('CreateBalance', () => {
    it('should persist a new zero balance for the account', async () => {
      mockDb.Get = jest.fn().mockResolvedValue({
        id: 'acct_z_1',
        platform_account: 'acct_z_platform',
      });

      const balance = await module.CreateBalance('acct_z_1');

      expect(mockDb.Set).toHaveBeenCalledWith(
        'Balances',
        balance.id,
        expect.objectContaining({ account: 'acct_z_1' })
      );
      expect(balance.available[0].amount).toBe(0);
    });
  });

  describe('GetBalance', () => {
    it('should return the balance for an account', async () => {
      const mockBalance: Balance = {
        id: 'bal_z_1',
        object: 'balance',
        account: 'acct_z_1',
        platform_account: 'acct_z_platform',
        livemode: false,
        available: [{ amount: 5000, currency: 'usdc' }],
        pending: [{ amount: 0, currency: 'usdc' }],
      };
      mockDb.Find = jest.fn().mockResolvedValue([mockBalance]);

      const result = await module.GetBalance('acct_z_1');

      expect(result).toEqual(mockBalance);
    });

    it('should return null when no balance exists', async () => {
      mockDb.Find = jest.fn().mockResolvedValue([]);
      const result = await module.GetBalance('acct_z_missing');
      expect(result).toBeNull();
    });
  });

  describe('UpdateBalance', () => {
    it('should add to the available balance for an existing currency', () => {
      const balance: Balance = {
        id: 'bal_z_1',
        object: 'balance',
        account: 'acct_z_1',
        platform_account: 'acct_z_platform',
        livemode: false,
        available: [{ amount: 1000, currency: 'usdc' }],
        pending: [{ amount: 0, currency: 'usdc' }],
      };

      const updated = module.UpdateBalance(balance, 500, 'usdc', 'available');

      expect(updated.available[0].amount).toBe(1500);
    });

    it('should subtract from the available balance', () => {
      const balance: Balance = {
        id: 'bal_z_1',
        object: 'balance',
        account: 'acct_z_1',
        platform_account: 'acct_z_platform',
        livemode: false,
        available: [{ amount: 1000, currency: 'usdc' }],
        pending: [{ amount: 0, currency: 'usdc' }],
      };

      const updated = module.UpdateBalance(balance, -300, 'usdc', 'available');

      expect(updated.available[0].amount).toBe(700);
    });

    it('should add a new currency entry when not found', () => {
      const balance: Balance = {
        id: 'bal_z_1',
        object: 'balance',
        account: 'acct_z_1',
        platform_account: 'acct_z_platform',
        livemode: false,
        available: [{ amount: 1000, currency: 'usdc' }],
        pending: [{ amount: 0, currency: 'usdc' }],
      };

      const updated = module.UpdateBalance(balance, 200, 'sol', 'available');

      expect(updated.available).toHaveLength(2);
      expect(updated.available[1]).toEqual({ amount: 200, currency: 'sol' });
    });

    it('should update pending balance separately from available', () => {
      const balance: Balance = {
        id: 'bal_z_1',
        object: 'balance',
        account: 'acct_z_1',
        platform_account: 'acct_z_platform',
        livemode: false,
        available: [{ amount: 1000, currency: 'usdc' }],
        pending: [{ amount: 500, currency: 'usdc' }],
      };

      const updated = module.UpdateBalance(balance, 300, 'usdc', 'pending');

      expect(updated.pending[0].amount).toBe(800);
      expect(updated.available[0].amount).toBe(1000);
    });
  });
});
