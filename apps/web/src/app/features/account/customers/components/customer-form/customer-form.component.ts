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
  inject,
  ViewChild,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Customer } from '@zoneless/shared-types';
import { ConfigService } from '../../../../../data';
import {
  CreateCustomerInput,
  UpdateCustomerInput,
} from '@zoneless/shared-schemas';
import { MetadataEditorComponent } from '../../../components';
import { Subscription } from 'rxjs';
export type CustomerFormMode = 'create' | 'edit';

@Component({
  selector: 'app-customer-form',
  standalone: true,
  imports: [FormsModule, MetadataEditorComponent],
  templateUrl: './customer-form.component.html',
  styleUrls: ['./customer-form.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CustomerFormComponent implements OnInit, OnChanges {
  readonly configService = inject(ConfigService);
  private sub?: Subscription;

  @Input() customer: Customer | null = null;
  @Input() mode: CustomerFormMode = 'create';
  @Input() showErrors = false;
  @Input() isOpen = false;

  @Output() formChange = new EventEmitter<
    CreateCustomerInput | UpdateCustomerInput
  >();
  @Output() validationChange = new EventEmitter<boolean>();

  name: WritableSignal<string> = signal('');
  nameError: WritableSignal<string> = signal('');
  NAME_MAX_LENGTH = 200;

  email: WritableSignal<string> = signal('');
  emailError: WritableSignal<string> = signal('');
  EMAIL_MAX_LENGTH = 512;

  metadata: WritableSignal<Record<string, string>> = signal({});
  metadataArray: WritableSignal<{ key: string; value: string }[]> = signal([]);

  detailsExpanded: WritableSignal<boolean> = signal(false);

  ngOnInit(): void {
    this.InitializeForm();
  }

  ngOnChanges(changes: SimpleChanges): void {
    // Reinitialize form when panel opens
    if (changes['isOpen'] && this.isOpen) {
      this.InitializeForm();
    }
  }

  InitializeForm(): void {
    if (this.customer) {
      this.name.set(this.customer.name || '');
      this.email.set(this.customer.email || '');
      this.metadata.set(this.customer.metadata || {});
    } else {
      this.name.set('');
      this.email.set('');
    }
    this.EmitFormChange();
  }

  OnNameChange(value: string): void {
    this.name.set(value.trim());
    this.ValidateName();
    this.EmitFormChange();
  }

  ValidateName(): void {
    const name = this.name();
    this.nameError.set('');
    if (!name) {
      this.nameError.set('Please enter a name');
      return;
    }
  }

  OnEmailChange(value: string): void {
    this.email.set(value.trim());
    this.ValidateEmail();
    this.EmitFormChange();
  }

  ValidateEmail(): void {
    const email = this.email();
    this.emailError.set('');
    if (!email) {
      return;
    }
    if (!this.IsValidEmail(email)) {
      this.emailError.set('Please enter a valid email address');
    }
  }

  private IsValidEmail(email: string): boolean {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }

  OnMetadataChange(metadata: Record<string, string>): void {
    this.metadata.set(metadata);
    this.EmitFormChange();
  }

  ValidateAll(): boolean {
    this.ValidateName();
    this.ValidateEmail();
    return this.IsValid();
  }

  IsValid(): boolean {
    return !this.nameError() && !this.emailError();
  }

  CreateCustomerFormData(): CreateCustomerInput {
    const data: CreateCustomerInput = {
      name: this.name(),
      metadata: this.metadata(),
    };
    if (this.email()) {
      data.email = this.email();
    }
    return data;
  }

  UpdateCustomerFormData(): UpdateCustomerInput {
    const data: UpdateCustomerInput = {
      name: this.name(),
      metadata: this.metadata(),
    };
    if (this.email()) {
      data.email = this.email();
    }
    return data;
  }

  private EmitFormChange(): void {
    if (this.mode === 'create') {
      this.formChange.emit(this.CreateCustomerFormData());
    } else {
      this.formChange.emit(this.UpdateCustomerFormData());
    }
    this.validationChange.emit(this.IsValid());
  }

  ToggleDetailsExpanded(): void {
    this.detailsExpanded.update((expanded) => !expanded);
  }
}
