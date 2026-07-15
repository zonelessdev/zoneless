import { inject, Injectable, signal, WritableSignal } from '@angular/core';
import type { PaymentLink } from '@zoneless/shared-types';
import { Subject } from 'rxjs';
import { PaymentLinkService, PriceService } from '../../../../data';
import { CreatePaymentLinkInput } from '@zoneless/shared-schemas';

export type PaymentLinkActionEvent =
  | { type: 'created'; paymentLink: PaymentLink }
  | { type: 'updated'; paymentLink: PaymentLink }
  | { type: 'deactivated'; paymentLink: PaymentLink }
  | { type: 'activated'; paymentLink: PaymentLink };

export type PaymentLinkCreateFormPayload = {
  createInput: CreatePaymentLinkInput;
  /** When set, a custom-amount price is created before the payment link. */
  customAmount?: {
    name: string;
    preset: number;
    minimum: number;
    maximum: number;
  };
};

@Injectable()
export class PaymentLinkActionsService {
  private readonly paymentLinkService = inject(PaymentLinkService);
  private readonly priceService = inject(PriceService);

  flowOpen: WritableSignal<boolean> = signal(false);
  loading: WritableSignal<boolean> = signal(false);
  showErrors: WritableSignal<boolean> = signal(false);
  error: WritableSignal<string | null> = signal(null);

  deactivateDialogOpen = signal(false);
  deactivating = signal(false);
  paymentLinkToDeactivate = signal<PaymentLink | null>(null);

  activateDialogOpen = signal(false);
  activating = signal(false);
  paymentLinkToActivate = signal<PaymentLink | null>(null);

  metadataDialogOpen: WritableSignal<boolean> = signal(false);
  metadataSaving: WritableSignal<boolean> = signal(false);
  metadataTarget: WritableSignal<PaymentLink | null> = signal(null);
  metadataDraft: WritableSignal<Record<string, string>> = signal({});

  readonly events$ = new Subject<PaymentLinkActionEvent>();

  OpenCreate(): void {
    this.showErrors.set(false);
    this.error.set(null);
    this.flowOpen.set(true);
  }

  CloseFlow(): void {
    this.flowOpen.set(false);
    this.showErrors.set(false);
    this.error.set(null);
  }

  async Save(payload: PaymentLinkCreateFormPayload): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    try {
      let createInput = payload.createInput;

      if (payload.customAmount) {
        const price = await this.priceService.CreatePrice({
          currency: 'usdc',
          unit_amount: payload.customAmount.preset,
          custom_unit_amount: {
            enabled: true,
            preset: payload.customAmount.preset,
            minimum: payload.customAmount.minimum,
            maximum: payload.customAmount.maximum,
          },
          product_data: {
            name: payload.customAmount.name,
          },
        });
        const { line_items: _ignored, ...options } = createInput;
        createInput = {
          ...options,
          line_items: [{ price: price.id, quantity: 1 }],
        };
      }

      const paymentLink = await this.paymentLinkService.CreatePaymentLink(
        createInput
      );
      this.events$.next({ type: 'created', paymentLink });
      this.CloseFlow();
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : 'Failed to create payment link';
      this.error.set(message);
      console.error('Failed to create payment link:', error);
    } finally {
      this.loading.set(false);
    }
  }

  OpenDeactivate(paymentLink: PaymentLink): void {
    this.paymentLinkToDeactivate.set(paymentLink);
    this.deactivateDialogOpen.set(true);
  }

  async ConfirmDeactivate(): Promise<void> {
    const paymentLink = this.paymentLinkToDeactivate();
    if (!paymentLink) return;
    this.deactivating.set(true);
    try {
      const updated = await this.paymentLinkService.UpdatePaymentLink(
        paymentLink.id,
        { active: false }
      );
      this.events$.next({ type: 'deactivated', paymentLink: updated });
      this.deactivateDialogOpen.set(false);
      this.paymentLinkToDeactivate.set(null);
    } finally {
      this.deactivating.set(false);
    }
  }

  OpenActivate(paymentLink: PaymentLink): void {
    this.paymentLinkToActivate.set(paymentLink);
    this.activateDialogOpen.set(true);
  }

  async ConfirmActivate(): Promise<void> {
    const paymentLink = this.paymentLinkToActivate();
    if (!paymentLink) return;
    this.activating.set(true);
    try {
      const updated = await this.paymentLinkService.UpdatePaymentLink(
        paymentLink.id,
        { active: true }
      );
      this.events$.next({ type: 'activated', paymentLink: updated });
      this.activateDialogOpen.set(false);
      this.paymentLinkToActivate.set(null);
    } finally {
      this.activating.set(false);
    }
  }

  OpenEditMetadata(paymentLink: PaymentLink): void {
    this.metadataTarget.set(paymentLink);
    this.metadataDraft.set({ ...(paymentLink.metadata ?? {}) });
    this.metadataDialogOpen.set(true);
  }

  OnMetadataChange(metadata: Record<string, string>): void {
    this.metadataDraft.set(metadata);
  }

  async ConfirmEditMetadata(): Promise<void> {
    const paymentLink = this.metadataTarget();
    if (!paymentLink) return;
    this.metadataSaving.set(true);
    try {
      const updated = await this.paymentLinkService.UpdatePaymentLink(
        paymentLink.id,
        { metadata: this.metadataDraft() }
      );
      this.events$.next({ type: 'updated', paymentLink: updated });
      this.metadataDialogOpen.set(false);
    } finally {
      this.metadataSaving.set(false);
    }
  }
}
