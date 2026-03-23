import {
  IsPlatformAccount,
  GetPlatformAccountId,
  CanAccessAccount,
  IsPlatformOwner,
} from '../modules/PlatformAccess';
import { Account } from '@zoneless/shared-types';

function MakeAccount(id: string, platformAccount: string): Account {
  return {
    id,
    object: 'account',
    type: 'express',
    business_type: 'individual',
    email: null,
    country: 'US',
    default_currency: 'usdc',
    created: 0,
    charges_enabled: false,
    payouts_enabled: false,
    details_submitted: false,
    metadata: {},
    platform_account: platformAccount,
  };
}

describe('PlatformAccess', () => {
  describe('IsPlatformAccount', () => {
    it('should return true for a self-referential platform account', () => {
      const platform = MakeAccount('acct_z_1', 'acct_z_1');
      expect(IsPlatformAccount(platform)).toBe(true);
    });

    it('should return false for a connected account', () => {
      const connected = MakeAccount('acct_z_2', 'acct_z_1');
      expect(IsPlatformAccount(connected)).toBe(false);
    });
  });

  describe('GetPlatformAccountId', () => {
    it('should return own ID for a platform account', () => {
      const platform = MakeAccount('acct_z_1', 'acct_z_1');
      expect(GetPlatformAccountId(platform)).toBe('acct_z_1');
    });

    it('should return the parent platform ID for a connected account', () => {
      const connected = MakeAccount('acct_z_2', 'acct_z_1');
      expect(GetPlatformAccountId(connected)).toBe('acct_z_1');
    });
  });

  describe('CanAccessAccount', () => {
    it('should allow self-access', () => {
      const account = MakeAccount('acct_z_1', 'acct_z_platform');
      expect(CanAccessAccount('acct_z_1', account)).toBe(true);
    });

    it('should allow platform to access its connected accounts', () => {
      const connected = MakeAccount('acct_z_seller', 'acct_z_platform');
      expect(CanAccessAccount('acct_z_platform', connected)).toBe(true);
    });

    it('should deny access from unrelated accounts', () => {
      const connected = MakeAccount('acct_z_seller', 'acct_z_platform');
      expect(CanAccessAccount('acct_z_other', connected)).toBe(false);
    });

    it('should deny connected accounts from accessing the platform', () => {
      const platform = MakeAccount('acct_z_platform', 'acct_z_platform');
      expect(CanAccessAccount('acct_z_seller', platform)).toBe(false);
    });
  });

  describe('IsPlatformOwner', () => {
    it('should return true when user is the owning platform', () => {
      const connected = MakeAccount('acct_z_seller', 'acct_z_platform');
      expect(IsPlatformOwner('acct_z_platform', connected)).toBe(true);
    });

    it('should return false for self-ownership (platform accessing itself)', () => {
      const platform = MakeAccount('acct_z_platform', 'acct_z_platform');
      expect(IsPlatformOwner('acct_z_platform', platform)).toBe(false);
    });

    it('should return false for unrelated accounts', () => {
      const connected = MakeAccount('acct_z_seller', 'acct_z_platform');
      expect(IsPlatformOwner('acct_z_other', connected)).toBe(false);
    });
  });
});
