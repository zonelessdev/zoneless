import { Injectable, inject, signal, WritableSignal } from '@angular/core';
import { ApiService } from '../../core';
import { PublicConfig, SetupStatus } from '@zoneless/shared-types';

/** Orchestra rails advertised by GET /v1/config. Local until shared-types lands. */
export interface OrchestraSource {
  chain: string;
  asset: string;
  label: string;
}

export interface OrchestraPublicConfig {
  enabled: boolean;
  live?: boolean;
  sources: OrchestraSource[];
}

type PublicConfigWithOrchestra = PublicConfig & {
  orchestra?: OrchestraPublicConfig;
};

@Injectable({
  providedIn: 'root',
})
export class ConfigService {
  private readonly api = inject(ApiService);

  config: WritableSignal<PublicConfig | null> = signal(null);
  setupStatus: WritableSignal<SetupStatus | null> = signal(null);
  loading: WritableSignal<boolean> = signal(false);
  loaded: WritableSignal<boolean> = signal(false);

  /**
   * Check if platform setup is needed.
   * Returns true if setup is required, false otherwise.
   */
  async CheckSetupStatus(): Promise<boolean> {
    try {
      const status = await this.api.Call<SetupStatus>('GET', 'setup/status');
      this.setupStatus.set(status);
      return status.needs_setup;
    } catch (err) {
      console.error('Failed to check setup status:', err);
      // If we can't check, assume setup is not needed
      return false;
    }
  }

  /**
   * Fetches platform configuration from the API.
   * Pass a token for onboarding flows to get the correct platform's config.
   *
   * @param token - Optional AccountLink token for onboarding context
   */
  async LoadConfig(token?: string): Promise<PublicConfig> {
    // Return cached config if already loaded (and no token override)
    const existingConfig = this.config();
    if (existingConfig && !token) {
      return existingConfig;
    }

    // Prevent duplicate requests (only if no token - tokens should always fetch)
    if (this.loading() && !token) {
      // Wait for existing request to complete
      return new Promise((resolve) => {
        const checkLoaded = setInterval(() => {
          const config = this.config();
          if (config) {
            clearInterval(checkLoaded);
            resolve(config);
          }
        }, 50);
      });
    }

    this.loading.set(true);
    try {
      // Build endpoint with optional token query param
      const endpoint = token
        ? `config?token=${encodeURIComponent(token)}`
        : 'config';
      const config = await this.api.Call<PublicConfig>('GET', endpoint);
      this.config.set(config);
      this.loaded.set(true);
      return config;
    } finally {
      this.loading.set(false);
    }
  }

  /**
   * Returns the platform name, or 'Zoneless' as fallback.
   */
  GetPlatformName(): string {
    return this.config()?.platform_name || 'Zoneless';
  }

  /**
   * Returns the platform logo URL, or empty string if not set.
   */
  GetPlatformLogoUrl(): string {
    return this.config()?.platform_logo_url || '';
  }

  /**
   * Returns initials from the platform name (up to 2 characters).
   * Used as fallback when no logo is set.
   */
  GetPlatformInitials(): string {
    const name = this.GetPlatformName();
    const words = name.split(/\s+/).filter((w) => w.length > 0);

    if (words.length >= 2) {
      return (words[0][0] + words[1][0]).toUpperCase();
    }

    return name.substring(0, 2).toUpperCase();
  }

  /**
   * Returns true if a logo URL is configured.
   */
  HasLogo(): boolean {
    const url = this.GetPlatformLogoUrl();
    return url.length > 0;
  }

  /**
   * Returns the platform's Terms of Service URL, or empty string if not set.
   */
  GetTermsUrl(): string {
    return this.config()?.terms_url || '';
  }

  /**
   * Returns the platform's Privacy Policy URL, or empty string if not set.
   */
  GetPrivacyUrl(): string {
    return this.config()?.privacy_url || '';
  }

  /**
   * Returns true if a Terms URL is configured.
   */
  HasTermsUrl(): boolean {
    return this.GetTermsUrl().length > 0;
  }

  /**
   * Returns true if a Privacy URL is configured.
   */
  HasPrivacyUrl(): boolean {
    return this.GetPrivacyUrl().length > 0;
  }

  /**
   * Returns true if the platform is running in test mode (not live).
   */
  IsTestMode(): boolean {
    return this.config()?.livemode === false;
  }

  /**
   * Returns true when test mode uses fake funds instead of a blockchain.
   */
  IsSimulatedSettlement(): boolean {
    return this.config()?.settlement === 'simulated';
  }

  /**
   * True in simulated test mode (picker always shows locally) or when
   * Orchestra is configured on the instance.
   */
  OrchestraEnabled(): boolean {
    return this.OrchestraConfig()?.enabled === true;
  }

  OrchestraLive(): boolean {
    return this.OrchestraConfig()?.live === true;
  }

  OrchestraSources(): OrchestraSource[] {
    return this.OrchestraConfig()?.sources ?? [];
  }

  private OrchestraConfig(): OrchestraPublicConfig | undefined {
    return (this.config() as PublicConfigWithOrchestra | null)?.orchestra;
  }

  /**
   * Clear the cached config. Useful when switching contexts.
   */
  ClearConfig(): void {
    this.config.set(null);
    this.loaded.set(false);
  }
}
