import { Injectable, inject, signal, WritableSignal } from '@angular/core';
import { ApiService } from '../../core';
import {
  SetupStatus,
  SetupRequest,
  SetupResponse,
} from '@zoneless/shared-types';

@Injectable({
  providedIn: 'root',
})
export class SetupService {
  private readonly api = inject(ApiService);

  status: WritableSignal<SetupStatus | null> = signal(null);
  loading: WritableSignal<boolean> = signal(false);
  error: WritableSignal<string> = signal('');

  /**
   * Check the setup status of the platform.
   * Returns true if setup is needed.
   */
  async CheckSetupStatus(): Promise<boolean> {
    this.loading.set(true);
    this.error.set('');

    try {
      const status = await this.api.Call<SetupStatus>('GET', 'setup/status');
      this.status.set(status);
      return status.needs_setup;
    } catch (err) {
      console.error('Failed to check setup status:', err);
      this.error.set(
        err instanceof Error ? err.message : 'Failed to check setup status'
      );
      // If we can't check status, assume setup is not needed
      return false;
    } finally {
      this.loading.set(false);
    }
  }

  /**
   * Complete the platform setup.
   * Returns the setup response containing API key and secrets.
   */
  async CompleteSetup(request: SetupRequest): Promise<SetupResponse> {
    this.loading.set(true);
    this.error.set('');

    try {
      const response = await this.api.Call<SetupResponse>(
        'POST',
        'setup',
        request
      );
      // Update status after successful setup
      this.status.set({
        object: 'setup_status',
        needs_setup: false,
        has_wallet: true,
      });
      return response;
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Failed to complete setup';
      this.error.set(message);
      throw err;
    } finally {
      this.loading.set(false);
    }
  }

  /**
   * Generate a Solana keypair client-side.
   * This is more secure as the private key never goes over the network.
   */
  async GenerateSolanaKeypair(): Promise<{
    publicKey: string;
    secretKey: string;
  }> {
    // Dynamically import Solana web3.js to avoid bundling it if not needed
    const { Keypair } = await import('@solana/web3.js');
    const bs58 = await import('bs58');

    const keypair = Keypair.generate();
    return {
      publicKey: keypair.publicKey.toBase58(),
      secretKey: bs58.default.encode(keypair.secretKey),
    };
  }

  /**
   * Reset the service state.
   */
  Reset(): void {
    this.status.set(null);
    this.loading.set(false);
    this.error.set('');
  }
}
