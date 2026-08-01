import { IdentityLiteModule } from '../modules/identity/IdentityLite';
import { HeaderIpGeoProvider } from '../modules/identity/IpGeo';
import { Database } from '../modules/Database';
import { Account, Person } from '@zoneless/shared-types';
import {
  CreateMockDatabase,
  DeterministicId,
  ResetIdCounter,
  GetFixedTimestamp,
} from './Setup';
import {
  CheckPersonName,
  CheckPhoneNumber,
  CheckDob,
  CheckPostalCode,
  CountriesCompatible,
  IsDisposableEmail,
  IsIdentityBlockingPayouts,
  IDENTITY_UNDER_REVIEW,
  IDENTITY_REQUIREMENT_FIELDS,
} from '@zoneless/shared-schemas';

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

function BuildPerson(overrides: Partial<Person> = {}): Person {
  return {
    id: 'person_z_test001',
    object: 'person',
    account: 'acct_z_seller',
    created: GetFixedTimestamp(),
    dob: { day: 15, month: 6, year: 1990 },
    email: 'alice@example.com',
    first_name: 'Alice',
    last_name: 'Smith',
    future_requirements: null,
    id_number_provided: false,
    metadata: {},
    phone: '+14155552671',
    relationship: {
      director: false,
      executive: false,
      owner: false,
      representative: true,
      title: null,
      percent_ownership: null,
    },
    requirements: {
      alternatives: [],
      currently_due: [],
      errors: [],
      eventually_due: [],
      past_due: [],
      pending_verification: [],
    },
    ssn_last_4_provided: false,
    verification: {
      additional_document: null,
      details: null,
      details_code: null,
      document: {
        back: null,
        details: null,
        details_code: null,
        front: null,
      },
      status: 'unverified',
    },
    address: {
      line1: '123 Main St',
      line2: null,
      city: 'San Francisco',
      state: 'CA',
      postal_code: '94105',
      country: 'US',
    },
    platform_account: 'acct_z_platform',
    ...overrides,
  };
}

function BuildAccount(overrides: Partial<Account> = {}): Account {
  return {
    id: 'acct_z_seller',
    object: 'account',
    type: 'express',
    business_type: 'individual',
    email: 'alice@example.com',
    country: 'US',
    default_currency: 'usdc',
    charges_enabled: false,
    payouts_enabled: false,
    details_submitted: true,
    created: GetFixedTimestamp(),
    metadata: {},
    platform_account: 'acct_z_platform',
    requirements: {
      currently_due: [],
      eventually_due: [],
      past_due: [],
      pending_verification: [],
      disabled_reason: null,
      errors: [],
    },
    capabilities: {
      usdc_payouts: 'inactive',
      transfers: 'inactive',
    },
    ...overrides,
  } as Account;
}

describe('IdentityValidators', () => {
  describe('CheckPersonName', () => {
    it('rejects empty, short, digit-only, and placeholder names', () => {
      expect(CheckPersonName('').valid).toBe(false);
      expect(CheckPersonName('A').valid).toBe(false);
      expect(CheckPersonName('12345').valid).toBe(false);
      expect(CheckPersonName('test').valid).toBe(false);
      expect(CheckPersonName('xxxx').valid).toBe(false);
    });

    it('accepts real names', () => {
      expect(CheckPersonName('Alice').valid).toBe(true);
      expect(CheckPersonName("O'Brien").valid).toBe(true);
    });
  });

  describe('CheckPhoneNumber', () => {
    it('normalizes a valid US number to E.164', () => {
      const result = CheckPhoneNumber('+1 415 555 2671', 'US');
      expect(result.valid).toBe(true);
      expect(result.e164).toBe('+14155552671');
      expect(result.country).toBe('US');
    });

    it('rejects invalid numbers', () => {
      expect(CheckPhoneNumber('123', 'US').valid).toBe(false);
      expect(CheckPhoneNumber(null).valid).toBe(false);
    });
  });

  describe('CheckDob', () => {
    it('rejects under-13 and incomplete DOB', () => {
      const thisYear = new Date().getFullYear();
      expect(CheckDob({ day: 1, month: 1, year: thisYear - 5 }).valid).toBe(
        false
      );
      expect(CheckDob({ day: null, month: 1, year: 1990 }).valid).toBe(false);
    });

    it('accepts a plausible adult DOB', () => {
      expect(CheckDob({ day: 15, month: 6, year: 1990 }).valid).toBe(true);
    });
  });

  describe('CheckPostalCode', () => {
    it('validates US and CA formats', () => {
      expect(CheckPostalCode('94105', 'US').valid).toBe(true);
      expect(CheckPostalCode('9410', 'US').valid).toBe(false);
      expect(CheckPostalCode('K1A 0B1', 'CA').valid).toBe(true);
    });
  });

  describe('CountriesCompatible', () => {
    it('treats US/CA as compatible and rejects clear mismatches', () => {
      expect(CountriesCompatible('US', 'US')).toBe(true);
      expect(CountriesCompatible('US', 'CA')).toBe(true);
      expect(CountriesCompatible('US', 'GB')).toBe(false);
    });
  });

  describe('IsDisposableEmail', () => {
    it('detects known disposable domains', () => {
      expect(IsDisposableEmail('a@mailinator.com')).toBe(true);
      expect(IsDisposableEmail('alice@example.com')).toBe(false);
    });
  });

  describe('IsIdentityBlockingPayouts', () => {
    it('blocks on hard currently_due and rejected, but not pending review or document IDV', () => {
      expect(
        IsIdentityBlockingPayouts({ currently_due: ['individual.phone'] })
      ).toBe(true);
      expect(
        IsIdentityBlockingPayouts({
          currently_due: [IDENTITY_REQUIREMENT_FIELDS.verificationDocument],
        })
      ).toBe(false);
      expect(
        IsIdentityBlockingPayouts({
          currently_due: [],
          disabled_reason: IDENTITY_UNDER_REVIEW,
        })
      ).toBe(false);
      expect(
        IsIdentityBlockingPayouts({
          currently_due: [],
          disabled_reason: 'rejected.fraud',
        })
      ).toBe(true);
      expect(
        IsIdentityBlockingPayouts({ currently_due: [], disabled_reason: null })
      ).toBe(false);
    });
  });
});

describe('HeaderIpGeoProvider', () => {
  it('reads CF-IPCountry header', async () => {
    const provider = new HeaderIpGeoProvider();
    await expect(
      provider.LookupCountry('1.2.3.4', { 'cf-ipcountry': 'GB' })
    ).resolves.toBe('GB');
    await expect(
      provider.LookupCountry('1.2.3.4', { 'cf-ipcountry': 'XX' })
    ).resolves.toBeNull();
  });
});

describe('IdentityLiteModule', () => {
  let module: IdentityLiteModule;
  let mockDb: jest.Mocked<Database>;
  let storedAccounts: Map<string, Account>;
  let storedPersons: Map<string, Person>;

  beforeEach(() => {
    jest.clearAllMocks();
    ResetIdCounter();
    mockDb = CreateMockDatabase();
    storedAccounts = new Map();
    storedPersons = new Map();

    mockDb.Get.mockImplementation(async (collection, id) => {
      if (collection === 'Accounts') return storedAccounts.get(id) ?? null;
      if (collection === 'Persons') return storedPersons.get(id) ?? null;
      return null;
    });

    mockDb.Update.mockImplementation(async (collection, id, update) => {
      const patch = update as Record<string, unknown>;
      if (collection === 'Accounts') {
        const existing = storedAccounts.get(id);
        if (existing) {
          storedAccounts.set(id, {
            ...existing,
            ...patch,
            requirements: patch.requirements
              ? {
                  ...existing.requirements,
                  ...(patch.requirements as Account['requirements']),
                }
              : existing.requirements,
            capabilities: patch.capabilities
              ? {
                  ...existing.capabilities,
                  ...(patch.capabilities as Account['capabilities']),
                }
              : existing.capabilities,
          } as Account);
        }
      }
      if (collection === 'Persons') {
        const existing = storedPersons.get(id);
        if (existing) {
          storedPersons.set(id, { ...existing, ...patch } as Person);
        }
      }
    });

    mockDb.Find.mockImplementation(async (collection, field, value) => {
      if (collection === 'Persons' && field === 'account') {
        return [...storedPersons.values()].filter((p) => p.account === value);
      }
      return [];
    });

    mockDb.Find2Custom.mockResolvedValue([]);

    module = new IdentityLiteModule(mockDb);
  });

  function SeedClean(): { account: Account; person: Person } {
    const account = BuildAccount();
    const person = BuildPerson();
    storedAccounts.set(account.id, account);
    storedPersons.set(person.id, person);
    return { account, person };
  }

  it('clears dues for a clean person', async () => {
    const { account, person } = SeedClean();

    const evaluation = await module.EvaluateAndApply(account.id, person);

    expect(evaluation.blocking).toBe(false);
    expect(evaluation.currentlyDue).toEqual([]);
    expect(evaluation.normalizedPhone).toBe('+14155552671');
    expect(storedAccounts.get(account.id)?.requirements?.currently_due).toEqual(
      []
    );
  });

  it('soft-blocks on fake name and invalid phone', async () => {
    const { account, person } = SeedClean();
    person.first_name = 'test';
    person.phone = '123';
    storedPersons.set(person.id, person);

    const evaluation = await module.EvaluateAndApply(account.id, person);

    expect(evaluation.blocking).toBe(true);
    expect(evaluation.currentlyDue).toEqual(
      expect.arrayContaining([
        IDENTITY_REQUIREMENT_FIELDS.firstName,
        IDENTITY_REQUIREMENT_FIELDS.phone,
      ])
    );
    expect(storedAccounts.get(account.id)?.requirements?.currently_due).toEqual(
      expect.arrayContaining([IDENTITY_REQUIREMENT_FIELDS.firstName])
    );
  });

  it('flags disposable email as pending review without blocking payouts', async () => {
    const { account, person } = SeedClean();
    person.email = 'temp@mailinator.com';
    storedPersons.set(person.id, person);

    const evaluation = await module.EvaluateAndApply(account.id, person);

    expect(evaluation.pendingVerification.length).toBeGreaterThan(0);
    expect(evaluation.blocking).toBe(false);
    expect(evaluation.currentlyDue).toEqual([]);
    expect(evaluation.pendingVerification).toContain(
      IDENTITY_REQUIREMENT_FIELDS.email
    );
    expect(
      storedAccounts.get(account.id)?.requirements?.disabled_reason
    ).toBeNull();
    expect(
      storedAccounts.get(account.id)?.requirements?.pending_verification
    ).toContain(IDENTITY_REQUIREMENT_FIELDS.email);
    expect(() =>
      module.AssertCanEnablePayouts(storedAccounts.get(account.id)!)
    ).not.toThrow();
  });

  it('AssertCanEnablePayouts allows under_review legacy flag (pending review does not block)', () => {
    const account = BuildAccount({
      requirements: {
        currently_due: [],
        disabled_reason: IDENTITY_UNDER_REVIEW,
        errors: [],
      },
    });

    expect(() => module.AssertCanEnablePayouts(account)).not.toThrow();
  });

  it('AssertCanEnablePayouts throws when currently_due is set', () => {
    const account = BuildAccount({
      requirements: {
        currently_due: [IDENTITY_REQUIREMENT_FIELDS.phone],
        disabled_reason: null,
        errors: [],
      },
    });

    expect(() => module.AssertCanEnablePayouts(account)).toThrow(
      /Outstanding identity requirements/
    );
  });

  it('AssertCanEnablePayouts allows document IDV currently_due', () => {
    const account = BuildAccount({
      requirements: {
        currently_due: [IDENTITY_REQUIREMENT_FIELDS.verificationDocument],
        disabled_reason: null,
        errors: [],
      },
    });

    expect(() => module.AssertCanEnablePayouts(account)).not.toThrow();
  });

  it('ApproveIdentity dismisses pending review and skips re-flagging review signals', async () => {
    const { account, person } = SeedClean();
    person.email = 'temp@mailinator.com';
    storedPersons.set(person.id, person);
    storedAccounts.set(account.id, {
      ...account,
      requirements: {
        ...account.requirements,
        disabled_reason: null,
        currently_due: [],
        pending_verification: [IDENTITY_REQUIREMENT_FIELDS.email],
        errors: [
          {
            code: 'invalid_value',
            reason: 'disposable',
            requirement: IDENTITY_REQUIREMENT_FIELDS.email,
          },
        ],
      },
    });

    const updated = await module.ApproveIdentity(account.id);

    expect(updated.requirements?.pending_verification).toEqual([]);
    expect(updated.requirements?.currently_due).toEqual([]);
    expect(updated.metadata?.identity_lite_review).toBe('dismissed');
  });

  it('flags IP mismatch as pending review without blocking', async () => {
    const geoModule = new IdentityLiteModule(mockDb, null, {
      LookupCountry: async () => 'GB',
    });
    const { account } = SeedClean();

    const evaluation = await geoModule.EvaluateAndApply(account.id, null, {
      ip: '8.8.8.8',
    });

    expect(evaluation.pendingVerification.length).toBeGreaterThan(0);
    expect(evaluation.blocking).toBe(false);
    expect(evaluation.pendingVerification).toContain(
      IDENTITY_REQUIREMENT_FIELDS.addressCountry
    );
    expect(
      evaluation.errors.some(
        (e) => e.requirement === 'individual.address.country'
      )
    ).toBe(true);
  });

  it('flags phone country vs address country mismatch', async () => {
    const { account, person } = SeedClean();
    // UK mobile with US address
    person.phone = '+447911123456';
    person.address = {
      ...person.address!,
      country: 'US',
      postal_code: '94105',
    };
    storedPersons.set(person.id, person);

    const evaluation = await module.EvaluateAndApply(account.id, person);

    expect(evaluation.blocking).toBe(false);
    expect(evaluation.pendingVerification.length).toBeGreaterThan(0);
    expect(
      evaluation.errors.some(
        (e) => e.code === 'identity_lite.phone_country_mismatch'
      )
    ).toBe(true);
    expect(evaluation.pendingVerification).toContain(
      IDENTITY_REQUIREMENT_FIELDS.phone
    );
  });

  it('flags duplicate email across connected accounts on the same platform', async () => {
    const { account, person } = SeedClean();

    mockDb.Find2Custom.mockImplementation(
      async (collection, field1, _op1, value1) => {
        if (
          collection === 'Persons' &&
          field1 === 'email' &&
          value1 === person.email
        ) {
          return [
            {
              ...person,
              id: 'person_z_other',
              account: 'acct_z_other',
            },
          ];
        }
        return [];
      }
    );

    const evaluation = await module.EvaluateAndApply(account.id, person);

    expect(evaluation.pendingVerification.length).toBeGreaterThan(0);
    expect(evaluation.blocking).toBe(false);
    expect(
      evaluation.errors.some((e) => e.reason.includes('Email is already used'))
    ).toBe(true);
    expect(evaluation.pendingVerification).toContain(
      IDENTITY_REQUIREMENT_FIELDS.email
    );
  });

  it('flags duplicate wallet addresses on the same platform', async () => {
    const { account, person } = SeedClean();
    const wallet = 'D8VMZCmmTUUfhejNhNQKAmqvZCKfUq1qU6RqQKxQwXyX';

    mockDb.Find2Custom.mockImplementation(async (collection, field1) => {
      if (collection === 'ExternalWallets' && field1 === 'wallet_address') {
        return [
          {
            id: 'wa_z_other',
            account: 'acct_z_other',
            platform_account: 'acct_z_platform',
            wallet_address: wallet,
            status: 'new',
          },
        ];
      }
      return [];
    });

    const evaluation = await module.EvaluateAndApply(account.id, null, {
      walletAddress: wallet,
    });

    expect(evaluation.pendingVerification.length).toBeGreaterThan(0);
    expect(
      evaluation.errors.some((e) =>
        e.reason.includes('Wallet address is already used')
      )
    ).toBe(true);
    expect(person.account).toBe(account.id);
  });

  it('flags duplicate signup IPs on the same platform', async () => {
    const { account } = SeedClean();
    const publicIp = '203.0.113.10';

    mockDb.Find2Custom.mockImplementation(
      async (collection, field1, _op1, value1) => {
        if (
          collection === 'Accounts' &&
          field1 === 'tos_acceptance.ip' &&
          value1 === publicIp
        ) {
          return [
            {
              id: 'acct_z_other',
              platform_account: 'acct_z_platform',
              tos_acceptance: { ip: publicIp },
            },
          ];
        }
        return [];
      }
    );

    const evaluation = await module.EvaluateAndApply(account.id, null, {
      ip: publicIp,
    });

    expect(evaluation.pendingVerification.length).toBeGreaterThan(0);
    expect(
      evaluation.errors.some((e) =>
        e.reason.includes('Signup IP is already used')
      )
    ).toBe(true);
  });

  it('disables payouts when evaluation becomes blocking on an enabled account', async () => {
    const { account, person } = SeedClean();
    storedAccounts.set(account.id, {
      ...account,
      payouts_enabled: true,
      capabilities: { usdc_payouts: 'active', transfers: 'active' },
    });
    person.first_name = 'xxx';
    storedPersons.set(person.id, person);

    await module.EvaluateAndApply(account.id, person);

    expect(storedAccounts.get(account.id)?.payouts_enabled).toBe(false);
  });

  it('RestorePayoutsIfEligible re-enables when no hard dues and wallet exists', async () => {
    const { account } = SeedClean();
    storedAccounts.set(account.id, {
      ...account,
      payouts_enabled: false,
      capabilities: { usdc_payouts: 'inactive', transfers: 'inactive' },
      requirements: {
        ...account.requirements,
        currently_due: [],
        pending_verification: [IDENTITY_REQUIREMENT_FIELDS.email],
        errors: [
          {
            code: 'invalid_value',
            reason: 'Email is already used',
            requirement: IDENTITY_REQUIREMENT_FIELDS.email,
          },
        ],
      },
    });

    mockDb.Find2Custom.mockImplementation(
      async (collection, field1, _op1, value1) => {
        if (
          collection === 'ExternalWallets' &&
          field1 === 'account' &&
          value1 === account.id
        ) {
          return [
            {
              id: 'ba_z_1',
              object: 'bank_account',
              account: account.id,
              default_for_currency: true,
              status: 'new',
            },
          ];
        }
        return [];
      }
    );

    await module.RestorePayoutsIfEligible(account.id);

    expect(storedAccounts.get(account.id)?.payouts_enabled).toBe(true);
  });

  it('RestorePayoutsIfEligible does not re-enable with hard currently_due', async () => {
    const { account } = SeedClean();
    storedAccounts.set(account.id, {
      ...account,
      payouts_enabled: false,
      requirements: {
        ...account.requirements,
        currently_due: [IDENTITY_REQUIREMENT_FIELDS.phone],
      },
    });

    mockDb.Find2Custom.mockImplementation(
      async (collection, field1, _op1, value1) => {
        if (collection === 'ExternalWallets' && field1 === 'account') {
          return [
            {
              id: 'ba_z_1',
              account: value1,
              default_for_currency: true,
              status: 'new',
            },
          ];
        }
        return [];
      }
    );

    await module.RestorePayoutsIfEligible(account.id);

    expect(storedAccounts.get(account.id)?.payouts_enabled).toBe(false);
  });
});
