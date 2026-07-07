export interface AuthenticatedUser {
  account: string;
  platform?: string;
  /**
   * The platform account this user belongs to.
   * Self-referential for platform accounts, the parent platform's ID
   * for connected accounts. Used for usage metering.
   * @zoneless_extension
   */
  platform_account?: string;
  /**
   * How the request was authenticated: an API key (server-to-server)
   * or a JWT session (dashboard). Usage metering only counts API keys.
   * @zoneless_extension
   */
  auth_type?: 'api_key' | 'session';
  role?: string;
}
