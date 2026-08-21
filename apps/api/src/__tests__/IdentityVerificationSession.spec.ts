import { createHmac } from 'crypto';
import { AccountModule } from '../modules/Account';
import { Database } from '../modules/Database';
import { IdentityLiteModule } from '../modules/identity/IdentityLite';
import { IdentityVerificationSessionModule } from '../modules/IdentityVerificationSession';
import { DiditProvider } from '../modules/identity/DiditProvider';
import {
  EncryptIdentitySettings,
  RedactAccountIdentitySecrets,
  DecryptIdentitySecret,
} from '../modules/identity/IdentitySettingsCrypto';
import {
  Account,
  IdentityVerificationSession,
  Person,
} from '@zoneless/shared-types';
import {
  IsBusinessAccount,
  ResolvedIdentityProvider,
  SelectIdentityWorkflow,
} from '../modules/identity/ResolveIdentityProvider';
import { IDENTITY_REQUIREMENT_FIELDS } from '@zoneless/shared-schemas';
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

const TEST_ENCRYPTION_KEY = 'a'.repeat(64);

jest.mock('../modules/AppConfig', () => ({
  GetAppConfig: jest.fn(() => ({
    dashboardUrl: 'http://localhost:4200',
    livemode: false,
    appSecret: 'aa'.repeat(32),
  })),
  GetEncryptionKey: jest.fn(() => TEST_ENCRYPTION_KEY),
}));

describe('IdentitySettingsCrypto', () => {
  it('encrypts Didit secrets and redacts them on account responses', () => {
    const encrypted = EncryptIdentitySettings({
      provider: 'didit',
      didit: {
        api_key: 'didit_live_key',
        workflow_id: 'wf_123',
        webhook_secret: 'whsec_abc',
      },
      rules: { payout_volume_threshold_cents: 100_000 },
    });

    expect(encrypted?.didit?.api_key).not.toBe('didit_live_key');
    expect(encrypted?.didit?.webhook_secret).not.toBe('whsec_abc');
    expect(encrypted?.didit?.workflow_id).toBe('wf_123');
    expect(DecryptIdentitySecret(encrypted?.didit?.api_key)).toBe(
      'didit_live_key'
    );

    const account = {
      id: 'acct_z_platform',
      settings: { identity: encrypted },
    } as Account;

    const redacted = RedactAccountIdentitySecrets(account);
    expect(redacted.settings?.identity?.didit?.api_key).toBeNull();
    expect(redacted.settings?.identity?.didit?.webhook_secret).toBeNull();
    expect(redacted.settings?.identity?.didit?.api_key_set).toBe(true);
    expect(redacted.settings?.identity?.didit?.webhook_secret_set).toBe(true);
    expect(redacted.settings?.identity?.didit?.workflow_id).toBe('wf_123');
    expect(encrypted?.didit?.kyb_workflow_id).toBeUndefined();
  });

  it('persists kyb_workflow_id without encrypting it', () => {
    const encrypted = EncryptIdentitySettings({
      provider: 'didit',
      didit: {
        api_key: 'didit_live_key',
        workflow_id: 'wf_kyc',
        kyb_workflow_id: 'wf_kyb',
        webhook_secret: 'whsec_abc',
      },
    });

    expect(encrypted?.didit?.workflow_id).toBe('wf_kyc');
    expect(encrypted?.didit?.kyb_workflow_id).toBe('wf_kyb');
  });
});

describe('SelectIdentityWorkflow', () => {
  function BuildResolved(
    kybWorkflowId: string | null = 'wf_kyb'
  ): ResolvedIdentityProvider {
    return {
      provider: {} as never,
      apiKey: 'key',
      workflowId: 'wf_kyc',
      kybWorkflowId,
      webhookSecret: null,
    };
  }

  it('uses the KYC workflow for individuals', () => {
    expect(
      SelectIdentityWorkflow(BuildResolved(), {
        business_type: 'individual',
      } as Account)
    ).toEqual({ workflowId: 'wf_kyc', isKyb: false });
  });

  it('uses the KYB workflow for companies when configured', () => {
    expect(
      SelectIdentityWorkflow(BuildResolved(), {
        business_type: 'company',
      } as Account)
    ).toEqual({ workflowId: 'wf_kyb', isKyb: true });
  });

  it('falls back to the KYC workflow when kyb_workflow_id is unset', () => {
    expect(
      SelectIdentityWorkflow(BuildResolved(null), {
        business_type: 'company',
      } as Account)
    ).toEqual({ workflowId: 'wf_kyc', isKyb: false });
  });

  it('treats non_profit and government_entity as business accounts', () => {
    expect(IsBusinessAccount({ business_type: 'non_profit' })).toBe(true);
    expect(IsBusinessAccount({ business_type: 'government_entity' })).toBe(
      true
    );
    expect(IsBusinessAccount({ business_type: 'individual' })).toBe(false);
    expect(IsBusinessAccount(null)).toBe(false);
  });
});

describe('DiditProvider', () => {
  const provider = new DiditProvider();

  it('maps Didit statuses to VerificationSession statuses', () => {
    expect(provider.MapStatus('Approved')).toBe('verified');
    expect(provider.MapStatus('Declined')).toBe('requires_input');
    expect(provider.MapStatus('In Progress')).toBe('processing');
    expect(provider.MapStatus('Not Started')).toBe('requires_input');
  });

  it('verifies X-Signature-Simple webhooks', () => {
    const secret = 'test_webhook_secret';
    const body = {
      timestamp: GetFixedTimestamp(),
      session_id: 'didit_sess_1',
      status: 'Approved',
      webhook_type: 'status.updated',
    };
    const canonical = [
      body.timestamp,
      body.session_id,
      body.status,
      body.webhook_type,
    ].join(':');
    const signature = createHmac('sha256', secret)
      .update(canonical)
      .digest('hex');

    // Freeze "now" within tolerance of body.timestamp
    const realNow = Date.now;
    Date.now = () => GetFixedTimestamp() * 1000;
    try {
      expect(
        provider.VerifyWebhook(secret, body, {
          signatureSimple: signature,
          timestamp: String(GetFixedTimestamp()),
        })
      ).toBe(true);
      expect(
        provider.VerifyWebhook(secret, body, {
          signatureSimple: 'deadbeef',
          timestamp: String(GetFixedTimestamp()),
        })
      ).toBe(false);
    } finally {
      Date.now = realNow;
    }
  });
});

describe('IdentityVerificationSessionModule', () => {
  let mockDb: jest.Mocked<Database>;
  let sessionModule: IdentityVerificationSessionModule;
  let storedAccounts: Map<string, Account>;
  let storedPersons: Map<string, Person>;
  let storedSessions: Map<string, IdentityVerificationSession>;

  const platformId = 'acct_z_platform';
  const connectedId = 'acct_z_connected';
  const personId = 'person_z_1';

  function BuildPlatform(): Account {
    const encrypted = EncryptIdentitySettings({
      provider: 'didit',
      didit: {
        api_key: 'didit_key',
        workflow_id: 'wf_test',
        webhook_secret: 'whsec_test',
      },
      rules: { payout_volume_threshold_cents: 100_000 },
    });

    return {
      id: platformId,
      object: 'account',
      platform_account: platformId,
      charges_enabled: true,
      payouts_enabled: true,
      details_submitted: true,
      country: 'US',
      created: GetFixedTimestamp(),
      default_currency: 'usdc',
      metadata: {},
      settings: { identity: encrypted ?? null },
      requirements: {
        currently_due: [],
        eventually_due: [],
        pending_verification: [],
        errors: [],
        disabled_reason: null,
      },
    } as Account;
  }

  function BuildConnected(): Account {
    return {
      id: connectedId,
      object: 'account',
      platform_account: platformId,
      charges_enabled: true,
      payouts_enabled: true,
      details_submitted: true,
      country: 'US',
      created: GetFixedTimestamp(),
      default_currency: 'usdc',
      metadata: {},
      requirements: {
        currently_due: [],
        eventually_due: [],
        pending_verification: [],
        errors: [],
        disabled_reason: null,
      },
    } as Account;
  }

  function BuildPerson(overrides: Partial<Person> = {}): Person {
    return {
      id: personId,
      object: 'person',
      account: connectedId,
      platform_account: platformId,
      created: GetFixedTimestamp(),
      first_name: 'Jane',
      last_name: 'Doe',
      email: 'jane@example.com',
      phone: '+14155552671',
      dob: { day: 1, month: 1, year: 1990 },
      address: {
        line1: '1 Market St',
        city: 'San Francisco',
        postal_code: '94105',
        country: 'US',
        line2: null,
        state: 'CA',
      },
      metadata: {},
      relationship: { representative: true },
      requirements: {
        alternatives: [],
        currently_due: [],
        errors: [],
        eventually_due: [],
        past_due: [],
        pending_verification: [],
      },
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
      ...overrides,
    } as Person;
  }

  beforeEach(() => {
    jest.clearAllMocks();
    ResetIdCounter();
    mockDb = CreateMockDatabase();
    storedAccounts = new Map();
    storedPersons = new Map();
    storedSessions = new Map();

    storedAccounts.set(platformId, BuildPlatform());
    storedAccounts.set(connectedId, BuildConnected());
    storedPersons.set(personId, BuildPerson());

    mockDb.Get.mockImplementation(async (collection, id) => {
      if (collection === 'Accounts') return storedAccounts.get(id) ?? null;
      if (collection === 'Persons') return storedPersons.get(id) ?? null;
      if (collection === 'VerificationSessions')
        return storedSessions.get(id) ?? null;
      return null;
    });

    mockDb.Set.mockImplementation(async (collection, id, doc) => {
      if (collection === 'Accounts') {
        storedAccounts.set(id, doc as Account);
      } else if (collection === 'Persons') {
        storedPersons.set(id, doc as Person);
      } else if (collection === 'VerificationSessions') {
        storedSessions.set(id, doc as IdentityVerificationSession);
      }
      return null;
    });

    mockDb.Update.mockImplementation(async (collection, id, update) => {
      if (collection === 'Accounts') {
        const existing = storedAccounts.get(id);
        if (existing) {
          storedAccounts.set(id, {
            ...existing,
            ...(update as Partial<Account>),
            requirements: {
              ...existing.requirements,
              ...(update as Partial<Account>).requirements,
            },
          } as Account);
        }
      } else if (collection === 'Persons') {
        const existing = storedPersons.get(id);
        if (existing) {
          storedPersons.set(id, {
            ...existing,
            ...(update as Partial<Person>),
          } as Person);
        }
      } else if (collection === 'VerificationSessions') {
        const existing = storedSessions.get(id);
        if (existing) {
          storedSessions.set(id, {
            ...existing,
            ...(update as Partial<IdentityVerificationSession>),
          } as IdentityVerificationSession);
        }
      }
    });

    mockDb.Find.mockImplementation(async (collection, field, value) => {
      if (collection === 'Persons' && field === 'account') {
        return [...storedPersons.values()].filter((p) => p.account === value);
      }
      return [];
    });

    mockDb.FindCustom.mockImplementation(
      async (collection, field, _op, value) => {
        if (
          collection === 'VerificationSessions' &&
          field === 'provider_session_id'
        ) {
          return [...storedSessions.values()].filter(
            (s) => s.provider_session_id === value
          );
        }
        return [];
      }
    );

    mockDb.Find2Custom.mockResolvedValue([]);
    mockDb.Aggregate.mockResolvedValue([{ gross: 0 }]);

    sessionModule = new IdentityVerificationSessionModule(mockDb);

    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        session_id: 'didit_sess_abc',
        session_token: 'tok_abc',
        url: 'https://verify.didit.me/session/abc',
        status: 'Not Started',
      }),
      text: async () => '',
    }) as unknown as typeof fetch;
  });

  it('creates a VerificationSession with a Didit url', async () => {
    const session = await sessionModule.Create(platformId, {
      type: 'document',
      related_account: connectedId,
    });

    expect(session.id).toMatch(/^vs_z/);
    expect(session.object).toBe('identity.verification_session');
    expect(session.url).toBe('https://verify.didit.me/session/abc');
    expect(session.provider_session_id).toBe('didit_sess_abc');
    expect(session.related_account).toBe(connectedId);
    expect(session.related_person).toBe(personId);
    expect(storedPersons.get(personId)?.verification?.status).toBe('pending');
    expect(global.fetch).toHaveBeenCalledWith(
      'https://verification.didit.me/v3/session/',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          'x-api-key': 'didit_key',
        }),
      })
    );
    const createBody = JSON.parse(
      (global.fetch as jest.Mock).mock.calls[0][1].body
    );
    expect(createBody.workflow_id).toBe('wf_test');
    expect(createBody.expected_details).toBeUndefined();
  });

  it('uses the KYB workflow and expected_details for company accounts', async () => {
    const platform = storedAccounts.get(platformId)!;
    platform.settings = {
      identity: EncryptIdentitySettings({
        provider: 'didit',
        didit: {
          api_key: 'didit_key',
          workflow_id: 'wf_test',
          kyb_workflow_id: 'wf_kyb',
          webhook_secret: 'whsec_test',
        },
      }),
    };
    storedAccounts.set(platformId, platform);

    const connected = storedAccounts.get(connectedId)!;
    connected.business_type = 'company';
    connected.business_profile = {
      name: "Ben's Business",
      mcc: null,
      product_description: null,
      support_email: null,
      support_phone: null,
      support_url: null,
      url: null,
    };
    storedAccounts.set(connectedId, connected);

    await sessionModule.Create(platformId, {
      type: 'document',
      related_account: connectedId,
    });

    const createBody = JSON.parse(
      (global.fetch as jest.Mock).mock.calls[0][1].body
    );
    expect(createBody.workflow_id).toBe('wf_kyb');
    expect(createBody.expected_details).toEqual({
      company_name: "Ben's Business",
      registry_country: 'US',
    });
  });

  it('falls back to the KYC workflow for companies without kyb_workflow_id', async () => {
    const connected = storedAccounts.get(connectedId)!;
    connected.business_type = 'company';
    storedAccounts.set(connectedId, connected);

    await sessionModule.Create(platformId, {
      type: 'document',
      related_account: connectedId,
    });

    const createBody = JSON.parse(
      (global.fetch as jest.Mock).mock.calls[0][1].body
    );
    expect(createBody.workflow_id).toBe('wf_test');
    expect(createBody.expected_details).toBeUndefined();
  });

  it('cancels a session and sets person back to unverified', async () => {
    const session = await sessionModule.Create(platformId, {
      type: 'document',
      related_account: connectedId,
    });

    const canceled = await sessionModule.Cancel(session.id, platformId);
    expect(canceled.status).toBe('canceled');
    expect(canceled.url).toBeNull();
    expect(storedPersons.get(personId)?.verification?.status).toBe(
      'unverified'
    );
  });

  it('applies approved Didit webhook and verifies the person', async () => {
    const session = await sessionModule.Create(platformId, {
      type: 'document',
      related_account: connectedId,
    });

    const body = {
      timestamp: GetFixedTimestamp(),
      session_id: session.provider_session_id,
      status: 'Approved',
      webhook_type: 'status.updated',
    };
    const canonical = [
      body.timestamp,
      body.session_id,
      body.status,
      body.webhook_type,
    ].join(':');
    const signature = createHmac('sha256', 'whsec_test')
      .update(canonical)
      .digest('hex');

    const realNow = Date.now;
    Date.now = () => GetFixedTimestamp() * 1000;
    try {
      await sessionModule.HandleDiditWebhook(body, {
        signatureSimple: signature,
        timestamp: String(GetFixedTimestamp()),
      });
    } finally {
      Date.now = realNow;
    }

    expect(storedSessions.get(session.id)?.status).toBe('verified');
    expect(storedPersons.get(personId)?.verification?.status).toBe('verified');
  });

  it('applies declined Didit webhook and keeps person unverified', async () => {
    const session = await sessionModule.Create(platformId, {
      type: 'document',
      related_account: connectedId,
    });

    const body = {
      timestamp: GetFixedTimestamp(),
      session_id: session.provider_session_id,
      status: 'Declined',
      webhook_type: 'status.updated',
    };
    const canonical = [
      body.timestamp,
      body.session_id,
      body.status,
      body.webhook_type,
    ].join(':');
    const signature = createHmac('sha256', 'whsec_test')
      .update(canonical)
      .digest('hex');

    const realNow = Date.now;
    Date.now = () => GetFixedTimestamp() * 1000;
    try {
      await sessionModule.HandleDiditWebhook(body, {
        signatureSimple: signature,
        timestamp: String(GetFixedTimestamp()),
      });
    } finally {
      Date.now = realNow;
    }

    expect(storedSessions.get(session.id)?.status).toBe('requires_input');
    expect(storedPersons.get(personId)?.verification?.status).toBe(
      'unverified'
    );
    expect(storedPersons.get(personId)?.verification?.details_code).toBe(
      'verification_failed'
    );
  });
});

describe('Identity volume threshold gating', () => {
  let mockDb: jest.Mocked<Database>;
  let module: IdentityLiteModule;
  let storedAccounts: Map<string, Account>;
  let storedPersons: Map<string, Person>;

  const platformId = 'acct_z_platform';
  const connectedId = 'acct_z_connected';

  beforeEach(() => {
    jest.clearAllMocks();
    ResetIdCounter();
    mockDb = CreateMockDatabase();
    storedAccounts = new Map();
    storedPersons = new Map();

    const encrypted = EncryptIdentitySettings({
      provider: 'didit',
      didit: {
        api_key: 'k',
        workflow_id: 'wf',
        webhook_secret: 's',
      },
      rules: { payout_volume_threshold_cents: 100_000 },
    });

    storedAccounts.set(platformId, {
      id: platformId,
      object: 'account',
      platform_account: platformId,
      charges_enabled: true,
      payouts_enabled: true,
      details_submitted: true,
      country: 'US',
      created: GetFixedTimestamp(),
      default_currency: 'usdc',
      metadata: {},
      settings: { identity: encrypted ?? null },
      requirements: {
        currently_due: [],
        eventually_due: [],
        pending_verification: [],
        errors: [],
        disabled_reason: null,
      },
    } as Account);

    storedAccounts.set(connectedId, {
      id: connectedId,
      object: 'account',
      platform_account: platformId,
      charges_enabled: true,
      payouts_enabled: true,
      details_submitted: true,
      country: 'US',
      created: GetFixedTimestamp(),
      default_currency: 'usdc',
      metadata: {},
      requirements: {
        currently_due: [],
        eventually_due: [],
        pending_verification: [],
        errors: [],
        disabled_reason: null,
      },
    } as Account);

    storedPersons.set('person_z_1', {
      id: 'person_z_1',
      object: 'person',
      account: connectedId,
      platform_account: platformId,
      created: GetFixedTimestamp(),
      first_name: 'Jane',
      last_name: 'Doe',
      email: 'jane@example.com',
      phone: '+14155552671',
      dob: { day: 1, month: 1, year: 1990 },
      address: {
        line1: '1 Market St',
        city: 'San Francisco',
        postal_code: '94105',
        country: 'US',
        line2: null,
        state: 'CA',
      },
      metadata: {},
      relationship: { representative: true },
      requirements: {
        alternatives: [],
        currently_due: [],
        errors: [],
        eventually_due: [],
        past_due: [],
        pending_verification: [],
      },
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
    } as Person);

    mockDb.Get.mockImplementation(async (collection, id) => {
      if (collection === 'Accounts') return storedAccounts.get(id) ?? null;
      if (collection === 'Persons') return storedPersons.get(id) ?? null;
      return null;
    });

    mockDb.Update.mockImplementation(async (collection, id, update) => {
      if (collection === 'Accounts') {
        const existing = storedAccounts.get(id)!;
        storedAccounts.set(id, {
          ...existing,
          ...(update as Partial<Account>),
          requirements: {
            ...existing.requirements,
            ...(update as Partial<Account>).requirements,
          },
          metadata: (update as Partial<Account>).metadata ?? existing.metadata,
        } as Account);
      } else if (collection === 'Persons') {
        const existing = storedPersons.get(id)!;
        storedPersons.set(id, {
          ...existing,
          ...(update as Partial<Person>),
        } as Person);
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

  it('puts document on eventually_due below threshold', async () => {
    mockDb.Aggregate.mockResolvedValue([{ gross: 50_000 }]);

    const evaluation = await module.EvaluateAndApply(connectedId);

    expect(evaluation.blocking).toBe(false);
    expect(evaluation.currentlyDue).not.toContain(
      IDENTITY_REQUIREMENT_FIELDS.verificationDocument
    );
    expect(evaluation.eventuallyDue).toContain(
      IDENTITY_REQUIREMENT_FIELDS.verificationDocument
    );
  });

  it('promotes document to currently_due and blocks at threshold', async () => {
    mockDb.Aggregate.mockResolvedValue([{ gross: 100_000 }]);

    const evaluation = await module.EvaluateAndApply(connectedId);

    expect(evaluation.blocking).toBe(true);
    expect(evaluation.currentlyDue).toContain(
      IDENTITY_REQUIREMENT_FIELDS.verificationDocument
    );
    expect(
      storedAccounts.get(connectedId)?.requirements?.currently_due
    ).toContain(IDENTITY_REQUIREMENT_FIELDS.verificationDocument);
    expect(storedAccounts.get(connectedId)?.payouts_enabled).toBe(false);
  });

  it('clears document requirement when person is verified', async () => {
    mockDb.Aggregate.mockResolvedValue([{ gross: 250_000 }]);
    const person = storedPersons.get('person_z_1')!;
    person.verification = {
      ...person.verification!,
      status: 'verified',
    };
    storedPersons.set(person.id, person);

    const evaluation = await module.EvaluateAndApply(connectedId);

    expect(evaluation.blocking).toBe(false);
    expect(evaluation.currentlyDue).not.toContain(
      IDENTITY_REQUIREMENT_FIELDS.verificationDocument
    );
    expect(evaluation.eventuallyDue).not.toContain(
      IDENTITY_REQUIREMENT_FIELDS.verificationDocument
    );
  });

  it('skips document IDV when Didit is not configured', async () => {
    const platform = storedAccounts.get(platformId)!;
    platform.settings = {
      identity: {
        provider: 'didit',
        didit: { workflow_id: null, api_key: null },
        rules: { payout_volume_threshold_cents: 0 },
      },
    };
    storedAccounts.set(platformId, platform);
    mockDb.Aggregate.mockResolvedValue([{ gross: 0 }]);

    const evaluation = await module.EvaluateAndApply(connectedId);

    expect(evaluation.eventuallyDue).not.toContain(
      IDENTITY_REQUIREMENT_FIELDS.verificationDocument
    );
    expect(evaluation.currentlyDue).not.toContain(
      IDENTITY_REQUIREMENT_FIELDS.verificationDocument
    );
  });

  it('applies country override $0 for PK immediately', async () => {
    const platform = storedAccounts.get(platformId)!;
    platform.settings = {
      identity: EncryptIdentitySettings({
        provider: 'didit',
        didit: { api_key: 'k', workflow_id: 'wf', webhook_secret: 's' },
        rules: {
          payout_volume_threshold_cents: 10_000,
          country_thresholds: [
            { countries: ['PK', 'ID'], payout_volume_threshold_cents: 0 },
            { countries: ['IN'], payout_volume_threshold_cents: 5_000 },
          ],
        },
      }),
    };
    storedAccounts.set(platformId, platform);

    const connected = storedAccounts.get(connectedId)!;
    connected.country = 'PK';
    storedAccounts.set(connectedId, connected);
    mockDb.Aggregate.mockResolvedValue([{ gross: 0 }]);

    const evaluation = await module.EvaluateAndApply(connectedId);

    expect(evaluation.blocking).toBe(true);
    expect(evaluation.currentlyDue).toContain(
      IDENTITY_REQUIREMENT_FIELDS.verificationDocument
    );
  });

  it('uses India override $50 below and at threshold', async () => {
    const platform = storedAccounts.get(platformId)!;
    platform.settings = {
      identity: EncryptIdentitySettings({
        provider: 'didit',
        didit: { api_key: 'k', workflow_id: 'wf', webhook_secret: 's' },
        rules: {
          payout_volume_threshold_cents: 10_000,
          country_thresholds: [
            { countries: ['PK', 'ID'], payout_volume_threshold_cents: 0 },
            { countries: ['IN'], payout_volume_threshold_cents: 5_000 },
          ],
        },
      }),
    };
    storedAccounts.set(platformId, platform);

    const connected = storedAccounts.get(connectedId)!;
    connected.country = 'IN';
    storedAccounts.set(connectedId, connected);

    mockDb.Aggregate.mockResolvedValue([{ gross: 4_999 }]);
    let evaluation = await module.EvaluateAndApply(connectedId);
    expect(evaluation.blocking).toBe(false);
    expect(evaluation.eventuallyDue).toContain(
      IDENTITY_REQUIREMENT_FIELDS.verificationDocument
    );

    mockDb.Aggregate.mockResolvedValue([{ gross: 5_000 }]);
    evaluation = await module.EvaluateAndApply(connectedId);
    expect(evaluation.blocking).toBe(true);
    expect(evaluation.currentlyDue).toContain(
      IDENTITY_REQUIREMENT_FIELDS.verificationDocument
    );
  });

  it('falls back to default $100 for unmatched countries', async () => {
    const platform = storedAccounts.get(platformId)!;
    platform.settings = {
      identity: EncryptIdentitySettings({
        provider: 'didit',
        didit: { api_key: 'k', workflow_id: 'wf', webhook_secret: 's' },
        rules: {
          payout_volume_threshold_cents: 10_000,
          country_thresholds: [
            { countries: ['PK', 'ID'], payout_volume_threshold_cents: 0 },
            { countries: ['IN'], payout_volume_threshold_cents: 5_000 },
          ],
        },
      }),
    };
    storedAccounts.set(platformId, platform);

    const connected = storedAccounts.get(connectedId)!;
    connected.country = 'US';
    storedAccounts.set(connectedId, connected);

    mockDb.Aggregate.mockResolvedValue([{ gross: 9_999 }]);
    let evaluation = await module.EvaluateAndApply(connectedId);
    expect(evaluation.blocking).toBe(false);
    expect(evaluation.eventuallyDue).toContain(
      IDENTITY_REQUIREMENT_FIELDS.verificationDocument
    );

    mockDb.Aggregate.mockResolvedValue([{ gross: 10_000 }]);
    evaluation = await module.EvaluateAndApply(connectedId);
    expect(evaluation.blocking).toBe(true);
    expect(evaluation.currentlyDue).toContain(
      IDENTITY_REQUIREMENT_FIELDS.verificationDocument
    );
  });

  it('skips document IDV when no threshold rules are set', async () => {
    const platform = storedAccounts.get(platformId)!;
    platform.settings = {
      identity: EncryptIdentitySettings({
        provider: 'didit',
        didit: { api_key: 'k', workflow_id: 'wf', webhook_secret: 's' },
        rules: {
          payout_volume_threshold_cents: null,
          country_thresholds: [],
        },
      }),
    };
    storedAccounts.set(platformId, platform);
    mockDb.Aggregate.mockResolvedValue([{ gross: 1_000_000 }]);

    const evaluation = await module.EvaluateAndApply(connectedId);

    expect(evaluation.currentlyDue).not.toContain(
      IDENTITY_REQUIREMENT_FIELDS.verificationDocument
    );
    expect(evaluation.eventuallyDue).not.toContain(
      IDENTITY_REQUIREMENT_FIELDS.verificationDocument
    );
  });

  it('refresh clears document currently_due when volume is now under threshold', async () => {
    mockDb.Aggregate.mockResolvedValue([{ gross: 250_000 }]);
    await module.EvaluateAndApply(connectedId);
    expect(
      storedAccounts.get(connectedId)?.requirements?.currently_due
    ).toContain(IDENTITY_REQUIREMENT_FIELDS.verificationDocument);

    mockDb.Aggregate.mockResolvedValue([{ gross: 50_000 }]);
    const refreshed = await module.RefreshIdentityRequirements(connectedId);

    expect(refreshed.requirements?.currently_due).not.toContain(
      IDENTITY_REQUIREMENT_FIELDS.verificationDocument
    );
    expect(refreshed.requirements?.eventually_due).toContain(
      IDENTITY_REQUIREMENT_FIELDS.verificationDocument
    );

    mockDb.Aggregate.mockResolvedValue([{ gross: 250_000 }]);
    const evaluation = await module.EvaluateAndApply(connectedId);
    expect(evaluation.blocking).toBe(true);
    expect(evaluation.currentlyDue).toContain(
      IDENTITY_REQUIREMENT_FIELDS.verificationDocument
    );
  });

  it('refresh keeps document currently_due when still over threshold', async () => {
    mockDb.Aggregate.mockResolvedValue([{ gross: 250_000 }]);
    await module.EvaluateAndApply(connectedId);

    const refreshed = await module.RefreshIdentityRequirements(connectedId);

    expect(refreshed.requirements?.currently_due).toContain(
      IDENTITY_REQUIREMENT_FIELDS.verificationDocument
    );
  });
});

describe('AccountModule identity settings merge', () => {
  let accountModule: AccountModule;
  let mockDb: jest.Mocked<Database>;

  beforeEach(() => {
    jest.clearAllMocks();
    ResetIdCounter();
    mockDb = CreateMockDatabase();
    accountModule = new AccountModule(mockDb);

    mockDb.Get.mockImplementation(async (_c, id) => {
      if (id === 'acct_z_platform') {
        return {
          id: 'acct_z_platform',
          object: 'account',
          platform_account: 'acct_z_platform',
          charges_enabled: true,
          payouts_enabled: true,
          details_submitted: true,
          country: 'US',
          created: GetFixedTimestamp(),
          default_currency: 'usdc',
          metadata: {},
          settings: {},
          requirements: {
            currently_due: [],
            eventually_due: [],
            pending_verification: [],
            errors: [],
            disabled_reason: null,
          },
        } as Account;
      }
      return null;
    });

    mockDb.Update.mockResolvedValue(undefined);
  });

  it('encrypts identity secrets on UpdateAccount', async () => {
    // After update, Get returns the updated doc from Set/Update chain —
    // UpdateAccountInternal calls Update then Get. Seed Get to return merged.
    let stored: Account | null = null;
    mockDb.Update.mockImplementation(async (_c, _id, update) => {
      stored = {
        id: 'acct_z_platform',
        object: 'account',
        platform_account: 'acct_z_platform',
        charges_enabled: true,
        payouts_enabled: true,
        details_submitted: true,
        country: 'US',
        created: GetFixedTimestamp(),
        default_currency: 'usdc',
        metadata: {},
        requirements: {
          currently_due: [],
          eventually_due: [],
          pending_verification: [],
          errors: [],
          disabled_reason: null,
        },
        ...(update as Partial<Account>),
      } as Account;
    });
    mockDb.Get.mockImplementation(async () => stored);

    // First Get for ProcessUpdateInput
    const base = {
      id: 'acct_z_platform',
      object: 'account' as const,
      platform_account: 'acct_z_platform',
      charges_enabled: true,
      payouts_enabled: true,
      details_submitted: true,
      country: 'US',
      created: GetFixedTimestamp(),
      default_currency: 'usdc',
      metadata: {},
      settings: {},
      requirements: {
        currently_due: [],
        eventually_due: [],
        pending_verification: [],
        errors: [],
        disabled_reason: null,
      },
    } as Account;

    let call = 0;
    mockDb.Get.mockImplementation(async () => {
      call++;
      if (call === 1) return base;
      return stored;
    });

    const updated = await accountModule.UpdateAccount('acct_z_platform', {
      settings: {
        identity: {
          provider: 'didit',
          didit: {
            api_key: 'plain_key',
            workflow_id: 'wf_1',
            kyb_workflow_id: 'wf_kyb_1',
            webhook_secret: 'plain_secret',
          },
          rules: { payout_volume_threshold_cents: 1000 },
        },
      },
    });

    expect(updated.settings?.identity?.didit?.api_key).not.toBe('plain_key');
    expect(updated.settings?.identity?.didit?.workflow_id).toBe('wf_1');
    expect(updated.settings?.identity?.didit?.kyb_workflow_id).toBe('wf_kyb_1');
    expect(
      DecryptIdentitySecret(updated.settings?.identity?.didit?.api_key)
    ).toBe('plain_key');
  });
});
