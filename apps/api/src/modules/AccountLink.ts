/**
 * @fileOverview Methods for AccountLinks
 *
 * Account Links are the means by which a Connect platform grants a connected
 * account permission to access Zoneless-hosted applications, such as Connect Onboarding.
 *
 * @see https://docs.stripe.com/api/account_links
 * @module AccountLink
 */

import { Database } from './Database';
import { GetAppConfig } from './AppConfig';
import { GenerateId } from '../utils/IdGenerator';
import { Now } from '../utils/Timestamp';
import {
  AccountLink,
  AccountLinkRecord,
  AccountLinkType,
} from '@zoneless/shared-types';

/**
 * Converts an internal AccountLinkRecord to the Stripe-compatible API response.
 * Only includes fields that Stripe returns: object, created, expires_at, url.
 */
export function ToAccountLinkResponse(record: AccountLinkRecord): AccountLink {
  return {
    object: record.object,
    created: record.created,
    expires_at: record.expires_at,
    url: record.url,
  };
}

export class AccountLinkModule {
  private readonly db: Database;

  constructor(db: Database) {
    this.db = db;
  }

  /**
   * Creates an AccountLink object that includes a single-use Zoneless URL
   * that the platform can redirect their user to in order to take them
   * through the Connect Onboarding flow.
   *
   * @param account - The identifier of the account to create an account link for
   * @param type - The type of account link (account_onboarding or account_update)
   * @param refreshUrl - URL to redirect to if link is expired/invalid
   * @param returnUrl - URL to redirect to upon leaving or completing the flow
   * @returns The AccountLink API response (Stripe-compatible)
   */
  async CreateAccountLink(
    account: string,
    type: AccountLinkType,
    refreshUrl: string,
    returnUrl: string
  ): Promise<AccountLink> {
    const record = this.CreateAccountLinkRecord(
      account,
      type,
      refreshUrl,
      returnUrl
    );
    await this.db.Set('AccountLinks', record.id, record);
    return ToAccountLinkResponse(record);
  }

  /**
   * Creates the internal AccountLinkRecord for storage.
   * @internal
   */
  CreateAccountLinkRecord(
    account: string,
    type: AccountLinkType,
    refreshUrl: string,
    returnUrl: string
  ): AccountLinkRecord {
    const { dashboardUrl } = GetAppConfig();
    const timestamp = Now();
    const expiresAt = timestamp + 60 * 60; // 1 hour (in seconds)
    const token = GenerateId('al_z', 32);
    const url = `${dashboardUrl}/onboard?token=${token}`;

    const record: AccountLinkRecord = {
      object: 'account_link',
      created: timestamp,
      expires_at: expiresAt,
      url: url,
      id: GenerateId('acct_link_z'),
      token: token,
      account: account,
      type: type,
      refresh_url: refreshUrl,
      return_url: returnUrl,
      consumed: false,
    };

    return record;
  }

  /**
   * Marks an account link as consumed (used).
   * Account links are single-use and should be marked consumed after the user
   * starts the onboarding flow.
   */
  async MarkAsConsumed(accountLinkId: string): Promise<void> {
    await this.db.Update('AccountLinks', accountLinkId, {
      consumed: true,
      consumed_at: Now(),
    });
  }

  /**
   * Retrieves an account link record by its token.
   * Used internally to validate and process onboarding requests.
   *
   * @param token - The token from the account link URL
   * @returns The full AccountLinkRecord or null if not found
   */
  async GetAccountLinkByToken(
    token: string
  ): Promise<AccountLinkRecord | null> {
    const accountLinks = await this.db.Find<AccountLinkRecord>(
      'AccountLinks',
      'token',
      token
    );
    if (accountLinks && accountLinks.length > 0) {
      return accountLinks[0];
    }
    return null;
  }

  /**
   * Validates whether an account link is valid for use.
   *
   * @param token - The token from the account link URL
   * @returns Object with validity status and the record if valid
   */
  async ValidateAccountLink(token: string): Promise<{
    valid: boolean;
    reason?: 'not_found' | 'expired' | 'consumed';
    record?: AccountLinkRecord;
  }> {
    const record = await this.GetAccountLinkByToken(token);

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
