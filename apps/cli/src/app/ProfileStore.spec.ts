import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { ProfileStore, type AgentProfile } from './ProfileStore';
import type { SecretStore } from './SecretStore';

describe('Profile store multi-platform behavior', () => {
  let configRoot: string;
  let secrets: Map<string, string>;
  let secretStore: SecretStore;

  beforeEach(async () => {
    configRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'zoneless-profiles-'));
    secrets = new Map();
    secretStore = {
      Delete: async (account) => {
        secrets.delete(account);
      },
      Get: async (account) => secrets.get(account) ?? null,
      Set: async (account, value) => {
        secrets.set(account, value);
      },
    };
  });

  afterEach(async () => {
    await fs.rm(configRoot, { recursive: true, force: true });
  });

  it('reuses a complete live and test profile pair', async () => {
    const store = new ProfileStore(
      { XDG_CONFIG_HOME: configRoot },
      secretStore
    );
    await store.SaveProfiles(
      {
        'acme-live': CreateProfile('live'),
        'acme-test': CreateProfile('test'),
      },
      {
        'acme-live': 'live-secret',
        'acme-test': 'test-secret',
      },
      'acme-test'
    );

    const reusable = await store.GetReusableSetup('acme');

    expect(reusable).toMatchObject({
      currentProfile: 'acme-test',
      live: { platformId: 'platform-live' },
      test: { platformId: 'platform-test' },
    });
    await expect(store.GetReusableSetup()).resolves.toMatchObject({
      currentProfile: 'acme-test',
      test: { workspaceId: 'workspace-acme' },
    });
  });

  it('generates a collision-free prefix for another platform', async () => {
    const store = new ProfileStore(
      { XDG_CONFIG_HOME: configRoot },
      secretStore
    );
    await store.SaveProfiles(
      {
        'acme-live': CreateProfile('live'),
        'acme-test': CreateProfile('test'),
      },
      {
        'acme-live': 'live-secret',
        'acme-test': 'test-secret',
      }
    );

    await expect(store.ResolveNewPlatformPrefix('Acme')).resolves.toBe(
      'acme-2'
    );
    await expect(
      store.ResolveNewPlatformPrefix('Other', 'acme')
    ).rejects.toThrow(/already exist/);
    await expect(
      store.SaveProfiles(
        {
          'acme-live': CreateProfile('live'),
          'acme-test': CreateProfile('test'),
        },
        {
          'acme-live': 'replacement-live',
          'acme-test': 'replacement-test',
        }
      )
    ).rejects.toThrow(/were not changed/);
    expect([...secrets.values()]).not.toContain('replacement-live');

    await expect(
      store.SaveProfiles(
        {
          'acme-live': CreateProfile('live'),
          'acme-test': CreateProfile('test'),
        },
        {
          'acme-live': 'reconnected-live',
          'acme-test': 'reconnected-test',
        },
        'acme-test',
        true
      )
    ).resolves.toBeUndefined();
  });

  it('can resolve profile metadata for reconnect when local keys are missing', async () => {
    const store = new ProfileStore(
      { XDG_CONFIG_HOME: configRoot },
      secretStore
    );
    await store.SaveProfiles(
      {
        'acme-live': CreateProfile('live'),
        'acme-test': CreateProfile('test'),
      },
      {
        'acme-live': 'live-secret',
        'acme-test': 'test-secret',
      },
      'acme-test'
    );
    secrets.clear();

    await expect(store.GetReusableSetup('acme')).resolves.toBeNull();
    await expect(
      store.GetReusableSetup('acme', 'acme-test', false)
    ).resolves.toMatchObject({
      liveProfile: 'acme-live',
      testProfile: 'acme-test',
    });
  });
});

function CreateProfile(mode: 'live' | 'test'): AgentProfile {
  return {
    apiKeyPrefix: `${mode}-prefix`,
    apiUrl: `https://api-${mode}.example/v1`,
    mode,
    platformId: `platform-${mode}`,
    platformName: 'Acme',
    walletPublicKey: 'wallet-public-key',
    workspaceId: 'workspace-acme',
  };
}

describe('Profile store', () => {
  it('writes only non-secret metadata to an owner-readable config', async () => {
    const configRoot = await fs.mkdtemp(
      path.join(os.tmpdir(), 'zoneless-cli-')
    );
    const secrets = new Map<string, string>();
    const secretStore: SecretStore = {
      Delete: async (account) => {
        secrets.delete(account);
      },
      Get: async (account) => secrets.get(account) ?? null,
      Set: async (account, value) => {
        secrets.set(account, value);
      },
    };
    const store = new ProfileStore(
      { XDG_CONFIG_HOME: configRoot },
      secretStore
    );

    await store.SaveProfiles(
      {
        test: {
          apiKeyPrefix: 'zk_test',
          apiUrl: 'https://api-test.zonus.com/v1',
          mode: 'test',
          platformId: 'platform-test',
          platformName: 'Agent Store',
          walletPublicKey: 'wallet-public-key',
        },
      },
      { test: 'zk_test_secret' }
    );

    const configPath = path.join(configRoot, 'zoneless', 'config.json');
    const contents = await fs.readFile(configPath, 'utf8');
    const fileMode = (await fs.stat(configPath)).mode & 0o777;
    expect(contents).toContain('wallet-public-key');
    expect(contents).not.toContain('zk_test_secret');
    expect(fileMode).toBe(0o600);
    await expect(store.GetCredentials()).resolves.toMatchObject({
      apiKey: 'zk_test_secret',
      profileName: 'test',
    });

    await fs.rm(configRoot, { force: true, recursive: true });
  });
});
