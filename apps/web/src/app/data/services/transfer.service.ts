import { Injectable, inject } from '@angular/core';
import { ApiService } from '../../core';
import type { Transfer } from '@zoneless/shared-types';
import type { CreateTransferInput } from '@zoneless/shared-schemas';

@Injectable({
  providedIn: 'root',
})
export class TransferService {
  private readonly api = inject(ApiService);

  /**
   * Create a transfer from the platform balance to a connected account.
   */
  async CreateTransfer(input: CreateTransferInput): Promise<Transfer> {
    return this.api.Call<Transfer>('POST', 'transfers', input);
  }

  /**
   * Create a transfer on behalf of a connected account (Zoneless-Account header).
   * The connected account is the source; destination is typically the platform.
   */
  async CreateTransferForConnectedAccount(
    connectedAccountId: string,
    input: CreateTransferInput
  ): Promise<Transfer> {
    return this.api.Call<Transfer>('POST', 'transfers', input, {
      zonelessAccount: connectedAccountId,
    });
  }

  async GetTransfer(transferId: string): Promise<Transfer> {
    return this.api.Call<Transfer>('GET', `transfers/${transferId}`);
  }
}
