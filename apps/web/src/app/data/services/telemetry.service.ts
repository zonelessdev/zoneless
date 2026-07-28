import { Injectable, inject, signal, WritableSignal } from '@angular/core';
import { ApiService } from '../../core';
import {
  TelemetryStatus,
  UpdateTelemetryRequest,
} from '@zoneless/shared-types';

@Injectable({
  providedIn: 'root',
})
export class TelemetryService {
  private readonly api = inject(ApiService);

  status: WritableSignal<TelemetryStatus | null> = signal(null);
  loading: WritableSignal<boolean> = signal(false);

  Reset(): void {
    this.status.set(null);
    this.loading.set(false);
  }

  async GetStatus(): Promise<TelemetryStatus | null> {
    this.loading.set(true);
    try {
      const status = await this.api.Call<TelemetryStatus>('GET', 'telemetry');
      this.status.set(status);
      return status;
    } catch (error) {
      console.error('Failed to get telemetry status:', error);
      this.status.set(null);
      return null;
    } finally {
      this.loading.set(false);
    }
  }

  async SetEnabled(enabled: boolean): Promise<TelemetryStatus> {
    this.loading.set(true);
    try {
      const body: UpdateTelemetryRequest = { enabled };
      const status = await this.api.Call<TelemetryStatus>(
        'POST',
        'telemetry',
        body
      );
      this.status.set(status);
      return status;
    } finally {
      this.loading.set(false);
    }
  }
}
