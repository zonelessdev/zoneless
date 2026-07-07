import {
  ChangeDetectionStrategy,
  Component,
  inject,
  ViewChild,
} from '@angular/core';

import {
  SlidePanelComponent,
  ConfirmDialogComponent,
} from '../../../../../shared';
import { CustomerFormComponent } from '../customer-form/customer-form.component';
import { MetadataEditModalComponent } from '../../../components';

import { CustomerActionsService } from '../../services/customer-actions.service';

@Component({
  selector: 'app-customer-actions-host',
  imports: [
    SlidePanelComponent,
    CustomerFormComponent,
    ConfirmDialogComponent,
    MetadataEditModalComponent,
  ],
  templateUrl: './customer-actions-host.component.html',
  styleUrl: './customer-actions-host.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CustomerActionsHostComponent {
  readonly actions = inject(CustomerActionsService);
  @ViewChild('customerForm') customerForm!: CustomerFormComponent;

  GetPanelTitle(): string {
    return this.actions.panelMode() === 'create'
      ? 'Add a customer'
      : 'Update a customer';
  }

  async OnSubmit(): Promise<void> {
    if (!this.customerForm) return;
    this.actions.panelShowErrors.set(true);
    if (!this.customerForm.ValidateAll()) return;
    const data =
      this.actions.panelMode() === 'create'
        ? this.customerForm.CreateCustomerFormData()
        : this.customerForm.UpdateCustomerFormData();
    try {
      await this.actions.Save(data);
    } catch (error) {
      console.error('Failed to save customer:', error);
    }
  }

  OnValidationChange(isValid: boolean): void {
    this.actions.panelShowErrors.set(isValid);
  }
}
