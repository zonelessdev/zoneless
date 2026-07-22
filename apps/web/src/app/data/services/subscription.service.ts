import { Injectable, inject, signal, WritableSignal } from '@angular/core';
import { ApiService } from '../../core';
import { Subscription } from '@zoneless/shared-types';
import {
  CancelSubscriptionInput,
  CreateSubscriptionInput,
  ResumeSubscriptionInput,
  UpdateSubscriptionInput,
} from '@zoneless/shared-schemas';

@Injectable({
  providedIn: 'root',
})
export class SubscriptionService {
  private readonly api = inject(ApiService);

  loading: WritableSignal<boolean> = signal(false);

  async CreateSubscription(
    data: CreateSubscriptionInput
  ): Promise<Subscription> {
    this.loading.set(true);
    try {
      return await this.api.Call<Subscription>('POST', `subscriptions`, data);
    } finally {
      this.loading.set(false);
    }
  }

  async GetSubscription(
    subscriptionId: string,
    expand: string[] = ['customer']
  ): Promise<Subscription> {
    this.loading.set(true);
    try {
      const expandQuery =
        expand.length > 0 ? `?expand=${expand.join(',')}` : '';
      return await this.api.Call<Subscription>(
        'GET',
        `subscriptions/${subscriptionId}${expandQuery}`
      );
    } finally {
      this.loading.set(false);
    }
  }

  async UpdateSubscription(
    subscriptionId: string,
    data: UpdateSubscriptionInput
  ): Promise<Subscription> {
    this.loading.set(true);
    try {
      return await this.api.Call<Subscription>(
        'POST',
        `subscriptions/${subscriptionId}`,
        data
      );
    } finally {
      this.loading.set(false);
    }
  }

  async CancelSubscription(
    subscriptionId: string,
    data: CancelSubscriptionInput = {}
  ): Promise<Subscription> {
    this.loading.set(true);
    try {
      return await this.api.Call<Subscription>(
        'DELETE',
        `subscriptions/${subscriptionId}`,
        data
      );
    } finally {
      this.loading.set(false);
    }
  }

  async ResumeSubscription(
    subscriptionId: string,
    data: ResumeSubscriptionInput = {}
  ): Promise<Subscription> {
    this.loading.set(true);
    try {
      return await this.api.Call<Subscription>(
        'POST',
        `subscriptions/${subscriptionId}/resume`,
        data
      );
    } finally {
      this.loading.set(false);
    }
  }
}
