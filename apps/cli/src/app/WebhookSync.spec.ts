import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { ProfileStore, type AgentProfile } from './ProfileStore';
import { GetWebhookSecretAccount, type SecretStore } from './SecretStore';
import type { WebhookEndpointResponse, WebhookSyncCommand } from './Types';
import { SyncWebhook, type WebhookClient } from './WebhookSync';

class MemorySecretStore implements SecretStore {
  private readonly values = new Map<string, string>();

  async Delete(account: string): Promise<void> {
    this.values.delete(account);
  }

  async Get(account: string): Promise<string | null> {
    return this.values.get(account) ?? null;
  }

  async Set(account: string, value: string): Promise<void> {
    this.values.set(account, value);
  }
}

class FakeWebhookClient implements WebhookClient {
  readonly created: Record<string, unknown>[] = [];
  readonly updated: Array<{ body: Record<string, unknown>; id: string }> = [];

  constructor(readonly endpoints: WebhookEndpointResponse[] = []) {}

  async CreateWebhookEndpoint(
    body: Record<string, unknown>
  ): Promise<WebhookEndpointResponse> {
    this.created.push(body);
    const endpoint: WebhookEndpointResponse = {
      enabled_events: body['enabled_events'] as string[],
      id: 'we_z_created',
      metadata: body['metadata'] as Record<string, string>,
      secret: 'whsec_z_created',
      status: 'enabled',
      url: body['url'] as string,
    };
    this.endpoints.push(endpoint);
    return endpoint;
  }

  async ListWebhookEndpoints() {
    return { data: this.endpoints, has_more: false };
  }

  async UpdateWebhookEndpoint(
    id: string,
    body: Record<string, unknown>
  ): Promise<WebhookEndpointResponse> {
    this.updated.push({ body, id });
    const endpoint = this.endpoints.find((candidate) => candidate.id === id)!;
    Object.assign(endpoint, {
      enabled_events: body['enabled_events'],
      metadata: body['metadata'],
      status: 'enabled',
      url: body['url'],
    });
    return endpoint;
  }
}

interface Fixture {
  command: WebhookSyncCommand;
  profileStore: ProfileStore;
  projectDirectory: string;
  rootDirectory: string;
  secretStore: MemorySecretStore;
}

async function CreateFixture(): Promise<Fixture> {
  const rootDirectory = await fs.mkdtemp(
    path.join(os.tmpdir(), 'zoneless-webhook-sync-')
  );
  const projectDirectory = path.join(rootDirectory, 'project');
  await fs.mkdir(projectDirectory);
  const secretStore = new MemorySecretStore();
  const profileStore = new ProfileStore(
    { XDG_CONFIG_HOME: path.join(rootDirectory, 'config') },
    secretStore
  );
  const profile: AgentProfile = {
    apiKeyPrefix: 'sk_test_z_',
    apiUrl: 'https://api-test.zoneless.com/v1',
    mode: 'test',
    platformId: 'acct_test',
    platformName: 'Test Platform',
    walletPublicKey: 'wallet_test',
    workspaceId: 'workspace_test',
  };
  await profileStore.SaveProfiles(
    { 'test-platform-test': profile },
    { 'test-platform-test': 'sk_test_z_fixture' },
    'test-platform-test'
  );

  return {
    command: {
      events: ['checkout.session.completed', 'invoice.paid'],
      json: true,
      name: 'webhook-sync',
      preset: null,
      profile: 'test-platform-test',
      target: '.env',
      url: 'https://example.ngrok.app/api/webhooks/zoneless',
    },
    profileStore,
    projectDirectory,
    rootDirectory,
    secretStore,
  };
}

describe('Webhook sync', () => {
  it('creates an endpoint and privately syncs its one-time secret', async () => {
    const fixture = await CreateFixture();
    try {
      const client = new FakeWebhookClient();
      const result = await SyncWebhook(client, {
        ...fixture,
        profileName: 'test-platform-test',
        workspaceId: 'workspace_test',
      });

      expect(result).toMatchObject({
        created: true,
        endpoint_id: 'we_z_created',
        mode: 'test',
        restart_required: true,
      });
      expect(JSON.stringify(result)).not.toContain('whsec_z_created');
      expect(
        await fixture.secretStore.Get(
          GetWebhookSecretAccount('test-platform-test', 'we_z_created')
        )
      ).toBe('whsec_z_created');
      const environment = await fs.readFile(
        path.join(fixture.projectDirectory, '.env'),
        'utf8'
      );
      expect(environment).toContain('ZONELESS_WEBHOOK_SECRET=whsec_z_created');
      expect(environment).toContain(
        'ZONELESS_API_URL=https://api-test.zoneless.com'
      );
    } finally {
      await fs.rm(fixture.rootDirectory, { force: true, recursive: true });
    }
  });

  it('updates the managed endpoint and reuses its stored secret', async () => {
    const fixture = await CreateFixture();
    try {
      const endpoint: WebhookEndpointResponse = {
        enabled_events: ['checkout.session.completed'],
        id: 'we_z_existing',
        metadata: {
          zoneless_cli_managed: 'webhook_sync',
          zoneless_workspace_id: 'workspace_test',
        },
        status: 'enabled',
        url: 'https://old.example/webhook',
      };
      const client = new FakeWebhookClient([endpoint]);
      await fixture.secretStore.Set(
        GetWebhookSecretAccount('test-platform-test', endpoint.id),
        'whsec_z_existing'
      );

      const result = await SyncWebhook(client, {
        ...fixture,
        profileName: 'test-platform-test',
        workspaceId: 'workspace_test',
      });

      expect(result.created).toBe(false);
      expect(client.created).toHaveLength(0);
      expect(client.updated).toHaveLength(1);
      expect(result.url).toBe(fixture.command.url);
      const environment = await fs.readFile(
        path.join(fixture.projectDirectory, '.env'),
        'utf8'
      );
      expect(environment).toContain('ZONELESS_WEBHOOK_SECRET=whsec_z_existing');
    } finally {
      await fs.rm(fixture.rootDirectory, { force: true, recursive: true });
    }
  });

  it('does not duplicate a dashboard endpoint with the same URL', async () => {
    const fixture = await CreateFixture();
    try {
      const client = new FakeWebhookClient([
        {
          enabled_events: ['checkout.session.completed'],
          id: 'we_z_dashboard',
          metadata: {},
          status: 'enabled',
          url: fixture.command.url,
        },
      ]);

      await expect(
        SyncWebhook(client, {
          ...fixture,
          profileName: 'test-platform-test',
          workspaceId: 'workspace_test',
        })
      ).rejects.toThrow(/not managed by the CLI/);
      expect(client.created).toHaveLength(0);
    } finally {
      await fs.rm(fixture.rootDirectory, { force: true, recursive: true });
    }
  });
});
