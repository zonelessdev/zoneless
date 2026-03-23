/**
 * @fileOverview Methods for TopUps
 *
 * TopUps represent incoming USDC deposits to a platform wallet.
 * When an incoming deposit is detected, a TopUp is created along with
 * a BalanceTransaction, and the platform's balance is increased.
 *
 *
 * @module TopUp
 */

import { ClientSession } from 'mongoose';
import { Database } from './Database';
import { EventService } from './EventService';
import { BalanceTransactionModule } from './BalanceTransaction';
import { BalanceModule } from './Balance';
import { GetAppConfig } from './AppConfig';
import { GenerateId } from '../utils/IdGenerator';
import { Now } from '../utils/Timestamp';
import { AppError } from '../utils/AppError';
import { ERRORS } from '../utils/Errors';
import {
  TopUp as TopUpType,
  TopUpStatus,
  TopUpSource,
  QueryOperators,
} from '@zoneless/shared-types';
import { ListHelper, ListOptions, ListResult } from '../utils/ListHelper';
import { IncomingDeposit, SolanaExplorerUrl } from './chains/Solana';
import { CreateTopUpInput, UpdateTopUpInput } from '../schemas/TopUpSchema';

export class TopUpModule {
  private readonly db: Database;
  private readonly eventService: EventService | null;
  private readonly listHelper: ListHelper<TopUpType>;

  constructor(db: Database, eventService?: EventService) {
    this.db = db;
    this.eventService = eventService || null;
    this.listHelper = new ListHelper<TopUpType>(db, {
      collection: 'TopUps',
      orderByField: 'created',
      orderDirection: 'desc',
      urlPath: '/v1/topups',
    });
  }

  /**
   * Creates a TopUp via the API.
   * This is the standard API endpoint for platforms to create top-ups.
   * Emits a 'topup.created' event.
   *
   * @param input - The top-up creation input
   * @param platformAccountId - The platform account creating this top-up
   * @returns The created TopUp object
   */
  async Create(
    input: CreateTopUpInput,
    platformAccountId: string
  ): Promise<TopUpType> {
    const topUp = this.TopUpObject(
      input.amount,
      input.currency,
      platformAccountId,
      {
        description: input.description,
        statementDescriptor: input.statement_descriptor,
        transferGroup: input.transfer_group,
        metadata: input.metadata || {},
      }
    );

    await this.db.Set('TopUps', topUp.id, topUp);

    // Emit topup.created event
    if (this.eventService) {
      await this.eventService.Emit('topup.created', platformAccountId, topUp);
    }

    return topUp;
  }

  /**
   * Creates a TopUp from an incoming blockchain deposit.
   * This is called by the TopUpMonitor when a deposit is detected.
   * Emits 'topup.created' and 'topup.succeeded' events.
   *
   * @param deposit - The incoming deposit details from Solana
   * @param platformAccountId - The platform account to credit
   * @returns The created TopUp object
   */
  async CreateFromDeposit(
    deposit: IncomingDeposit,
    platformAccountId: string
  ): Promise<TopUpType> {
    return this.db
      .RunTransaction(async (session: ClientSession) => {
        const balanceTransactionModule = new BalanceTransactionModule(this.db);
        const balanceModule = new BalanceModule(this.db);

        const metadata: Record<string, string> = {
          blockchain_tx: deposit.signature,
          network: 'solana',
          sender_address: deposit.senderAddress,
          explorer_url: SolanaExplorerUrl('tx', deposit.signature),
        };

        const topUp = this.TopUpObject(
          deposit.amountCents,
          'usdc',
          platformAccountId,
          {
            description: `Deposit from ${deposit.senderAddress.slice(0, 8)}...`,
            metadata,
          }
        );

        // Mark as succeeded immediately since we detected a confirmed transaction
        const timestamp = Now();
        topUp.status = 'succeeded';
        topUp.arrival_date = timestamp;

        const balanceTransaction =
          balanceTransactionModule.BalanceTransactionObject({
            amount: deposit.amountCents,
            currency: 'usdc',
            account: platformAccountId,
            platformAccountId: platformAccountId,
            type: 'topup',
            source: topUp.id,
            description: `Top Up from ${deposit.senderAddress.slice(0, 8)}...`,
            metadata: {},
            status: 'available',
            available_on: timestamp,
          });

        topUp.balance_transaction = balanceTransaction.id;

        const balanceData = await balanceModule.GetBalance(
          platformAccountId,
          session
        );
        if (!balanceData) {
          throw new Error(`Balance not found for platform account`);
        }

        await this.db.Set('TopUps', topUp.id, topUp, session);
        await this.db.Set(
          'BalanceTransactions',
          balanceTransaction.id,
          balanceTransaction,
          session
        );

        const updatedBalance = balanceModule.UpdateBalance(
          balanceData,
          deposit.amountCents,
          'usdc',
          'available'
        );
        await this.db.Update(
          'Balances',
          updatedBalance.id,
          { available: updatedBalance.available },
          session
        );

        return topUp;
      })
      .then(async (topUp) => {
        // Emit events after transaction commits
        if (this.eventService) {
          await this.eventService.Emit(
            'topup.created',
            platformAccountId,
            topUp
          );
          await this.eventService.Emit(
            'topup.succeeded',
            platformAccountId,
            topUp
          );
        }
        return topUp;
      });
  }

  /**
   * Cancel a pending top-up.
   * Only pending top-ups can be canceled.
   * Emits a 'topup.canceled' event.
   *
   * @param topUpId - The TopUp ID to cancel
   * @returns The canceled TopUp object
   */
  async Cancel(topUpId: string): Promise<TopUpType> {
    const topUp = await this.GetTopUp(topUpId);
    if (!topUp) {
      throw new AppError(
        ERRORS.TOPUP_NOT_FOUND.message,
        ERRORS.TOPUP_NOT_FOUND.status,
        ERRORS.TOPUP_NOT_FOUND.type
      );
    }

    if (topUp.status !== 'pending') {
      throw new AppError(
        'Only pending top-ups can be canceled',
        400,
        'invalid_request_error'
      );
    }

    const update: Partial<TopUpType> = {
      status: 'canceled' as TopUpStatus,
    };

    await this.db.Update<TopUpType>('TopUps', topUpId, update);

    const updatedTopUp = await this.GetTopUp(topUpId);
    if (!updatedTopUp) {
      throw new AppError(
        ERRORS.TOPUP_NOT_FOUND.message,
        ERRORS.TOPUP_NOT_FOUND.status,
        ERRORS.TOPUP_NOT_FOUND.type
      );
    }

    // Emit topup.canceled event
    if (this.eventService) {
      await this.eventService.Emit(
        'topup.canceled',
        updatedTopUp.account,
        updatedTopUp
      );
    }

    return updatedTopUp;
  }

  /**
   * Mark a top-up as failed.
   * Used internally when a deposit fails to process.
   * Emits a 'topup.failed' event.
   *
   * @param topUpId - The TopUp ID to mark as failed
   * @param failureCode - Error code explaining the failure
   * @param failureMessage - Human-readable failure message
   * @returns The failed TopUp object
   */
  async MarkFailed(
    topUpId: string,
    failureCode: string,
    failureMessage: string
  ): Promise<TopUpType> {
    const topUp = await this.GetTopUp(topUpId);
    if (!topUp) {
      throw new AppError(
        ERRORS.TOPUP_NOT_FOUND.message,
        ERRORS.TOPUP_NOT_FOUND.status,
        ERRORS.TOPUP_NOT_FOUND.type
      );
    }

    const update: Partial<TopUpType> = {
      status: 'failed' as TopUpStatus,
      failure_code: failureCode,
      failure_message: failureMessage,
    };

    await this.db.Update<TopUpType>('TopUps', topUpId, update);

    const updatedTopUp = await this.GetTopUp(topUpId);
    if (!updatedTopUp) {
      throw new AppError(
        ERRORS.TOPUP_NOT_FOUND.message,
        ERRORS.TOPUP_NOT_FOUND.status,
        ERRORS.TOPUP_NOT_FOUND.type
      );
    }

    // Emit topup.failed event
    if (this.eventService) {
      await this.eventService.Emit(
        'topup.failed',
        updatedTopUp.account,
        updatedTopUp
      );
    }

    return updatedTopUp;
  }

  /**
   * Check if a blockchain transaction has already been processed as a TopUp.
   *
   * @param signature - The blockchain transaction signature
   * @returns True if already processed, false otherwise
   */
  async IsSignatureProcessed(signature: string): Promise<boolean> {
    const existingTopUps = await this.db.Find<TopUpType>(
      'TopUps',
      'metadata.blockchain_tx',
      signature
    );
    return existingTopUps.length > 0;
  }

  /**
   * Get all processed blockchain signatures for a platform account.
   * Used by the TopUpMonitor to avoid reprocessing.
   *
   * @param platformAccountId - The platform account to get signatures for
   * @param limit - Maximum number of recent signatures to fetch
   * @returns Set of processed signatures
   */
  async GetProcessedSignatures(
    platformAccountId: string,
    limit: number = 200
  ): Promise<Set<string>> {
    const topUps = await this.db.Query<TopUpType>({
      collection: 'TopUps',
      method: 'READ',
      parameters: [
        {
          key: 'account',
          operator: QueryOperators['=='],
          value: platformAccountId,
        },
      ],
      orderBy: [{ key: 'created', direction: 'desc' }],
      limit,
    });

    const signatures = new Set<string>();
    for (const topUp of topUps) {
      if (topUp.metadata?.blockchain_tx) {
        signatures.add(topUp.metadata.blockchain_tx);
      }
    }
    return signatures;
  }

  /**
   * Get a single TopUp by ID.
   *
   * @param topUpId - The TopUp ID to retrieve
   * @returns The TopUp object or null if not found
   */
  async GetTopUp(topUpId: string): Promise<TopUpType | null> {
    return this.db.Get<TopUpType>('TopUps', topUpId);
  }

  /**
   * Get a TopUp by blockchain transaction signature.
   *
   * @param signature - The blockchain transaction signature
   * @returns The TopUp object or null if not found
   */
  async GetTopUpBySignature(signature: string): Promise<TopUpType | null> {
    const topUps = await this.db.Find<TopUpType>(
      'TopUps',
      'metadata.blockchain_tx',
      signature
    );
    return topUps.length > 0 ? topUps[0] : null;
  }

  /**
   * List TopUps with cursor-based pagination.
   * Matches Stripe's GET /v1/topups endpoint.
   *
   * @param options - Pagination and filter options
   * @returns Paginated list of TopUps
   */
  async ListTopUps(
    options: ListOptions & {
      status?: TopUpStatus;
    }
  ): Promise<ListResult<TopUpType>> {
    const { status, ...listOptions } = options;

    const filters: Record<string, unknown> = {};
    if (status) filters.status = status;

    return this.listHelper.List({
      ...listOptions,
      filters: { ...listOptions.filters, ...filters },
    });
  }

  /**
   * Update a TopUp's metadata and/or description.
   * Only description and metadata are editable by design (matches Stripe).
   *
   * @param topUpId - The TopUp ID to update
   * @param input - The fields to update
   * @returns The updated TopUp object
   */
  async UpdateTopUp(
    topUpId: string,
    input: UpdateTopUpInput
  ): Promise<TopUpType | null> {
    const topUp = await this.GetTopUp(topUpId);
    if (!topUp) {
      return null;
    }

    const update: Partial<TopUpType> = {};

    if (input.description !== undefined) {
      update.description = input.description;
    }

    if (input.metadata !== undefined) {
      // Merge metadata - empty string values unset the key
      const newMetadata = { ...topUp.metadata };
      for (const [key, value] of Object.entries(input.metadata)) {
        if (value === '') {
          delete newMetadata[key];
        } else {
          newMetadata[key] = value;
        }
      }
      update.metadata = newMetadata;
    }

    if (Object.keys(update).length > 0) {
      await this.db.Update<TopUpType>('TopUps', topUpId, update);
    }

    return this.GetTopUp(topUpId);
  }

  /**
   * Creates a TopUp object with all required fields.
   * For TopUps, the account is always the platform account itself.
   */
  TopUpObject(
    amount: number,
    currency: string,
    account: string,
    options: {
      description?: string;
      statementDescriptor?: string;
      transferGroup?: string;
      metadata?: Record<string, string>;
      source?: TopUpSource;
    } = {}
  ): TopUpType {
    const timestamp = Now();
    const appConfig = GetAppConfig();

    const topUp: TopUpType = {
      id: GenerateId('tu_z'),
      object: 'topup',
      amount: amount,
      balance_transaction: null,
      created: timestamp,
      currency: currency.toLowerCase(),
      description: options.description ?? null,
      expected_availability_date: timestamp,
      failure_code: null,
      failure_message: null,
      livemode: appConfig.livemode,
      metadata: options.metadata || {},
      source: options.source ?? null,
      statement_descriptor: options.statementDescriptor ?? null,
      status: 'pending',
      transfer_group: options.transferGroup ?? null,
      // Zoneless extensions
      account: account,
      platform_account: account, // TopUps are always for platform accounts
      arrival_date: null,
    };

    // If metadata contains blockchain info, create a source object
    if (options.metadata?.blockchain_tx && !options.source) {
      topUp.source = {
        id: GenerateId('src_z'),
        object: 'source',
        type: 'crypto_deposit',
        metadata: {},
      };
    }

    return topUp;
  }
}
