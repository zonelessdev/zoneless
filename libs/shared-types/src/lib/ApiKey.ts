export interface ApiKey {
  id: string;
  object: 'api_key';
  /** Unix timestamp in seconds when the API key was created */
  created: number;
  /**
   * Has the value `true` if the object exists in live mode or the value
   * `false` if the object exists in test mode.
   */
  livemode: boolean;
  /**
   * A human-readable name for the API key, for your own identification.
   */
  name: string;
  /**
   * SHA-256 hash of the API key token.
   * The plaintext token is only shown once at creation time and is not stored.
   */
  token_hash: string;
  /**
   * First characters of the token for identification in UI.
   * e.g., "sk_live_z_Abc12..." so users can identify which key is which.
   */
  token_prefix: string;
  /**
   * The ID of the account this API key belongs to.
   */
  account: string;
  /** Unix timestamp in seconds when the API key was last used, or null if never used */
  last_used: number | null;
  /**
   * Set of key-value pairs that you can attach to an object.
   * This can be useful for storing additional information about the object
   * in a structured format.
   */
  metadata: Record<string, string>;
  /**
   * The status of the API key.
   * - `active`: The key can be used for authentication.
   * - `inactive`: The key is temporarily disabled.
   * - `revoked`: The key has been permanently revoked and cannot be reactivated.
   */
  status: 'active' | 'inactive' | 'revoked';

  /**
   * The platform account that owns this resource.
   * For connected account resources, this is the platform's account ID.
   * For platform's own resources, this equals the account field (self-referential).
   * @zoneless_extension
   */
  platform_account: string;
}

/**
 * Result returned when creating a new API key.
 * Contains both the stored ApiKey object and the plaintext token (shown only once).
 */
export interface ApiKeyCreateResult {
  /** The API key object (with hashed token) stored in the database */
  api_key: ApiKey;
  /** The plaintext token - only available at creation time, not stored */
  plaintext_token: string;
}
