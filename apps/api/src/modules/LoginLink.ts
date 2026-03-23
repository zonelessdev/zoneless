/**
 * @fileOverview Methods for LoginLinks
 *
 * Login Links are single-use URLs that take an Express account to the login page
 * for their Zoneless dashboard. A Login Link differs from an Account Link in that
 * it takes the user directly to their Express dashboard for the specified account.
 *
 * @see https://docs.stripe.com/api/accounts/login_link
 * @module LoginLink
 */

import { Database } from './Database';
import { GetAppConfig } from './AppConfig';
import { GenerateId } from '../utils/IdGenerator';
import { Now } from '../utils/Timestamp';
import { LoginLink, LoginLinkRecord } from '@zoneless/shared-types';

/**
 * Converts an internal LoginLinkRecord to the Stripe-compatible API response.
 * Only includes fields that Stripe returns: object, created, url.
 */
export function ToLoginLinkResponse(record: LoginLinkRecord): LoginLink {
  return {
    object: record.object,
    created: record.created,
    url: record.url,
  };
}

export class LoginLinkModule {
  private readonly db: Database;

  constructor(db: Database) {
    this.db = db;
  }

  /**
   * Creates a LoginLink object that includes a single-use Zoneless URL
   * that the platform can redirect their user to in order to access
   * the Express dashboard.
   *
   * @param account - The identifier of the account to create a login link for
   * @param platformName - The platform name for display purposes
   * @returns The LoginLink API response (Stripe-compatible)
   */
  async CreateLoginLink(
    account: string,
    platformName: string
  ): Promise<LoginLink> {
    const record = this.CreateLoginLinkRecord(account, platformName);
    await this.db.Set('LoginLinks', record.token, record);
    return ToLoginLinkResponse(record);
  }

  /**
   * Creates the internal LoginLinkRecord for storage.
   * @internal
   */
  CreateLoginLinkRecord(
    account: string,
    platformName: string
  ): LoginLinkRecord {
    const { dashboardUrl } = GetAppConfig();
    const timestamp = Now();
    const expiresAt = timestamp + 60 * 5; // 5 minutes in seconds (shorter than AccountLink)
    const token = GenerateId('ll_z', 32);
    const url = `${dashboardUrl}/login?token=${token}`;

    const record: LoginLinkRecord = {
      object: 'login_link',
      created: timestamp,
      url: url,
      token: token,
      account: account,
      platform_name: platformName,
      expires_at: expiresAt,
      consumed: false,
    };

    return record;
  }

  /**
   * Marks a login link as consumed (used).
   * Login links are single-use and should be marked consumed after the user
   * successfully logs in.
   */
  async MarkAsConsumed(token: string): Promise<void> {
    await this.db.Update('LoginLinks', token, {
      consumed: true,
      consumed_at: Now(),
    });
  }

  /**
   * Retrieves a login link record by its token.
   * Used internally to validate and process login requests.
   *
   * @param token - The token from the login link URL
   * @returns The full LoginLinkRecord or null if not found
   */
  async GetLoginLinkByToken(token: string): Promise<LoginLinkRecord | null> {
    return this.db.Get<LoginLinkRecord>('LoginLinks', token);
  }

  /**
   * Retrieves all login links for an account.
   * Used to populate the account response with login_links list.
   *
   * @param account - The account ID
   * @returns Array of LoginLinkRecords
   */
  async GetLoginLinksByAccount(account: string): Promise<LoginLinkRecord[]> {
    const loginLinks = await this.db.Find<LoginLinkRecord>(
      'LoginLinks',
      'account',
      account
    );
    return loginLinks || [];
  }

  /**
   * Validates whether a login link is valid for use.
   *
   * @param token - The token from the login link URL
   * @returns Object with validity status and the record if valid
   */
  async ValidateLoginLink(token: string): Promise<{
    valid: boolean;
    reason?: 'not_found' | 'expired' | 'consumed';
    record?: LoginLinkRecord;
  }> {
    const record = await this.GetLoginLinkByToken(token);

    if (!record) {
      return { valid: false, reason: 'not_found' };
    }

    if (record.consumed) {
      return { valid: false, reason: 'consumed', record };
    }

    const now = Now();
    if (record.expires_at < now) {
      return { valid: false, reason: 'expired', record };
    }

    return { valid: true, record };
  }
}
