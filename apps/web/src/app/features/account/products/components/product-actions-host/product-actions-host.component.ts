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
import { ProductFormComponent } from '../product-form/product-form.component';
import { MetadataEditModalComponent } from '../../../components';

import { ProductActionsService } from '../../services/product-actions.service';

@Component({
  selector: 'app-product-actions-host',
  imports: [
    SlidePanelComponent,
    ProductFormComponent,
    ConfirmDialogComponent,
    MetadataEditModalComponent,
  ],
  templateUrl: './product-actions-host.component.html',
  styleUrl: './product-actions-host.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProductActionsHostComponent {
  readonly actions = inject(ProductActionsService);
  @ViewChild('productForm') productForm!: ProductFormComponent;

  GetPanelTitle(): string {
    return this.actions.panelMode() === 'create'
      ? 'Add a product'
      : 'Update a product';
  }

  async OnSubmit(): Promise<void> {
    if (!this.productForm) return;
    this.actions.panelShowErrors.set(true);
    if (!this.productForm.ValidateAll()) return;
    const data =
      this.actions.panelMode() === 'create'
        ? this.productForm.CreateProductFormData()
        : this.productForm.UpdateProductFormData();
    try {
      await this.actions.Save(data);
    } catch (error) {
      console.error('Failed to save product:', error);
    }
  }

  OnValidationChange(isValid: boolean): void {
    this.actions.panelShowErrors.set(isValid);
  }
}
