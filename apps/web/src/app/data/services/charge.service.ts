import { Injectable, inject, signal, WritableSignal } from '@angular/core';
import { ApiService } from '../../core';
import { Charge } from '@zoneless/shared-types';

@Injectable({
  providedIn: 'root',
})
export class ChargeService {
  private readonly api = inject(ApiService);

  loading: WritableSignal<boolean> = signal(false);

  async GetCharge(chargeId: string): Promise<Charge> {
    this.loading.set(true);
    try {
      return await this.api.Call<Charge>('GET', `charges/${chargeId}`);
    } finally {
      this.loading.set(false);
    }
  }
}
