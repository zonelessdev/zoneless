import { Injectable, signal, WritableSignal, inject } from '@angular/core';
import { ApiService } from '../../core/services/api.service';
import { Account, LoginLink } from '@zoneless/shared-types';

/**
 * Input type for updating an account.
 * All fields are optional - only provided fields will be updated.
 * Protected fields (id, object, created, payouts_enabled, details_submitted, tos_acceptance)
 * cannot be updated directly.
 */
export type AccountUpdateInput = Partial<
  Omit<
    Account,
    | 'id'
    | 'object'
    | 'created'
    | 'payouts_enabled'
    | 'details_submitted'
    | 'tos_acceptance'
    | 'individual'
  >
>;

@Injectable({
  providedIn: 'root',
})
export class AccountService {
  private api = inject(ApiService);

  // Current user's account state
  account: WritableSignal<Account | null> = signal(null);
  loading: WritableSignal<boolean> = signal(false);

  // Connected account selection state (for viewing connected accounts in panel)
  selectedConnectedAccount: WritableSignal<Account | null> = signal(null);
  loadingConnectedAccount: WritableSignal<boolean> = signal(false);

  Reset(): void {
    this.account.set(null);
    this.selectedConnectedAccount.set(null);
    this.loadingConnectedAccount.set(false);
  }

  async GetAccount(): Promise<Account | null> {
    this.loading.set(true);
    try {
      const account = await this.api.Call<Account>('GET', 'accounts/me');
      this.account.set(account);
      return account;
    } catch (error) {
      console.error('Failed to get account:', error);
      this.account.set(null);
      return null;
    } finally {
      this.loading.set(false);
    }
  }

  async UpdateAccount(
    accountId: string,
    data: AccountUpdateInput
  ): Promise<Account> {
    this.loading.set(true);
    try {
      const account = await this.api.Call<Account>(
        'POST',
        `accounts/${accountId}`,
        data
      );
      this.account.set(account);
      return account;
    } finally {
      this.loading.set(false);
    }
  }

  async AgreeTerms(accountId: string): Promise<Account> {
    this.loading.set(true);
    try {
      const account = await this.api.Call<Account>(
        'POST',
        `accounts/${accountId}/agree_terms`,
        {}
      );
      this.account.set(account);
      return account;
    } finally {
      this.loading.set(false);
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Connected Account Methods (Platform Only)
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Fetch any account by ID (used for viewing connected accounts).
   * Sets the selectedConnectedAccount signal for panel display.
   */
  async LoadConnectedAccount(accountId: string): Promise<Account | null> {
    this.loadingConnectedAccount.set(true);
    this.selectedConnectedAccount.set(null);

    try {
      const account = await this.api.Call<Account>(
        'GET',
        `accounts/${accountId}`
      );
      this.selectedConnectedAccount.set(account);
      return account;
    } catch (error) {
      console.error('Failed to load connected account:', error);
      this.selectedConnectedAccount.set(null);
      return null;
    } finally {
      this.loadingConnectedAccount.set(false);
    }
  }

  /**
   * Clear the selected connected account.
   */
  ClearSelectedConnectedAccount(): void {
    this.selectedConnectedAccount.set(null);
  }

  /**
   * Create a login link for a connected account and open their dashboard in a new tab.
   */
  async CreateLoginLink(accountId: string): Promise<LoginLink> {
    return this.api.Call<LoginLink>(
      'POST',
      `accounts/${accountId}/login_links`
    );
  }

  /**
   * Get the display name for an account.
   * Returns the person's full name if available, otherwise the email.
   */
  GetConnectedAccountDisplayName(account: Account): string {
    const individual = account.individual;
    if (individual?.first_name || individual?.last_name) {
      return [individual.first_name, individual.last_name]
        .filter(Boolean)
        .join(' ');
    }
    return account.email ?? account.id;
  }
}
