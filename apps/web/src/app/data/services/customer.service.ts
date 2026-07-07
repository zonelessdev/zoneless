import { Injectable, inject, signal, WritableSignal } from '@angular/core';
import { ApiService } from '../../core';
import { Customer } from '@zoneless/shared-types';
import {
  CreateCustomerInput,
  UpdateCustomerInput,
} from '@zoneless/shared-schemas';

@Injectable({
  providedIn: 'root',
})
export class CustomerService {
  private readonly api = inject(ApiService);

  loading: WritableSignal<boolean> = signal(false);

  async CreateCustomer(data: CreateCustomerInput): Promise<Customer> {
    this.loading.set(true);
    try {
      const customer = await this.api.Call<Customer>('POST', `customers`, data);
      return customer;
    } finally {
      this.loading.set(false);
    }
  }

  async UpdateCustomer(
    customerId: string,
    data: UpdateCustomerInput
  ): Promise<Customer> {
    this.loading.set(true);
    try {
      const customer = await this.api.Call<Customer>(
        'POST',
        `customers/${customerId}`,
        data
      );
      return customer;
    } finally {
      this.loading.set(false);
    }
  }

  async DeleteCustomer(customerId: string): Promise<void> {
    this.loading.set(true);
    try {
      await this.api.Call<void>('DELETE', `customers/${customerId}`);
    } finally {
      this.loading.set(false);
    }
  }

  async GetCustomer(customerId: string): Promise<Customer> {
    this.loading.set(true);
    try {
      const customer = await this.api.Call<Customer>(
        'GET',
        `customers/${customerId}`
      );
      return customer;
    } finally {
      this.loading.set(false);
    }
  }
}
