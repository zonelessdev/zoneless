import { Injectable, inject } from '@angular/core';
import type { CreatePayoutInput } from '@zoneless/shared-schemas';
import type { PayoutBatchBroadcastResponse } from '@zoneless/shared-types';
import { ApiService } from '../../core';

@Injectable({
  providedIn: 'root',
})
export class PayoutService {
  private readonly api = inject(ApiService);

  /**
   * Create and process a connected-account payout from the dashboard.
   */
  async CreateDashboardPayout(
    connectedAccountId: string,
    input: CreatePayoutInput
  ): Promise<PayoutBatchBroadcastResponse> {
    return this.api.Call<PayoutBatchBroadcastResponse>(
      'POST',
      'dashboard/payouts',
      input,
      {
        timeout: 60000,
        zonelessAccount: connectedAccountId,
      }
    );
  }
}
