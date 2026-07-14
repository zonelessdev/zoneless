import { Injectable, inject, signal, WritableSignal } from '@angular/core';
import { ApiService } from '../../core';
import {
  CheckoutSessionLineItemList,
  PaymentLink,
} from '@zoneless/shared-types';
import {
  CreatePaymentLinkInput,
  UpdatePaymentLinkInput,
} from '@zoneless/shared-schemas';

@Injectable({
  providedIn: 'root',
})
export class PaymentLinkService {
  private readonly api = inject(ApiService);

  loading: WritableSignal<boolean> = signal(false);

  async CreatePaymentLink(data: CreatePaymentLinkInput): Promise<PaymentLink> {
    this.loading.set(true);
    try {
      return await this.api.Call<PaymentLink>('POST', `payment_links`, data);
    } finally {
      this.loading.set(false);
    }
  }

  async UpdatePaymentLink(
    paymentLinkId: string,
    data: UpdatePaymentLinkInput
  ): Promise<PaymentLink> {
    this.loading.set(true);
    try {
      return await this.api.Call<PaymentLink>(
        'POST',
        `payment_links/${paymentLinkId}`,
        data
      );
    } finally {
      this.loading.set(false);
    }
  }

  async GetPaymentLink(paymentLinkId: string): Promise<PaymentLink> {
    this.loading.set(true);
    try {
      return await this.api.Call<PaymentLink>(
        'GET',
        `payment_links/${paymentLinkId}`
      );
    } finally {
      this.loading.set(false);
    }
  }

  async ListLineItems(
    paymentLinkId: string
  ): Promise<CheckoutSessionLineItemList> {
    this.loading.set(true);
    try {
      return await this.api.Call<CheckoutSessionLineItemList>(
        'GET',
        `payment_links/${paymentLinkId}/line_items`
      );
    } finally {
      this.loading.set(false);
    }
  }
}
