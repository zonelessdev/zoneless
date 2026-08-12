import { createHash } from 'node:crypto';
import { SyncEnvironment } from './EnvSync';
import { ApiError, InvalidInput } from './Errors';
import type { ProfileStore } from './ProfileStore';
import { GetWebhookSecretAccount, type SecretStore } from './SecretStore';
import type {
  WebhookEndpointListResponse,
  WebhookEndpointResponse,
  WebhookSyncCommand,
} from './Types';

const managedMetadataKey = 'zoneless_cli_managed';
const managedMetadataValue = 'webhook_sync';
const workspaceMetadataKey = 'zoneless_workspace_id';

export interface WebhookClient {
  CreateWebhookEndpoint(
    body: Record<string, unknown>,
    idempotencyKey: string
  ): Promise<WebhookEndpointResponse>;
  ListWebhookEndpoints(): Promise<WebhookEndpointListResponse>;
  UpdateWebhookEndpoint(
    id: string,
    body: Record<string, unknown>
  ): Promise<WebhookEndpointResponse>;
}

export interface WebhookSyncOptions {
  command: WebhookSyncCommand;
  profileName: string;
  profileStore: ProfileStore;
  projectDirectory: string;
  secretStore: SecretStore;
  workspaceId: string;
}

export interface WebhookSyncResult {
  created: boolean;
  dashboard_url: string;
  enabled_events: string[];
  endpoint_id: string;
  mode: 'live' | 'test';
  object: 'webhook_sync';
  ok: true;
  profile: string;
  restart_required: true;
  target: string;
  url: string;
  written: string[];
}

export async function SyncWebhook(
  client: WebhookClient,
  options: WebhookSyncOptions
): Promise<WebhookSyncResult> {
  const { command, profileName, workspaceId } = options;
  const endpoints = await client.ListWebhookEndpoints();
  const managedEndpoints = endpoints.data.filter((endpoint) =>
    IsManagedEndpoint(endpoint, workspaceId)
  );
  if (managedEndpoints.length > 1) {
    throw InvalidInput(
      'Multiple CLI-managed webhook endpoints were found for this project. Remove the duplicates in the Zoneless dashboard, then retry.'
    );
  }

  let endpoint = managedEndpoints[0];
  let created = false;
  let webhookSecret: string | null = null;

  if (endpoint) {
    webhookSecret = await options.secretStore.Get(
      GetWebhookSecretAccount(profileName, endpoint.id)
    );
    if (!webhookSecret) {
      throw InvalidInput(
        `The signing secret for webhook endpoint "${endpoint.id}" is not available locally. Delete that CLI-managed endpoint in the Zoneless dashboard and rerun webhook sync, or configure ZONELESS_WEBHOOK_SECRET manually.`
      );
    }

    if (
      endpoint.url !== command.url ||
      !SameEvents(endpoint.enabled_events, command.events) ||
      endpoint.status !== 'enabled'
    ) {
      endpoint = await client.UpdateWebhookEndpoint(endpoint.id, {
        disabled: false,
        enabled_events: command.events,
        metadata: {
          ...(endpoint.metadata ?? {}),
          ...ManagedMetadata(workspaceId),
        },
        url: command.url,
      });
    }
  } else {
    const existingAtUrl = endpoints.data.find(
      (candidate) => candidate.url === command.url
    );
    if (existingAtUrl) {
      throw InvalidInput(
        `Webhook endpoint "${existingAtUrl.id}" already uses this URL, but its one-time signing secret is not managed by the CLI. Use its secret manually or delete it in the Zoneless dashboard before running webhook sync.`
      );
    }

    const body = {
      description: 'Managed by Zoneless CLI for subscription billing',
      enabled_events: command.events,
      metadata: ManagedMetadata(workspaceId),
      url: command.url,
    };
    endpoint = await client.CreateWebhookEndpoint(
      body,
      CreateIdempotencyKey(workspaceId, command.url, command.events)
    );
    webhookSecret = endpoint.secret ?? null;
    if (!webhookSecret) {
      throw new ApiError(
        'Zoneless created the webhook endpoint without returning its signing secret.',
        0
      );
    }
    await options.secretStore.Set(
      GetWebhookSecretAccount(profileName, endpoint.id),
      webhookSecret
    );
    created = true;
  }

  const environment = await SyncEnvironment(
    {
      includeWallet: false,
      profileName,
      projectDirectory: options.projectDirectory,
      target: command.target,
      webhookSecret,
    },
    options.profileStore,
    options.secretStore
  );

  return {
    created,
    dashboard_url:
      environment.mode === 'live'
        ? 'https://dashboard.zoneless.com/account/developers'
        : 'https://dashboard-test.zoneless.com/account/developers',
    enabled_events: command.events,
    endpoint_id: endpoint.id,
    mode: environment.mode,
    object: 'webhook_sync',
    ok: true,
    profile: profileName,
    restart_required: true,
    target: environment.target,
    url: endpoint.url,
    written: environment.written,
  };
}

function IsManagedEndpoint(
  endpoint: WebhookEndpointResponse,
  workspaceId: string
): boolean {
  return (
    endpoint.metadata?.[managedMetadataKey] === managedMetadataValue &&
    endpoint.metadata?.[workspaceMetadataKey] === workspaceId
  );
}

function ManagedMetadata(workspaceId: string): Record<string, string> {
  return {
    [managedMetadataKey]: managedMetadataValue,
    [workspaceMetadataKey]: workspaceId,
  };
}

function SameEvents(left: string[], right: string[]): boolean {
  return [...left].sort().join('\n') === [...right].sort().join('\n');
}

function CreateIdempotencyKey(
  workspaceId: string,
  url: string,
  events: string[]
): string {
  const digest = createHash('sha256')
    .update(JSON.stringify({ events: [...events].sort(), url, workspaceId }))
    .digest('hex')
    .slice(0, 32);
  return `webhook-sync:${digest}`;
}
