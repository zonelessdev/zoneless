/**
 * @fileOverview Methods for Balances
 *
 * Handles balance retrieval and updates for accounts.
 * Emits 'balance.available' events when balance changes.
 *
 *
 * @module Balance
 */

import { ClientSession } from 'mongoose';
import {
  Balance as BalanceType,
  BalanceAmount,
  BalanceDetails,
} from '@zoneless/shared-types';
import { GenerateId } from '../utils/IdGenerator';
import { Database } from './Database';
import { EventService } from './EventService';
import { GetAppConfig } from './AppConfig';
import { GetPlatformAccountId } from './PlatformAccess';
import { AccountModule } from './Account';
import { ExternalWalletModule } from './ExternalWallet';
import { Solana } from './chains/Solana';

export class BalanceModule {
  private readonly db: Database;
  private readonly eventService: EventService | null;
  private readonly accountModule: AccountModule;

  constructor(db: Database, eventService?: EventService) {
    this.db = db;
    this.eventService = eventService || null;
    this.accountModule = new AccountModule(db);
  }

  /**
   * Creates a new balance for an account.
   * Initializes with zero available and pending balances in USDC.
   *
   * @param accountId - The account ID to create a balance for
   * @returns The created balance
   */
  async CreateBalance(accountId: string): Promise<BalanceType> {
    // Get the account to determine the platform
    const account = await this.accountModule.GetAccount(accountId);
    const platformAccountId = account
      ? GetPlatformAccountId(account)
      : accountId;

    const balance = this.BalanceObject(accountId, platformAccountId);
    await this.db.Set('Balances', balance.id, balance);
    return balance;
  }

  /**
   * Creates a balance object with default values.
   *
   * @param accountId - The account ID
   * @param platformAccountId - The platform account ID that owns this resource
   * @returns A new balance object
   */
  BalanceObject(accountId: string, platformAccountId: string): BalanceType {
    const balance: BalanceType = {
      id: GenerateId('bal_z'),
      object: 'balance',
      account: accountId,
      platform_account: platformAccountId,
      livemode: GetAppConfig().livemode,
      available: [
        {
          amount: 0,
          currency: 'usdc',
        },
      ],
      pending: [
        {
          amount: 0,
          currency: 'usdc',
        },
      ],
    };
    return balance;
  }

  /**
   * Retrieves the balance for an account.
   *
   * @param accountId - The account ID to get the balance for
   * @param session - Optional MongoDB session for transactions
   * @returns The balance or null if not found
   */
  async GetBalance(
    accountId: string,
    session?: ClientSession
  ): Promise<BalanceType | null> {
    const balances = await this.db.Find<BalanceType>(
      'Balances',
      'account',
      accountId,
      session
    );
    if (balances && balances.length > 0) {
      return balances[0];
    }
    return null;
  }

  /**
   * Updates a balance by adding/subtracting an amount from available or pending.
   * This method modifies the balance object in memory - call SaveBalance to persist.
   *
   * @param balanceData - The current balance data
   * @param amount - The amount to add (positive) or subtract (negative)
   * @param currency - The currency code
   * @param type - Whether to update 'available' or 'pending' balance
   * @returns The updated balance object
   */
  UpdateBalance(
    balanceData: BalanceType,
    amount: number,
    currency: string,
    type: 'available' | 'pending'
  ): BalanceType {
    const targetArray: BalanceAmount[] =
      type === 'available'
        ? balanceData.available || []
        : balanceData.pending || [];
    let currencyFound = false;

    for (const balanceAmount of targetArray) {
      if (balanceAmount.currency === currency) {
        balanceAmount.amount += amount;
        // Update source_types if present
        if (balanceAmount.source_types?.wallet !== undefined) {
          balanceAmount.source_types.wallet += amount;
        }
        currencyFound = true;
        break;
      }
    }
    if (!currencyFound) {
      targetArray.push({
        amount: amount,
        currency: currency,
      });
    }

    if (type === 'available') {
      balanceData.available = targetArray;
    } else {
      balanceData.pending = targetArray;
    }

    return balanceData;
  }

  /**
   * Saves a balance to the database and optionally emits a balance.available event.
   *
   * @param balance - The balance to save
   * @param emitEvent - Whether to emit a balance.available event (default: true)
   * @param session - Optional MongoDB session for transactions
   */
  async SaveBalance(
    balance: BalanceType,
    emitEvent: boolean = true,
    session?: ClientSession
  ): Promise<void> {
    await this.db.Update(
      'Balances',
      balance.id,
      {
        available: balance.available,
        pending: balance.pending,
      },
      session
    );

    // Emit balance.available event if EventService is configured
    if (emitEvent && this.eventService) {
      await this.eventService.Emit(
        'balance.available',
        balance.account,
        balance
      );
    }
  }

  /**
   * Retrieves a detailed balance view for a platform account.
   * Combines on-chain wallet balances (USDC + SOL) with internal ledger data
   * and the total owed to connected accounts.
   *
   * @param platformAccountId - The platform account ID
   * @returns Detailed balance breakdown or null if no wallet/balance found
   */
  async GetBalanceDetails(
    platformAccountId: string
  ): Promise<BalanceDetails | null> {
    const externalWalletModule = new ExternalWalletModule(this.db);
    const wallets = await externalWalletModule.GetExternalWalletsByAccount(
      platformAccountId
    );
    const wallet = wallets.find((w) => w.default_for_currency) || wallets[0];

    if (!wallet) return null;

    const solana = new Solana();
    const [walletUsdc, walletSol, platformBalance, connectedOwed] =
      await Promise.all([
        solana.GetUSDCBalance(wallet.wallet_address),
        solana.GetSOLBalance(wallet.wallet_address),
        this.GetBalance(platformAccountId),
        this.GetConnectedAccountsOwed(platformAccountId),
      ]);

    const available =
      platformBalance?.available?.find((b) => b.currency === 'usdc')?.amount ??
      0;
    const pending =
      platformBalance?.pending?.find((b) => b.currency === 'usdc')?.amount ?? 0;

    return {
      object: 'balance_details',
      wallet_usdc: walletUsdc,
      wallet_sol: walletSol,
      connected_accounts_owed: connectedOwed,
      platform_available: available,
      platform_pending: pending,
      wallet_address: wallet.wallet_address,
    };
  }

  /**
   * Sums the available + pending USDC balance across all connected accounts
   * belonging to a platform via a MongoDB aggregation pipeline.
   * Returns a single number without pulling documents into memory.
   *
   * @param platformAccountId - The platform account ID
   * @returns Total owed in cents
   */
  async GetConnectedAccountsOwed(platformAccountId: string): Promise<number> {
    const result = await this.db.Aggregate<{ total: number }>('Balances', [
      {
        $match: {
          platform_account: platformAccountId,
          account: { $ne: platformAccountId },
        },
      },
      {
        $addFields: {
          _usdcAvailable: {
            $reduce: {
              input: { $ifNull: ['$available', []] },
              initialValue: 0,
              in: {
                $cond: [
                  { $eq: ['$$this.currency', 'usdc'] },
                  { $add: ['$$value', '$$this.amount'] },
                  '$$value',
                ],
              },
            },
          },
          _usdcPending: {
            $reduce: {
              input: { $ifNull: ['$pending', []] },
              initialValue: 0,
              in: {
                $cond: [
                  { $eq: ['$$this.currency', 'usdc'] },
                  { $add: ['$$value', '$$this.amount'] },
                  '$$value',
                ],
              },
            },
          },
        },
      },
      {
        $group: {
          _id: null,
          total: { $sum: { $add: ['$_usdcAvailable', '$_usdcPending'] } },
        },
      },
    ]);

    return result.length > 0 ? result[0].total : 0;
  }

  /**
   * Synchronises the platform's internal balance with the on-chain USDC wallet.
   * Adjusts the available balance so that:
   *   platform_available = wallet_usdc_cents - connected_accounts_owed
   *
   * Only adjusts if there is a discrepancy. Emits a balance.available event
   * after syncing.
   *
   * @param platformAccountId - The platform account ID
   * @returns The updated balance details after sync
   */
  async SyncBalance(platformAccountId: string): Promise<BalanceDetails | null> {
    const details = await this.GetBalanceDetails(platformAccountId);
    if (!details) return null;

    const walletUsdcCents = Math.round(details.wallet_usdc * 100);
    const expectedAvailable = walletUsdcCents - details.connected_accounts_owed;

    if (details.platform_available !== expectedAvailable) {
      const balance = await this.GetBalance(platformAccountId);
      if (!balance) return details;

      const usdcEntry = balance.available?.find((b) => b.currency === 'usdc');
      if (usdcEntry) {
        usdcEntry.amount = expectedAvailable;
        if (usdcEntry.source_types?.wallet !== undefined) {
          usdcEntry.source_types.wallet = expectedAvailable;
        }
      } else {
        balance.available = [
          ...(balance.available || []),
          { amount: expectedAvailable, currency: 'usdc' },
        ];
      }

      // Clear pending after sync - deposits have been accounted for
      const pendingUsdc = balance.pending?.find((b) => b.currency === 'usdc');
      if (pendingUsdc) {
        pendingUsdc.amount = 0;
      }

      await this.SaveBalance(balance, true);

      return {
        ...details,
        platform_available: expectedAvailable,
        platform_pending: 0,
      };
    }

    return details;
  }
}
