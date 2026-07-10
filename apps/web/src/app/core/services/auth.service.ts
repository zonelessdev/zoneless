import { Injectable, inject, signal, WritableSignal } from '@angular/core';
import { Account } from '@zoneless/shared-types';
import { StorageService } from './storage.service';
import { ApiService } from './api.service';

export type DashboardType = 'express' | 'full' | 'none';

export interface ExchangeContext {
  type: 'account_link' | 'login_link';
  link_type?: 'account_onboarding' | 'account_update';
  return_url?: string;
  refresh_url?: string;
  platform_name: string;
  account: string;
}

export interface ExchangeResponse {
  token: string;
  context: ExchangeContext;
}

export interface ApiKeyLoginResponse {
  token: string;
  account_id: string;
}

export function ResolveDashboardType(account: Account | null): DashboardType {
  const explicit = account?.controller?.zoneless_dashboard?.type;
  if (explicit) {
    return explicit;
  }
  if (account && account.platform_account === account.id) {
    return 'full';
  }
  return 'express';
}

@Injectable({
  providedIn: 'root',
})
export class AuthService {
  private readonly storage = inject(StorageService);
  private readonly api = inject(ApiService);

  isAuthenticated: WritableSignal<boolean> = signal(false);
  isPlatform: WritableSignal<boolean> = signal(false);
  dashboardType: WritableSignal<DashboardType> = signal('express');

  constructor() {
    this.CheckAuth();
  }

  CheckAuth(): void {
    const token = this.storage.GetItemString('auth_token');
    this.isAuthenticated.set(!!token);

    const isPlatformStored = this.storage.GetItemString('is_platform');
    this.isPlatform.set(isPlatformStored === 'true');

    const storedType = this.storage.GetItemString('dashboard_type');
    if (
      storedType === 'express' ||
      storedType === 'full' ||
      storedType === 'none'
    ) {
      this.dashboardType.set(storedType);
    } else {
      this.dashboardType.set(isPlatformStored === 'true' ? 'full' : 'express');
    }
  }

  SyncFromAccount(account: Account | null): void {
    const type = ResolveDashboardType(account);
    const isPlatform = !!(account && account.platform_account === account.id);

    this.dashboardType.set(type);
    this.isPlatform.set(isPlatform);
    this.storage.StoreItemString('dashboard_type', type);
    this.storage.StoreItemString('is_platform', String(isPlatform));
  }

  GetToken(): string | null {
    return this.storage.GetItemString('auth_token');
  }

  async Exchange(token: string): Promise<ExchangeResponse> {
    const response = await this.api.Call<ExchangeResponse>(
      'POST',
      'auth/exchange',
      { token }
    );
    this.storage.StoreItemString('auth_token', response.token);
    this.storage.StoreItemString('is_platform', 'false');
    this.storage.StoreItemString('dashboard_type', 'express');
    this.isAuthenticated.set(true);
    this.isPlatform.set(false);
    this.dashboardType.set('express');
    return response;
  }

  /**
   * Log in with a pre-issued platform session token (JWT).
   * Used by operator-managed instances where the managed hosting site
   * mints login links via the operator API.
   */
  async LoginWithToken(token: string): Promise<void> {
    this.storage.StoreItemString('auth_token', token);

    try {
      // Validate the token by fetching the account it belongs to
      await this.api.Call('GET', 'accounts/me');
    } catch (err) {
      this.storage.RemoveItem('auth_token');
      throw err;
    }

    this.storage.StoreItemString('is_platform', 'true');
    this.storage.StoreItemString('dashboard_type', 'full');
    this.isAuthenticated.set(true);
    this.isPlatform.set(true);
    this.dashboardType.set('full');
  }

  async LoginWithApiKey(apiKey: string): Promise<ApiKeyLoginResponse> {
    const response = await this.api.Call<ApiKeyLoginResponse>(
      'POST',
      'auth/api-key',
      { api_key: apiKey }
    );
    this.storage.StoreItemString('auth_token', response.token);
    this.storage.StoreItemString('is_platform', 'true');
    this.storage.StoreItemString('dashboard_type', 'full');
    this.isAuthenticated.set(true);
    this.isPlatform.set(true);
    this.dashboardType.set('full');
    return response;
  }

  Logout(): void {
    this.storage.RemoveItem('auth_token');
    this.storage.ClearAll();
    this.isAuthenticated.set(false);
    this.isPlatform.set(false);
    this.dashboardType.set('express');
  }
}
