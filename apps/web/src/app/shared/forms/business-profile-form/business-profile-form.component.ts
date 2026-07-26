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

export type BusinessProfileFormMode = 'setup' | 'edit';

export interface BusinessProfileFormData {
  businessName: string;
  logoUrl: string;
  termsUrl: string;
  privacyUrl: string;
}

export interface BusinessProfileSetupData {
  platform_name: string;
  platform_logo_url?: string;
  terms_url?: string;
  privacy_url?: string;
}

@Component({
  selector: 'app-business-profile-form',
  standalone: true,
  imports: [FormsModule],
  templateUrl: './business-profile-form.component.html',
  styleUrls: ['./business-profile-form.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class BusinessProfileFormComponent implements OnInit, OnChanges {
  @Input() mode: BusinessProfileFormMode = 'edit';
  @Input() account: Account | null = null;
  @Input() initialData: BusinessProfileSetupData | null = null;
  @Input() showErrors = false;
  @Input() isOpen = false;

  @Output() formChange = new EventEmitter<BusinessProfileFormData>();
  @Output() validationChange = new EventEmitter<boolean>();

  businessName: WritableSignal<string> = signal('');
  businessNameError: WritableSignal<string> = signal('');

  logoUrl: WritableSignal<string> = signal('');
  logoUrlError: WritableSignal<string> = signal('');

  termsUrl: WritableSignal<string> = signal('');
  termsUrlError: WritableSignal<string> = signal('');

  privacyUrl: WritableSignal<string> = signal('');
  privacyUrlError: WritableSignal<string> = signal('');

  ngOnInit(): void {
    this.InitializeForm();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['isOpen'] && this.isOpen) {
      this.InitializeForm();
    }
    if (changes['account'] && this.mode === 'edit') {
      this.InitializeForm();
    }
  }

  InitializeForm(): void {
    if (this.mode === 'edit' && this.account) {
      const name =
        this.account.business_profile?.name?.trim() ||
        this.account.settings?.dashboard?.display_name?.trim() ||
        '';
      this.businessName.set(name);
      this.logoUrl.set(this.account.settings?.branding?.logo || '');
      this.termsUrl.set(this.account.settings?.terms_url || '');
      this.privacyUrl.set(this.account.settings?.privacy_url || '');
    } else if (this.mode === 'setup' && this.initialData) {
      this.businessName.set(this.initialData.platform_name || '');
      this.logoUrl.set(this.initialData.platform_logo_url || '');
      this.termsUrl.set(this.initialData.terms_url || '');
      this.privacyUrl.set(this.initialData.privacy_url || '');
    }

    this.businessNameError.set('');
    this.logoUrlError.set('');
    this.termsUrlError.set('');
    this.privacyUrlError.set('');

    this.EmitFormChange();
  }

  OnBusinessNameChange(value: string): void {
    this.businessName.set(value);
    this.ValidateBusinessName();
    this.EmitFormChange();
  }

  OnLogoUrlChange(value: string): void {
    this.logoUrl.set(value);
    this.ValidateOptionalUrl(value, this.logoUrlError);
    this.EmitFormChange();
  }

  OnTermsUrlChange(value: string): void {
    this.termsUrl.set(value);
    this.ValidateOptionalUrl(value, this.termsUrlError);
    this.EmitFormChange();
  }

  OnPrivacyUrlChange(value: string): void {
    this.privacyUrl.set(value);
    this.ValidateOptionalUrl(value, this.privacyUrlError);
    this.EmitFormChange();
  }

  ValidateBusinessName(): void {
    const name = this.businessName().trim();
    if (!name) {
      this.businessNameError.set('Business name is required');
      return;
    }
    this.businessNameError.set('');
  }

  ValidateOptionalUrl(
    value: string,
    errorSignal: WritableSignal<string>
  ): void {
    const trimmed = value.trim();
    if (!trimmed) {
      errorSignal.set('');
      return;
    }
    if (!this.IsValidUrl(trimmed)) {
      errorSignal.set('Please enter a valid URL');
      return;
    }
    errorSignal.set('');
  }

  ValidateAll(): boolean {
    this.ValidateBusinessName();
    this.ValidateOptionalUrl(this.logoUrl(), this.logoUrlError);
    this.ValidateOptionalUrl(this.termsUrl(), this.termsUrlError);
    this.ValidateOptionalUrl(this.privacyUrl(), this.privacyUrlError);

    return (
      !this.businessNameError() &&
      !this.logoUrlError() &&
      !this.termsUrlError() &&
      !this.privacyUrlError()
    );
  }

  IsValid(): boolean {
    return (
      !!this.businessName().trim() &&
      !this.businessNameError() &&
      !this.logoUrlError() &&
      !this.termsUrlError() &&
      !this.privacyUrlError()
    );
  }

  GetFormData(): BusinessProfileFormData {
    return {
      businessName: this.businessName(),
      logoUrl: this.logoUrl(),
      termsUrl: this.termsUrl(),
      privacyUrl: this.privacyUrl(),
    };
  }

  /**
   * Account update payload for Settings edit mode.
   * Empty optional URLs are sent as null so they clear existing values.
   */
  GetUpdateData(): UpdateAccountInput {
    const name = this.businessName().trim();
    return {
      business_profile: { name },
      settings: {
        branding: { logo: this.logoUrl().trim() || null },
        dashboard: { display_name: name },
        terms_url: this.termsUrl().trim() || null,
        privacy_url: this.privacyUrl().trim() || null,
      },
    };
  }

  /**
   * Setup request fields for the Platform Details step.
   */
  GetSetupData(): BusinessProfileSetupData {
    const data: BusinessProfileSetupData = {
      platform_name: this.businessName().trim(),
    };

    const logo = this.logoUrl().trim();
    if (logo) data.platform_logo_url = logo;

    const terms = this.termsUrl().trim();
    if (terms) data.terms_url = terms;

    const privacy = this.privacyUrl().trim();
    if (privacy) data.privacy_url = privacy;

    return data;
  }

  private IsValidUrl(value: string): boolean {
    try {
      const url = new URL(value);
      return url.protocol === 'http:' || url.protocol === 'https:';
    } catch {
      return false;
    }
  }

  private EmitFormChange(): void {
    this.formChange.emit(this.GetFormData());
    this.validationChange.emit(this.IsValid());
  }
}
