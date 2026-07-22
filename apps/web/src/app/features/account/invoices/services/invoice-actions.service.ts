import { inject, Injectable, signal, WritableSignal } from '@angular/core';
import type { Invoice } from '@zoneless/shared-types';
import { Subject } from 'rxjs';
import { InvoiceService } from '../../../../data';

export type InvoiceActionEvent = {
  type: 'updated';
  invoice: Invoice;
};

@Injectable()
export class InvoiceActionsService {
  private readonly invoiceService = inject(InvoiceService);

  metadataDialogOpen: WritableSignal<boolean> = signal(false);
  metadataSaving: WritableSignal<boolean> = signal(false);
  metadataTarget: WritableSignal<Invoice | null> = signal(null);
  metadataDraft: WritableSignal<Record<string, string>> = signal({});

  readonly events$ = new Subject<InvoiceActionEvent>();

  OpenEditMetadata(invoice: Invoice): void {
    this.metadataTarget.set(invoice);
    this.metadataDraft.set({ ...(invoice.metadata ?? {}) });
    this.metadataDialogOpen.set(true);
  }

  OnMetadataChange(metadata: Record<string, string>): void {
    this.metadataDraft.set(metadata);
  }

  async ConfirmEditMetadata(): Promise<void> {
    const invoice = this.metadataTarget();
    if (!invoice) return;
    this.metadataSaving.set(true);
    try {
      const updated = await this.invoiceService.UpdateInvoice(invoice.id, {
        metadata: this.metadataDraft(),
      });
      this.events$.next({ type: 'updated', invoice: updated });
      this.metadataDialogOpen.set(false);
    } finally {
      this.metadataSaving.set(false);
    }
  }

  CopyInvoiceId(invoice: Invoice): void {
    void navigator.clipboard.writeText(invoice.id);
  }
}
