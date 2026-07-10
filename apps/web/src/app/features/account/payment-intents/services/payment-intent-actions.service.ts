import { inject, Injectable, signal, WritableSignal } from '@angular/core';
import type { PaymentIntent } from '@zoneless/shared-types';
import { Subject } from 'rxjs';
import { PaymentIntentService } from '../../../../data';

export type PaymentIntentActionEvent = {
  type: 'updated';
  paymentIntent: PaymentIntent;
};

@Injectable()
export class PaymentIntentActionsService {
  private readonly paymentIntentService = inject(PaymentIntentService);

  metadataDialogOpen: WritableSignal<boolean> = signal(false);
  metadataSaving: WritableSignal<boolean> = signal(false);
  metadataTarget: WritableSignal<PaymentIntent | null> = signal(null);
  metadataDraft: WritableSignal<Record<string, string>> = signal({});

  readonly events$ = new Subject<PaymentIntentActionEvent>();

  OpenEditMetadata(paymentIntent: PaymentIntent): void {
    this.metadataTarget.set(paymentIntent);
    this.metadataDraft.set({ ...(paymentIntent.metadata ?? {}) });
    this.metadataDialogOpen.set(true);
  }

  OnMetadataChange(metadata: Record<string, string>): void {
    this.metadataDraft.set(metadata);
  }

  async ConfirmEditMetadata(): Promise<void> {
    const paymentIntent = this.metadataTarget();
    if (!paymentIntent) return;
    this.metadataSaving.set(true);
    try {
      const updated = await this.paymentIntentService.UpdatePaymentIntent(
        paymentIntent.id,
        { metadata: this.metadataDraft() }
      );
      this.events$.next({ type: 'updated', paymentIntent: updated });
      this.metadataDialogOpen.set(false);
    } finally {
      this.metadataSaving.set(false);
    }
  }
}
