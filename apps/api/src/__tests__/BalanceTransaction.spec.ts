import { BalanceTransactionModule } from '../modules/BalanceTransaction';
import { Database } from '../modules/Database';
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

describe('BalanceTransactionModule', () => {
  let module: BalanceTransactionModule;
  let mockDb: jest.Mocked<Database>;

  beforeEach(() => {
    jest.clearAllMocks();
    ResetIdCounter();
    mockDb = CreateMockDatabase();
    module = new BalanceTransactionModule(mockDb);
  });

  describe('BalanceTransactionObject', () => {
    it('should create a balance transaction with correct fields', () => {
      const txn = module.BalanceTransactionObject({
        amount: 5000,
        currency: 'usdc',
        account: 'acct_z_1',
        platformAccountId: 'acct_z_platform',
        type: 'transfer',
        source: 'tr_z_1',
        description: 'Marketplace sale',
        metadata: {},
        status: 'available',
        available_on: GetFixedTimestamp(),
      });

      expect(txn.object).toBe('balance_transaction');
      expect(txn.amount).toBe(5000);
      expect(txn.currency).toBe('usdc');
      expect(txn.account).toBe('acct_z_1');
      expect(txn.platform_account).toBe('acct_z_platform');
      expect(txn.type).toBe('transfer');
      expect(txn.source).toBe('tr_z_1');
      expect(txn.net).toBe(5000); // no fee
      expect(txn.fee).toBe(0);
      expect(txn.id).toMatch(/^txn_z_test/);
    });

    it('should calculate net after fee', () => {
      const txn = module.BalanceTransactionObject({
        amount: 10000,
        currency: 'usdc',
        account: 'acct_z_1',
        platformAccountId: 'acct_z_platform',
        type: 'payout',
        fee: 250,
        status: 'pending',
      });

      expect(txn.net).toBe(9750);
      expect(txn.fee).toBe(250);
    });

    it('should map transfer-related types to transfer reporting category', () => {
      const txn = module.BalanceTransactionObject({
        amount: 1000,
        currency: 'usdc',
        account: 'acct_z_1',
        platformAccountId: 'acct_z_platform',
        type: 'transfer_cancel',
        status: 'available',
      });

      expect(txn.reporting_category).toBe('transfer');
    });

    it('should map payout-related types to payout reporting category', () => {
      const txn = module.BalanceTransactionObject({
        amount: -1000,
        currency: 'usdc',
        account: 'acct_z_1',
        platformAccountId: 'acct_z_platform',
        type: 'payout_failure',
        status: 'available',
      });

      expect(txn.reporting_category).toBe('payout');
    });
  });

  describe('GetBalanceTransaction', () => {
    it('should retrieve a transaction by ID', async () => {
      const mockTxn = { id: 'txn_z_1', object: 'balance_transaction' };
      mockDb.Get = jest.fn().mockResolvedValue(mockTxn);

      const result = await module.GetBalanceTransaction('txn_z_1');
      expect(result).toEqual(mockTxn);
      expect(mockDb.Get).toHaveBeenCalledWith('BalanceTransactions', 'txn_z_1');
    });

    it('should return null when not found', async () => {
      const result = await module.GetBalanceTransaction('nonexistent');
      expect(result).toBeNull();
    });
  });
});
