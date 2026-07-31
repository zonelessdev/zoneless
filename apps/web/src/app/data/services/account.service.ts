import { Injectable, signal, WritableSignal, inject } from '@angular/core';
import { ApiService } from '../../core/services/api.service';
import { Account, LoginLink } from '@zoneless/shared-types';
import {
  CreateAccountInput,
  UpdateAccountInput,
} from '@zoneless/shared-schemas';
import { SettingsCardRow } from '../../shared';

@Injectable({
  providedIn: 'root',
})
export class AccountService {
  private api = inject(ApiService);

  // Current user's account state
  account: WritableSignal<Account | null> = signal(null);
  loading: WritableSignal<boolean> = signal(false);

  Reset(): void {
    this.account.set(null);
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
    data: UpdateAccountInput
  ): Promise<Account> {
    this.loading.set(true);
    try {
      const account = await this.api.Call<Account>(
        'POST',
        `accounts/${accountId}`,
        data
      );
      // Only update the signed-in account signal when editing self
      if (this.account()?.id === accountId) {
        this.account.set(account);
      }
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

  /**
   * Platform-only: dismiss lite identity review flags.
   */
  async ApproveIdentity(accountId: string): Promise<Account> {
    return this.api.Call<Account>(
      'POST',
      `accounts/${accountId}/approve_identity`,
      {}
    );
  }

  /**
   * Platform-only: reject a connected account.
   */
  async RejectAccount(
    accountId: string,
    data: { reason: 'fraud' | 'terms_of_service' | 'other'; pause_payouts?: boolean }
  ): Promise<Account> {
    return this.api.Call<Account>('POST', `accounts/${accountId}/reject`, data);
  }

  /**
   * Platform-only: unreject a previously rejected connected account.
   */
  async UnrejectAccount(accountId: string): Promise<Account> {
    return this.api.Call<Account>(
      'POST',
      `accounts/${accountId}/unreject`,
      {}
    );
  }

  /**
   * Platform-only: pause or resume payments (charges).
   */
  async SetChargesEnabled(
    accountId: string,
    chargesEnabled: boolean
  ): Promise<Account> {
    return this.api.Call<Account>(
      'POST',
      `accounts/${accountId}/charges_enabled`,
      { charges_enabled: chargesEnabled }
    );
  }

  /**
   * Platform-only: pause or resume payouts.
   */
  async SetPayoutsEnabled(
    accountId: string,
    payoutsEnabled: boolean
  ): Promise<Account> {
    return this.api.Call<Account>(
      'POST',
      `accounts/${accountId}/payouts_enabled`,
      { payouts_enabled: payoutsEnabled }
    );
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Connected Account Methods (Platform Only)
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Create a connected account (platform API key only).
   */
  async CreateAccount(data: CreateAccountInput): Promise<Account> {
    return this.api.Call<Account>('POST', 'accounts', data);
  }

  /**
   * Fetch a connected account by ID.
   */
  async GetConnectedAccount(accountId: string): Promise<Account> {
    return this.api.Call<Account>('GET', `accounts/${accountId}`);
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
   * Prefers business name, then person's name, then email.
   */
  GetConnectedAccountDisplayName(account: Account): string {
    const businessName = account.business_profile?.name?.trim();
    if (businessName) return businessName;

    const displayName = account.settings?.dashboard?.display_name?.trim();
    if (displayName) return displayName;

    const individual = account.individual;
    if (individual?.first_name || individual?.last_name) {
      return [individual.first_name, individual.last_name]
        .filter(Boolean)
        .join(' ');
    }

    return account.email ?? individual?.email ?? account.id;
  }

  /**
   * Display title for the Business details settings card.
   */
  GetBusinessDetailsTitle(account: Account | null): string {
    if (!account) return 'Business details';
    return (
      account.business_profile?.name?.trim() ||
      account.settings?.dashboard?.display_name?.trim() ||
      'Business details'
    );
  }

  GetBusinessDetailsCardRows(account: Account | null): SettingsCardRow[] {
    if (!account) return [];

    return [
      {
        label: 'Logo',
        value: account.settings?.branding?.logo || '—',
        type: 'text',
      },
      {
        label: 'Terms of Service',
        value: account.settings?.terms_url || '—',
        type: 'text',
      },
      {
        label: 'Privacy Policy',
        value: account.settings?.privacy_url || '—',
        type: 'text',
      },
    ];
  }
}
