import { Injectable, inject, signal, WritableSignal } from '@angular/core';
import { ApiService } from '../../core';
import {
  DepositInfo,
  TopUp,
  CheckDepositsResponse,
} from '@zoneless/shared-types';

export interface TopUpListResponse {
  object: 'list';
  data: TopUp[];
  has_more: boolean;
  url: string;
}

@Injectable({
  providedIn: 'root',
})
export class TopupService {
  private readonly api = inject(ApiService);

  depositInfo: WritableSignal<DepositInfo | null> = signal(null);
  loading: WritableSignal<boolean> = signal(false);

  // Polling state for detecting new deposits
  private pollingInterval: ReturnType<typeof setInterval> | null = null;
  // The ID of the most recent topup when the panel opened (null if none)
  private lastKnownTopUpId: string | null = null;

  isPolling: WritableSignal<boolean> = signal(false);
  newDepositDetected: WritableSignal<TopUp | null> = signal(null);

  /**
   * Fetch deposit information (wallet address) for the platform.
   * Platform-only endpoint.
   */
  async GetDepositInfo(): Promise<DepositInfo> {
    this.loading.set(true);
    try {
      const info = await this.api.Call<DepositInfo>(
        'GET',
        'config/deposit-info'
      );
      this.depositInfo.set(info);
      return info;
    } finally {
      this.loading.set(false);
    }
  }

  /**
   * Capture the most recent topup ID when the panel opens.
   * Any topup with a different (newer) ID is considered a new deposit.
   */
  async CaptureLastTopUpId(): Promise<void> {
    try {
      const topUps = await this.GetRecentTopUps(1);
      this.lastKnownTopUpId = topUps.length > 0 ? topUps[0].id : null;
    } catch {
      this.lastKnownTopUpId = null;
    }
  }

  /**
   * Start polling for new deposits.
   * Call CaptureLastTopUpId() first when the panel opens.
   * Uses the check-deposits endpoint to actively scan the blockchain.
   * @param intervalMs - Polling interval in milliseconds (default: 15 seconds)
   */
  StartPolling(intervalMs = 15000): void {
    if (this.pollingInterval) {
      return; // Already polling
    }

    this.isPolling.set(true);
    this.newDepositDetected.set(null);

    // Do an immediate check first
    this.CheckForNewDeposits();

    // Then continue polling at intervals
    this.pollingInterval = setInterval(async () => {
      await this.CheckForNewDeposits();
    }, intervalMs);
  }

  /**
   * Stop polling for deposits.
   */
  StopPolling(): void {
    if (this.pollingInterval) {
      clearInterval(this.pollingInterval);
      this.pollingInterval = null;
    }
    this.isPolling.set(false);
  }

  /**
   * Check for new deposits by calling the check-deposits endpoint.
   * This endpoint actively scans the blockchain for new incoming USDC transfers
   * and creates TopUp records for any new deposits found.
   */
  private async CheckForNewDeposits(): Promise<void> {
    try {
      // Call the check-deposits endpoint which scans the blockchain
      const response = await this.api.Call<CheckDepositsResponse>(
        'POST',
        'topups/check-deposits'
      );

      // If new deposits were found and processed
      if (response.topups.length > 0) {
        // Get the most recent newly created topup
        const latestTopUp = response.topups[0];

        // Only notify if it's a new deposit (not already known)
        if (latestTopUp.id !== this.lastKnownTopUpId) {
          this.newDepositDetected.set(latestTopUp);
          this.StopPolling();
          return;
        }
      }

      // Fallback: also check the topups list in case the deposit was processed
      // by another mechanism (e.g., monitor running in dev environment)
      const topUps = await this.GetRecentTopUps(1);
      if (topUps.length > 0) {
        const latestTopUp = topUps[0];
        if (latestTopUp.id !== this.lastKnownTopUpId) {
          this.newDepositDetected.set(latestTopUp);
          this.StopPolling();
        }
      }
    } catch {
      // Silently continue polling on transient errors
    }
  }

  /**
   * Get recent topups.
   */
  async GetRecentTopUps(limit = 1): Promise<TopUp[]> {
    const response = await this.api.Call<TopUpListResponse>(
      'GET',
      `topups?limit=${limit}`
    );
    return response.data;
  }

  /**
   * Reset service state.
   */
  Reset(): void {
    this.StopPolling();
    this.depositInfo.set(null);
    this.newDepositDetected.set(null);
    this.lastKnownTopUpId = null;
  }
}
