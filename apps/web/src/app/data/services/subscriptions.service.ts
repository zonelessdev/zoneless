import { Injectable, inject, signal, WritableSignal } from '@angular/core';
import { ApiService } from '../../core';

@Injectable({
  providedIn: 'root',
})
export class SubscriptionsService {
  private readonly api = inject(ApiService);

  async CreateSubscription(
    subscriberPublicKey: string,
    amount: number,
    periodSeconds: number
  ): Promise<any> {
    return await this.api.Call<any>('POST', 'subscriptions', {
      subscriberPublicKey: subscriberPublicKey,
      amount: amount,
      periodSeconds: periodSeconds,
    });
  }

  async GetSubscription(subscriberPublicKey: string): Promise<any> {
    return await this.api.Call<any>(
      'GET',
      `subscriptions/${subscriberPublicKey}`
    );
  }

  async CancelSubscription(subscriberPublicKey: string): Promise<any> {
    return await this.api.Call<any>('POST', 'subscriptions/cancel', {
      subscriberPublicKey: subscriberPublicKey,
    });
  }

  async ChargeSubscription(
    subscriberPublicKey: string,
    feePayerPublicKey: string
  ): Promise<any> {
    return await this.api.Call<any>('POST', 'subscriptions/charge', {
      subscriberPublicKey: subscriberPublicKey,
      feePayerPublicKey: feePayerPublicKey,
    });
  }

  async GetSubscriptionDebugInfo(subscriberPublicKey: string): Promise<any> {
    return await this.api.Call<any>(
      'GET',
      `subscriptions/${subscriberPublicKey}/debug`
    );
  }
}
