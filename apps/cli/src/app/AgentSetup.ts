import {
  constants,
  createDecipheriv,
  generateKeyPairSync,
  privateDecrypt,
} from 'node:crypto';
import bs58 from 'bs58';
import { ApiError, CliError } from './Errors';
import {
  BuildProfileNames,
  type AgentProfile,
  type ProfileMode,
} from './ProfileStore';
import { GetWalletAccount, type SecretStore } from './SecretStore';
import { exitCodes } from './Types';

const defaultAuthUrl =
  'https://us-central1-zoneless-app.cloudfunctions.net/Actions';
const defaultActivationUrl = 'https://zoneless.com/activate';
const setupTimeoutMs = 10 * 60 * 1000;

interface ModeCredentials {
  apiBaseUrl: string;
  apiKey: string;
  apiKeyPrefix: string;
  platformId: string;
}

interface ProvisionCredentials {
  action: 'create' | 'reconnect';
  live: ModeCredentials;
  platformName: string;
  test: ModeCredentials;
  walletPublicKey: string;
  workspaceId: string;
}

interface EncryptedCredentials {
  authTag: string;
  ciphertext: string;
  encryptedKey: string;
  iv: string;
}

interface AuthorizationCreated {
  deviceCode: string;
  expiresAt: number;
  intervalSeconds: number;
  success: true;
  userCode: string;
  verificationUrl: string;
}

interface AuthorizationPoll {
  credentials?: EncryptedCredentials;
  message?: string;
  status:
    | 'pending'
    | 'approved'
    | 'provisioning'
    | 'ready'
    | 'denied'
    | 'expired'
    | 'failed'
    | 'consumed';
  success: boolean;
}

export interface AgentSetupOptions {
  activationUrl?: string;
  authUrl?: string;
  expectedWorkspaceId?: string;
  newPlatform?: boolean;
  platformName: string;
  pollIntervalMs?: number;
  profilePrefix?: string;
  reconnect?: boolean;
}

export interface AuthorizationPrompt {
  expiresAt: number;
  userCode: string;
  verificationUrl: string;
  walletPublicKey: string;
}

export interface AgentSetupResult {
  current_profile: string;
  object: 'agent_setup';
  ok: true;
  platform_name: string;
  profiles: {
    live: { api_url: string; platform_id: string };
    test: { api_url: string; platform_id: string };
  };
  wallet_public_key: string;
  workspace_id: string;
}

export interface ProfileWriter {
  SaveProfiles(
    profiles: Record<string, AgentProfile>,
    apiKeys: Record<string, string>,
    currentProfile?: string,
    allowOverwrite?: boolean
  ): Promise<void>;
}

export class AgentSetupService {
  constructor(
    private readonly fetchRequest: typeof fetch,
    private readonly secretStore: SecretStore,
    private readonly profileStore: ProfileWriter,
    private readonly wait: (milliseconds: number) => Promise<void> = Wait
  ) {}

  async Setup(
    options: AgentSetupOptions,
    onAuthorization: (prompt: AuthorizationPrompt) => void | Promise<void>
  ): Promise<AgentSetupResult> {
    const authUrl = options.authUrl ?? defaultAuthUrl;
    const activationUrl = options.activationUrl ?? defaultActivationUrl;
    const wallet = GenerateWallet();
    const walletPublicKey = wallet.publicKey;
    await this.secretStore.Set(
      GetWalletAccount(walletPublicKey),
      wallet.secretKey.toString('base64')
    );

    const encryptionKeys = generateKeyPairSync('rsa', {
      modulusLength: 2048,
      publicKeyEncoding: { format: 'pem', type: 'spki' },
      privateKeyEncoding: { format: 'pem', type: 'pkcs8' },
    });
    let authorization: AuthorizationCreated;
    try {
      authorization = await this.Call<AuthorizationCreated>(authUrl, {
        activationUrl,
        credentialPublicKey: encryptionKeys.publicKey,
        endpoint: 'CreateAgentAuthorization',
        newPlatform: options.newPlatform === true,
        platformName: options.platformName,
        reconnect: options.reconnect === true,
        solanaPublicKey: walletPublicKey,
      });
    } catch (error) {
      try {
        await this.secretStore.Delete(GetWalletAccount(walletPublicKey));
      } catch {
        // Preserve the authorization error; the orphaned key is not exposed.
      }
      throw error;
    }
    if (!authorization.success) {
      throw new ApiError('Unable to create agent authorization.', 0);
    }

    await onAuthorization({
      expiresAt: authorization.expiresAt,
      userCode: authorization.userCode,
      verificationUrl: authorization.verificationUrl,
      walletPublicKey,
    });

    const configuredInterval =
      options.pollIntervalMs ??
      Math.max(authorization.intervalSeconds * 1000, 1000);
    const deadline = Math.min(
      authorization.expiresAt,
      Date.now() + setupTimeoutMs
    );
    let encryptedCredentials: EncryptedCredentials | undefined;

    while (Date.now() < deadline) {
      await this.wait(configuredInterval);
      let poll: AuthorizationPoll;
      try {
        poll = await this.Call<AuthorizationPoll>(authUrl, {
          deviceCode: authorization.deviceCode,
          endpoint: 'PollAgentAuthorization',
          userCode: authorization.userCode,
        });
      } catch (error) {
        if (
          error instanceof ApiError &&
          (error.status === 0 || error.status === 429 || error.status >= 500)
        ) {
          continue;
        }
        throw error;
      }
      if (poll.status === 'ready' && poll.credentials) {
        encryptedCredentials = poll.credentials;
        break;
      }
      if (['denied', 'expired', 'failed', 'consumed'].includes(poll.status)) {
        throw new CliError(
          poll.message ?? `Agent authorization ${poll.status}.`,
          `authorization_${poll.status}`,
          exitCodes.apiError
        );
      }
    }

    if (!encryptedCredentials) {
      throw new CliError(
        'Agent authorization expired before approval completed.',
        'authorization_expired',
        exitCodes.apiError
      );
    }

    const credentials = DecryptCredentials(
      encryptedCredentials,
      encryptionKeys.privateKey
    );
    ValidateCredentials(credentials);
    if (options.reconnect && credentials.action !== 'reconnect') {
      await this.secretStore.Delete(GetWalletAccount(walletPublicKey));
      throw new ApiError(
        'The authorization did not reconnect the existing platform.',
        0
      );
    }
    if (
      options.expectedWorkspaceId &&
      credentials.workspaceId !== options.expectedWorkspaceId
    ) {
      await this.secretStore.Delete(GetWalletAccount(walletPublicKey));
      throw new ApiError(
        'The authorization returned credentials for a different workspace.',
        0
      );
    }
    if (credentials.walletPublicKey !== walletPublicKey) {
      await this.secretStore.Delete(GetWalletAccount(walletPublicKey));
    }
    const profileNames = BuildProfileNames(options.profilePrefix);
    await this.SaveCredentials(
      credentials,
      credentials.walletPublicKey,
      profileNames
    );

    try {
      await this.Call(authUrl, {
        deviceCode: authorization.deviceCode,
        endpoint: 'AcknowledgeAgentAuthorization',
        userCode: authorization.userCode,
      });
    } catch {
      // Credentials are already secure locally. Server-side ciphertext expires.
    }

    return {
      current_profile: profileNames.test,
      object: 'agent_setup',
      ok: true,
      platform_name: credentials.platformName,
      profiles: {
        live: {
          api_url: credentials.live.apiBaseUrl,
          platform_id: credentials.live.platformId,
        },
        test: {
          api_url: credentials.test.apiBaseUrl,
          platform_id: credentials.test.platformId,
        },
      },
      wallet_public_key: credentials.walletPublicKey,
      workspace_id: credentials.workspaceId,
    };
  }

  private async Call<T>(
    authUrl: string,
    data: Record<string, unknown>
  ): Promise<T> {
    let response: Response;
    try {
      response = await this.fetchRequest(authUrl, {
        body: JSON.stringify({ data }),
        headers: { 'content-type': 'application/json' },
        method: 'POST',
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Unknown network error';
      throw new ApiError(
        `Unable to reach Zoneless authorization: ${message}`,
        0
      );
    }

    const responseBody = (await response.json()) as Record<string, unknown>;
    if (!response.ok || responseBody['error']) {
      const callableError = responseBody['error'] as
        | Record<string, unknown>
        | undefined;
      throw new ApiError(
        typeof callableError?.['message'] === 'string'
          ? callableError['message']
          : `Zoneless authorization failed with status ${response.status}.`,
        response.status
      );
    }
    return (responseBody['result'] ?? responseBody['data']) as T;
  }

  private async SaveCredentials(
    credentials: ProvisionCredentials,
    walletPublicKey: string,
    profileNames: Record<ProfileMode, string>
  ): Promise<void> {
    const profiles: Record<string, AgentProfile> = {
      [profileNames.live]: ToProfile(
        'live',
        credentials.platformName,
        walletPublicKey,
        credentials.workspaceId,
        credentials.live
      ),
      [profileNames.test]: ToProfile(
        'test',
        credentials.platformName,
        walletPublicKey,
        credentials.workspaceId,
        credentials.test
      ),
    };
    await this.profileStore.SaveProfiles(
      profiles,
      {
        [profileNames.live]: credentials.live.apiKey,
        [profileNames.test]: credentials.test.apiKey,
      },
      profileNames.test,
      credentials.action === 'reconnect'
    );
  }
}

function DecryptCredentials(
  encrypted: EncryptedCredentials,
  privateKey: string
): ProvisionCredentials {
  const contentKey = privateDecrypt(
    {
      key: privateKey,
      oaepHash: 'sha256',
      padding: constants.RSA_PKCS1_OAEP_PADDING,
    },
    Buffer.from(encrypted.encryptedKey, 'base64')
  );
  const decipher = createDecipheriv(
    'aes-256-gcm',
    contentKey,
    Buffer.from(encrypted.iv, 'base64')
  );
  decipher.setAuthTag(Buffer.from(encrypted.authTag, 'base64'));
  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(encrypted.ciphertext, 'base64')),
    decipher.final(),
  ]);
  return JSON.parse(plaintext.toString('utf8')) as ProvisionCredentials;
}

function ToProfile(
  mode: ProfileMode,
  platformName: string,
  walletPublicKey: string,
  workspaceId: string,
  credentials: ModeCredentials
): AgentProfile {
  return {
    apiKeyPrefix: credentials.apiKeyPrefix,
    apiUrl: credentials.apiBaseUrl,
    mode,
    platformId: credentials.platformId,
    platformName,
    walletPublicKey,
    workspaceId,
  };
}

function ValidateCredentials(
  credentials: ProvisionCredentials
): asserts credentials is ProvisionCredentials {
  for (const mode of ['live', 'test'] as const) {
    const value = credentials[mode];
    if (
      !value?.apiBaseUrl ||
      !value.apiKey ||
      !value.apiKeyPrefix ||
      !value.platformId
    ) {
      throw new ApiError(
        `Provisioning returned incomplete ${mode} credentials.`,
        0
      );
    }
  }
  if (
    !['create', 'reconnect'].includes(credentials.action) ||
    !credentials.platformName ||
    typeof credentials.walletPublicKey !== 'string' ||
    !credentials.workspaceId
  ) {
    throw new ApiError('Provisioning returned incomplete workspace data.', 0);
  }
}

function Wait(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function GenerateWallet(): { publicKey: string; secretKey: Buffer } {
  const keyPair = generateKeyPairSync('ed25519');
  const privateKey = keyPair.privateKey.export({ format: 'jwk' });
  if (!privateKey.d || !privateKey.x) {
    throw new CliError(
      'Node.js could not export the generated wallet key.',
      'wallet_generation_failed',
      exitCodes.apiError
    );
  }
  const privateSeed = Buffer.from(privateKey.d, 'base64url');
  const publicKey = Buffer.from(privateKey.x, 'base64url');
  return {
    publicKey: bs58.encode(publicKey),
    secretKey: Buffer.concat([privateSeed, publicKey]),
  };
}

export { DecryptCredentials, GenerateWallet };
