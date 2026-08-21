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
import { Account, AccountBusinessType } from '@zoneless/shared-types';
import { UpdateAccountInput } from '@zoneless/shared-schemas';
import {
  IsBusinessAccount,
  NAME_MAX_LENGTH,
  NAME_MIN_LENGTH,
} from '../../../utils';

export type AccountTypeFormMode = 'onboard' | 'edit';

export interface AccountTypeFormData {
  businessType: AccountBusinessType;
  businessName: string;
}

type AccountTypeChoice = 'individual' | 'company';

@Component({
  selector: 'app-account-type-form',
  standalone: true,
  imports: [FormsModule],
  templateUrl: './account-type-form.component.html',
  styleUrls: ['./account-type-form.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AccountTypeFormComponent implements OnInit, OnChanges {
  readonly NAME_MAX_LENGTH = NAME_MAX_LENGTH;

  @Input() mode: AccountTypeFormMode = 'onboard';
  @Input() account: Account | null = null;
  @Input() showErrors = false;
  @Input() isOpen = false;

  @Output() formChange = new EventEmitter<AccountTypeFormData>();
  @Output() validationChange = new EventEmitter<boolean>();

  accountType: WritableSignal<AccountTypeChoice> = signal('individual');
  businessName: WritableSignal<string> = signal('');
  businessNameError: WritableSignal<string> = signal('');

  ngOnInit(): void {
    this.InitializeForm();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['isOpen'] && this.isOpen) {
      this.InitializeForm();
    }
    if (changes['account'] && !this.isOpen) {
      this.InitializeForm();
    }
  }

  InitializeForm(): void {
    this.accountType.set(
      IsBusinessAccount(this.account) ? 'company' : 'individual'
    );
    this.businessName.set(this.account?.business_profile?.name?.trim() || '');
    this.businessNameError.set('');
    this.EmitFormChange();
  }

  OnAccountTypeChange(value: string): void {
    this.accountType.set(value === 'company' ? 'company' : 'individual');
    this.ValidateBusinessName();
    this.EmitFormChange();
  }

  OnBusinessNameChange(value: string): void {
    this.businessName.set(value);
    this.ValidateBusinessName();
    this.EmitFormChange();
  }

  IsBusiness(): boolean {
    return this.accountType() === 'company';
  }

  ValidateAll(): boolean {
    this.ValidateBusinessName();
    const valid = this.IsValid();
    this.validationChange.emit(valid);
    return valid;
  }

  IsValid(): boolean {
    if (!this.IsBusiness()) return true;
    return !!this.businessName().trim() && !this.businessNameError();
  }

  GetFormData(): AccountTypeFormData {
    return {
      businessType: this.ResolveBusinessType(),
      businessName: this.businessName().trim(),
    };
  }

  GetUpdateData(): UpdateAccountInput {
    const isBusiness = this.IsBusiness();
    return {
      business_type: this.ResolveBusinessType(),
      business_profile: {
        name: isBusiness ? this.businessName().trim() : null,
      },
    };
  }

  private ResolveBusinessType(): AccountBusinessType {
    if (!this.IsBusiness()) return 'individual';
    const existing = this.account?.business_type;
    if (existing === 'non_profit' || existing === 'government_entity') {
      return existing;
    }
    return 'company';
  }

  private ValidateBusinessName(): void {
    if (!this.IsBusiness()) {
      this.businessNameError.set('');
      return;
    }
    const name = this.businessName().trim();
    if (!name) {
      this.businessNameError.set('Legal business name is required');
      return;
    }
    if (name.length < NAME_MIN_LENGTH) {
      this.businessNameError.set(
        `Business name must be at least ${NAME_MIN_LENGTH} characters`
      );
      return;
    }
    this.businessNameError.set('');
  }

  private EmitFormChange(): void {
    this.formChange.emit(this.GetFormData());
    this.validationChange.emit(this.IsValid());
  }
}
