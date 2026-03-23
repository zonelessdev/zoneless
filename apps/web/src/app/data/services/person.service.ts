import { Injectable, inject, signal, WritableSignal } from '@angular/core';
import { ApiService } from '../../core';
import { Person } from '@zoneless/shared-types';
import { GetCountryName } from '../../utils';
import { SettingsCardRow } from '../../shared';

/**
 * Input type for updating a person.
 * All fields are optional - only provided fields will be updated.
 * Protected fields (id, object, account, created, verification) cannot be updated.
 */
export type PersonUpdateInput = Partial<
  Omit<Person, 'id' | 'object' | 'account' | 'created' | 'verification'>
>;

const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

@Injectable({
  providedIn: 'root',
})
export class PersonService {
  private readonly api = inject(ApiService);

  person: WritableSignal<Person | null> = signal(null);
  loading: WritableSignal<boolean> = signal(false);

  Reset(): void {
    this.person.set(null);
  }

  SetPerson(person: Person | null): void {
    this.person.set(person);
  }

  async GetPerson(accountId: string, personId: string): Promise<Person> {
    this.loading.set(true);
    try {
      const person = await this.api.Call<Person>(
        'GET',
        `accounts/${accountId}/persons/${personId}`
      );
      this.person.set(person);
      return person;
    } finally {
      this.loading.set(false);
    }
  }

  async UpdatePerson(
    accountId: string,
    personId: string,
    data: PersonUpdateInput
  ): Promise<Person> {
    this.loading.set(true);
    try {
      const person = await this.api.Call<Person>(
        'POST',
        `accounts/${accountId}/persons/${personId}`,
        data
      );
      this.person.set(person);
      return person;
    } finally {
      this.loading.set(false);
    }
  }

  GetFullName(person: Person | null): string {
    if (!person) return '';
    return `${person.first_name || ''} ${person.last_name || ''}`.trim();
  }

  FormatDob(person: Person | null): string | null {
    if (!person?.dob?.day || !person?.dob?.month || !person?.dob?.year) {
      return null;
    }
    return `Born on ${person.dob.day} ${MONTHS[person.dob.month - 1]} ${
      person.dob.year
    }`;
  }

  FormatAddress(person: Person | null): string[] | null {
    if (!person?.address) return null;

    const lines: string[] = [];
    if (person.address.line1) lines.push(person.address.line1);
    if (person.address.line2) lines.push(person.address.line2);
    if (person.address.city) lines.push(person.address.city);
    if (person.address.postal_code) lines.push(person.address.postal_code);
    if (person.address.country) {
      const countryName = GetCountryName(person.address.country);
      lines.push(countryName || person.address.country);
    }

    return lines.length > 0 ? lines : null;
  }

  GetOtherInfo(person: Person | null): string {
    if (!person) return '—';
    const info: string[] = [];
    if (person.phone) info.push('Phone');
    return info.length > 0 ? info.join(', ') : '—';
  }

  GetSettingsCardRows(person: Person | null): SettingsCardRow[] {
    if (!person) return [];

    return [
      {
        label: 'Email address',
        value: person.email,
        type: 'text',
      },
      {
        label: 'Date of birth',
        value: this.FormatDob(person),
        type: 'text',
      },
      {
        label: 'Address',
        value: this.FormatAddress(person),
        type: 'multiline',
      },
      {
        label: 'Other information provided',
        value: this.GetOtherInfo(person),
        type: 'text',
      },
    ];
  }
}
