import { Injectable, inject, signal, WritableSignal } from '@angular/core';
import { ApiService } from '../../core';
import { ApiKey } from '@zoneless/shared-types';
import { SettingsCardRow } from '../../shared';

/**
 * Input type for creating an API key.
 */
export interface ApiKeyCreateInput {
  name: string;
  metadata?: Record<string, string>;
}

/**
 * Input type for updating an API key.
 */
export interface ApiKeyUpdateInput {
  name?: string;
  status?: 'active' | 'inactive';
  metadata?: Record<string, string>;
}

/**
 * Response when creating or rolling an API key.
 * Includes the plaintext token which is only shown once.
 */
export interface ApiKeyCreateResponse extends ApiKey {
  plaintext_token: string;
  rolled_from?: string;
}

@Injectable({
  providedIn: 'root',
})
export class ApiKeyService {
  private readonly api = inject(ApiService);

  loading: WritableSignal<boolean> = signal(false);
  apiKeys: WritableSignal<ApiKey[]> = signal([]);
  selectedApiKey: WritableSignal<ApiKey | null> = signal(null);

  Reset(): void {
    this.apiKeys.set([]);
    this.selectedApiKey.set(null);
  }

  /**
   * Create a new API key.
   */
  async CreateApiKey(data: ApiKeyCreateInput): Promise<ApiKeyCreateResponse> {
    this.loading.set(true);
    try {
      const apiKey = await this.api.Call<ApiKeyCreateResponse>(
        'POST',
        'api_keys',
        data
      );
      // Add to list (without plaintext token)
      const { plaintext_token: _plaintext_token, ...apiKeyWithoutToken } =
        apiKey;
      this.apiKeys.update((keys) => [apiKeyWithoutToken, ...keys]);
      return apiKey;
    } finally {
      this.loading.set(false);
    }
  }

  /**
   * List all API keys.
   */
  async ListApiKeys(): Promise<ApiKey[]> {
    this.loading.set(true);
    try {
      const response = await this.api.Call<{ data: ApiKey[] }>(
        'GET',
        'api_keys'
      );
      this.apiKeys.set(response.data || []);
      return this.apiKeys();
    } finally {
      this.loading.set(false);
    }
  }

  /**
   * Get a single API key.
   */
  async GetApiKey(id: string): Promise<ApiKey | null> {
    this.loading.set(true);
    try {
      const apiKey = await this.api.Call<ApiKey>('GET', `api_keys/${id}`);
      this.selectedApiKey.set(apiKey);
      return apiKey;
    } catch {
      this.selectedApiKey.set(null);
      return null;
    } finally {
      this.loading.set(false);
    }
  }

  /**
   * Update an API key.
   */
  async UpdateApiKey(id: string, data: ApiKeyUpdateInput): Promise<ApiKey> {
    this.loading.set(true);
    try {
      const apiKey = await this.api.Call<ApiKey>(
        'POST',
        `api_keys/${id}`,
        data
      );
      // Update in the list
      this.apiKeys.update((keys) =>
        keys.map((k) => (k.id === id ? apiKey : k))
      );
      this.selectedApiKey.set(apiKey);
      return apiKey;
    } finally {
      this.loading.set(false);
    }
  }

  /**
   * Delete an API key.
   */
  async DeleteApiKey(id: string): Promise<void> {
    this.loading.set(true);
    try {
      await this.api.Call<{ id: string; deleted: boolean }>(
        'DELETE',
        `api_keys/${id}`
      );
      // Remove from list
      this.apiKeys.update((keys) => keys.filter((k) => k.id !== id));
      if (this.selectedApiKey()?.id === id) {
        this.selectedApiKey.set(null);
      }
    } finally {
      this.loading.set(false);
    }
  }

  /**
   * Roll an API key (generate new token, invalidate old).
   */
  async RollApiKey(id: string): Promise<ApiKeyCreateResponse> {
    this.loading.set(true);
    try {
      const result = await this.api.Call<ApiKeyCreateResponse>(
        'POST',
        `api_keys/${id}/roll`
      );
      // Update the list: remove old key, add new one
      const {
        plaintext_token: _plaintext_token,
        rolled_from: _rolled_from,
        ...apiKeyWithoutToken
      } = result;
      this.apiKeys.update((keys) => {
        const filtered = keys.filter((k) => k.id !== id);
        return [apiKeyWithoutToken, ...filtered];
      });
      return result;
    } finally {
      this.loading.set(false);
    }
  }

  GetKeyTitle(apiKey: ApiKey | null): string {
    return apiKey?.name || 'Unnamed Key';
  }

  GetStatusDisplay(apiKey: ApiKey | null): string {
    if (!apiKey) return '';
    switch (apiKey.status) {
      case 'active':
        return 'Active';
      case 'inactive':
        return 'Inactive';
      case 'revoked':
        return 'Revoked';
      default:
        return apiKey.status;
    }
  }

  GetLastUsedDisplay(apiKey: ApiKey | null): string {
    if (!apiKey?.last_used) return 'Never used';
    const date = new Date(apiKey.last_used * 1000);
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  GetCreatedDisplay(apiKey: ApiKey | null): string {
    if (!apiKey?.created) return '';
    const date = new Date(apiKey.created * 1000);
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  }

  GetSettingsCardRows(apiKey: ApiKey | null): SettingsCardRow[] {
    if (!apiKey) return [];

    return [
      {
        label: 'Token',
        value: apiKey.token_prefix,
        type: 'text',
      },
      {
        label: 'Status',
        value: this.GetStatusDisplay(apiKey),
        type: 'text',
      },
      {
        label: 'Created',
        value: this.GetCreatedDisplay(apiKey),
        type: 'text',
      },
      {
        label: 'Last used',
        value: this.GetLastUsedDisplay(apiKey),
        type: 'text',
      },
    ];
  }
}
