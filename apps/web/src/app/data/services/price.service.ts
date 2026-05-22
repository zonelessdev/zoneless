import { Injectable, inject, signal, WritableSignal } from '@angular/core';
import { ApiService } from '../../core';
import { Price } from '@zoneless/shared-types';
import { CreatePriceInput, UpdatePriceInput } from '@zoneless/shared-schemas';

@Injectable({
  providedIn: 'root',
})
export class PriceService {
  private readonly api = inject(ApiService);

  loading: WritableSignal<boolean> = signal(false);

  async CreatePrice(data: CreatePriceInput): Promise<Price> {
    this.loading.set(true);
    try {
      const price = await this.api.Call<Price>('POST', `prices`, data);
      return price;
    } finally {
      this.loading.set(false);
    }
  }

  async UpdatePrice(priceId: string, data: UpdatePriceInput): Promise<Price> {
    this.loading.set(true);
    data.expand = ['default_price'];
    try {
      const price = await this.api.Call<Price>(
        'POST',
        `prices/${priceId}`,
        data
      );
      return price;
    } finally {
      this.loading.set(false);
    }
  }

  async DeletePrice(priceId: string): Promise<void> {
    this.loading.set(true);
    try {
      await this.api.Call<void>('DELETE', `prices/${priceId}`);
    } finally {
      this.loading.set(false);
    }
  }

  async GetPrice(priceId: string): Promise<Price> {
    this.loading.set(true);
    try {
      const price = await this.api.Call<Price>(
        'GET',
        `prices/${priceId}?expand=product`
      );
      return price;
    } finally {
      this.loading.set(false);
    }
  }
}
