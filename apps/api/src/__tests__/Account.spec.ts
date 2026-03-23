import { AccountModule } from '../modules/Account';
import { Database } from '../modules/Database';
import { Account } from '@zoneless/shared-types';
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

describe('AccountModule', () => {
  let accountModule: AccountModule;
  let mockDb: jest.Mocked<Database>;

  beforeEach(() => {
    jest.clearAllMocks();
    ResetIdCounter();
    mockDb = CreateMockDatabase();
    accountModule = new AccountModule(mockDb);
  });

  // -----------------------------------------------------------------------
  // CreateAccountObject
  // -----------------------------------------------------------------------
  describe('CreateAccountObject', () => {
    it('should create an account with sensible defaults', () => {
      const account = accountModule.CreateAccountObject({});

      expect(account).toMatchObject({
        object: 'account',
        type: 'express',
        business_type: 'individual',
        email: null,
        country: '',
        default_currency: 'usdc',
        charges_enabled: false,
        payouts_enabled: false,
        details_submitted: false,
        metadata: {},
      });
      expect(account.id).toMatch(/^acct_z_test/);
      expect(account.created).toBe(GetFixedTimestamp());
    });

    it('should accept all provided input fields', () => {
      const account = accountModule.CreateAccountObject({
        email: 'seller@marketplace.com',
        business_type: 'company',
        country: 'US',
        default_currency: 'usdc',
        metadata: { order_id: '42' },
      });

      expect(account.email).toBe('seller@marketplace.com');
      expect(account.business_type).toBe('company');
      expect(account.country).toBe('US');
      expect(account.metadata).toEqual({ order_id: '42' });
    });

    it('should set platform_account to self when no platform ID provided', () => {
      const account = accountModule.CreateAccountObject({});
      expect(account.platform_account).toBe(account.id);
    });

    it('should set platform_account to the provided platform ID', () => {
      const account = accountModule.CreateAccountObject({}, 'acct_z_platform');
      expect(account.platform_account).toBe('acct_z_platform');
    });

    it('should initialise capabilities as inactive by default', () => {
      const account = accountModule.CreateAccountObject({});

      expect(account.capabilities).toEqual({
        transfers: 'inactive',
        usdc_payouts: 'inactive',
      });
    });

    it('should set capabilities to pending when requested', () => {
      const account = accountModule.CreateAccountObject({
        capabilities: {
          transfers: { requested: true },
          usdc_payouts: { requested: true },
        },
      });

      expect(account.capabilities).toEqual({
        transfers: 'pending',
        usdc_payouts: 'pending',
      });
    });

    it('should deep-merge settings with defaults', () => {
      const account = accountModule.CreateAccountObject({
        settings: {
          dashboard: { display_name: 'My Store' },
        },
      });

      expect(account.settings?.dashboard?.display_name).toBe('My Store');
      expect(account.settings?.dashboard?.timezone).toBe('Etc/UTC');
      expect(account.settings?.payouts?.schedule?.interval).toBe('daily');
    });
  });

  // -----------------------------------------------------------------------
  // CreateAccount
  // -----------------------------------------------------------------------
  describe('CreateAccount', () => {
    it('should persist the account to the database', async () => {
      const account = await accountModule.CreateAccount({
        email: 'test@example.com',
        country: 'US',
      });

      expect(mockDb.Set).toHaveBeenCalledWith(
        'Accounts',
        account.id,
        expect.objectContaining({
          email: 'test@example.com',
          country: 'US',
        })
      );
    });

    it('should return the created account', async () => {
      const account = await accountModule.CreateAccount({});
      expect(account.object).toBe('account');
      expect(account.id).toBeDefined();
    });
  });

  // -----------------------------------------------------------------------
  // GetAccount
  // -----------------------------------------------------------------------
  describe('GetAccount', () => {
    it('should return the account when found', async () => {
      const mockAccount = { id: 'acct_z_1', object: 'account' } as Account;
      mockDb.Get = jest.fn().mockResolvedValue(mockAccount);

      const result = await accountModule.GetAccount('acct_z_1');
      expect(result).toEqual(mockAccount);
      expect(mockDb.Get).toHaveBeenCalledWith('Accounts', 'acct_z_1');
    });

    it('should return null when not found', async () => {
      const result = await accountModule.GetAccount('nonexistent');
      expect(result).toBeNull();
    });
  });

  // -----------------------------------------------------------------------
  // UpdateAccount
  // -----------------------------------------------------------------------
  describe('UpdateAccount', () => {
    const existingAccount: Account = {
      id: 'acct_z_1',
      object: 'account',
      type: 'express',
      business_type: 'individual',
      email: 'old@example.com',
      country: 'US',
      default_currency: 'usdc',
      created: GetFixedTimestamp(),
      charges_enabled: false,
      payouts_enabled: false,
      details_submitted: false,
      metadata: {},
      platform_account: 'acct_z_platform',
    };

    it('should update the account fields', async () => {
      mockDb.Get = jest.fn().mockResolvedValue(existingAccount);

      const result = await accountModule.UpdateAccount('acct_z_1', {
        email: 'new@example.com',
      });

      expect(mockDb.Update).toHaveBeenCalledWith(
        'Accounts',
        'acct_z_1',
        expect.objectContaining({ email: 'new@example.com' })
      );
      expect(result).toEqual(existingAccount);
    });

    it('should throw when account not found after update', async () => {
      mockDb.Get = jest.fn().mockResolvedValue(null);

      await expect(
        accountModule.UpdateAccount('acct_z_missing', {
          email: 'test@example.com',
        })
      ).rejects.toThrow('Account not found');
    });
  });

  // -----------------------------------------------------------------------
  // DeleteAccount
  // -----------------------------------------------------------------------
  describe('DeleteAccount', () => {
    it('should delete the account and return confirmation', async () => {
      mockDb.Get = jest
        .fn()
        .mockResolvedValue({ id: 'acct_z_1', object: 'account' });

      const result = await accountModule.DeleteAccount('acct_z_1');

      expect(mockDb.Delete).toHaveBeenCalledWith('Accounts', 'acct_z_1');
      expect(result).toEqual({
        id: 'acct_z_1',
        object: 'account',
        deleted: true,
      });
    });

    it('should throw when account not found', async () => {
      await expect(accountModule.DeleteAccount('nonexistent')).rejects.toThrow(
        'Account not found'
      );
    });
  });

  // -----------------------------------------------------------------------
  // Lifecycle helpers
  // -----------------------------------------------------------------------
  describe('TOSAccepted', () => {
    it('should set tos_acceptance with timestamp', async () => {
      const existing = {
        id: 'acct_z_1',
        object: 'account',
        platform_account: 'acct_z_platform',
      } as Account;
      mockDb.Get = jest.fn().mockResolvedValue(existing);

      await accountModule.TOSAccepted('acct_z_1', '1.2.3.4', 'TestAgent');

      expect(mockDb.Update).toHaveBeenCalledWith('Accounts', 'acct_z_1', {
        tos_acceptance: {
          date: GetFixedTimestamp(),
          ip: '1.2.3.4',
          user_agent: 'TestAgent',
          service_agreement: 'full',
        },
      });
    });
  });

  describe('DetailsSubmitted', () => {
    it('should set details_submitted to true', async () => {
      const existing = {
        id: 'acct_z_1',
        object: 'account',
        platform_account: 'acct_z_platform',
      } as Account;
      mockDb.Get = jest.fn().mockResolvedValue(existing);

      await accountModule.DetailsSubmitted('acct_z_1');

      expect(mockDb.Update).toHaveBeenCalledWith('Accounts', 'acct_z_1', {
        details_submitted: true,
      });
    });
  });

  describe('PayoutsEnabled', () => {
    it('should enable payouts and activate capabilities', async () => {
      const existing = {
        id: 'acct_z_1',
        object: 'account',
        platform_account: 'acct_z_platform',
        capabilities: { transfers: 'inactive', usdc_payouts: 'inactive' },
      } as Account;
      mockDb.Get = jest.fn().mockResolvedValue(existing);

      await accountModule.PayoutsEnabled('acct_z_1');

      expect(mockDb.Update).toHaveBeenCalledWith('Accounts', 'acct_z_1', {
        payouts_enabled: true,
        capabilities: {
          transfers: 'active',
          usdc_payouts: 'active',
        },
      });
    });
  });

  describe('RejectAccount', () => {
    it('should disable the account and set rejection reason', async () => {
      const existing = {
        id: 'acct_z_1',
        object: 'account',
        platform_account: 'acct_z_platform',
        requirements: {
          alternatives: [],
          current_deadline: null,
          currently_due: ['tos_acceptance'],
          disabled_reason: null,
          errors: [],
          eventually_due: [],
          past_due: [],
          pending_verification: [],
        },
      } as Account;
      mockDb.Get = jest.fn().mockResolvedValue(existing);

      await accountModule.RejectAccount('acct_z_1', { reason: 'fraud' });

      expect(mockDb.Update).toHaveBeenCalledWith(
        'Accounts',
        'acct_z_1',
        expect.objectContaining({
          charges_enabled: false,
          payouts_enabled: false,
        })
      );
    });
  });
});
