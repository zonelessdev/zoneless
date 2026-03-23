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
} from '@angular/core';
import { FormsModule } from '@angular/forms';

import { Person } from '@zoneless/shared-types';
import {
  NAME_MIN_LENGTH,
  NAME_MAX_LENGTH,
  ISO_CODES,
  GetCountryDialCode,
} from '../../../utils';
import { ConfigService } from '../../../data';

export type PersonFormMode = 'onboard' | 'edit';

export interface PersonFormData {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  dobDay: number | null;
  dobMonth: number | null;
  dobYear: number | null;
  addressLine1: string;
  addressLine2: string;
  addressCity: string;
  addressState: string;
  addressPostalCode: string;
  addressCountry: string;
}

@Component({
  selector: 'app-person-form',
  standalone: true,
  imports: [FormsModule],
  templateUrl: './person-form.component.html',
  styleUrls: ['./person-form.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PersonFormComponent implements OnInit, OnChanges {
  readonly configService = inject(ConfigService);
  readonly NAME_MAX_LENGTH = NAME_MAX_LENGTH;
  readonly ISO_CODES = ISO_CODES;

  @Input() mode: PersonFormMode = 'onboard';
  @Input() person: Person | null = null;
  @Input() showErrors = false;
  @Input() isOpen = false;

  @Output() formChange = new EventEmitter<PersonFormData>();
  @Output() validationChange = new EventEmitter<boolean>();

  // Name fields
  firstName: WritableSignal<string> = signal('');
  lastName: WritableSignal<string> = signal('');
  firstNameError: WritableSignal<string> = signal('');
  lastNameError: WritableSignal<string> = signal('');

  // Email field
  email: WritableSignal<string> = signal('');
  emailError: WritableSignal<string> = signal('');

  // DOB fields
  dobDay: WritableSignal<number | null> = signal(null);
  dobMonth: WritableSignal<number | null> = signal(null);
  dobYear: WritableSignal<number | null> = signal(null);
  dobError: WritableSignal<string> = signal('');

  // Address fields
  addressLine1: WritableSignal<string> = signal('');
  addressLine2: WritableSignal<string> = signal('');
  addressCity: WritableSignal<string> = signal('');
  addressState: WritableSignal<string> = signal('');
  addressPostalCode: WritableSignal<string> = signal('');
  addressCountry: WritableSignal<string> = signal('');
  addressError: WritableSignal<string> = signal('');

  // Phone fields — phoneCountryCode stores ISO code (e.g. 'GB'), not dial code
  phoneCountryCode: WritableSignal<string> = signal('US');
  phoneNumber: WritableSignal<string> = signal('');
  phone: WritableSignal<string> = signal('');
  phoneError: WritableSignal<string> = signal('');

  GetPhoneDialCode(): string {
    return GetCountryDialCode(this.phoneCountryCode());
  }

  GetPhonePlaceholder(): string {
    const country = ISO_CODES.find((c) => c.code === this.phoneCountryCode());
    return country?.phoneExample || '123 456 7890';
  }

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
    if (this.person) {
      this.firstName.set(this.person.first_name || '');
      this.lastName.set(this.person.last_name || '');
      this.email.set(this.person.email || '');

      if (this.person.phone) {
        this.ParseAndSetPhone(this.person.phone);
      } else {
        this.phoneCountryCode.set('US');
        this.phoneNumber.set('');
        this.phone.set('');
      }

      if (this.person.dob) {
        this.dobDay.set(this.person.dob.day);
        this.dobMonth.set(this.person.dob.month);
        this.dobYear.set(this.person.dob.year);
      } else {
        this.dobDay.set(null);
        this.dobMonth.set(null);
        this.dobYear.set(null);
      }

      if (this.person.address) {
        this.addressLine1.set(this.person.address.line1 || '');
        this.addressLine2.set(this.person.address.line2 || '');
        this.addressCity.set(this.person.address.city || '');
        this.addressState.set(this.person.address.state || '');
        this.addressPostalCode.set(this.person.address.postal_code || '');
        this.addressCountry.set(this.person.address.country || '');
      } else {
        this.addressLine1.set('');
        this.addressLine2.set('');
        this.addressCity.set('');
        this.addressState.set('');
        this.addressPostalCode.set('');
        this.addressCountry.set('');
      }
    } else {
      // Reset to defaults
      this.firstName.set('');
      this.lastName.set('');
      this.email.set('');
      this.phoneCountryCode.set('US');
      this.phoneNumber.set('');
      this.phone.set('');
      this.dobDay.set(null);
      this.dobMonth.set(null);
      this.dobYear.set(null);
      this.addressLine1.set('');
      this.addressLine2.set('');
      this.addressCity.set('');
      this.addressState.set('');
      this.addressPostalCode.set('');
      this.addressCountry.set('');
    }

    this.EmitFormChange();
  }

  private ParseAndSetPhone(fullPhone: string): void {
    const sortedCountries = [...ISO_CODES].sort(
      (a, b) => b.dialCode.length - a.dialCode.length
    );
    for (const country of sortedCountries) {
      if (fullPhone.startsWith(country.dialCode)) {
        this.phoneCountryCode.set(country.code);
        this.phoneNumber.set(
          fullPhone.substring(country.dialCode.length).trim()
        );
        this.UpdateFullPhone();
        return;
      }
    }
    this.phoneNumber.set(fullPhone);
    this.UpdateFullPhone();
  }

  private UpdateFullPhone(): void {
    const dialCode = this.GetPhoneDialCode();
    const number = this.phoneNumber();
    if (number) {
      this.phone.set(`${dialCode} ${number}`.trim());
    } else {
      this.phone.set('');
    }
  }

  // Name handlers
  OnFirstNameChange(value: string): void {
    this.firstName.set(value);
    this.ValidateFirstName();
    this.EmitFormChange();
  }

  OnLastNameChange(value: string): void {
    this.lastName.set(value);
    this.ValidateLastName();
    this.EmitFormChange();
  }

  // Email handler
  OnEmailChange(value: string): void {
    this.email.set(value);
    this.ValidateEmail();
    this.EmitFormChange();
  }

  // DOB handlers
  OnDobDayChange(value: string): void {
    const numValue = value ? parseInt(value, 10) : null;
    this.dobDay.set(numValue);
    this.ValidateDob();
    this.EmitFormChange();
  }

  OnDobMonthChange(value: string): void {
    const numValue = value ? parseInt(value, 10) : null;
    this.dobMonth.set(numValue);
    this.ValidateDob();
    this.EmitFormChange();
  }

  OnDobYearChange(value: string): void {
    const numValue = value ? parseInt(value, 10) : null;
    this.dobYear.set(numValue);
    this.ValidateDob();
    this.EmitFormChange();
  }

  // Address handlers
  OnAddressLine1Change(value: string): void {
    this.addressLine1.set(value);
    this.ValidateAddress();
    this.EmitFormChange();
  }

  OnAddressLine2Change(value: string): void {
    this.addressLine2.set(value);
    this.EmitFormChange();
  }

  OnAddressCityChange(value: string): void {
    this.addressCity.set(value);
    this.ValidateAddress();
    this.EmitFormChange();
  }

  OnAddressStateChange(value: string): void {
    this.addressState.set(value);
    this.EmitFormChange();
  }

  OnAddressPostalCodeChange(value: string): void {
    this.addressPostalCode.set(value);
    this.ValidateAddress();
    this.EmitFormChange();
  }

  OnAddressCountryChange(value: string): void {
    this.addressCountry.set(value);

    const country = ISO_CODES.find((c) => c.code === value);
    if (country) {
      this.phoneCountryCode.set(country.code);
      this.UpdateFullPhone();
    }

    this.ValidateAddress();
    this.EmitFormChange();
  }

  // Phone handlers
  OnPhoneCountryCodeChange(value: string): void {
    this.phoneCountryCode.set(value);
    this.UpdateFullPhone();
    this.ValidatePhone();
    this.EmitFormChange();
  }

  OnPhoneNumberChange(value: string): void {
    this.phoneNumber.set(value);
    this.UpdateFullPhone();
    this.ValidatePhone();
    this.EmitFormChange();
  }

  // Validation methods
  ValidateFirstName(): void {
    const value = this.firstName();
    if (!value || !value.trim()) {
      this.firstNameError.set('Please enter a first name');
    } else if (value.length < NAME_MIN_LENGTH) {
      this.firstNameError.set('First name is too short');
    } else if (value.length > NAME_MAX_LENGTH) {
      this.firstNameError.set('First name is too long');
    } else {
      this.firstNameError.set('');
    }
  }

  ValidateLastName(): void {
    const value = this.lastName();
    if (!value || !value.trim()) {
      this.lastNameError.set('Please enter a last name');
    } else if (value.length < NAME_MIN_LENGTH) {
      this.lastNameError.set('Last name is too short');
    } else if (value.length > NAME_MAX_LENGTH) {
      this.lastNameError.set('Last name is too long');
    } else {
      this.lastNameError.set('');
    }
  }

  ValidateEmail(): void {
    const value = this.email();
    if (!value || !value.trim()) {
      this.emailError.set('Please enter an email address');
    } else if (!this.IsValidEmail(value)) {
      this.emailError.set('Please enter a valid email address');
    } else {
      this.emailError.set('');
    }
  }

  ValidateDob(): void {
    const day = this.dobDay();
    const month = this.dobMonth();
    const year = this.dobYear();

    const hasAnyValue = day !== null || month !== null || year !== null;

    if (!hasAnyValue) {
      this.dobError.set('Please enter your date of birth');
      return;
    }

    if (day === null || month === null || year === null) {
      this.dobError.set('Please complete all date of birth fields');
      return;
    }

    if (day < 1 || day > 31) {
      this.dobError.set('Day must be between 1 and 31');
      return;
    }

    if (month < 1 || month > 12) {
      this.dobError.set('Month must be between 1 and 12');
      return;
    }

    const currentYear = new Date().getFullYear();
    if (year < 1900 || year > currentYear) {
      this.dobError.set(`Year must be between 1900 and ${currentYear}`);
      return;
    }

    const birthDate = new Date(year, month - 1, day);
    const today = new Date();
    let age = today.getFullYear() - birthDate.getFullYear();
    const monthDiff = today.getMonth() - birthDate.getMonth();
    if (
      monthDiff < 0 ||
      (monthDiff === 0 && today.getDate() < birthDate.getDate())
    ) {
      age--;
    }

    if (age < 13) {
      this.dobError.set('You must be at least 13 years old');
      return;
    }

    this.dobError.set('');
  }

  ValidateAddress(): void {
    const line1 = this.addressLine1();
    const city = this.addressCity();
    const postalCode = this.addressPostalCode();
    const country = this.addressCountry();

    const hasAnyValue = line1 || city || postalCode || country;
    if (!hasAnyValue) {
      this.addressError.set('Please enter your address');
      return;
    }

    if (!country.trim()) {
      this.addressError.set('Please select a country');
      return;
    }

    if (!line1.trim()) {
      this.addressError.set('Please enter an address line 1');
      return;
    }

    if (!city.trim()) {
      this.addressError.set('Please enter a city');
      return;
    }

    if (!postalCode.trim()) {
      this.addressError.set('Please enter a postal code');
      return;
    }

    this.addressError.set('');
  }

  ValidatePhone(): void {
    const number = this.phoneNumber();
    if (!number || !number.trim()) {
      this.phoneError.set('Please enter a phone number');
    } else if (number.length < 6) {
      this.phoneError.set('Phone number is too short');
    } else {
      this.phoneError.set('');
    }
  }

  ValidateAll(): boolean {
    this.ValidateFirstName();
    this.ValidateLastName();
    this.ValidateEmail();
    this.ValidateDob();
    this.ValidateAddress();
    this.ValidatePhone();

    return (
      !this.firstNameError() &&
      !this.lastNameError() &&
      !this.emailError() &&
      !this.dobError() &&
      !this.addressError() &&
      !this.phoneError()
    );
  }

  IsValid(): boolean {
    const hasDob =
      this.dobDay() !== null &&
      this.dobMonth() !== null &&
      this.dobYear() !== null;

    return (
      !!this.firstName() &&
      !!this.lastName() &&
      !!this.email() &&
      hasDob &&
      !!this.addressCountry() &&
      !!this.addressLine1() &&
      !!this.addressCity() &&
      !!this.addressPostalCode() &&
      !!this.phoneNumber() &&
      !this.firstNameError() &&
      !this.lastNameError() &&
      !this.emailError() &&
      !this.dobError() &&
      !this.addressError() &&
      !this.phoneError()
    );
  }

  GetFormData(): PersonFormData {
    return {
      firstName: this.firstName(),
      lastName: this.lastName(),
      email: this.email(),
      phone: this.phone(),
      dobDay: this.dobDay(),
      dobMonth: this.dobMonth(),
      dobYear: this.dobYear(),
      addressLine1: this.addressLine1(),
      addressLine2: this.addressLine2(),
      addressCity: this.addressCity(),
      addressState: this.addressState(),
      addressPostalCode: this.addressPostalCode(),
      addressCountry: this.addressCountry(),
    };
  }

  /**
   * Returns data ready for the Person update API.
   */
  GetUpdateData(): {
    first_name: string;
    last_name: string;
    email: string;
    phone: string | null;
    dob: { day: number | null; month: number | null; year: number | null };
    address: {
      line1: string | null;
      line2: string | null;
      city: string | null;
      state: string | null;
      postal_code: string | null;
      country: string | null;
    };
  } {
    return {
      first_name: this.firstName().trim(),
      last_name: this.lastName().trim(),
      email: this.email().trim(),
      phone: this.phone() || null,
      dob: {
        day: this.dobDay(),
        month: this.dobMonth(),
        year: this.dobYear(),
      },
      address: {
        line1: this.addressLine1() || null,
        line2: this.addressLine2() || null,
        city: this.addressCity() || null,
        state: this.addressState() || null,
        postal_code: this.addressPostalCode() || null,
        country: this.addressCountry() || null,
      },
    };
  }

  private IsValidEmail(email: string): boolean {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }

  private EmitFormChange(): void {
    this.formChange.emit(this.GetFormData());
    this.validationChange.emit(this.IsValid());
  }
}
