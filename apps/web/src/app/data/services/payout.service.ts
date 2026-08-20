import { Injectable, inject } from '@angular/core';
import type {
  BroadcastPayoutsBatchInput,
  BuildPayoutsBatchInput,
  CreatePayoutInput,
} from '@zoneless/shared-schemas';
import type {
  Payout,
  PayoutBatchBroadcastResponse,
  PayoutBatchBuildResponse,
} from '@zoneless/shared-types';
import { ApiService } from '../../core';

@Injectable({
  providedIn: 'root',
})
export class PayoutService {
  private readonly api = inject(ApiService);

  async CreatePayoutForConnectedAccount(
    connectedAccountId: string,
    input: CreatePayoutInput
  ): Promise<Payout> {
    return this.api.Call<Payout>('POST', 'payouts', input, {
      zonelessAccount: connectedAccountId,
    });
  }

  async BuildPayoutsBatch(
    input: BuildPayoutsBatchInput
  ): Promise<PayoutBatchBuildResponse> {
    return this.api.Call<PayoutBatchBuildResponse>(
      'POST',
      'payouts/build',
      input
    );
  }

  async BroadcastPayoutsBatch(
    input: BroadcastPayoutsBatchInput
  ): Promise<PayoutBatchBroadcastResponse> {
    return this.api.Call<PayoutBatchBroadcastResponse>(
      'POST',
      'payouts/broadcast',
      input,
      { timeout: 60000 }
    );
  }

  async CancelPayout(payoutId: string): Promise<Payout> {
    return this.api.Call<Payout>('POST', `payouts/${payoutId}/cancel`);
  }

  async SyncPayout(payoutId: string): Promise<Payout> {
    return this.api.Call<Payout>('POST', `payouts/${payoutId}/sync`);
  }
}
