import { Injectable, inject, signal, WritableSignal } from '@angular/core';
import { ApiService } from '../../core';
import { Product } from '@zoneless/shared-types';

//TODO: Use the shared schema for this, or switch to node SDK.
export interface CreateProductInput {
  name: string;
  description: string;
  default_price_data?: {
    currency: 'usdc';
    recurring: {
      interval: 'day' | 'week' | 'month' | 'year' | null;
    } | null;
    unit_amount: number;
  };
  images?: string[];
}

export interface UpdateProductInput {
  active?: boolean;
  name?: string;
  description?: string;
  images?: string[];
}

@Injectable({
  providedIn: 'root',
})
export class ProductService {
  private readonly api = inject(ApiService);

  loading: WritableSignal<boolean> = signal(false);

  async CreateProduct(data: CreateProductInput): Promise<Product> {
    this.loading.set(true);
    try {
      const product = await this.api.Call<Product>('POST', `products`, data);
      return product;
    } finally {
      this.loading.set(false);
    }
  }

  async UpdateProduct(
    productId: string,
    data: UpdateProductInput
  ): Promise<Product> {
    this.loading.set(true);
    try {
      const product = await this.api.Call<Product>(
        'POST',
        `products/${productId}`,
        data
      );
      return product;
    } finally {
      this.loading.set(false);
    }
  }

  async DeleteProduct(productId: string): Promise<void> {
    this.loading.set(true);
    try {
      await this.api.Call<void>('DELETE', `products/${productId}`);
    } finally {
      this.loading.set(false);
    }
  }
}
