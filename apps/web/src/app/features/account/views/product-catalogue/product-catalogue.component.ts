import {
  ChangeDetectionStrategy,
  Component,
  WritableSignal,
  signal,
  ViewChild,
  inject,
} from '@angular/core';
import {
  PaginatedListComponent,
  SlidePanelComponent,
  PaginatedListColumn,
  ProductFormComponent,
  ConfirmDialogComponent,
} from '../../../../shared';
import type { Product, Price } from '@zoneless/shared-types';

import { ProductService } from '../../../../data';

@Component({
  selector: 'app-product-catalogue',
  imports: [
    PaginatedListComponent,
    SlidePanelComponent,
    ProductFormComponent,
    ConfirmDialogComponent,
  ],
  templateUrl: './product-catalogue.component.html',
  styleUrl: './product-catalogue.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProductCatalogueComponent {
  readonly productService = inject(ProductService);
  @ViewChild('productForm') productForm!: ProductFormComponent;
  @ViewChild('productsList') productsList?: PaginatedListComponent<any>;

  productsTab: WritableSignal<'all'> = signal('all');
  productsActiveTab: WritableSignal<'all' | 'active' | 'archived'> =
    signal('active');
  productPanelOpen: WritableSignal<boolean> = signal(false);
  productLoading: WritableSignal<boolean> = signal(false);
  productShowErrors: WritableSignal<boolean> = signal(false);

  productFormMode: WritableSignal<'create' | 'edit'> = signal('create');
  productToEdit: WritableSignal<Product | null> = signal(null);

  archiveDialogOpen = signal(false);
  archiving = signal(false);
  productToArchive = signal<Product | null>(null);

  unarchiveDialogOpen = signal(false);
  unarchiving = signal(false);
  productToUnarchive = signal<Product | null>(null);

  deleteDialogOpen = signal(false);
  deleting = signal(false);
  productToDelete = signal<Product | null>(null);

  productColumns: PaginatedListColumn[] = [
    {
      header: 'Name',
      field: 'name',
      type: 'text',
      bolded: true,
      imageField: 'images[0]',
      placeholderIcon: 'package_outline.svg',
    },
    {
      header: 'Pricing',
      field: 'default_price.unit_amount',
      type: 'text',
      formatter: (item: unknown) => {
        const product = item as Product;
        if (product.default_price === null) {
          return 'No prices';
        }
        const unitAmount = (product.default_price as Price)?.unit_amount ?? 0;
        if ((product.default_price as Price)?.recurring) {
          const recurringData = (product.default_price as Price)?.recurring;
          if (recurringData?.interval === 'day') {
            return `$${(unitAmount / 100).toFixed(2)} / day`;
          }
          if (recurringData?.interval === 'week') {
            return `$${(unitAmount / 100).toFixed(2)} / week`;
          }
          if (recurringData?.interval === 'month') {
            return `$${(unitAmount / 100).toFixed(2)} / month`;
          }
        }
        return `$${(unitAmount / 100).toFixed(2)}`;
      },
    },
    {
      header: 'Status',
      field: 'active',
      type: 'status',
      formatter: (item: unknown) => {
        const product = item as Product;
        return product.active ? 'active' : 'archived';
      },
    },
    {
      header: 'Created',
      field: 'created',
      type: 'date',
    },
    {
      header: 'Updated',
      field: 'updated',
      type: 'date',
    },
    {
      header: '',
      field: '',
      type: 'actions',
      actions: [
        {
          title: 'Edit product',
          action: (item: Product) => this.OnEditProductClick(item),
          disabled: (item: Product) => !item.active,
        },
        {
          title: 'Archive product',
          action: (item: Product) => this.OnArchiveProductClick(item),
          hidden: (item: Product) => !item.active,
        },
        {
          title: 'Unarchive product',
          action: (item: Product) => this.OnUnarchiveProductClick(item),
          hidden: (item: Product) => item.active,
        },
        {
          title: 'Delete product',
          action: (item: Product) => this.OnDeleteProductClick(item),
        },
      ],
    },
  ];
  productsQueryParams: WritableSignal<Record<string, string>> = signal({
    active: 'true',
  });
  productsExpand: WritableSignal<string[]> = signal(['default_price']);

  SetProductsTab(tab: 'all'): void {
    this.productsTab.set(tab);
  }

  SetProductsActiveTab(tab: 'all' | 'active' | 'archived'): void {
    switch (tab) {
      case 'all':
        this.productsQueryParams.set({});
        break;
      case 'active':
        this.productsQueryParams.set({ active: 'true' });
        break;
      case 'archived':
        this.productsQueryParams.set({ active: 'false' });
        break;
    }
    this.productsActiveTab.set(tab);
  }

  OnProductListClick(product: Product): void {
    //TODO: Navigate to dedicated product page.
    console.log(product);
  }

  OnEditProductClick(product: Product): void {
    this.productFormMode.set('edit');
    this.productToEdit.set(product);
    this.productPanelOpen.set(true);
  }

  OnCreateProductClick(): void {
    this.productFormMode.set('create');
    this.productToEdit.set(null);
    this.productPanelOpen.set(true);
  }

  OnProductPanelClosed(): void {
    this.productPanelOpen.set(false);
    this.productFormMode.set('create');
    this.productToEdit.set(null);
  }

  async OnProductSubmit(): Promise<void> {
    if (!this.productForm) return;

    this.productShowErrors.set(true);

    if (!this.productForm.ValidateAll()) {
      return;
    }

    this.productLoading.set(true);

    try {
      if (this.productFormMode() === 'create') {
        const data = this.productForm.CreateProductFormData();
        await this.productService.CreateProduct(data);
      } else if (this.productFormMode() === 'edit') {
        const productToEdit = this.productToEdit();
        if (productToEdit) {
          const data = this.productForm.UpdateProductFormData();
          await this.productService.UpdateProduct(productToEdit.id, data);
        }
      }
      this.productPanelOpen.set(false);
      this.productShowErrors.set(false);
      await this.productsList?.Reload();
    } catch (error) {
      console.error('Failed to create product:', error);
    } finally {
      this.productLoading.set(false);
    }
  }

  OnArchiveProductClick(product: Product): void {
    this.productToArchive.set(product);
    this.archiveDialogOpen.set(true);
  }

  async ConfirmArchive(): Promise<void> {
    const product = this.productToArchive();
    if (!product) return;
    this.archiving.set(true);
    try {
      await this.productService.UpdateProduct(product.id, { active: false });
      this.archiveDialogOpen.set(false);
      await this.productsList?.Reload();
    } finally {
      this.archiving.set(false);
    }
  }

  OnUnarchiveProductClick(product: Product): void {
    this.productToUnarchive.set(product);
    this.unarchiveDialogOpen.set(true);
  }

  async ConfirmUnarchive(): Promise<void> {
    const product = this.productToUnarchive();
    if (!product) return;
    this.unarchiving.set(true);
    try {
      await this.productService.UpdateProduct(product.id, { active: true });
      this.unarchiveDialogOpen.set(false);
      await this.productsList?.Reload();
    } finally {
      this.unarchiving.set(false);
    }
  }

  OnDeleteProductClick(product: Product): void {
    this.productToDelete.set(product);
    this.deleteDialogOpen.set(true);
  }

  async ConfirmDelete(): Promise<void> {
    const product = this.productToDelete();
    if (!product) return;
    this.deleting.set(true);
    try {
      await this.productService.DeleteProduct(product.id);
      this.deleteDialogOpen.set(false);
      await this.productsList?.Reload();
    } finally {
      this.deleting.set(false);
    }
  }

  OnProductValidationChange(isValid: boolean): void {
    this.productShowErrors.set(isValid);
  }
}
