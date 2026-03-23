import { Injectable, inject, signal, WritableSignal } from '@angular/core';
import { ApiService } from '../../core';
import { WebhookEndpoint, EVENT_TYPES } from '@zoneless/shared-types';
import { SettingsCardRow } from '../../shared';

/**
 * Input type for creating a webhook endpoint.
 */
export interface WebhookEndpointCreateInput {
  url: string;
  enabled_events: string[];
  description?: string;
  api_version?: string;
  metadata?: Record<string, string>;
}

/**
 * Input type for updating a webhook endpoint.
 */
export interface WebhookEndpointUpdateInput {
  url?: string;
  enabled_events?: string[];
  description?: string | null;
  disabled?: boolean;
  metadata?: Record<string, string>;
}

/**
 * Human-readable labels for event types.
 */
const EVENT_TYPE_LABELS: Record<(typeof EVENT_TYPES)[number], string> = {
  '*': 'All events',
  'account.created': 'Account created',
  'account.updated': 'Account updated',
  'api_key.created': 'API key created',
  'api_key.updated': 'API key updated',
  'api_key.deleted': 'API key deleted',
  'balance.available': 'Balance available',
  'balance_transaction.created': 'Balance transaction created',
  'external_account.created': 'External account created',
  'external_account.updated': 'External account updated',
  'external_account.deleted': 'External account deleted',
  'payout.created': 'Payout created',
  'payout.updated': 'Payout updated',
  'payout.paid': 'Payout paid',
  'payout.failed': 'Payout failed',
  'payout.canceled': 'Payout canceled',
  'person.created': 'Person created',
  'person.updated': 'Person updated',
  'person.deleted': 'Person deleted',
  'topup.created': 'Top-up created',
  'topup.canceled': 'Top-up canceled',
  'topup.failed': 'Top-up failed',
  'topup.reversed': 'Top-up reversed',
  'topup.succeeded': 'Top-up succeeded',
  'transfer.created': 'Transfer created',
  'transfer.updated': 'Transfer updated',
  'transfer.reversed': 'Transfer reversed',
};

/**
 * List of valid event types with labels for UI display.
 * Derived from the shared EVENT_TYPES constant.
 */
export const VALID_EVENT_TYPES = EVENT_TYPES.map((type) => ({
  value: type,
  label: EVENT_TYPE_LABELS[type],
}));

@Injectable({
  providedIn: 'root',
})
export class WebhookEndpointService {
  private readonly api = inject(ApiService);

  loading: WritableSignal<boolean> = signal(false);
  webhookEndpoints: WritableSignal<WebhookEndpoint[]> = signal([]);
  selectedEndpoint: WritableSignal<WebhookEndpoint | null> = signal(null);

  Reset(): void {
    this.webhookEndpoints.set([]);
    this.selectedEndpoint.set(null);
  }

  /**
   * Create a new webhook endpoint.
   */
  async CreateWebhookEndpoint(
    data: WebhookEndpointCreateInput
  ): Promise<WebhookEndpoint> {
    this.loading.set(true);
    try {
      const endpoint = await this.api.Call<WebhookEndpoint>(
        'POST',
        'webhook_endpoints',
        data
      );
      // Add to list (with secret for display)
      this.webhookEndpoints.update((endpoints) => [endpoint, ...endpoints]);
      return endpoint;
    } finally {
      this.loading.set(false);
    }
  }

  /**
   * List all webhook endpoints.
   */
  async ListWebhookEndpoints(): Promise<WebhookEndpoint[]> {
    this.loading.set(true);
    try {
      const response = await this.api.Call<{ data: WebhookEndpoint[] }>(
        'GET',
        'webhook_endpoints'
      );
      this.webhookEndpoints.set(response.data || []);
      return this.webhookEndpoints();
    } finally {
      this.loading.set(false);
    }
  }

  /**
   * Get a single webhook endpoint.
   */
  async GetWebhookEndpoint(id: string): Promise<WebhookEndpoint | null> {
    this.loading.set(true);
    try {
      const endpoint = await this.api.Call<WebhookEndpoint>(
        'GET',
        `webhook_endpoints/${id}`
      );
      this.selectedEndpoint.set(endpoint);
      return endpoint;
    } catch {
      this.selectedEndpoint.set(null);
      return null;
    } finally {
      this.loading.set(false);
    }
  }

  /**
   * Update a webhook endpoint.
   */
  async UpdateWebhookEndpoint(
    id: string,
    data: WebhookEndpointUpdateInput
  ): Promise<WebhookEndpoint> {
    this.loading.set(true);
    try {
      const endpoint = await this.api.Call<WebhookEndpoint>(
        'POST',
        `webhook_endpoints/${id}`,
        data
      );
      // Update in the list
      this.webhookEndpoints.update((endpoints) =>
        endpoints.map((e) => (e.id === id ? endpoint : e))
      );
      this.selectedEndpoint.set(endpoint);
      return endpoint;
    } finally {
      this.loading.set(false);
    }
  }

  /**
   * Delete a webhook endpoint.
   */
  async DeleteWebhookEndpoint(id: string): Promise<void> {
    this.loading.set(true);
    try {
      await this.api.Call<{ id: string; deleted: boolean }>(
        'DELETE',
        `webhook_endpoints/${id}`
      );
      // Remove from list
      this.webhookEndpoints.update((endpoints) =>
        endpoints.filter((e) => e.id !== id)
      );
      if (this.selectedEndpoint()?.id === id) {
        this.selectedEndpoint.set(null);
      }
    } finally {
      this.loading.set(false);
    }
  }

  GetEndpointTitle(endpoint: WebhookEndpoint | null): string {
    if (!endpoint?.url) return '';
    try {
      const url = new URL(endpoint.url);
      return url.hostname + url.pathname;
    } catch {
      return endpoint.url;
    }
  }

  GetStatusDisplay(endpoint: WebhookEndpoint | null): string {
    return endpoint?.status === 'enabled' ? 'Enabled' : 'Disabled';
  }

  GetEventsDisplay(endpoint: WebhookEndpoint | null): string {
    if (!endpoint?.enabled_events?.length) return 'None';
    if (endpoint.enabled_events.includes('*')) return 'All events';
    if (endpoint.enabled_events.length <= 2) {
      return endpoint.enabled_events.join(', ');
    }
    return `${endpoint.enabled_events.length} events`;
  }

  GetSettingsCardRows(endpoint: WebhookEndpoint | null): SettingsCardRow[] {
    if (!endpoint) return [];

    return [
      {
        label: 'URL',
        value: endpoint.url,
        type: 'text',
      },
      {
        label: 'Status',
        value: this.GetStatusDisplay(endpoint),
        type: 'text',
      },
      {
        label: 'Events',
        value: this.GetEventsDisplay(endpoint),
        type: 'text',
      },
      ...(endpoint.description
        ? [
            {
              label: 'Description',
              value: endpoint.description,
              type: 'text' as const,
            },
          ]
        : []),
    ];
  }
}
