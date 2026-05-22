import { inject, Injectable, signal, WritableSignal } from '@angular/core';
import type { Product, Price } from '@zoneless/shared-types';
import { Subject } from 'rxjs';
import { Router } from '@angular/router';
import { ProductService } from '../../../../data';
import {
  CreateProductInput,
  UpdateProductInput,
} from '@zoneless/shared-schemas';

export type ProductActionEvent =
  | { type: 'created'; product: Product }
  | { type: 'updated'; product: Product }
  | { type: 'archived'; product: Product }
  | { type: 'unarchived'; product: Product }
  | { type: 'deleted'; productId: string };

@Injectable()
export class ProductActionsService {
  private readonly productService = inject(ProductService);
  private readonly router = inject(Router);

  // Edit/create panel state
  panelOpen: WritableSignal<boolean> = signal(false);
  panelMode: WritableSignal<'create' | 'edit'> = signal('create');
  panelLoading: WritableSignal<boolean> = signal(false);
  panelShowErrors: WritableSignal<boolean> = signal(false);
  productToEdit: WritableSignal<Product | null> = signal(null);

  // Archive dialog state
  archiveDialogOpen = signal(false);
  archiving = signal(false);
  productToArchive = signal<Product | null>(null);

  // Unarchive dialog state
  unarchiveDialogOpen = signal(false);
  unarchiving = signal(false);
  productToUnarchive = signal<Product | null>(null);

  // Delete dialog state
  deleteDialogOpen = signal(false);
  deleting = signal(false);
  productToDelete = signal<Product | null>(null);

  // Metadata dialog state
  metadataDialogOpen: WritableSignal<boolean> = signal(false);
  metadataSaving: WritableSignal<boolean> = signal(false);
  metadataTarget: WritableSignal<Product | null> = signal(null);
  metadataDraft: WritableSignal<Record<string, string>> = signal({});

  /** Listen to this in catalogue (to reload list) or detail (to refetch / navigate away). */
  readonly events$ = new Subject<ProductActionEvent>();

  CreateEvent(event: ProductActionEvent): void {
    this.events$.next(event);
  }

  OpenCreate(): void {
    this.panelMode.set('create');
    this.productToEdit.set(null);
    this.panelShowErrors.set(false);
    this.panelOpen.set(true);
  }

  OpenEdit(product: Product): void {
    this.panelMode.set('edit');
    this.productToEdit.set(product);
    this.panelShowErrors.set(false);
    this.panelOpen.set(true);
  }

  ClosePanel(): void {
    this.panelOpen.set(false);
    this.productToEdit.set(null);
    this.panelShowErrors.set(false);
  }

  async Save(data: CreateProductInput | UpdateProductInput): Promise<void> {
    this.panelLoading.set(true);
    try {
      if (this.panelMode() === 'create') {
        const product = await this.productService.CreateProduct(
          data as CreateProductInput
        );
        this.CreateEvent({ type: 'created', product });
      } else if (this.panelMode() === 'edit') {
        const productToEdit = this.productToEdit();
        if (productToEdit) {
          const product = await this.productService.UpdateProduct(
            productToEdit.id,
            data as UpdateProductInput
          );
          this.CreateEvent({ type: 'updated', product });
        }
      }
      this.ClosePanel();
    } catch (error) {
      console.error('Failed to create product:', error);
    } finally {
      this.panelLoading.set(false);
    }
  }

  OpenArchive(product: Product): void {
    this.productToArchive.set(product);
    this.archiveDialogOpen.set(true);
  }

  async ConfirmArchive(): Promise<void> {
    const product = this.productToArchive();
    if (!product) return;
    this.archiving.set(true);
    try {
      const updatedProduct = await this.productService.UpdateProduct(
        product.id,
        { active: false }
      );
      this.CreateEvent({ type: 'archived', product: updatedProduct });
      this.archiveDialogOpen.set(false);
      this.productToArchive.set(null);
    } finally {
      this.archiving.set(false);
    }
  }

  OpenUnarchive(product: Product): void {
    this.productToUnarchive.set(product);
    this.unarchiveDialogOpen.set(true);
  }

  async ConfirmUnarchive(): Promise<void> {
    const product = this.productToUnarchive();
    if (!product) return;
    this.unarchiving.set(true);
    try {
      const updatedProduct = await this.productService.UpdateProduct(
        product.id,
        { active: true }
      );
      this.CreateEvent({ type: 'unarchived', product: updatedProduct });
      this.unarchiveDialogOpen.set(false);
      this.productToUnarchive.set(null);
    } finally {
      this.unarchiving.set(false);
    }
  }

  OpenDelete(product: Product): void {
    this.productToDelete.set(product);
    this.deleteDialogOpen.set(true);
  }

  async ConfirmDelete(): Promise<void> {
    const product = this.productToDelete();
    if (!product) return;
    this.deleting.set(true);
    try {
      await this.productService.DeleteProduct(product.id);
      this.CreateEvent({ type: 'deleted', productId: product.id });
      this.deleteDialogOpen.set(false);
      this.productToDelete.set(null);
    } finally {
      this.deleting.set(false);
    }
  }

  async SetDefaultPrice(price: Price): Promise<void> {
    const product = await this.productService.UpdateProduct(price.product, {
      default_price: price.id,
    });
    this.CreateEvent({ type: 'updated', product: product });
  }

  OpenEditMetadata(product: Product): void {
    this.metadataTarget.set(product);
    this.metadataDraft.set({ ...(product.metadata ?? {}) });
    this.metadataDialogOpen.set(true);
  }

  OnMetadataChange(metadata: Record<string, string>): void {
    this.metadataDraft.set(metadata);
  }

  async ConfirmEditMetadata(): Promise<void> {
    const product = this.metadataTarget();
    if (!product) return;
    this.metadataSaving.set(true);
    try {
      const updated = await this.productService.UpdateProduct(product.id, {
        metadata: this.metadataDraft(),
      });
      this.CreateEvent({ type: 'updated', product: updated });
      this.metadataDialogOpen.set(false);
    } finally {
      this.metadataSaving.set(false);
    }
  }
}
