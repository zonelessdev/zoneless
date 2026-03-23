/**
 * @fileOverview TopUp Monitor - Polls Solana for incoming USDC deposits
 *
 * This service runs at regular intervals to detect incoming USDC transfers
 * to platform wallets. When a transfer is detected, it creates a TopUp
 * record and credits the platform balance.
 *
 * IMPORTANT: The TopUpMonitor is DISABLED by default because it can cause
 * duplicate processing issues in multi-instance deployments (e.g., Cloud Run).
 * For production deployments, use the POST /v1/topups/check-deposits endpoint
 * instead, which is triggered on-demand when users confirm they've sent funds.
 *
 * To enable the monitor (e.g., for single-instance development), set:
 *   TOPUP_MONITOR_ENABLED=true
 *
 * In multi-tenant mode, the monitor polls all platform wallets.
 *
 *
 * @module TopUpMonitor
 */

import { Database } from './Database';
import { TopUpModule } from './TopUp';
import { AccountModule } from './Account';
import { ExternalWalletModule } from './ExternalWallet';
import { Solana, IncomingDeposit } from './chains/Solana';
import { EventService } from './EventService';
import { TopUp, CheckDepositsResponse } from '@zoneless/shared-types';
import { Logger } from '../utils/Logger';

// Hardcoded TopUp settings
const TOPUP_POLL_INTERVAL_MS = parseInt(
  process.env.TOPUP_POLL_INTERVAL_MS || '30000',
  10
);
// DISABLED by default to prevent duplicate processing in multi-instance deployments
const TOPUP_MONITOR_ENABLED = process.env.TOPUP_MONITOR_ENABLED === 'true';

/**
 * Internal representation of a platform wallet for polling.
 */
interface PlatformWalletInfo {
  /** The wallet ID */
  id: string;
  /** The platform account ID that owns this wallet */
  account: string;
  /** The wallet public key / address */
  publicKey: string;
}

export class TopUpMonitor {
  private readonly db: Database;
  private readonly topUpModule: TopUpModule;
  private readonly accountModule: AccountModule;
  private readonly externalWalletModule: ExternalWalletModule;
  private readonly solana: Solana;
  private intervalId: NodeJS.Timeout | null = null;
  private isRunning: boolean = false;

  constructor(db: Database) {
    this.db = db;
    const eventService = new EventService(db);
    this.topUpModule = new TopUpModule(db, eventService);
    this.accountModule = new AccountModule(db);
    this.externalWalletModule = new ExternalWalletModule(db);
    this.solana = new Solana();
  }

  /**
   * Check if the TopUp monitor is enabled via configuration.
   */
  static IsEnabled(): boolean {
    return TOPUP_MONITOR_ENABLED;
  }

  /**
   * Get the configured poll interval.
   */
  static GetPollInterval(): number {
    return TOPUP_POLL_INTERVAL_MS;
  }

  /**
   * Start the TopUp monitor.
   * Runs an initial check immediately, then polls at the configured interval.
   * In multi-tenant mode, polls all platform wallets.
   */
  Start(): void {
    if (this.isRunning) {
      Logger.warn('TopUpMonitor is already running');
      return;
    }

    if (!TopUpMonitor.IsEnabled()) {
      Logger.info('TopUpMonitor is disabled via configuration');
      return;
    }

    this.isRunning = true;
    Logger.info('TopUpMonitor started', {
      pollInterval: TOPUP_POLL_INTERVAL_MS,
      mode: 'multi-tenant',
    });

    // Run initial check
    this.Poll().catch((error) => {
      Logger.error('TopUpMonitor initial poll failed', error);
    });

    // Set up recurring poll
    this.intervalId = setInterval(() => {
      this.Poll().catch((error) => {
        Logger.error('TopUpMonitor poll failed', error);
      });
    }, TOPUP_POLL_INTERVAL_MS);
  }

  /**
   * Stop the TopUp monitor.
   */
  Stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    this.isRunning = false;
    Logger.info('TopUpMonitor stopped');
  }

  /**
   * Get all platform wallets for monitoring.
   * Returns the default/primary ExternalWallet for each platform account.
   */
  private async GetAllPlatformWallets(): Promise<PlatformWalletInfo[]> {
    const platformAccounts = await this.accountModule.GetPlatformAccounts();
    const wallets: PlatformWalletInfo[] = [];

    for (const account of platformAccounts) {
      const accountWallets =
        await this.externalWalletModule.GetExternalWalletsByAccount(account.id);
      const primaryWallet =
        accountWallets.find((w) => w.default_for_currency) || accountWallets[0];

      if (primaryWallet) {
        wallets.push({
          id: primaryWallet.id,
          account: account.id,
          publicKey: primaryWallet.wallet_address,
        });
      }
    }

    return wallets;
  }

  /**
   * Get the primary wallet for a specific platform account.
   */
  private async GetPlatformWallet(
    platformAccountId: string
  ): Promise<PlatformWalletInfo | null> {
    const wallets = await this.externalWalletModule.GetExternalWalletsByAccount(
      platformAccountId
    );
    const primaryWallet =
      wallets.find((w) => w.default_for_currency) || wallets[0];

    if (!primaryWallet) {
      return null;
    }

    return {
      id: primaryWallet.id,
      account: platformAccountId,
      publicKey: primaryWallet.wallet_address,
    };
  }

  /**
   * Poll for new incoming transfers across all platform wallets.
   */
  async Poll(): Promise<void> {
    try {
      Logger.debug('TopUpMonitor polling for new deposits...');

      const wallets = await this.GetAllPlatformWallets();

      if (wallets.length === 0) {
        Logger.debug('No platform wallets configured');
        return;
      }

      Logger.debug(`Polling ${wallets.length} platform wallet(s)`);

      for (const wallet of wallets) {
        try {
          await this.PollWallet(wallet, 1);
        } catch (error) {
          Logger.error('Failed to poll platform wallet', error as Error, {
            walletId: wallet.id,
            account: wallet.account,
          });
        }
      }
    } catch (error) {
      Logger.error('TopUpMonitor poll error', error as Error);
      throw error;
    }
  }

  /**
   * Check for new deposits for a specific platform account.
   * This is the primary method for on-demand deposit detection via the API.
   *
   * @param platformAccountId - The platform account ID to check deposits for
   * @param limit - Maximum number of recent signatures to check (default: 1)
   * @returns CheckDepositsResponse with processed count and created TopUps
   */
  async CheckDepositsForAccount(
    platformAccountId: string,
    limit: number = 1
  ): Promise<CheckDepositsResponse> {
    Logger.info('Checking deposits for account', { platformAccountId, limit });

    const wallet = await this.GetPlatformWallet(platformAccountId);

    if (!wallet) {
      Logger.warn('No wallet found for account', { platformAccountId });
      return {
        object: 'check_deposits_result',
        processed: 0,
        errors: 0,
        topups: [],
        message: 'No wallet configured for this account',
      };
    }

    const result = await this.PollWallet(wallet, limit);

    return {
      object: 'check_deposits_result',
      processed: result.processed,
      errors: result.errors,
      topups: result.topUps,
      message:
        result.processed > 0
          ? `Found and processed ${result.processed} new deposit(s)`
          : 'No new deposits found',
    };
  }

  /**
   * Poll a single platform wallet for incoming deposits.
   *
   * @param wallet - The platform wallet info to poll
   * @param limit - Maximum number of recent signatures to check
   * @returns Object with processed count, errors, and created TopUps
   */
  private async PollWallet(
    wallet: PlatformWalletInfo,
    limit: number
  ): Promise<{ processed: number; errors: number; topUps: TopUp[] }> {
    Logger.debug('Polling wallet', {
      walletId: wallet.id,
      account: wallet.account,
      publicKey: wallet.publicKey,
    });

    const result = { processed: 0, errors: 0, topUps: [] as TopUp[] };

    // Get already processed signatures to avoid duplicates
    const processedSignatures = await this.topUpModule.GetProcessedSignatures(
      wallet.account
    );

    // Fetch recent incoming deposits
    const deposits = await this.solana.GetIncomingDeposits(
      wallet.publicKey,
      limit,
      processedSignatures
    );

    if (deposits.length === 0) {
      Logger.debug('No new deposits found for wallet', {
        walletId: wallet.id,
      });
      return result;
    }

    Logger.info(`Found ${deposits.length} new deposit(s) to process`, {
      walletId: wallet.id,
      account: wallet.account,
    });

    // Process each deposit
    for (const deposit of deposits) {
      try {
        const topUp = await this.ProcessDeposit(deposit, wallet.account);
        if (topUp) {
          result.processed++;
          result.topUps.push(topUp);
        }
      } catch (error) {
        Logger.error('Failed to process deposit', error as Error, {
          signature: deposit.signature,
        });
        result.errors++;
      }
    }

    return result;
  }

  /**
   * Process a single incoming deposit.
   * Creates a TopUp and emits webhook events.
   *
   * @param deposit - The deposit to process
   * @param platformAccountId - The platform account to credit
   * @returns The created TopUp or null if already processed
   */
  private async ProcessDeposit(
    deposit: IncomingDeposit,
    platformAccountId: string
  ): Promise<TopUp | null> {
    // Double-check the signature hasn't been processed (race condition protection)
    const alreadyProcessed = await this.topUpModule.IsSignatureProcessed(
      deposit.signature
    );

    if (alreadyProcessed) {
      Logger.debug(
        `Skipping already processed signature: ${deposit.signature}`
      );
      return null;
    }

    Logger.info('Processing incoming deposit', {
      signature: deposit.signature,
      amount: deposit.amount,
      amountCents: deposit.amountCents,
      sender: deposit.senderAddress,
      platformAccountId,
    });

    // Create the TopUp (this also creates BalanceTransaction, updates balance, and emits events)
    const topUp = await this.topUpModule.CreateFromDeposit(
      deposit,
      platformAccountId
    );

    // Detailed audit log for the created TopUp
    Logger.info('TopUp processed successfully', {
      topUpId: topUp.id,
      amount: topUp.amount,
      currency: topUp.currency,
      status: topUp.status,
      blockchain_tx: topUp.metadata.blockchain_tx,
      sender: topUp.metadata.sender_address,
      explorer_url: topUp.metadata.explorer_url,
      balance_transaction: topUp.balance_transaction,
      arrival_date: topUp.arrival_date,
      platformAccountId,
    });

    return topUp;
  }

  /**
   * Manually trigger a poll (useful for testing or API endpoint).
   * Polls all platform wallets.
   */
  async ManualPoll(): Promise<{ processed: number; errors: number }> {
    let processed = 0;
    let errors = 0;

    try {
      const wallets = await this.GetAllPlatformWallets();

      for (const wallet of wallets) {
        try {
          const result = await this.PollWallet(wallet, 5);
          processed += result.processed;
          errors += result.errors;
        } catch (error) {
          Logger.error('Manual poll failed for wallet', error as Error, {
            walletId: wallet.id,
          });
          errors++;
        }
      }
    } catch (error) {
      Logger.error('Manual poll failed', error as Error);
      throw error;
    }

    return { processed, errors };
  }

  /**
   * Check if the monitor is currently running.
   */
  IsRunning(): boolean {
    return this.isRunning;
  }
}

// Singleton instance for the monitor
let monitorInstance: TopUpMonitor | null = null;

/**
 * Get or create the TopUpMonitor singleton.
 */
export function GetTopUpMonitor(db: Database): TopUpMonitor {
  if (!monitorInstance) {
    monitorInstance = new TopUpMonitor(db);
  }
  return monitorInstance;
}
