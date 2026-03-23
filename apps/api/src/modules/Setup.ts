/**
 * @fileOverview Platform Setup Module
 *
 * Handles platform account creation and setup.
 * In multi-tenant mode, multiple platforms can be created independently.
 *
 * @module Setup
 */

import { Database } from './Database';
import { AccountModule } from './Account';
import { ApiKeyModule } from './ApiKey';
import { PersonModule } from './Person';
import { BalanceModule } from './Balance';
import { ExternalWalletModule } from './ExternalWallet';
import { SignToken } from '../utils/Token';
import { SetupRequest, SetupResponse } from '@zoneless/shared-types';
import { GetJwtSecret } from './AppConfig';
import { AppError } from '../utils/AppError';
import { ERRORS } from '../utils/Errors';

/**
 * Handles platform setup and account creation.
 */
export class SetupModule {
  private readonly db: Database;
  private readonly accountModule: AccountModule;
  private readonly apiKeyModule: ApiKeyModule;
  private readonly personModule: PersonModule;
  private readonly balanceModule: BalanceModule;
  private readonly externalWalletModule: ExternalWalletModule;

  constructor(db: Database) {
    this.db = db;
    this.accountModule = new AccountModule(db);
    this.apiKeyModule = new ApiKeyModule(db);
    this.personModule = new PersonModule(db);
    this.balanceModule = new BalanceModule(db);
    this.externalWalletModule = new ExternalWalletModule(db);
  }

  /**
   * Creates a new platform account with all required resources.
   * This creates:
   * - A platform account (standard type, no platform_account field)
   * - A person record for the platform
   * - A balance for the platform
   * - An ExternalWallet for receiving USDC deposits
   * - An initial API key
   *
   * Note: Wallet generation happens in the browser. Only the public key is
   * sent to the API. The secret key is never stored on the server.
   *
   * @param request - The setup request with platform details
   * @returns Setup response with credentials (shown once!)
   */
  async CreatePlatformAccount(request: SetupRequest): Promise<SetupResponse> {
    // Validate wallet public key is provided
    if (!request.solana_public_key || !request.solana_public_key.trim()) {
      throw new AppError(
        'solana_public_key is required',
        ERRORS.VALIDATION_ERROR.status,
        ERRORS.VALIDATION_ERROR.type
      );
    }

    // Create platform account (standard type, no parent platform_account)
    // Platform accounts have full dashboard access
    const account = await this.accountModule.CreateAccount({
      type: 'standard',
      business_type: 'company',
      country: request.country || 'US',
      business_profile: {
        name: request.platform_name,
        url: request.platform_url,
      },
      settings: {
        branding: {
          logo: request.platform_logo_url || null,
        },
        dashboard: {
          display_name: request.platform_name,
        },
        terms_url: request.terms_url || null,
        privacy_url: request.privacy_url || null,
      },
    });
    // Note: No platformAccountId passed - this IS a platform (root account)

    // Create Person and Balance for the account (required for dashboard)
    await Promise.all([
      this.personModule.CreatePerson(account.id, {
        first_name: request.platform_name,
      }),
      this.balanceModule.CreateBalance(account.id),
    ]);

    // Create ExternalWallet for the platform (only stores public key)
    const wallet = await this.externalWalletModule.CreateExternalWallet(
      account.id,
      {
        wallet_address: request.solana_public_key.trim(),
        network: 'solana',
        currency: 'usdc',
        default_for_currency: true,
        account_holder_type: 'company',
        account_holder_name: request.platform_name,
      }
    );

    // Mark account as fully set up
    await this.accountModule.DetailsSubmitted(account.id);
    await this.accountModule.PayoutsEnabled(account.id);
    await this.accountModule.TOSAccepted(account.id);

    // Generate API key (plaintext token only available at creation)
    const apiKeyResult = await this.apiKeyModule.CreateApiKey(
      account.id,
      'Platform Master Key'
    );

    // Generate a login token for immediate dashboard access
    const loginToken = SignToken(
      { account_id: account.id, type: 'account_session' },
      GetJwtSecret(),
      '7d'
    );

    return {
      object: 'setup_response',
      success: true,
      api_key: apiKeyResult.plaintext_token,
      platform_account_id: account.id,
      solana_public_key: wallet.wallet_address,
      login_token: loginToken,
    };
  }

  /**
   * Gets setup status for an authenticated account.
   * Returns whether the account is a platform and has a wallet configured.
   *
   * @param accountId - The account to check
   * @returns Setup status
   */
  async GetSetupStatus(accountId: string): Promise<{
    object: 'setup_status';
    is_platform: boolean;
    has_wallet: boolean;
  }> {
    const account = await this.accountModule.GetAccount(accountId);

    if (!account) {
      return {
        object: 'setup_status',
        is_platform: false,
        has_wallet: false,
      };
    }

    // A platform account has platform_account === id (self-referential)
    const isPlatform = account.platform_account === account.id;

    // Check if platform has an external wallet
    let hasWallet = false;
    if (isPlatform) {
      const wallets =
        await this.externalWalletModule.GetExternalWalletsByAccount(accountId);
      hasWallet = wallets.length > 0;
    }

    return {
      object: 'setup_status',
      is_platform: isPlatform,
      has_wallet: hasWallet,
    };
  }
}
