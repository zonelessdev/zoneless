import {
  AccountLinkModule,
  ToAccountLinkResponse,
} from '../modules/AccountLink';
import { Database } from '../modules/Database';
import { AccountLinkRecord } from '@zoneless/shared-types';
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

describe('AccountLinkModule', () => {
  let module: AccountLinkModule;
  let mockDb: jest.Mocked<Database>;

  beforeEach(() => {
    jest.clearAllMocks();
    ResetIdCounter();
    mockDb = CreateMockDatabase();
    module = new AccountLinkModule(mockDb);
  });

  describe('CreateAccountLinkRecord', () => {
    it('should build a record with correct expiry and token', () => {
      const record = module.CreateAccountLinkRecord(
        'acct_z_1',
        'account_onboarding',
        'https://example.com/refresh',
        'https://example.com/return'
      );

      expect(record.object).toBe('account_link');
      expect(record.account).toBe('acct_z_1');
      expect(record.type).toBe('account_onboarding');
      expect(record.refresh_url).toBe('https://example.com/refresh');
      expect(record.return_url).toBe('https://example.com/return');
      expect(record.consumed).toBe(false);
      expect(record.expires_at).toBe(GetFixedTimestamp() + 3600);
      expect(record.url).toContain('http://localhost:4200/onboard?token=');
    });
  });

  describe('CreateAccountLink', () => {
    it('should persist the record and return the public response', async () => {
      const link = await module.CreateAccountLink(
        'acct_z_1',
        'account_onboarding',
        'https://example.com/refresh',
        'https://example.com/return'
      );

      expect(mockDb.Set).toHaveBeenCalledTimes(1);
      expect(link.object).toBe('account_link');
      expect(link.url).toBeDefined();
      expect(link.expires_at).toBeDefined();
      // Public response should NOT contain internal fields
      expect((link as any).id).toBeUndefined();
      expect((link as any).token).toBeUndefined();
      expect((link as any).account).toBeUndefined();
    });
  });

  describe('ToAccountLinkResponse', () => {
    it('should strip internal fields from the record', () => {
      const record: AccountLinkRecord = {
        object: 'account_link',
        created: GetFixedTimestamp(),
        expires_at: GetFixedTimestamp() + 3600,
        url: 'http://localhost:4200/onboard?token=abc',
        id: 'acct_link_z_1',
        token: 'al_z_abc123',
        account: 'acct_z_1',
        type: 'account_onboarding',
        refresh_url: 'https://example.com/refresh',
        return_url: 'https://example.com/return',
        consumed: false,
      };

      const response = ToAccountLinkResponse(record);

      expect(response).toEqual({
        object: 'account_link',
        created: GetFixedTimestamp(),
        expires_at: GetFixedTimestamp() + 3600,
        url: 'http://localhost:4200/onboard?token=abc',
      });
    });
  });

  describe('ValidateAccountLink', () => {
    it('should return valid for an unconsumed, non-expired link', async () => {
      const record: AccountLinkRecord = {
        object: 'account_link',
        created: GetFixedTimestamp(),
        expires_at: GetFixedTimestamp() + 3600,
        url: 'http://localhost:4200/onboard?token=abc',
        id: 'acct_link_z_1',
        token: 'al_z_abc',
        account: 'acct_z_1',
        type: 'account_onboarding',
        refresh_url: 'https://example.com/refresh',
        return_url: 'https://example.com/return',
        consumed: false,
      };
      mockDb.Find = jest.fn().mockResolvedValue([record]);

      const result = await module.ValidateAccountLink('al_z_abc');

      expect(result.valid).toBe(true);
      expect(result.record).toEqual(record);
    });

    it('should return invalid for a consumed link', async () => {
      const record = {
        consumed: true,
        expires_at: GetFixedTimestamp() + 3600,
      } as AccountLinkRecord;
      mockDb.Find = jest.fn().mockResolvedValue([record]);

      const result = await module.ValidateAccountLink('al_z_abc');

      expect(result.valid).toBe(false);
      expect(result.reason).toBe('consumed');
    });

    it('should return invalid for an expired link', async () => {
      const record = {
        consumed: false,
        expires_at: GetFixedTimestamp() - 1, // expired 1 second ago
      } as AccountLinkRecord;
      mockDb.Find = jest.fn().mockResolvedValue([record]);

      const result = await module.ValidateAccountLink('al_z_abc');

      expect(result.valid).toBe(false);
      expect(result.reason).toBe('expired');
    });

    it('should return not_found when token does not exist', async () => {
      mockDb.Find = jest.fn().mockResolvedValue([]);

      const result = await module.ValidateAccountLink('nonexistent');

      expect(result.valid).toBe(false);
      expect(result.reason).toBe('not_found');
    });
  });

  describe('MarkAsConsumed', () => {
    it('should update the record with consumed flag', async () => {
      await module.MarkAsConsumed('acct_link_z_1');

      expect(mockDb.Update).toHaveBeenCalledWith(
        'AccountLinks',
        'acct_link_z_1',
        expect.objectContaining({ consumed: true })
      );
    });
  });
});
