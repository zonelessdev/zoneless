import { Injectable, inject, signal, WritableSignal } from '@angular/core';
import { ApiService } from '../../core';
import { PaymentIntent } from '@zoneless/shared-types';
import { UpdatePaymentIntentInput } from '@zoneless/shared-schemas';

@Injectable({
  providedIn: 'root',
})
export class PaymentIntentService {
  private readonly api = inject(ApiService);

  loading: WritableSignal<boolean> = signal(false);

  async GetPaymentIntent(
    paymentIntentId: string,
    expand: string[] = ['customer']
  ): Promise<PaymentIntent> {
    this.loading.set(true);
    try {
      const expandQuery =
        expand.length > 0 ? `?expand=${expand.join(',')}` : '';
      return await this.api.Call<PaymentIntent>(
        'GET',
        `payment_intents/${paymentIntentId}${expandQuery}`
      );
    } finally {
      this.loading.set(false);
    }
  }

  async UpdatePaymentIntent(
    paymentIntentId: string,
    data: UpdatePaymentIntentInput
  ): Promise<PaymentIntent> {
    this.loading.set(true);
    try {
      return await this.api.Call<PaymentIntent>(
        'POST',
        `payment_intents/${paymentIntentId}`,
        data
      );
    } finally {
      this.loading.set(false);
    }
  }

  async CancelPaymentIntent(
    paymentIntentId: string,
    cancellationReason?: string
  ): Promise<PaymentIntent> {
    this.loading.set(true);
    try {
      return await this.api.Call<PaymentIntent>(
        'POST',
        `payment_intents/${paymentIntentId}/cancel`,
        cancellationReason ? { cancellation_reason: cancellationReason } : {}
      );
    } finally {
      this.loading.set(false);
    }
  }
}
