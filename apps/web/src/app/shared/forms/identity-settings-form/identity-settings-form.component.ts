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
import { CopyTextComponent } from '../../ui';
import { ISO_CODES } from '../../../utils';
import { GetDiditWebhookUrl } from './didit-webhook-url';

export interface IdentitySettingsFormData {
  apiKey: string;
  workflowId: string;
  kybWorkflowId: string;
  webhookSecret: string;
  /** Dollars string for the default payout volume threshold */
  payoutVolumeThreshold: string;
  countryThresholds: IdentityCountryThresholdFormRow[];
}

export interface IdentityCountryThresholdFormRow {
  country: string;
  /** Dollars string (converted to cents on save) */
  threshold: string;
}

@Component({
  selector: 'app-identity-settings-form',
  standalone: true,
  imports: [FormsModule, CopyTextComponent],
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

  readonly ISO_CODES = [...ISO_CODES].sort((a, b) =>
    a.country.localeCompare(b.country)
  );

  readonly diditWebhookUrl = GetDiditWebhookUrl();

  apiKey: WritableSignal<string> = signal('');
  apiKeyError: WritableSignal<string> = signal('');
  apiKeyConfigured: WritableSignal<boolean> = signal(false);

  workflowId: WritableSignal<string> = signal('');
  workflowIdError: WritableSignal<string> = signal('');

  kybWorkflowId: WritableSignal<string> = signal('');

  webhookSecret: WritableSignal<string> = signal('');
  webhookSecretError: WritableSignal<string> = signal('');
  webhookSecretConfigured: WritableSignal<boolean> = signal(false);

  payoutVolumeThreshold: WritableSignal<string> = signal('');
  payoutVolumeThresholdError: WritableSignal<string> = signal('');

  countryThresholds: WritableSignal<IdentityCountryThresholdFormRow[]> = signal(
    []
  );
  countryThresholdsError: WritableSignal<string> = signal('');

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
    const providerSettings = identity?.didit;
    const rules = identity?.rules;

    this.apiKey.set('');
    this.webhookSecret.set('');
    this.apiKeyConfigured.set(!!providerSettings?.api_key_set);
    this.webhookSecretConfigured.set(!!providerSettings?.webhook_secret_set);
    this.workflowId.set(providerSettings?.workflow_id?.trim() || '');
    this.kybWorkflowId.set(providerSettings?.kyb_workflow_id?.trim() || '');

    const cents = rules?.payout_volume_threshold_cents;
    this.payoutVolumeThreshold.set(
      cents != null && cents >= 0 ? String(cents / 100) : ''
    );

    // One UI row per country (API may group countries that share a threshold)
    const rows: IdentityCountryThresholdFormRow[] = [];
    for (const row of rules?.country_thresholds ?? []) {
      const threshold =
        row.payout_volume_threshold_cents != null
          ? String(row.payout_volume_threshold_cents / 100)
          : '';
      for (const code of row.countries ?? []) {
        rows.push({ country: code, threshold });
      }
    }
    this.countryThresholds.set(rows);

    this.apiKeyError.set('');
    this.workflowIdError.set('');
    this.webhookSecretError.set('');
    this.payoutVolumeThresholdError.set('');
    this.countryThresholdsError.set('');

    this.EmitFormChange();
  }

  OnApiKeyChange(value: string): void {
    this.apiKey.set(value);
    this.ValidateApiKey();
    this.ValidateThresholdRequiresProvider();
    this.EmitFormChange();
  }

  OnWorkflowIdChange(value: string): void {
    this.workflowId.set(value);
    this.ValidateWorkflowId();
    this.ValidateThresholdRequiresProvider();
    this.EmitFormChange();
  }

  OnKybWorkflowIdChange(value: string): void {
    this.kybWorkflowId.set(value);
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
    this.ValidateThresholdRequiresProvider();
    this.EmitFormChange();
  }

  AddCountryThresholdRow(): void {
    this.countryThresholds.set([
      ...this.countryThresholds(),
      { country: '', threshold: '' },
    ]);
    this.ValidateCountryThresholds();
    this.ValidateThresholdRequiresProvider();
    this.EmitFormChange();
  }

  RemoveCountryThresholdRow(index: number): void {
    this.countryThresholds.set(
      this.countryThresholds().filter((_, i) => i !== index)
    );
    this.ValidateCountryThresholds();
    this.ValidateThresholdRequiresProvider();
    this.EmitFormChange();
  }

  OnCountryChange(index: number, code: string): void {
    const rows = this.countryThresholds().map((row, i) =>
      i === index ? { ...row, country: code } : row
    );
    this.countryThresholds.set(rows);
    this.ValidateCountryThresholds();
    this.ValidateThresholdRequiresProvider();
    this.EmitFormChange();
  }

  OnCountryThresholdChange(index: number, value: string): void {
    const rows = this.countryThresholds().map((row, i) =>
      i === index ? { ...row, threshold: value } : row
    );
    this.countryThresholds.set(rows);
    this.ValidateCountryThresholds();
    this.ValidateThresholdRequiresProvider();
    this.EmitFormChange();
  }

  AvailableCountriesForRow(index: number): typeof this.ISO_CODES {
    const usedElsewhere = new Set(
      this.countryThresholds()
        .filter((_, i) => i !== index)
        .map((row) => row.country)
        .filter(Boolean)
    );
    return this.ISO_CODES.filter((c) => !usedElsewhere.has(c.code));
  }

  ValidateAll(): boolean {
    this.ValidateApiKey();
    this.ValidateWorkflowId();
    this.ValidateWebhookSecret();
    this.ValidatePayoutVolumeThreshold();
    this.ValidateCountryThresholds();
    this.ValidateThresholdRequiresProvider();
    const valid = this.IsValid();
    this.validationChange.emit(valid);
    return valid;
  }

  IsValid(): boolean {
    return (
      !this.apiKeyError() &&
      !this.workflowIdError() &&
      !this.webhookSecretError() &&
      !this.payoutVolumeThresholdError() &&
      !this.countryThresholdsError()
    );
  }

  GetFormData(): IdentitySettingsFormData {
    return {
      apiKey: this.apiKey(),
      workflowId: this.workflowId(),
      kybWorkflowId: this.kybWorkflowId(),
      webhookSecret: this.webhookSecret(),
      payoutVolumeThreshold: this.payoutVolumeThreshold(),
      countryThresholds: this.countryThresholds(),
    };
  }

  /**
   * Account update payload. Blank secret fields are omitted so existing
   * write-only credentials are preserved.
   */
  GetUpdateData(): UpdateAccountInput {
    const providerCredentials: {
      api_key?: string;
      workflow_id: string | null;
      kyb_workflow_id: string | null;
      webhook_secret?: string;
    } = {
      workflow_id: this.workflowId().trim() || null,
      kyb_workflow_id: this.kybWorkflowId().trim() || null,
    };

    const apiKey = this.apiKey().trim();
    if (apiKey) {
      providerCredentials.api_key = apiKey;
    }

    const webhookSecret = this.webhookSecret().trim();
    if (webhookSecret) {
      providerCredentials.webhook_secret = webhookSecret;
    }

    const thresholdDollars = this.payoutVolumeThreshold().trim();
    let payoutVolumeThresholdCents: number | null = null;
    if (thresholdDollars) {
      payoutVolumeThresholdCents = Math.round(
        parseFloat(thresholdDollars) * 100
      );
    }

    // Group countries that share the same threshold cents
    const byThreshold = new Map<number, string[]>();
    for (const row of this.countryThresholds()) {
      if (!row.country.trim() || !row.threshold.trim()) continue;
      const cents = Math.round(parseFloat(row.threshold) * 100);
      if (!Number.isFinite(cents)) continue;
      const list = byThreshold.get(cents) ?? [];
      list.push(row.country.trim().toUpperCase());
      byThreshold.set(cents, list);
    }
    const countryThresholds = [...byThreshold.entries()].map(
      ([cents, countries]) => ({
        countries,
        payout_volume_threshold_cents: cents,
      })
    );

    return {
      settings: {
        identity: {
          provider: 'didit',
          didit: providerCredentials,
          rules: {
            payout_volume_threshold_cents: payoutVolumeThresholdCents,
            country_thresholds: countryThresholds,
          },
        },
      },
    };
  }

  private HasProviderConfigured(): boolean {
    const hasKey = !!this.apiKey().trim() || this.apiKeyConfigured();
    const hasWorkflow = !!this.workflowId().trim();
    return hasKey && hasWorkflow;
  }

  private HasAnyThreshold(): boolean {
    if (this.payoutVolumeThreshold().trim()) return true;
    return this.countryThresholds().some(
      (row) => row.country.trim() || row.threshold.trim()
    );
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

  private ValidateCountryThresholds(): void {
    const rows = this.countryThresholds();
    const seen = new Set<string>();

    for (const row of rows) {
      if (!row.country.trim() && !row.threshold.trim()) {
        continue;
      }
      if (!row.country.trim()) {
        this.countryThresholdsError.set('Select a country for each override');
        return;
      }
      if (!row.threshold.trim()) {
        this.countryThresholdsError.set('Each override needs a threshold');
        return;
      }
      const value = parseFloat(row.threshold);
      if (!Number.isFinite(value) || value < 0) {
        this.countryThresholdsError.set(
          'Override thresholds must be $0 or more'
        );
        return;
      }
      if (seen.has(row.country)) {
        this.countryThresholdsError.set(
          `Country ${row.country} appears more than once`
        );
        return;
      }
      seen.add(row.country);
    }

    this.countryThresholdsError.set('');
  }

  private ValidateThresholdRequiresProvider(): void {
    if (!this.HasAnyThreshold()) return;
    if (this.HasProviderConfigured()) return;

    if (!this.apiKey().trim() && !this.apiKeyConfigured()) {
      this.apiKeyError.set(
        'API key is required when volume thresholds are set'
      );
    }
    if (!this.workflowId().trim()) {
      this.workflowIdError.set(
        'Workflow ID is required when volume thresholds are set'
      );
    }
  }

  private EmitFormChange(): void {
    this.formChange.emit(this.GetFormData());
    this.validationChange.emit(this.IsValid());
  }
}
