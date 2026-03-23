import { Injectable, inject, WritableSignal, signal } from '@angular/core';
import { AuthService, ExchangeContext } from '../../core';

export interface LinkError {
  type: string;
  message: string;
}

@Injectable({
  providedIn: 'root',
})
export class AccountLinkService {
  private readonly auth = inject(AuthService);

  accountId: WritableSignal<string> = signal('');
  linkContext: WritableSignal<ExchangeContext | null> = signal(null);
  linkError: WritableSignal<LinkError | null> = signal(null);

  Reset(): void {
    this.accountId.set('');
    this.linkContext.set(null);
    this.linkError.set(null);
  }

  async ExchangeToken(token: string): Promise<void> {
    this.linkError.set(null);

    try {
      // Exchange the token for a JWT and get the session context
      const { context } = await this.auth.Exchange(token);

      this.linkContext.set(context);
      this.accountId.set(context.account);
    } catch (error: unknown) {
      console.error('Failed to exchange token:', error);
      this.linkContext.set(null);

      // Check if this is a link_expired or authentication error
      const apiError = error as { type?: string; message?: string };
      if (
        apiError?.type === 'link_expired' ||
        apiError?.type === 'authentication_error'
      ) {
        this.linkError.set({
          type: apiError.type,
          message: apiError.message || 'This link is no longer valid',
        });
      } else {
        this.linkError.set({
          type: 'unknown_error',
          message: 'An error occurred while processing this link',
        });
      }
      throw error;
    }
  }
}
