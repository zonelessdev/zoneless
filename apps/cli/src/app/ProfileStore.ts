import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { InvalidInput } from './Errors';
import {
  GetApiKeyAccount,
  GetWalletAccount,
  type SecretStore,
} from './SecretStore';
import type { Environment } from './Types';

export type ProfileMode = 'live' | 'test';

export interface AgentProfile {
  apiKeyPrefix: string;
  apiUrl: string;
  mode: ProfileMode;
  platformId: string;
  platformName: string;
  walletPublicKey: string;
  workspaceId?: string;
}

export interface ProfileConfig {
  currentProfile: string | null;
  profiles: Record<string, AgentProfile>;
  version: 1;
}

export interface ProfileCredentials {
  apiKey: string;
  profile: AgentProfile;
  profileName: string;
}

export class ProfileStore {
  private readonly configPath: string;

  constructor(
    environment: Environment,
    private readonly secretStore: SecretStore
  ) {
    const configRoot =
      environment.XDG_CONFIG_HOME ??
      (environment.HOME
        ? path.join(environment.HOME, '.config')
        : path.join(os.homedir(), '.config'));
    this.configPath = path.join(configRoot, 'zoneless', 'config.json');
  }

  async GetCredentials(profileName?: string): Promise<ProfileCredentials> {
    const selected = await this.GetProfile(profileName);
    const apiKey = await this.secretStore.Get(
      GetApiKeyAccount(selected.profileName)
    );
    if (!apiKey) {
      throw InvalidInput(
        `The API key for profile "${selected.profileName}" is missing from the credential store.`
      );
    }
    return { apiKey, ...selected };
  }

  async GetProfile(
    profileName?: string
  ): Promise<Omit<ProfileCredentials, 'apiKey'>> {
    const config = await this.Read();
    const selectedName = profileName ?? config.currentProfile;
    if (!selectedName) {
      throw InvalidInput(
        'No Zoneless profile is configured. Run "zoneless agent setup" or provide ZONELESS_API_URL and ZONELESS_API_KEY.'
      );
    }

    const profile = config.profiles[selectedName];
    if (!profile) {
      throw InvalidInput(`No Zoneless profile named "${selectedName}" exists.`);
    }
    return { profile, profileName: selectedName };
  }

  async GetStatus(profileNames?: string | string[]): Promise<{
    currentProfile: string | null;
    profiles: Array<
      AgentProfile & {
        name: string;
        secretAvailable: boolean;
        walletSecretAvailable: boolean;
      }
    >;
  }> {
    const config = await this.Read();
    const profileEntries = Object.entries(config.profiles).filter(
      ([name]) =>
        !profileNames ||
        (Array.isArray(profileNames)
          ? profileNames.includes(name)
          : name === profileNames)
    );
    const profiles = await Promise.all(
      profileEntries.map(async ([name, profile]) => ({
        ...profile,
        name,
        secretAvailable: Boolean(
          await this.secretStore.Get(GetApiKeyAccount(name))
        ),
        walletSecretAvailable: Boolean(
          profile.walletPublicKey &&
            (await this.secretStore.Get(
              GetWalletAccount(profile.walletPublicKey)
            ))
        ),
      }))
    );
    return { currentProfile: config.currentProfile, profiles };
  }

  async GetReusableSetup(
    profilePrefix?: string,
    profileName?: string,
    requireSecrets = true
  ): Promise<{
    currentProfile: string;
    live: AgentProfile;
    liveProfile: string;
    test: AgentProfile;
    testProfile: string;
  } | null> {
    const config = await this.Read();
    const requestedNames = profilePrefix
      ? BuildProfileNames(profilePrefix)
      : null;
    const selectedName = profileName ?? config.currentProfile;
    const selectedProfile = selectedName
      ? config.profiles[selectedName]
      : undefined;
    const entries = requestedNames
      ? Object.entries(config.profiles).filter(([name]) =>
          [requestedNames.live, requestedNames.test].includes(name)
        )
      : Object.entries(config.profiles).filter(([, profile]) =>
          selectedProfile?.workspaceId
            ? profile.workspaceId === selectedProfile.workspaceId
            : profile.platformName === selectedProfile?.platformName &&
              profile.walletPublicKey === selectedProfile.walletPublicKey
        );
    const liveEntry = entries.find(([, profile]) => profile.mode === 'live');
    const testEntry = entries.find(([, profile]) => profile.mode === 'test');
    if (!liveEntry || !testEntry) return null;
    const live = liveEntry[1];
    const test = testEntry[1];
    if (live.platformName !== test.platformName) return null;
    const [liveKey, testKey] = await Promise.all([
      this.secretStore.Get(GetApiKeyAccount(liveEntry[0])),
      this.secretStore.Get(GetApiKeyAccount(testEntry[0])),
    ]);
    if (requireSecrets && (!liveKey || !testKey)) return null;
    const currentProfile = [liveEntry[0], testEntry[0]].includes(
      config.currentProfile || ''
    )
      ? config.currentProfile!
      : testEntry[0];
    return {
      currentProfile,
      live,
      liveProfile: liveEntry[0],
      test,
      testProfile: testEntry[0],
    };
  }

  async ResolveNewPlatformPrefix(
    platformName: string,
    requestedPrefix?: string
  ): Promise<string> {
    const config = await this.Read();
    if (requestedPrefix) {
      const names = BuildProfileNames(requestedPrefix);
      if (config.profiles[names.live] || config.profiles[names.test]) {
        throw InvalidInput(
          `Profiles "${names.live}" or "${names.test}" already exist. Choose another --profile-prefix.`
        );
      }
      return requestedPrefix;
    }

    const basePrefix =
      platformName
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '')
        .slice(0, 40) || 'platform';
    for (let suffix = 1; suffix <= 1000; suffix += 1) {
      const prefix = suffix === 1 ? basePrefix : `${basePrefix}-${suffix}`;
      const names = BuildProfileNames(prefix);
      if (!config.profiles[names.live] && !config.profiles[names.test]) {
        return prefix;
      }
    }
    throw InvalidInput('Unable to generate an unused profile prefix.');
  }

  async SaveProfiles(
    profiles: Record<string, AgentProfile>,
    apiKeys: Record<string, string>,
    currentProfile = 'test',
    allowOverwrite = false
  ): Promise<void> {
    const existing = await this.Read();
    const collisions = Object.keys(profiles).filter(
      (name) => existing.profiles[name]
    );
    if (collisions.length && !allowOverwrite) {
      throw InvalidInput(
        `Profiles ${collisions
          .map((name) => `"${name}"`)
          .join(', ')} already exist and were not changed.`
      );
    }
    for (const [name, apiKey] of Object.entries(apiKeys)) {
      await this.secretStore.Set(GetApiKeyAccount(name), apiKey);
    }

    await this.Write({
      currentProfile,
      profiles: { ...existing.profiles, ...profiles },
      version: 1,
    });
  }

  private async Read(): Promise<ProfileConfig> {
    try {
      const contents = await fs.readFile(this.configPath, 'utf8');
      const config = JSON.parse(contents) as ProfileConfig;
      if (config.version !== 1 || typeof config.profiles !== 'object') {
        throw new Error('Unsupported profile format');
      }
      return config;
    } catch (error) {
      const nodeError = error as NodeJS.ErrnoException;
      if (nodeError.code === 'ENOENT') {
        return { currentProfile: null, profiles: {}, version: 1 };
      }
      throw error;
    }
  }

  private async Write(config: ProfileConfig): Promise<void> {
    const configDirectory = path.dirname(this.configPath);
    const temporaryPath = `${this.configPath}.${process.pid}.tmp`;
    await fs.mkdir(configDirectory, { recursive: true, mode: 0o700 });
    await fs.writeFile(temporaryPath, `${JSON.stringify(config, null, 2)}\n`, {
      mode: 0o600,
    });
    await fs.rename(temporaryPath, this.configPath);
  }
}

export function BuildProfileNames(
  profilePrefix?: string
): Record<ProfileMode, string> {
  const prefix = profilePrefix?.trim();
  return {
    live: prefix ? `${prefix}-live` : 'live',
    test: prefix ? `${prefix}-test` : 'test',
  };
}
