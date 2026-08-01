import {
  Component,
  Input,
  Output,
  EventEmitter,
  OnInit,
  OnChanges,
  SimpleChanges,
  signal,
  WritableSignal,
  ChangeDetectionStrategy,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Account } from '@zoneless/shared-types';
import { UpdateAccountInput } from '@zoneless/shared-schemas';

export interface IdentitySettingsFormData {
  apiKey: string;
  workflowId: string;
  webhookSecret: string;
  /** Dollars string for the payout volume threshold (converted to cents on save) */
  payoutVolumeThreshold: string;
}

@Component({
  selector: 'app-identity-settings-form',
  standalone: true,
  imports: [FormsModule],
  templateUrl: './identity-settings-form.component.html',
  styleUrls: ['./identity-settings-form.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class IdentitySettingsFormComponent implements OnInit, OnChanges {
  @Input() account: Account | null = null;
  @Input() showErrors = false;
  @Input() isOpen = false;

  @Output() formChange = new EventEmitter<IdentitySettingsFormData>();
  @Output() validationChange = new EventEmitter<boolean>();

  apiKey: WritableSignal<string> = signal('');
  apiKeyError: WritableSignal<string> = signal('');
  apiKeyConfigured: WritableSignal<boolean> = signal(false);

  workflowId: WritableSignal<string> = signal('');
  workflowIdError: WritableSignal<string> = signal('');

  webhookSecret: WritableSignal<string> = signal('');
  webhookSecretError: WritableSignal<string> = signal('');
  webhookSecretConfigured: WritableSignal<boolean> = signal(false);

  payoutVolumeThreshold: WritableSignal<string> = signal('');
  payoutVolumeThresholdError: WritableSignal<string> = signal('');

  ngOnInit(): void {
    this.InitializeForm();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['isOpen'] && this.isOpen) {
      this.InitializeForm();
    }
    if (changes['account']) {
      this.InitializeForm();
    }
  }

  InitializeForm(): void {
    const identity = this.account?.settings?.identity;
    const didit = identity?.didit;
    const rules = identity?.rules;

    this.apiKey.set('');
    this.webhookSecret.set('');
    this.apiKeyConfigured.set(!!didit?.api_key_set);
    this.webhookSecretConfigured.set(!!didit?.webhook_secret_set);
    this.workflowId.set(didit?.workflow_id?.trim() || '');

    const cents = rules?.payout_volume_threshold_cents;
    this.payoutVolumeThreshold.set(
      cents != null && cents >= 0 ? String(cents / 100) : ''
    );

    this.apiKeyError.set('');
    this.workflowIdError.set('');
    this.webhookSecretError.set('');
    this.payoutVolumeThresholdError.set('');

    this.EmitFormChange();
  }

  OnApiKeyChange(value: string): void {
    this.apiKey.set(value);
    this.ValidateApiKey();
    this.EmitFormChange();
  }

  OnWorkflowIdChange(value: string): void {
    this.workflowId.set(value);
    this.ValidateWorkflowId();
    this.EmitFormChange();
  }

  OnWebhookSecretChange(value: string): void {
    this.webhookSecret.set(value);
    this.ValidateWebhookSecret();
    this.EmitFormChange();
  }

  OnPayoutVolumeThresholdChange(value: string): void {
    this.payoutVolumeThreshold.set(value);
    this.ValidatePayoutVolumeThreshold();
    this.EmitFormChange();
  }

  ValidateAll(): boolean {
    this.ValidateApiKey();
    this.ValidateWorkflowId();
    this.ValidateWebhookSecret();
    this.ValidatePayoutVolumeThreshold();
    const valid = this.IsValid();
    this.validationChange.emit(valid);
    return valid;
  }

  IsValid(): boolean {
    return (
      !this.apiKeyError() &&
      !this.workflowIdError() &&
      !this.webhookSecretError() &&
      !this.payoutVolumeThresholdError()
    );
  }

  GetFormData(): IdentitySettingsFormData {
    return {
      apiKey: this.apiKey(),
      workflowId: this.workflowId(),
      webhookSecret: this.webhookSecret(),
      payoutVolumeThreshold: this.payoutVolumeThreshold(),
    };
  }

  /**
   * Account update payload. Blank secret fields are omitted so existing
   * write-only credentials are preserved.
   */
  GetUpdateData(): UpdateAccountInput {
    const didit: {
      api_key?: string;
      workflow_id: string | null;
      webhook_secret?: string;
    } = {
      workflow_id: this.workflowId().trim() || null,
    };

    const apiKey = this.apiKey().trim();
    if (apiKey) {
      didit.api_key = apiKey;
    }

    const webhookSecret = this.webhookSecret().trim();
    if (webhookSecret) {
      didit.webhook_secret = webhookSecret;
    }

    const thresholdDollars = this.payoutVolumeThreshold().trim();
    let payoutVolumeThresholdCents: number | null = null;
    if (thresholdDollars) {
      payoutVolumeThresholdCents = Math.round(
        parseFloat(thresholdDollars) * 100
      );
    }

    return {
      settings: {
        identity: {
          provider: 'didit',
          didit,
          rules: {
            payout_volume_threshold_cents: payoutVolumeThresholdCents,
          },
        },
      },
    };
  }

  private ValidateApiKey(): void {
    const value = this.apiKey().trim();
    if (!value && !this.apiKeyConfigured()) {
      this.apiKeyError.set('API key is required');
      return;
    }
    this.apiKeyError.set('');
  }

  private ValidateWorkflowId(): void {
    if (!this.workflowId().trim()) {
      this.workflowIdError.set('Workflow ID is required');
      return;
    }
    this.workflowIdError.set('');
  }

  private ValidateWebhookSecret(): void {
    // Optional until webhooks are used; no hard require
    this.webhookSecretError.set('');
  }

  private ValidatePayoutVolumeThreshold(): void {
    const raw = this.payoutVolumeThreshold().trim();
    if (!raw) {
      this.payoutVolumeThresholdError.set('');
      return;
    }
    const value = parseFloat(raw);
    if (!Number.isFinite(value) || value < 0) {
      this.payoutVolumeThresholdError.set('Enter a valid amount of $0 or more');
      return;
    }
    this.payoutVolumeThresholdError.set('');
  }

  private EmitFormChange(): void {
    this.formChange.emit(this.GetFormData());
    this.validationChange.emit(this.IsValid());
  }
}
