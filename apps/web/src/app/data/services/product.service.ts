import { Injectable, inject, signal, WritableSignal } from '@angular/core';
import { ApiService } from '../../core';
import { ListResponse, Product } from '@zoneless/shared-types';
import {
  CreateProductInput,
  UpdateProductInput,
} from '@zoneless/shared-schemas';

@Injectable({
  providedIn: 'root',
})
export class ProductService {
  private readonly api = inject(ApiService);

  loading: WritableSignal<boolean> = signal(false);

  async ListProducts(
    params: {
      active?: boolean;
      limit?: number;
      expand?: string[];
    } = {}
  ): Promise<ListResponse<Product>> {
    let endpoint = 'products?';
    const parts: string[] = [];
    if (params.limit !== undefined) {
      parts.push(`limit=${params.limit}`);
    }
    if (params.active !== undefined) {
      parts.push(`active=${params.active}`);
    }
    if (params.expand?.length) {
      parts.push(
        `expand[]=${params.expand.map((field) => `data.${field}`).join(',')}`
      );
    }
    endpoint += parts.join('&');
    return this.api.Call<ListResponse<Product>>('GET', endpoint);
  }

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
    data.expand = ['default_price'];
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

  async GetProduct(productId: string): Promise<Product> {
    this.loading.set(true);
    try {
      const product = await this.api.Call<Product>(
        'GET',
        `products/${productId}?expand=default_price`
      );
      return product;
    } finally {
      this.loading.set(false);
    }
  }
}
