import {
  constants,
  createCipheriv,
  publicEncrypt,
  randomBytes,
} from 'node:crypto';
import bs58 from 'bs58';
import {
  AgentSetupService,
  GenerateWallet,
  type ProfileWriter,
} from './AgentSetup';
import type { SecretStore } from './SecretStore';

function JsonResponse(result: unknown): Response {
  return new Response(JSON.stringify({ result }), {
    headers: { 'content-type': 'application/json' },
    status: 200,
  });
}

function EncryptCredentials(
  value: object,
  publicKey: string
): {
  authTag: string;
  ciphertext: string;
  encryptedKey: string;
  iv: string;
} {
  const contentKey = randomBytes(32);
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', contentKey, iv);
  const ciphertext = Buffer.concat([
    cipher.update(JSON.stringify(value), 'utf8'),
    cipher.final(),
  ]);
  return {
    authTag: cipher.getAuthTag().toString('base64'),
    ciphertext: ciphertext.toString('base64'),
    encryptedKey: publicEncrypt(
      {
        key: publicKey,
        oaepHash: 'sha256',
        padding: constants.RSA_PKCS1_OAEP_PADDING,
      },
      contentKey
    ).toString('base64'),
    iv: iv.toString('base64'),
  };
}

describe('Agent setup', () => {
  it('generates a valid Solana public and secret key pair', () => {
    const wallet = GenerateWallet();

    expect(bs58.decode(wallet.publicKey)).toHaveLength(32);
    expect(wallet.secretKey).toHaveLength(64);
    expect(wallet.secretKey.subarray(32)).toEqual(
      Buffer.from(bs58.decode(wallet.publicKey))
    );
  });

  it('keeps generated secrets out of its result and saves both profiles', async () => {
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
    const saved: Array<{
      apiKeys: Record<string, string>;
      profiles: Record<string, unknown>;
    }> = [];
    const profileWriter: ProfileWriter = {
      SaveProfiles: async (profiles, apiKeys) => {
        saved.push({ apiKeys, profiles });
      },
    };
    let credentialPublicKey = '';
    let walletPublicKey = '';
    const fetchRequest = jest.fn(
      async (_input: RequestInfo | URL, init?: RequestInit) => {
        const request = JSON.parse(String(init?.body)) as {
          data: Record<string, unknown>;
        };
        if (request.data['endpoint'] === 'CreateAgentAuthorization') {
          credentialPublicKey = String(request.data['credentialPublicKey']);
          walletPublicKey = String(request.data['solanaPublicKey']);
          return JsonResponse({
            deviceCode: 'device-secret',
            expiresAt: Date.now() + 60_000,
            intervalSeconds: 1,
            success: true,
            userCode: 'ABCD-EFGH',
            verificationUrl: 'https://zoneless.com/activate?code=ABCD-EFGH',
          });
        }
        if (request.data['endpoint'] === 'PollAgentAuthorization') {
          return JsonResponse({
            credentials: EncryptCredentials(
              {
                action: 'create',
                live: {
                  apiBaseUrl: 'https://api.zonus.com/v1',
                  apiKey: 'zk_live_secret',
                  apiKeyPrefix: 'zk_live',
                  platformId: 'platform-live',
                },
                platformName: 'Agent Store',
                walletPublicKey,
                workspaceId: 'workspace-test',
                test: {
                  apiBaseUrl: 'https://api-test.zonus.com/v1',
                  apiKey: 'zk_test_secret',
                  apiKeyPrefix: 'zk_test',
                  platformId: 'platform-test',
                },
              },
              credentialPublicKey
            ),
            status: 'ready',
            success: true,
          });
        }
        return JsonResponse({ status: 'consumed', success: true });
      }
    );
    const service = new AgentSetupService(
      fetchRequest as typeof fetch,
      secretStore,
      profileWriter,
      async () => undefined
    );

    const result = await service.Setup(
      {
        authUrl: 'https://auth.example/Actions',
        platformName: 'Agent Store',
        pollIntervalMs: 100,
        profilePrefix: 'local',
      },
      () => undefined
    );

    expect(result).toMatchObject({
      current_profile: 'local-test',
      object: 'agent_setup',
      platform_name: 'Agent Store',
      profiles: {
        live: { platform_id: 'platform-live' },
        test: { platform_id: 'platform-test' },
      },
    });
    expect(JSON.stringify(result)).not.toContain('zk_live_secret');
    expect(JSON.stringify(result)).not.toContain('zk_test_secret');
    expect(saved[0].apiKeys).toEqual({
      'local-live': 'zk_live_secret',
      'local-test': 'zk_test_secret',
    });
    expect(
      [...secrets.keys()].some((account) => account.startsWith('wallet:'))
    ).toBe(true);
  });

  it('reconnects without keeping or replacing the existing wallet secret', async () => {
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
    let generatedWallet = '';
    let credentialPublicKey = '';
    let reconnectRequested = false;
    const savedProfiles: Record<string, { walletPublicKey: string }> = {};
    const profileWriter: ProfileWriter = {
      SaveProfiles: async (profiles) => {
        Object.assign(savedProfiles, profiles);
      },
    };
    const fetchRequest = jest.fn(
      async (_input: RequestInfo | URL, init?: RequestInit) => {
        const request = JSON.parse(String(init?.body)) as {
          data: Record<string, unknown>;
        };
        if (request.data['endpoint'] === 'CreateAgentAuthorization') {
          credentialPublicKey = String(request.data['credentialPublicKey']);
          generatedWallet = String(request.data['solanaPublicKey']);
          reconnectRequested = request.data['reconnect'] === true;
          return JsonResponse({
            deviceCode: 'device-secret',
            expiresAt: Date.now() + 60_000,
            intervalSeconds: 1,
            success: true,
            userCode: 'ABCD-EFGH',
            verificationUrl: 'https://zoneless.com/activate?code=ABCD-EFGH',
          });
        }
        if (request.data['endpoint'] === 'PollAgentAuthorization') {
          return JsonResponse({
            credentials: EncryptCredentials(
              {
                action: 'reconnect',
                live: {
                  apiBaseUrl: 'https://api.zonus.com/v1',
                  apiKey: 'zk_live_reconnected',
                  apiKeyPrefix: 'zk_live',
                  platformId: 'platform-live',
                },
                platformName: 'Existing Store',
                test: {
                  apiBaseUrl: 'https://api-test.zonus.com/v1',
                  apiKey: 'zk_test_reconnected',
                  apiKeyPrefix: 'zk_test',
                  platformId: 'platform-test',
                },
                walletPublicKey: 'existing-wallet',
                workspaceId: 'workspace-existing',
              },
              credentialPublicKey
            ),
            status: 'ready',
            success: true,
          });
        }
        return JsonResponse({ status: 'acknowledged', success: true });
      }
    );
    const service = new AgentSetupService(
      fetchRequest as typeof fetch,
      secretStore,
      profileWriter,
      async () => undefined
    );

    const result = await service.Setup(
      {
        authUrl: 'https://auth.example/Actions',
        expectedWorkspaceId: 'workspace-existing',
        platformName: 'Existing Store',
        pollIntervalMs: 100,
        reconnect: true,
      },
      () => undefined
    );

    expect(result.wallet_public_key).toBe('existing-wallet');
    expect(reconnectRequested).toBe(true);
    expect(savedProfiles['live'].walletPublicKey).toBe('existing-wallet');
    expect([...secrets.keys()]).not.toContain(`wallet:${generatedWallet}`);
  });
});
