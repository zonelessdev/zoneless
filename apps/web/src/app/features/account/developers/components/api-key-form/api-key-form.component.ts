import {
  Component,
  Input,
  Output,
  EventEmitter,
  OnChanges,
  SimpleChanges,
  signal,
  WritableSignal,
  ChangeDetectionStrategy,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ApiKey } from '@zoneless/shared-types';

export type ApiKeyFormMode = 'create' | 'edit';

export interface ApiKeyFormData {
  name: string;
  status: 'active' | 'inactive';
}

@Component({
  selector: 'app-api-key-form',
  standalone: true,
  imports: [FormsModule],
  templateUrl: './api-key-form.component.html',
  styleUrls: ['./api-key-form.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ApiKeyFormComponent implements OnChanges {
  @Input() mode: ApiKeyFormMode = 'create';
  @Input() apiKey: ApiKey | null = null;
  @Input() showErrors = false;
  @Input() isOpen = false;
  @Input() createdToken: string | null = null;

  @Output() formChange = new EventEmitter<ApiKeyFormData>();
  @Output() validationChange = new EventEmitter<boolean>();
  @Output() done = new EventEmitter<void>();

  name: WritableSignal<string> = signal('');
  nameError: WritableSignal<string> = signal('');
  status: WritableSignal<'active' | 'inactive'> = signal('active');

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['isOpen'] && this.isOpen) {
      this.InitializeForm();
    }
  }

  InitializeForm(): void {
    if (this.apiKey && this.mode === 'edit') {
      this.name.set(this.apiKey.name || '');
      this.status.set(
        this.apiKey.status === 'revoked' ? 'inactive' : this.apiKey.status
      );
    } else {
      this.name.set('');
      this.status.set('active');
    }

    this.nameError.set('');
    this.EmitFormChange();
  }

  OnNameChange(value: string): void {
    this.name.set(value);
    this.ValidateName();
    this.EmitFormChange();
  }

  OnStatusChange(value: 'active' | 'inactive'): void {
    this.status.set(value);
    this.EmitFormChange();
  }

  ValidateName(): void {
    const nameValue = this.name().trim();

    if (!nameValue) {
      this.nameError.set('Please enter a name for this API key');
      return;
    }

    if (nameValue.length > 100) {
      this.nameError.set('Name must be 100 characters or less');
      return;
    }

    this.nameError.set('');
  }

  ValidateAll(): boolean {
    this.ValidateName();
    return !this.nameError() && !!this.name().trim();
  }

  IsValid(): boolean {
    return !!this.name().trim() && !this.nameError();
  }

  GetFormData(): ApiKeyFormData {
    return {
      name: this.name().trim(),
      status: this.status(),
    };
  }

  private EmitFormChange(): void {
    this.formChange.emit(this.GetFormData());
    this.validationChange.emit(this.IsValid());
  }

  CopyTokenToClipboard(): void {
    if (this.createdToken) {
      navigator.clipboard.writeText(this.createdToken);
    }
  }

  OnDoneClick(): void {
    this.done.emit();
  }

  GetTokenDisplay(): string {
    if (!this.apiKey?.token_prefix) return '';
    return this.apiKey.token_prefix;
  }

  GetLastUsedDisplay(): string {
    if (!this.apiKey?.last_used) return 'Never used';
    const date = new Date(this.apiKey.last_used * 1000);
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  GetCreatedDisplay(): string {
    if (!this.apiKey?.created) return '';
    const date = new Date(this.apiKey.created * 1000);
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  }
}
