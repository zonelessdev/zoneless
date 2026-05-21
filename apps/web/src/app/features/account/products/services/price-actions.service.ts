import { inject, Injectable, signal, WritableSignal } from '@angular/core';
import type { Price } from '@zoneless/shared-types';
import { Subject } from 'rxjs';
import { Router } from '@angular/router';
import { PriceService } from '../../../../data';
import { CreatePriceInput, UpdatePriceInput } from '@zoneless/shared-schemas';

export type PriceActionEvent =
  | { type: 'created'; price: Price }
  | { type: 'updated'; price: Price }
  | { type: 'archived'; price: Price }
  | { type: 'unarchived'; price: Price }
  | { type: 'deleted'; priceId: string };

@Injectable()
export class PriceActionsService {
  private readonly priceService = inject(PriceService);
  private readonly router = inject(Router);

  // Edit/create panel state
  panelOpen: WritableSignal<boolean> = signal(false);
  panelMode: WritableSignal<'create' | 'edit'> = signal('create');
  panelLoading: WritableSignal<boolean> = signal(false);
  panelShowErrors: WritableSignal<boolean> = signal(false);
  priceToEdit: WritableSignal<Price | null> = signal(null);

  // Archive dialog state
  archiveDialogOpen = signal(false);
  archiving = signal(false);
  priceToArchive = signal<Price | null>(null);

  // Unarchive dialog state
  unarchiveDialogOpen = signal(false);
  unarchiving = signal(false);
  priceToUnarchive = signal<Price | null>(null);

  // Delete dialog state
  deleteDialogOpen = signal(false);
  deleting = signal(false);
  priceToDelete = signal<Price | null>(null);

  productId: WritableSignal<string | null> = signal(null);

  /** Listen to this in catalogue (to reload list) or detail (to refetch / navigate away). */
  readonly events$ = new Subject<PriceActionEvent>();

  CreateEvent(event: PriceActionEvent): void {
    this.events$.next(event);
  }

  OpenCreate(productId?: string): void {
    this.productId.set(productId ?? null);
    this.panelMode.set('create');
    this.priceToEdit.set(null);
    this.panelShowErrors.set(false);
    this.panelOpen.set(true);
  }

  OpenEdit(price: Price): void {
    this.panelMode.set('edit');
    this.priceToEdit.set(price);
    this.panelShowErrors.set(false);
    this.panelOpen.set(true);
  }

  ClosePanel(): void {
    this.panelOpen.set(false);
    this.priceToEdit.set(null);
    this.panelShowErrors.set(false);
  }

  async Save(data: CreatePriceInput | UpdatePriceInput): Promise<void> {
    this.panelLoading.set(true);
    try {
      if (this.panelMode() === 'create') {
        const createData = data as CreatePriceInput;
        const productId = this.productId();
        if (productId) {
          createData.product = productId;
        }
        const price = await this.priceService.CreatePrice(createData);
        this.CreateEvent({ type: 'created', price });
      } else if (this.panelMode() === 'edit') {
        const priceToEdit = this.priceToEdit();
        if (priceToEdit) {
          const price = await this.priceService.UpdatePrice(
            priceToEdit.id,
            data as UpdatePriceInput
          );
          this.CreateEvent({ type: 'updated', price });
        }
      }
      this.ClosePanel();
    } catch (error) {
      console.error('Failed to create price:', error);
    } finally {
      this.panelLoading.set(false);
    }
  }

  OpenArchive(price: Price): void {
    this.priceToArchive.set(price);
    this.archiveDialogOpen.set(true);
  }

  async ConfirmArchive(): Promise<void> {
    const price = this.priceToArchive();
    if (!price) return;
    this.archiving.set(true);
    try {
      const updatedPrice = await this.priceService.UpdatePrice(price.id, {
        active: false,
      });
      this.CreateEvent({ type: 'archived', price: updatedPrice });
      this.archiveDialogOpen.set(false);
      this.priceToArchive.set(null);
    } finally {
      this.archiving.set(false);
    }
  }

  OpenUnarchive(price: Price): void {
    this.priceToUnarchive.set(price);
    this.unarchiveDialogOpen.set(true);
  }

  async ConfirmUnarchive(): Promise<void> {
    const price = this.priceToUnarchive();
    if (!price) return;
    this.unarchiving.set(true);
    try {
      const updatedPrice = await this.priceService.UpdatePrice(price.id, {
        active: true,
      });
      this.CreateEvent({ type: 'unarchived', price: updatedPrice });
      this.unarchiveDialogOpen.set(false);
      this.priceToUnarchive.set(null);
    } finally {
      this.unarchiving.set(false);
    }
  }

  OpenDelete(price: Price): void {
    this.priceToDelete.set(price);
    this.deleteDialogOpen.set(true);
  }

  async ConfirmDelete(): Promise<void> {
    const price = this.priceToDelete();
    if (!price) return;
    this.deleting.set(true);
    try {
      await this.priceService.DeletePrice(price.id);
      this.CreateEvent({ type: 'deleted', priceId: price.id });
      this.deleteDialogOpen.set(false);
      this.priceToDelete.set(null);
    } finally {
      this.deleting.set(false);
    }
  }

  CopyPriceId(price: Price): void {
    navigator.clipboard.writeText(price.id);
  }
}
