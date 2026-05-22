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
import { PriceFormComponent } from '../price-form/price-form.component';
import { MetadataEditModalComponent } from '../../../components';

import { PriceActionsService } from '../../services/price-actions.service';

@Component({
  selector: 'app-price-actions-host',
  imports: [
    SlidePanelComponent,
    PriceFormComponent,
    ConfirmDialogComponent,
    MetadataEditModalComponent,
  ],
  templateUrl: './price-actions-host.component.html',
  styleUrl: './price-actions-host.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PriceActionsHostComponent {
  readonly actions = inject(PriceActionsService);
  @ViewChild('priceForm') priceForm!: PriceFormComponent;

  GetPanelTitle(): string {
    return this.actions.panelMode() === 'create'
      ? 'Add a price'
      : 'Update a price';
  }

  async OnSubmit(): Promise<void> {
    if (!this.priceForm) return;
    this.actions.panelShowErrors.set(true);
    if (!this.priceForm.ValidateAll()) return;
    const data =
      this.actions.panelMode() === 'create'
        ? this.priceForm.CreatePriceFormData()
        : this.priceForm.UpdatePriceFormData();
    try {
      await this.actions.Save(data);
    } catch (error) {
      console.error('Failed to save price:', error);
    }
  }

  OnValidationChange(isValid: boolean): void {
    this.actions.panelShowErrors.set(isValid);
  }
}
