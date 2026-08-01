import { Injectable, inject } from '@angular/core';
import { ApiService } from '../../core/services/api.service';
import type { IdentityVerificationSession } from '@zoneless/shared-types';
import type { CreateIdentityVerificationSessionInput } from '@zoneless/shared-schemas';

@Injectable({
  providedIn: 'root',
})
export class IdentityService {
  private readonly api = inject(ApiService);

  /**
   * Create an identity verification session. Returns a provider-hosted `url`
   * (e.g. Didit) the account can complete.
   */
  async CreateVerificationSession(
    data: CreateIdentityVerificationSessionInput
  ): Promise<IdentityVerificationSession> {
    return this.api.Call<IdentityVerificationSession>(
      'POST',
      'identity/verification_sessions',
      data
    );
  }
}
