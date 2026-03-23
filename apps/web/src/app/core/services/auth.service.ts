import { Injectable, inject, signal, WritableSignal } from '@angular/core';
import { StorageService } from './storage.service';
import { ApiService } from './api.service';

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

@Injectable({
  providedIn: 'root',
})
export class AuthService {
  private readonly storage = inject(StorageService);
  private readonly api = inject(ApiService);

  isAuthenticated: WritableSignal<boolean> = signal(false);
  isPlatform: WritableSignal<boolean> = signal(false);

  constructor() {
    this.CheckAuth();
  }

  CheckAuth(): void {
    const token = this.storage.GetItemString('auth_token');
    this.isAuthenticated.set(!!token);

    // Check if user logged in as platform
    const isPlatformStored = this.storage.GetItemString('is_platform');
    this.isPlatform.set(isPlatformStored === 'true');
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
    this.isAuthenticated.set(true);
    this.isPlatform.set(false);
    return response;
  }

  async LoginWithApiKey(apiKey: string): Promise<ApiKeyLoginResponse> {
    const response = await this.api.Call<ApiKeyLoginResponse>(
      'POST',
      'auth/api-key',
      { api_key: apiKey }
    );
    this.storage.StoreItemString('auth_token', response.token);
    this.storage.StoreItemString('is_platform', 'true');
    this.isAuthenticated.set(true);
    this.isPlatform.set(true);
    return response;
  }

  Logout(): void {
    this.storage.RemoveItem('auth_token');
    this.storage.ClearAll();
    this.isAuthenticated.set(false);
    this.isPlatform.set(false);
  }
}
