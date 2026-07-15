import { inject, Injectable, signal, WritableSignal } from '@angular/core';
import type { PaymentLink } from '@zoneless/shared-types';
import { Subject } from 'rxjs';
import { PaymentLinkService, PriceService } from '../../../../data';
import { CreatePaymentLinkInput } from '@zoneless/shared-schemas';

export type PaymentLinkActionEvent = {
  type: 'created';
  paymentLink: PaymentLink;
};

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
}
