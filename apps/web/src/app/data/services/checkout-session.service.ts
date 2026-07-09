import { Injectable, inject, signal, WritableSignal } from '@angular/core';
import { ApiService } from '../../core';
import { CheckoutSession } from '@zoneless/shared-types';
import {
  CreateCheckoutSessionInput,
  UpdateCheckoutSessionInput,
} from '@zoneless/shared-schemas';

@Injectable({
  providedIn: 'root',
})
export class CheckoutSessionService {
  private readonly api = inject(ApiService);

  loading: WritableSignal<boolean> = signal(false);

  async CreateCheckoutSession(data: CreateCheckoutSessionInput): Promise<CheckoutSession> {
    this.loading.set(true);
    try {
      const checkoutSession = await this.api.Call<CheckoutSession>('POST', `checkout/sessions`, data);
      return checkoutSession;
    } finally {
      this.loading.set(false);
    }
  }

  async UpdateCheckoutSession(
    checkoutSessionId: string,
    data: UpdateCheckoutSessionInput
  ): Promise<CheckoutSession> {
    this.loading.set(true);
    try {
      const checkoutSession = await this.api.Call<CheckoutSession>(
        'POST',
        `checkout/sessions/${checkoutSessionId}`,
        data
      );
      return checkoutSession;
    } finally {
      this.loading.set(false);
    }
  }

  async DeleteCheckoutSession(checkoutSessionId: string): Promise<void> {
    this.loading.set(true);
    try {
      await this.api.Call<void>('DELETE', `checkout/sessions/${checkoutSessionId}`);
    } finally {
      this.loading.set(false);
    }
  }

  async GetCheckoutSession(checkoutSessionId: string): Promise<CheckoutSession> {
    this.loading.set(true);
    try {
      const checkoutSession = await this.api.Call<CheckoutSession>(
        'GET',
        `checkout/sessions/${checkoutSessionId}`
      );
      return checkoutSession;
    } finally {
      this.loading.set(false);
    }
  }

  /**
   * Fetch a checkout session via the public payment pages endpoint.
   * Used by the hosted checkout page, which customers visit unauthenticated.
   */
  async GetPublicCheckoutSession(
    checkoutSessionId: string
  ): Promise<CheckoutSession> {
    this.loading.set(true);
    try {
      const checkoutSession = await this.api.Call<CheckoutSession>(
        'GET',
        `payment_pages/${checkoutSessionId}`
      );
      return checkoutSession;
    } finally {
      this.loading.set(false);
    }
  }
}
