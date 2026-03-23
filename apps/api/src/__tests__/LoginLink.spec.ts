import { LoginLinkModule, ToLoginLinkResponse } from '../modules/LoginLink';
import { Database } from '../modules/Database';
import { LoginLinkRecord } from '@zoneless/shared-types';
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

describe('LoginLinkModule', () => {
  let module: LoginLinkModule;
  let mockDb: jest.Mocked<Database>;

  beforeEach(() => {
    jest.clearAllMocks();
    ResetIdCounter();
    mockDb = CreateMockDatabase();
    module = new LoginLinkModule(mockDb);
  });

  describe('CreateLoginLinkRecord', () => {
    it('should build a record with 5-minute expiry', () => {
      const record = module.CreateLoginLinkRecord(
        'acct_z_seller',
        'My Marketplace'
      );

      expect(record.object).toBe('login_link');
      expect(record.account).toBe('acct_z_seller');
      expect(record.platform_name).toBe('My Marketplace');
      expect(record.consumed).toBe(false);
      expect(record.expires_at).toBe(GetFixedTimestamp() + 300);
      expect(record.url).toContain('http://localhost:4200/login?token=');
    });
  });

  describe('CreateLoginLink', () => {
    it('should persist and return the public response', async () => {
      const link = await module.CreateLoginLink(
        'acct_z_seller',
        'My Marketplace'
      );

      expect(mockDb.Set).toHaveBeenCalledTimes(1);
      expect(link.object).toBe('login_link');
      expect(link.url).toBeDefined();
      expect(link.created).toBeDefined();
      // Public response should NOT contain internal fields
      expect((link as any).token).toBeUndefined();
      expect((link as any).account).toBeUndefined();
    });
  });

  describe('ToLoginLinkResponse', () => {
    it('should strip internal fields from the record', () => {
      const record: LoginLinkRecord = {
        object: 'login_link',
        created: GetFixedTimestamp(),
        url: 'http://localhost:4200/login?token=abc',
        token: 'll_z_abc123',
        account: 'acct_z_seller',
        platform_name: 'My Marketplace',
        expires_at: GetFixedTimestamp() + 300,
        consumed: false,
      };

      const response = ToLoginLinkResponse(record);

      expect(response).toEqual({
        object: 'login_link',
        created: GetFixedTimestamp(),
        url: 'http://localhost:4200/login?token=abc',
      });
    });
  });

  describe('ValidateLoginLink', () => {
    it('should return valid for a fresh, unconsumed link', async () => {
      const record: LoginLinkRecord = {
        object: 'login_link',
        created: GetFixedTimestamp(),
        url: 'http://localhost:4200/login?token=abc',
        token: 'll_z_abc',
        account: 'acct_z_seller',
        platform_name: 'My Marketplace',
        expires_at: GetFixedTimestamp() + 300,
        consumed: false,
      };
      mockDb.Get = jest.fn().mockResolvedValue(record);

      const result = await module.ValidateLoginLink('ll_z_abc');

      expect(result.valid).toBe(true);
      expect(result.record).toEqual(record);
    });

    it('should return invalid for a consumed link', async () => {
      const record = {
        consumed: true,
        expires_at: GetFixedTimestamp() + 300,
      } as LoginLinkRecord;
      mockDb.Get = jest.fn().mockResolvedValue(record);

      const result = await module.ValidateLoginLink('ll_z_abc');

      expect(result.valid).toBe(false);
      expect(result.reason).toBe('consumed');
    });

    it('should return invalid for an expired link', async () => {
      const record = {
        consumed: false,
        expires_at: GetFixedTimestamp() - 1,
      } as LoginLinkRecord;
      mockDb.Get = jest.fn().mockResolvedValue(record);

      const result = await module.ValidateLoginLink('ll_z_abc');

      expect(result.valid).toBe(false);
      expect(result.reason).toBe('expired');
    });

    it('should return not_found for nonexistent token', async () => {
      const result = await module.ValidateLoginLink('nonexistent');

      expect(result.valid).toBe(false);
      expect(result.reason).toBe('not_found');
    });
  });

  describe('MarkAsConsumed', () => {
    it('should update the record with consumed flag', async () => {
      await module.MarkAsConsumed('ll_z_abc');

      expect(mockDb.Update).toHaveBeenCalledWith(
        'LoginLinks',
        'll_z_abc',
        expect.objectContaining({ consumed: true })
      );
    });
  });
});
