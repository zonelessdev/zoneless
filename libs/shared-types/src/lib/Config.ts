/**
 * Application infrastructure configuration.
 * Static configuration from environment variables (.env).
 * These are deployment-specific settings that don't change at runtime.
 */
export interface AppConfig {
  /** MongoDB connection string */
  mongodbUri: string;
  /** Dashboard URL (e.g., http://localhost:4200 or https://connect.yourdomain.com) */
  dashboardUrl: string;
  /**
   * Master application secret (from APP_SECRET env or auto-generated).
   * Purpose-specific keys (JWT, encryption) are derived from this via HKDF.
   * Use GetJwtSecret() and GetEncryptionKey() to access derived keys.
   */
  appSecret: string;
  /** True if running in live mode, false for test mode (from LIVEMODE env var) */
  livemode: boolean;
}

/**
 * Auto-generated application secret stored in database.
 * Used as fallback when APP_SECRET env var is not set.
 * Purpose-specific keys (JWT, encryption) are derived from this via HKDF.
 */
export interface AppSecrets {
  /** Singleton identifier */
  id: 'app_secrets';
  object: 'app_secrets';
  /** Master application secret (auto-generated if not in env) */
  app_secret: string;
  /** Unix timestamp when secret was created */
  created: number;
}

/**
 * Public platform configuration returned by the /v1/config endpoint.
 * Contains branding and other platform-level settings (safe to expose).
 * In multi-tenant mode, this is derived from the platform's Account settings.
 */
export interface PublicConfig {
  object: 'config';
  /** Platform display name */
  platform_name: string;
  /** URL to the platform logo image (empty string if not set) */
  platform_logo_url: string;
  /** URL to the platform's Terms of Service page (empty string if not set) */
  terms_url: string;
  /** URL to the platform's Privacy Policy page (empty string if not set) */
  privacy_url: string;
}

/**
 * Setup status returned by GET /v1/setup/status
 * In multi-tenant mode, this indicates if the authenticated account is a platform.
 */
export interface SetupStatus {
  object: 'setup_status';
  /** Whether setup is available (true = can create new platform) */
  needs_setup: boolean;
  /** Whether a Solana wallet has been configured (for platforms) */
  has_wallet: boolean;
  /** Whether the authenticated user is a connected account (should redirect away from setup) */
  is_connected_account?: boolean;
}

/**
 * Request body for POST /v1/setup
 * Creates a new platform account with wallet configuration.
 * Wallet is generated in the browser - only the public key is sent to the API.
 */
export interface SetupRequest {
  /** Platform display name */
  platform_name: string;
  /** URL to the platform logo image (optional) */
  platform_logo_url?: string;
  /** URL to the platform's Terms of Service page (optional) */
  terms_url?: string;
  /** URL to the platform's Privacy Policy page (optional) */
  privacy_url?: string;
  /** Platform website URL (optional) */
  platform_url?: string;
  /** Country code for the platform (optional, defaults to 'US') */
  country?: string;
  /** Solana wallet public key (required - generated in browser or existing wallet) */
  solana_public_key: string;
}

/**
 * Response from POST /v1/setup (shown once!)
 */
export interface SetupResponse {
  object: 'setup_response';
  /** Whether setup was successful */
  success: boolean;
  /** The generated API key (only shown once!) */
  api_key: string;
  /** The platform account ID */
  platform_account_id: string;
  /** The Solana wallet public key */
  solana_public_key: string;
  /** JWT token for immediate dashboard access */
  login_token: string;
}

/**
 * Deposit information returned by GET /v1/config/deposit-info
 * Platform-only endpoint for getting wallet address to receive funds.
 */
export interface DepositInfo {
  object: 'deposit_info';
  /** The Solana wallet address to send USDC to */
  wallet_address: string;
  /** The network to use */
  network: 'solana';
  /** The currency to send */
  currency: 'usdc';
  /** URL to view the wallet on a blockchain explorer */
  explorer_url: string;
}
