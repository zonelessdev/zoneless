import {
  Component,
  Input,
  Output,
  EventEmitter,
  ChangeDetectionStrategy,
  inject,
} from '@angular/core';
import { DatePipe } from '@angular/common';

import { Account, Person } from '@zoneless/shared-types';
import { StatusChipComponent } from '../../../../shared';
import { AccountService } from '../../../../data/services/account.service';
import { PersonService } from '../../../../data/services/person.service';
import { GetCountryName } from '../../../../utils';
import { GetAccountStatus } from '../../connected-accounts/util/connected-account-display';

@Component({
  selector: 'app-connected-account-detail',
  standalone: true,
  imports: [DatePipe, StatusChipComponent],
  templateUrl: './connected-account-detail.component.html',
  styleUrls: ['./connected-account-detail.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ConnectedAccountDetailComponent {
  private accountService = inject(AccountService);
  private personService = inject(PersonService);

  @Input({ required: true }) account!: Account;
  @Input() person: Person | null = null;

  @Output() viewDashboard = new EventEmitter<Account>();

  OnViewDashboard(): void {
    this.viewDashboard.emit(this.account);
  }

  GetDisplayName(): string {
    const accountWithPerson: Account = {
      ...this.account,
      individual: this.person ?? this.account.individual,
    };
    const name =
      this.accountService.GetConnectedAccountDisplayName(accountWithPerson);
    return name === this.account.id ? 'No name' : name;
  }

  GetEmail(): string | null {
    return this.account.email ?? this.person?.email ?? null;
  }

  GetStatus(): string {
    const accountWithPerson: Account = {
      ...this.account,
      individual: this.person ?? this.account.individual,
    };
    return GetAccountStatus(accountWithPerson);
  }

  GetCountry(): string {
    if (!this.account.country) return 'Unknown';
    return GetCountryName(this.account.country) || this.account.country;
  }

  GetCreatedDate(): number {
    // API returns Unix timestamps in seconds, DatePipe expects milliseconds
    return this.account.created * 1000;
  }

  GetId(): string {
    return this.account.id;
  }

  GetAccountType(): string {
    return this.account.type
      ? this.account.type.charAt(0).toUpperCase() + this.account.type.slice(1)
      : 'Express';
  }

  GetBusinessType(): string | null {
    if (!this.account.business_type) return null;
    return this.account.business_type
      .split('_')
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  }

  GetChargesEnabled(): boolean {
    return this.account.charges_enabled;
  }

  GetPayoutsEnabled(): boolean {
    return this.account.payouts_enabled;
  }

  GetDetailsSubmitted(): boolean {
    return this.account.details_submitted;
  }

  GetTosAccepted(): boolean {
    return !!this.account.tos_acceptance?.date;
  }

  GetTosAcceptedDate(): number | null {
    if (!this.account.tos_acceptance?.date) return null;
    return this.account.tos_acceptance.date * 1000;
  }

  GetPersonFirstName(): string | null {
    return this.person?.first_name ?? null;
  }

  GetPersonLastName(): string | null {
    return this.person?.last_name ?? null;
  }

  GetPersonPhone(): string | null {
    return this.person?.phone ?? null;
  }

  GetPersonDob(): string | null {
    if (
      !this.person?.dob?.day ||
      !this.person?.dob?.month ||
      !this.person?.dob?.year
    ) {
      return null;
    }
    return `${this.person.dob.day}/${this.person.dob.month}/${this.person.dob.year}`;
  }

  GetPersonAddressLines(): string[] | null {
    return this.personService.FormatAddress(this.person);
  }

  GetExternalWalletsCount(): number {
    return this.account.external_accounts?.total_count ?? 0;
  }

  GetMetadataEntries(): { key: string; value: string }[] {
    if (
      !this.account.metadata ||
      Object.keys(this.account.metadata).length === 0
    ) {
      return [];
    }
    return Object.entries(this.account.metadata).map(([key, value]) => ({
      key,
      value: String(value),
    }));
  }

  CopyToClipboard(text: string): void {
    void navigator.clipboard.writeText(text);
  }
}
