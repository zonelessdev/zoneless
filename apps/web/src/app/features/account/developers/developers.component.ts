import {
  ChangeDetectionStrategy,
  Component,
  ViewChild,
  WritableSignal,
  inject,
  signal,
} from '@angular/core';

import {
  SlidePanelComponent,
  LoaderComponent,
  SettingsCardComponent,
  SettingsCardAction,
} from '../../../shared';
import {
  ApiKeyFormComponent,
  WebhookEndpointFormComponent,
} from './components/index';
import { ApiKey, WebhookEndpoint } from '@zoneless/shared-types';
import { ApiKeyService, WebhookEndpointService } from '../../../data';

@Component({
  selector: 'app-developers',
  imports: [
    SlidePanelComponent,
    SettingsCardComponent,
    ApiKeyFormComponent,
    WebhookEndpointFormComponent,
    LoaderComponent,
  ],
  templateUrl: './developers.component.html',
  styleUrl: './developers.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DevelopersComponent {
  readonly webhookEndpointService = inject(WebhookEndpointService);
  readonly apiKeyService = inject(ApiKeyService);

  @ViewChild('webhookEndpointForm')
  webhookEndpointForm!: WebhookEndpointFormComponent;
  @ViewChild('apiKeyForm') apiKeyForm!: ApiKeyFormComponent;

  // Webhook endpoint panel state
  webhookPanelOpen: WritableSignal<boolean> = signal(false);
  webhookPanelMode: WritableSignal<'create' | 'edit'> = signal('create');
  webhookPanelLoading: WritableSignal<boolean> = signal(false);
  webhookPanelShowErrors: WritableSignal<boolean> = signal(false);
  selectedWebhookEndpoint: WritableSignal<WebhookEndpoint | null> =
    signal(null);
  newlyCreatedSecret: WritableSignal<string | null> = signal(null);

  // API key panel state
  apiKeyPanelOpen: WritableSignal<boolean> = signal(false);
  apiKeyPanelMode: WritableSignal<'create' | 'edit'> = signal('create');
  apiKeyPanelLoading: WritableSignal<boolean> = signal(false);
  apiKeyPanelShowErrors: WritableSignal<boolean> = signal(false);
  selectedApiKey: WritableSignal<ApiKey | null> = signal(null);
  newlyCreatedToken: WritableSignal<string | null> = signal(null);

  // Card action definitions
  readonly apiKeyActions: SettingsCardAction[] = [
    { id: 'roll', icon: 'refresh.svg', label: 'Roll key (generate new token)' },
    {
      id: 'delete',
      icon: 'delete.svg',
      label: 'Delete API key',
      variant: 'danger',
    },
  ];

  readonly webhookActions: SettingsCardAction[] = [
    {
      id: 'delete',
      icon: 'delete.svg',
      label: 'Delete webhook',
      variant: 'danger',
    },
  ];

  OnCreateWebhookClick(): void {
    this.webhookPanelMode.set('create');
    this.selectedWebhookEndpoint.set(null);
    this.webhookPanelShowErrors.set(false);
    this.newlyCreatedSecret.set(null);
    this.webhookPanelOpen.set(true);
  }

  OnEditWebhookClick(endpoint: WebhookEndpoint): void {
    this.webhookPanelMode.set('edit');
    this.selectedWebhookEndpoint.set(endpoint);
    this.webhookPanelShowErrors.set(false);
    this.newlyCreatedSecret.set(null);
    this.webhookPanelOpen.set(true);
  }

  OnWebhookPanelClosed(): void {
    this.webhookPanelOpen.set(false);
    this.webhookPanelShowErrors.set(false);
    this.newlyCreatedSecret.set(null);
  }

  async OnWebhookSubmit(): Promise<void> {
    if (!this.webhookEndpointForm) return;

    this.webhookPanelShowErrors.set(true);

    if (!this.webhookEndpointForm.ValidateAll()) {
      return;
    }

    this.webhookPanelLoading.set(true);

    try {
      const formData = this.webhookEndpointForm.GetFormData();

      if (this.webhookPanelMode() === 'create') {
        const endpoint =
          await this.webhookEndpointService.CreateWebhookEndpoint({
            url: formData.url,
            enabled_events: formData.enabled_events,
            description: formData.description || undefined,
          });

        // Show the secret to the user (only shown once)
        if (endpoint.secret) {
          this.newlyCreatedSecret.set(endpoint.secret);
        }

        this.webhookPanelShowErrors.set(false);
      } else {
        const endpoint = this.selectedWebhookEndpoint();
        if (!endpoint) return;

        await this.webhookEndpointService.UpdateWebhookEndpoint(endpoint.id, {
          url: formData.url,
          enabled_events: formData.enabled_events,
          description: formData.description || null,
          disabled: formData.disabled,
        });

        this.webhookPanelOpen.set(false);
        this.webhookPanelShowErrors.set(false);
      }
    } catch (error) {
      console.error('Failed to save webhook endpoint:', error);
    } finally {
      this.webhookPanelLoading.set(false);
    }
  }

  async OnDeleteWebhookClick(endpoint: WebhookEndpoint): Promise<void> {
    if (
      !confirm(
        `Are you sure you want to delete this webhook endpoint?\n\n${endpoint.url}`
      )
    ) {
      return;
    }

    try {
      await this.webhookEndpointService.DeleteWebhookEndpoint(endpoint.id);
    } catch (error) {
      console.error('Failed to delete webhook endpoint:', error);
    }
  }

  GetWebhookPanelTitle(): string {
    if (this.newlyCreatedSecret()) {
      return 'Webhook created';
    }
    return this.webhookPanelMode() === 'create'
      ? 'Create webhook endpoint'
      : 'Edit webhook endpoint';
  }

  OnWebhookFormDone(): void {
    this.webhookPanelOpen.set(false);
    this.newlyCreatedSecret.set(null);
  }

  // API Key Methods
  OnCreateApiKeyClick(): void {
    this.apiKeyPanelMode.set('create');
    this.selectedApiKey.set(null);
    this.apiKeyPanelShowErrors.set(false);
    this.newlyCreatedToken.set(null);
    this.apiKeyPanelOpen.set(true);
  }

  OnEditApiKeyClick(apiKey: ApiKey): void {
    this.apiKeyPanelMode.set('edit');
    this.selectedApiKey.set(apiKey);
    this.apiKeyPanelShowErrors.set(false);
    this.newlyCreatedToken.set(null);
    this.apiKeyPanelOpen.set(true);
  }

  OnApiKeyPanelClosed(): void {
    this.apiKeyPanelOpen.set(false);
    this.apiKeyPanelShowErrors.set(false);
    this.newlyCreatedToken.set(null);
  }

  async OnApiKeySubmit(): Promise<void> {
    if (!this.apiKeyForm) return;

    this.apiKeyPanelShowErrors.set(true);

    if (!this.apiKeyForm.ValidateAll()) {
      return;
    }

    this.apiKeyPanelLoading.set(true);

    try {
      const formData = this.apiKeyForm.GetFormData();

      if (this.apiKeyPanelMode() === 'create') {
        const result = await this.apiKeyService.CreateApiKey({
          name: formData.name,
        });

        // Show the token to the user (only shown once)
        if (result.plaintext_token) {
          this.newlyCreatedToken.set(result.plaintext_token);
        }

        this.apiKeyPanelShowErrors.set(false);
      } else {
        const apiKey = this.selectedApiKey();
        if (!apiKey) return;

        await this.apiKeyService.UpdateApiKey(apiKey.id, {
          name: formData.name,
          status: formData.status,
        });

        this.apiKeyPanelOpen.set(false);
        this.apiKeyPanelShowErrors.set(false);
      }
    } catch (error) {
      console.error('Failed to save API key:', error);
    } finally {
      this.apiKeyPanelLoading.set(false);
    }
  }

  async OnDeleteApiKeyClick(apiKey: ApiKey): Promise<void> {
    if (
      !confirm(
        `Are you sure you want to delete this API key?\n\n${apiKey.name}\n\nThis action cannot be undone.`
      )
    ) {
      return;
    }

    try {
      await this.apiKeyService.DeleteApiKey(apiKey.id);
    } catch (error) {
      console.error('Failed to delete API key:', error);
      alert(
        'Cannot delete the last active API key. Create a new key first or deactivate this one instead.'
      );
    }
  }

  async OnRollApiKeyClick(apiKey: ApiKey): Promise<void> {
    if (
      !confirm(
        `Are you sure you want to roll this API key?\n\n${apiKey.name}\n\nThis will generate a new token and invalidate the current one immediately.`
      )
    ) {
      return;
    }

    try {
      const result = await this.apiKeyService.RollApiKey(apiKey.id);

      // Show the new token
      this.selectedApiKey.set(null);
      this.apiKeyPanelMode.set('create');
      this.newlyCreatedToken.set(result.plaintext_token);
      this.apiKeyPanelOpen.set(true);
    } catch (error) {
      console.error('Failed to roll API key:', error);
    }
  }

  GetApiKeyPanelTitle(): string {
    if (this.newlyCreatedToken()) {
      return 'API key created';
    }
    return this.apiKeyPanelMode() === 'create'
      ? 'Create API key'
      : 'Edit API key';
  }

  OnApiKeyFormDone(): void {
    this.apiKeyPanelOpen.set(false);
    this.newlyCreatedToken.set(null);
  }

  // Card Action Handlers
  OnApiKeyAction(actionId: string, apiKey: ApiKey): void {
    switch (actionId) {
      case 'roll':
        this.OnRollApiKeyClick(apiKey);
        break;
      case 'delete':
        this.OnDeleteApiKeyClick(apiKey);
        break;
    }
  }

  OnWebhookAction(actionId: string, endpoint: WebhookEndpoint): void {
    switch (actionId) {
      case 'delete':
        this.OnDeleteWebhookClick(endpoint);
        break;
    }
  }
}
