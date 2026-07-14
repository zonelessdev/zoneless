import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ISO_CODES } from '../../../../../utils';
import {
  BusinessType,
  ConnectedAccountActionsService,
} from '../../services/connected-account-actions.service';

@Component({
  selector: 'app-create-connected-account-details-form',
  standalone: true,
  imports: [FormsModule],
  templateUrl: './create-connected-account-details-form.component.html',
  styleUrl: './create-connected-account-details-form.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CreateConnectedAccountDetailsFormComponent {
  readonly actions = inject(ConnectedAccountActionsService);
  readonly ISO_CODES = ISO_CODES;

  readonly BUSINESS_TYPES: { value: BusinessType; label: string }[] = [
    { value: 'individual', label: 'Individual' },
    { value: 'company', label: 'Company' },
    { value: 'non_profit', label: 'Non-profit' },
    { value: 'government_entity', label: 'Government entity' },
  ];

  OnCountryChange(country: string): void {
    this.actions.draftCountry.set(country);
  }

  OnBusinessTypeChange(businessType: BusinessType): void {
    this.actions.draftBusinessType.set(businessType);
  }

  OnTransfersChange(requested: boolean): void {
    this.actions.draftTransfersRequested.set(requested);
  }

  DeselectAllCapabilities(): void {
    this.actions.draftTransfersRequested.set(false);
  }
}
