import { Injectable, inject, signal, WritableSignal } from '@angular/core';
import { ApiService } from '../../core';
import { Invoice } from '@zoneless/shared-types';
import {
  CreateInvoiceInput,
  FinalizeInvoiceInput,
  PayInvoiceInput,
  UpdateInvoiceInput,
  VoidInvoiceInput,
} from '@zoneless/shared-schemas';

@Injectable({
  providedIn: 'root',
})
export class InvoiceService {
  private readonly api = inject(ApiService);

  loading: WritableSignal<boolean> = signal(false);

  async CreateInvoice(data: CreateInvoiceInput): Promise<Invoice> {
    this.loading.set(true);
    try {
      return await this.api.Call<Invoice>('POST', `invoices`, data);
    } finally {
      this.loading.set(false);
    }
  }

  async GetInvoice(
    invoiceId: string,
    expand: string[] = ['customer']
  ): Promise<Invoice> {
    this.loading.set(true);
    try {
      const expandQuery =
        expand.length > 0 ? `?expand=${expand.join(',')}` : '';
      return await this.api.Call<Invoice>(
        'GET',
        `invoices/${invoiceId}${expandQuery}`
      );
    } finally {
      this.loading.set(false);
    }
  }

  async UpdateInvoice(
    invoiceId: string,
    data: UpdateInvoiceInput
  ): Promise<Invoice> {
    this.loading.set(true);
    try {
      return await this.api.Call<Invoice>(
        'POST',
        `invoices/${invoiceId}`,
        data
      );
    } finally {
      this.loading.set(false);
    }
  }

  async DeleteInvoice(invoiceId: string): Promise<void> {
    this.loading.set(true);
    try {
      await this.api.Call<void>('DELETE', `invoices/${invoiceId}`);
    } finally {
      this.loading.set(false);
    }
  }

  async FinalizeInvoice(
    invoiceId: string,
    data: FinalizeInvoiceInput = {}
  ): Promise<Invoice> {
    this.loading.set(true);
    try {
      return await this.api.Call<Invoice>(
        'POST',
        `invoices/${invoiceId}/finalize`,
        data
      );
    } finally {
      this.loading.set(false);
    }
  }

  async PayInvoice(
    invoiceId: string,
    data: PayInvoiceInput = {}
  ): Promise<Invoice> {
    this.loading.set(true);
    try {
      return await this.api.Call<Invoice>(
        'POST',
        `invoices/${invoiceId}/pay`,
        data
      );
    } finally {
      this.loading.set(false);
    }
  }

  async VoidInvoice(
    invoiceId: string,
    data: VoidInvoiceInput = {}
  ): Promise<Invoice> {
    this.loading.set(true);
    try {
      return await this.api.Call<Invoice>(
        'POST',
        `invoices/${invoiceId}/void`,
        data
      );
    } finally {
      this.loading.set(false);
    }
  }

  async MarkInvoiceUncollectible(invoiceId: string): Promise<Invoice> {
    this.loading.set(true);
    try {
      return await this.api.Call<Invoice>(
        'POST',
        `invoices/${invoiceId}/mark_uncollectible`
      );
    } finally {
      this.loading.set(false);
    }
  }
}
