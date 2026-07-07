import { inject, Injectable, signal, WritableSignal } from '@angular/core';
import type { Customer } from '@zoneless/shared-types';
import { Subject } from 'rxjs';
import { Router } from '@angular/router';
import { CustomerService } from '../../../../data';
import {
  CreateCustomerInput,
  UpdateCustomerInput,
} from '@zoneless/shared-schemas';

export type CustomerActionEvent =
  | { type: 'created'; customer: Customer }
  | { type: 'updated'; customer: Customer }
  | { type: 'archived'; customer: Customer }
  | { type: 'unarchived'; customer: Customer }
  | { type: 'deleted'; customerId: string };

@Injectable()
export class CustomerActionsService {
  private readonly customerService = inject(CustomerService);
  private readonly router = inject(Router);

  // Edit/create panel state
  panelOpen: WritableSignal<boolean> = signal(false);
  panelMode: WritableSignal<'create' | 'edit'> = signal('create');
  panelLoading: WritableSignal<boolean> = signal(false);
  panelShowErrors: WritableSignal<boolean> = signal(false);
  customerToEdit: WritableSignal<Customer | null> = signal(null);

  // Archive dialog state
  archiveDialogOpen = signal(false);
  archiving = signal(false);
  customerToArchive = signal<Customer | null>(null);

  // Unarchive dialog state
  unarchiveDialogOpen = signal(false);
  unarchiving = signal(false);
  customerToUnarchive = signal<Customer | null>(null);

  // Delete dialog state
  deleteDialogOpen = signal(false);
  deleting = signal(false);
  customerToDelete = signal<Customer | null>(null);

  // Metadata dialog state
  metadataDialogOpen: WritableSignal<boolean> = signal(false);
  metadataSaving: WritableSignal<boolean> = signal(false);
  metadataTarget: WritableSignal<Customer | null> = signal(null);
  metadataDraft: WritableSignal<Record<string, string>> = signal({});

  /** Listen to this in catalogue (to reload list) or detail (to refetch / navigate away). */
  readonly events$ = new Subject<CustomerActionEvent>();

  CreateEvent(event: CustomerActionEvent): void {
    this.events$.next(event);
  }

  OpenCreate(productId?: string): void {
    this.panelMode.set('create');
    this.customerToEdit.set(null);
    this.panelShowErrors.set(false);
    this.panelOpen.set(true);
  }

  OpenEdit(customer: Customer): void {
    this.panelMode.set('edit');
    this.customerToEdit.set(customer);
    this.panelShowErrors.set(false);
    this.panelOpen.set(true);
  }

  ClosePanel(): void {
    this.panelOpen.set(false);
    this.customerToEdit.set(null);
    this.panelShowErrors.set(false);
  }

  async Save(data: CreateCustomerInput | UpdateCustomerInput): Promise<void> {
    this.panelLoading.set(true);
    try {
      if (this.panelMode() === 'create') {
        const createData = data as CreateCustomerInput;
        const customer = await this.customerService.CreateCustomer(createData);
        this.CreateEvent({ type: 'created', customer });
      } else if (this.panelMode() === 'edit') {
        const customerToEdit = this.customerToEdit();
        if (customerToEdit) {
          const customer = await this.customerService.UpdateCustomer(
            customerToEdit.id,
            data as UpdateCustomerInput
          );
          this.CreateEvent({ type: 'updated', customer });
        }
      }
      this.ClosePanel();
    } catch (error) {
      console.error('Failed to create customer:', error);
    } finally {
      this.panelLoading.set(false);
    }
  }

  OpenDelete(customer: Customer): void {
    this.customerToDelete.set(customer);
    this.deleteDialogOpen.set(true);
  }

  async ConfirmDelete(): Promise<void> {
    const customer = this.customerToDelete();
    if (!customer) return;
    this.deleting.set(true);
    try {
      await this.customerService.DeleteCustomer(customer.id);
      this.CreateEvent({ type: 'deleted', customerId: customer.id });
      this.deleteDialogOpen.set(false);
      this.customerToDelete.set(null);
    } finally {
      this.deleting.set(false);
    }
  }

  CopyCustomerId(customer: Customer): void {
    navigator.clipboard.writeText(customer.id);
  }

  OpenEditMetadata(customer: Customer): void {
    this.metadataTarget.set(customer);
    this.metadataDraft.set({ ...(customer.metadata ?? {}) });
    this.metadataDialogOpen.set(true);
  }

  OnMetadataChange(metadata: Record<string, string>): void {
    this.metadataDraft.set(metadata);
  }

  async ConfirmEditMetadata(): Promise<void> {
    const customer = this.metadataTarget();
    if (!customer) return;
    this.metadataSaving.set(true);
    try {
      const updated = await this.customerService.UpdateCustomer(customer.id, {
        metadata: this.metadataDraft(),
      });
      this.CreateEvent({ type: 'updated', customer: updated });
      this.metadataDialogOpen.set(false);
    } finally {
      this.metadataSaving.set(false);
    }
  }
}
