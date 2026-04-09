/**
 * @fileOverview Methods for Payouts
 *
 *
 * @module Payout
 */

import { ClientSession } from 'mongoose';
import { Database } from './Database';
import { EventService } from './EventService';
import { ExtractChangedFields } from './Event';
import { BalanceTransactionModule } from './BalanceTransaction';
import { BalanceModule } from './Balance';
import { ExternalWalletModule } from './ExternalWallet';
import { AccountModule } from './Account';
import { Solana } from './chains/Solana';
import { GetPlatformAccountId } from './PlatformAccess';
import { GetAppConfig } from './AppConfig';
import { GenerateId } from '../utils/IdGenerator';
import { Now } from '../utils/Timestamp';
import { AppError } from '../utils/AppError';
import { ERRORS } from '../utils/Errors';
import {
  Payout as PayoutType,
  PayoutFailureCode,
  PayoutBatchBuildResponse,
  PayoutBatchBroadcastResponse,
} from '@zoneless/shared-types';
import { ListHelper, ListOptions, ListResult } from '../utils/ListHelper';
import { ValidateUpdate } from './Util';
import {
  CreatePayoutSchema,
  CreatePayoutInput,
  UpdatePayoutSchema,
  UpdatePayoutInput,
  BuildPayoutsBatchInput,
  BroadcastPayoutsBatchInput,
} from '../schemas/PayoutSchema';

/**
 * Extended list options for payouts with additional filters
 */
export interface PayoutListOptions extends Omit<ListOptions, 'filters'> {
  status?: PayoutType['status'];
  destination?: string;
  arrivalDate?:
    | {
        gt?: number;
        gte?: number;
        lt?: number;
        lte?: number;
      }
    | number;
}

/**
 * List options for fetching payouts by platform (using platform_account field)
 */
export interface PayoutPlatformListOptions
  extends Omit<PayoutListOptions, 'account'> {
  platformAccount: string;
}

export class PayoutModule {
  private readonly db: Database;
  private readonly eventService: EventService | null;
  private readonly listHelper: ListHelper<PayoutType>;
  private readonly platformListHelper: ListHelper<PayoutType>;
  private readonly accountModule: AccountModule;
  private readonly externalWalletModule: ExternalWalletModule;
  private readonly balanceModule: BalanceModule;
  private readonly balanceTransactionModule: BalanceTransactionModule;
  private readonly solana: Solana;

  constructor(db: Database, eventService?: EventService) {
    this.db = db;
    this.eventService = eventService || null;
    this.accountModule = new AccountModule(db);
    this.externalWalletModule = new ExternalWalletModule(db);
    this.balanceModule = new BalanceModule(db);
    this.balanceTransactionModule = new BalanceTransactionModule(db);
    this.solana = new Solana();
    this.listHelper = new ListHelper<PayoutType>(db, {
      collection: 'Payouts',
      orderByField: 'created',
      orderDirection: 'desc',
      urlPath: '/v1/payouts',
    });
    // List helper for querying by platform_account (for platform-level queries)
    this.platformListHelper = new ListHelper<PayoutType>(db, {
      collection: 'Payouts',
      orderByField: 'created',
      orderDirection: 'desc',
      urlPath: '/v1/payouts',
      accountField: 'platform_account',
    });
  }

  /**
   * Creates a new payout that transfers funds from a connected account's
   * balance to an external wallet.
   * Emits a 'payout.created' event if EventService is configured.
   *
   * @param account - The connected account ID to debit funds from
   * @param input - Payout creation parameters
   * @returns The created payout object
   */
  async CreatePayout(
    account: string,
    input: CreatePayoutInput
  ): Promise<PayoutType> {
    const validatedInput = ValidateUpdate(CreatePayoutSchema, input);

    const {
      amount,
      currency,
      destination,
      description,
      method,
      metadata,
      statement_descriptor,
    } = validatedInput;

    if (amount <= 0) {
      throw new AppError(
        'Amount must be greater than 0',
        400,
        'invalid_request_error'
      );
    }

    // Get the destination wallet - either specified or the account's default
    let wallet;

    if (destination) {
      // Use specified destination wallet
      wallet = await this.externalWalletModule.GetExternalWallet(destination);

      if (!wallet) {
        throw new AppError(
          ERRORS.EXTERNAL_WALLET_NOT_FOUND.message,
          ERRORS.EXTERNAL_WALLET_NOT_FOUND.status,
          ERRORS.EXTERNAL_WALLET_NOT_FOUND.type
        );
      }

      if (wallet.status === 'archived') {
        throw new AppError(
          'Cannot create a payout to an archived wallet. Please use an active wallet.',
          400,
          'invalid_request_error'
        );
      }

      if (wallet.account !== account) {
        throw new AppError(
          'Destination wallet does not belong to this account',
          400,
          'invalid_request_error'
        );
      }
    } else {
      // Get the account's default external wallet
      const wallets = await this.externalWalletModule.GetExternalWalletsByAccount(
        account
      );

      if (wallets.length === 0) {
        throw new AppError(
          'No external wallet found for this account. Please add a payout method first.',
          400,
          'invalid_request_error'
        );
      }

      // Use the default wallet (first one marked as default, or just the first one)
      wallet =
        wallets.find((w) => w.default_for_currency === true) || wallets[0];
    }

    // Verify the wallet address is valid on the Solana network
    const walletExists = await this.solana.CheckWalletExists(
      wallet.wallet_address
    );
    if (!walletExists) {
      throw new AppError(
        'Destination wallet address is not valid on the Solana network',
        400,
        'invalid_request_error'
      );
    }

    // Get the account to determine the platform
    const payoutAccount = await this.accountModule.GetAccount(account);
    if (!payoutAccount) {
      throw new AppError(
        ERRORS.ACCOUNT_NOT_FOUND.message,
        ERRORS.ACCOUNT_NOT_FOUND.status,
        ERRORS.ACCOUNT_NOT_FOUND.type
      );
    }
    const platformAccountId = GetPlatformAccountId(payoutAccount);

    const payout = await this.db.RunTransaction(
      async (session: ClientSession) => {
        // Store the wallet ID as destination (not the wallet address)
        const newPayout = this.PayoutObject({
          account,
          platformAccountId,
          amount,
          currency: currency ?? 'usdc',
          destination: wallet.id,
          description,
          method: method ?? 'instant',
          metadata: metadata ?? {},
          statementDescriptor: statement_descriptor,
        });

        const timestamp = Now();
        const balanceTransaction =
          this.balanceTransactionModule.BalanceTransactionObject({
            amount: -amount,
            currency: currency ?? 'usdc',
            account: account,
            platformAccountId,
            type: 'payout',
            source: newPayout.id,
            description: description || `Payout to wallet ${wallet.id}`,
            metadata: {},
            status: 'pending',
            available_on: timestamp,
          });

        newPayout.balance_transaction = balanceTransaction.id;

        // Verify account has sufficient funds
        const balanceData = await this.balanceModule.GetBalance(account, session);
        if (!balanceData) {
          throw new AppError(
            ERRORS.BALANCE_NOT_FOUND.message,
            ERRORS.BALANCE_NOT_FOUND.status,
            ERRORS.BALANCE_NOT_FOUND.type
          );
        }

        const availableAmount =
          balanceData.available.find((b) => b.currency === (currency ?? 'usdc'))
            ?.amount || 0;

        if (availableAmount < amount) {
          throw new AppError(
            'Insufficient funds in account balance',
            402,
            'insufficient_funds'
          );
        }

        // Persist payout and balance transaction
        await this.db.Set('Payouts', newPayout.id, newPayout, session);
        await this.db.Set(
          'BalanceTransactions',
          balanceTransaction.id,
          balanceTransaction,
          session
        );

        // Deduct from available balance
        const updatedBalance = this.balanceModule.UpdateBalance(
          balanceData,
          -amount,
          currency ?? 'usdc',
          'available'
        );
        await this.db.Update(
          'Balances',
          updatedBalance.id,
          { available: updatedBalance.available },
          session
        );

        return newPayout;
      }
    );

    // Emit payout.created event
    if (this.eventService) {
      await this.eventService.Emit('payout.created', account, payout);
    }

    return payout;
  }

  /**
   * Get a single payout by ID.
   *
   * @param payoutId - The payout ID to retrieve
   * @returns The payout object or null if not found
   */
  async GetPayout(payoutId: string): Promise<PayoutType | null> {
    return this.db.Get<PayoutType>('Payouts', payoutId);
  }

  /**
   * Update a payout's metadata.
   * Emits a 'payout.updated' event if EventService is configured.
   *
   * @param payoutId - The payout ID to update
   * @param input - The fields to update
   * @returns The updated payout object
   */
  async UpdatePayout(
    payoutId: string,
    input: UpdatePayoutInput
  ): Promise<PayoutType> {
    const validatedUpdate = ValidateUpdate(UpdatePayoutSchema, input);

    // Get previous state for the event
    const previousPayout = this.eventService
      ? await this.GetPayout(payoutId)
      : null;

    if (Object.keys(validatedUpdate).length > 0) {
      await this.db.Update<PayoutType>(
        'Payouts',
        payoutId,
        validatedUpdate as Partial<PayoutType>
      );
    }

    const payout = await this.GetPayout(payoutId);
    if (!payout) {
      throw new AppError(
        ERRORS.PAYOUT_NOT_FOUND.message,
        ERRORS.PAYOUT_NOT_FOUND.status,
        ERRORS.PAYOUT_NOT_FOUND.type
      );
    }

    // Emit payout.updated event
    if (this.eventService && Object.keys(validatedUpdate).length > 0) {
      const previousAttributes = previousPayout
        ? ExtractChangedFields(
            previousPayout as unknown as Record<string, unknown>,
            validatedUpdate as Record<string, unknown>
          )
        : null;

      await this.eventService.Emit('payout.updated', payout.account, payout, {
        previousAttributes,
      });
    }

    return payout;
  }

  /**
   * List payouts with cursor-based pagination.
   * Supports filtering by status, destination, created, and arrival_date.
   *
   * @param options - Pagination and filter options
   * @returns Paginated list of payouts
   */
  async ListPayouts(
    options: PayoutListOptions
  ): Promise<ListResult<PayoutType>> {
    const { status, destination, arrivalDate, ...listOptions } = options;

    // Build filters for direct field matching
    const filters: Record<string, unknown> = {};
    if (status) filters.status = status;
    if (destination) filters.destination = destination;

    // Use the list helper for basic pagination
    let result = await this.listHelper.List({
      ...listOptions,
      filters,
    });

    // Apply arrival_date filter (post-filter since it's not in the standard ListHelper)
    if (arrivalDate) {
      result = {
        ...result,
        data: this.FilterByArrivalDate(result.data, arrivalDate),
      };
    }

    return result;
  }

  /**
   * List payouts for a platform (queries by platform_account field).
   * Returns all payouts belonging to the platform and its connected accounts.
   * Supports the same filtering as ListPayouts.
   *
   * @param options - Pagination and filter options with platform account ID
   * @returns Paginated list of payouts
   */
  async ListPayoutsByPlatform(
    options: PayoutPlatformListOptions
  ): Promise<ListResult<PayoutType>> {
    const {
      platformAccount,
      status,
      destination,
      arrivalDate,
      ...listOptions
    } = options;

    // Build filters for direct field matching
    const filters: Record<string, unknown> = {};
    if (status) filters.status = status;
    if (destination) filters.destination = destination;

    // Use the platform list helper which queries by platform_account
    let result = await this.platformListHelper.List({
      ...listOptions,
      account: platformAccount, // This will query platform_account field
      filters,
    });

    // Apply arrival_date filter (post-filter since it's not in the standard ListHelper)
    if (arrivalDate) {
      result = {
        ...result,
        data: this.FilterByArrivalDate(result.data, arrivalDate),
      };
    }

    return result;
  }

  /**
   * Filter payouts by arrival_date
   */
  private FilterByArrivalDate(
    payouts: PayoutType[],
    arrivalDate:
      | { gt?: number; gte?: number; lt?: number; lte?: number }
      | number
  ): PayoutType[] {
    if (typeof arrivalDate === 'number') {
      return payouts.filter((p) => p.arrival_date === arrivalDate);
    }

    return payouts.filter((payout) => {
      const date = payout.arrival_date;
      if (arrivalDate.gt !== undefined && date <= arrivalDate.gt) return false;
      if (arrivalDate.gte !== undefined && date < arrivalDate.gte) return false;
      if (arrivalDate.lt !== undefined && date >= arrivalDate.lt) return false;
      if (arrivalDate.lte !== undefined && date > arrivalDate.lte) return false;
      return true;
    });
  }

  /**
   * Cancel a pending payout and refund the account balance.
   * Emits a 'payout.canceled' event if EventService is configured.
   *
   * @param payoutId - The payout ID to cancel
   * @returns The cancelled payout object
   */
  async CancelPayout(payoutId: string): Promise<PayoutType> {
    const payout = await this.GetPayout(payoutId);

    if (!payout) {
      throw new AppError(
        ERRORS.PAYOUT_NOT_FOUND.message,
        ERRORS.PAYOUT_NOT_FOUND.status,
        ERRORS.PAYOUT_NOT_FOUND.type
      );
    }

    if (payout.status !== 'pending') {
      throw new AppError(
        `Payout cannot be canceled because it has status: ${payout.status}`,
        400,
        'invalid_request_error'
      );
    }

    const canceledPayout = await this.db.RunTransaction(
      async (session: ClientSession) => {
        // Mark payout as canceled
        await this.db.Update(
          'Payouts',
          payoutId,
          { status: 'canceled' },
          session
        );

        // Update balance transaction status
        if (payout.balance_transaction) {
          await this.db.Update(
            'BalanceTransactions',
            payout.balance_transaction,
            { status: 'canceled' },
            session
          );
        }

        // Refund the balance
        await this.RefundPayoutBalance(payout, session);

        const updatedPayout = await this.db.Get<PayoutType>(
          'Payouts',
          payoutId,
          session
        );

        return updatedPayout!;
      }
    );

    // Emit payout.canceled event
    if (this.eventService) {
      await this.eventService.Emit(
        'payout.canceled',
        canceledPayout.account,
        canceledPayout
      );
    }

    return canceledPayout;
  }

  /**
   * Gets the platform's wallet public key from ExternalWallet.
   * Used for building batch payout transactions.
   *
   * @param platformAccountId - The platform account ID
   * @returns The platform's wallet public key
   */
  private async GetPlatformWalletPublicKey(
    platformAccountId: string
  ): Promise<string> {
    const wallets = await this.externalWalletModule.GetExternalWalletsByAccount(
      platformAccountId
    );
    const platformWallet =
      wallets.find((w) => w.default_for_currency) || wallets[0];
    if (!platformWallet) {
      throw new AppError(
        'Platform wallet not found. Please set up your wallet first.',
        400,
        'invalid_request_error'
      );
    }
    return platformWallet.wallet_address;
  }

  /**
   * Build an unsigned batch payout transaction for multiple pending payouts.
   * This allows platforms to sign the transaction locally before broadcasting.
   *
   * @param platformAccountId - The platform account ID (for verification)
   * @param input - Object containing array of payout IDs
   * @returns Unsigned transaction data ready for signing
   */
  async BuildPayoutsBatch(
    platformAccountId: string,
    input: BuildPayoutsBatchInput
  ): Promise<PayoutBatchBuildResponse> {
    const { payouts: payoutIds } = input;

    // Fetch all payouts and validate they exist and are pending
    const payouts: PayoutType[] = [];

    for (const payoutId of payoutIds) {
      const payout = await this.GetPayout(payoutId);

      if (!payout) {
        throw new AppError(
          `Payout ${payoutId} not found`,
          ERRORS.PAYOUT_NOT_FOUND.status,
          ERRORS.PAYOUT_NOT_FOUND.type
        );
      }

      // Verify payout is pending
      if (payout.status !== 'pending') {
        throw new AppError(
          `Payout ${payoutId} is not pending (status: ${payout.status})`,
          400,
          'invalid_request_error'
        );
      }

      // Verify payout belongs to a connected account of this platform
      const payoutAccount = await this.accountModule.GetAccount(payout.account);
      if (!payoutAccount) {
        throw new AppError(
          `Account ${payout.account} not found for payout ${payoutId}`,
          400,
          'invalid_request_error'
        );
      }

      const accountPlatformId = GetPlatformAccountId(payoutAccount);
      if (accountPlatformId !== platformAccountId) {
        throw new AppError(
          `Payout ${payoutId} does not belong to your platform`,
          403,
          'permission_denied'
        );
      }

      payouts.push(payout);
    }

    // Build recipients list from payouts
    const recipients: { destinationAddress: string; amountInCents: number }[] =
      [];

    for (const payout of payouts) {
      const wallet = await this.externalWalletModule.GetExternalWallet(
        payout.destination
      );

      if (!wallet) {
        throw new AppError(
          `External wallet ${payout.destination} not found for payout ${payout.id}`,
          400,
          'invalid_request_error'
        );
      }

      recipients.push({
        destinationAddress: wallet.wallet_address,
        amountInCents: payout.amount,
      });
    }

    // Get the platform's wallet public key from ExternalWallet
    const platformWalletPublicKey = await this.GetPlatformWalletPublicKey(
      platformAccountId
    );

    // Build the unsigned transaction
    const transactionData = await this.solana.BuildBatchPayoutTransaction(
      platformWalletPublicKey,
      recipients
    );

    // Mark all payouts as processing (to prevent duplicate builds)
    await this.db.RunTransaction(async (session: ClientSession) => {
      for (const payout of payouts) {
        await this.db.Update(
          'Payouts',
          payout.id,
          { status: 'processing' },
          session
        );
      }
    });

    const totalAmount = payouts.reduce((sum, p) => sum + p.amount, 0);

    return {
      object: 'payout_batch_build',
      unsigned_transaction: transactionData.unsigned_transaction,
      estimated_fee_lamports: transactionData.estimated_fee_lamports,
      blockhash: transactionData.blockhash,
      last_valid_block_height: transactionData.last_valid_block_height,
      payouts,
      total_amount: totalAmount,
      recipients_count: transactionData.recipients_count,
    };
  }

  /**
   * Broadcast a signed batch payout transaction and update payout statuses.
   *
   * @param platformAccountId - The platform account ID (for verification)
   * @param input - Object containing signed transaction and payout IDs
   * @returns Broadcast result with updated payouts
   */
  async BroadcastPayoutsBatch(
    platformAccountId: string,
    input: BroadcastPayoutsBatchInput
  ): Promise<PayoutBatchBroadcastResponse> {
    const {
      signed_transaction,
      payouts: payoutIds,
      blockhash,
      last_valid_block_height,
    } = input;

    // Fetch and validate all payouts
    const payouts: PayoutType[] = [];

    for (const payoutId of payoutIds) {
      const payout = await this.GetPayout(payoutId);

      if (!payout) {
        throw new AppError(
          `Payout ${payoutId} not found`,
          ERRORS.PAYOUT_NOT_FOUND.status,
          ERRORS.PAYOUT_NOT_FOUND.type
        );
      }

      // Verify payout is in processing state (was built)
      if (payout.status !== 'processing' && payout.status !== 'pending') {
        throw new AppError(
          `Payout ${payoutId} is not ready for broadcast (status: ${payout.status})`,
          400,
          'invalid_request_error'
        );
      }

      // Verify payout belongs to a connected account of this platform
      const payoutAccount = await this.accountModule.GetAccount(payout.account);
      if (!payoutAccount) {
        throw new AppError(
          `Account ${payout.account} not found for payout ${payoutId}`,
          400,
          'invalid_request_error'
        );
      }

      const accountPlatformId = GetPlatformAccountId(payoutAccount);
      if (accountPlatformId !== platformAccountId) {
        throw new AppError(
          `Payout ${payoutId} does not belong to your platform`,
          403,
          'permission_denied'
        );
      }

      payouts.push(payout);
    }

    // Mark payouts as in_transit before broadcasting
    await this.db.RunTransaction(async (session: ClientSession) => {
      for (const payout of payouts) {
        await this.db.Update(
          'Payouts',
          payout.id,
          { status: 'in_transit' },
          session
        );
      }
    });

    // Broadcast the transaction
    const result = await this.solana.BroadcastSignedTransaction(
      signed_transaction,
      blockhash && last_valid_block_height
        ? { blockhash, lastValidBlockHeight: last_valid_block_height }
        : undefined
    );

    // Update all payouts based on result
    const updatedPayouts: PayoutType[] = [];

    if (result.status === 'paid') {
      // Success: mark all payouts as paid
      for (const payout of payouts) {
        await this.MarkPayoutPaid(payout, {
          network: 'solana',
          blockchain_tx: result.signature,
          gas_fee: 0, // Fee was paid by platform, not deducted from payout
          gas_fee_currency: 'sol',
          viewer_url: result.viewer_url,
        });

        const updatedPayout = await this.GetPayout(payout.id);
        if (updatedPayout) {
          updatedPayouts.push(updatedPayout);
        }
      }
    } else {
      // Failed: mark all payouts as failed and refund balances
      for (const payout of payouts) {
        await this.MarkPayoutFailed(
          payout,
          'blockchain_error',
          result.failure_message || 'Transaction broadcast failed'
        );

        const updatedPayout = await this.GetPayout(payout.id);
        if (updatedPayout) {
          updatedPayouts.push(updatedPayout);
        }
      }
    }

    return {
      object: 'payout_batch_broadcast',
      signature: result.signature,
      status: result.status,
      viewer_url: result.viewer_url,
      payouts: updatedPayouts,
      failure_message: result.failure_message,
    };
  }

  /**
   * Mark a payout as paid and emit the payout.paid event.
   */
  private async MarkPayoutPaid(
    payout: PayoutType,
    response: {
      network: string;
      blockchain_tx: string;
      gas_fee: number;
      gas_fee_currency: string;
      viewer_url: string;
    }
  ): Promise<void> {
    await this.db.RunTransaction(async (session: ClientSession) => {
      const updateData = {
        status: 'paid' as const,
        arrival_date: Now(),
        'metadata.network': response.network,
        'metadata.blockchain_tx': response.blockchain_tx,
        'metadata.gas_fee': response.gas_fee,
        'metadata.gas_fee_currency': response.gas_fee_currency,
        'metadata.viewer_url': response.viewer_url,
      };

      await this.db.Update('Payouts', payout.id, updateData, session);

      if (payout.balance_transaction) {
        await this.db.Update(
          'BalanceTransactions',
          payout.balance_transaction,
          { status: 'available' },
          session
        );
      }
    });

    // Emit payout.paid event
    if (this.eventService) {
      const updatedPayout = await this.GetPayout(payout.id);
      if (updatedPayout) {
        await this.eventService.Emit(
          'payout.paid',
          updatedPayout.account,
          updatedPayout
        );
      }
    }
  }

  /**
   * Mark a payout as failed, refund the balance, and emit the payout.failed event.
   */
  private async MarkPayoutFailed(
    payout: PayoutType,
    failureCode: PayoutFailureCode,
    failureMessage: string
  ): Promise<void> {
    await this.db.RunTransaction(async (session: ClientSession) => {
      await this.db.Update(
        'Payouts',
        payout.id,
        {
          status: 'failed',
          failure_code: failureCode,
          failure_message: failureMessage,
        },
        session
      );

      if (payout.balance_transaction) {
        await this.db.Update(
          'BalanceTransactions',
          payout.balance_transaction,
          { status: 'failed' },
          session
        );
      }

      await this.RefundPayoutBalance(payout, session);
    });

    // Emit payout.failed event
    if (this.eventService) {
      const updatedPayout = await this.GetPayout(payout.id);
      if (updatedPayout) {
        await this.eventService.Emit(
          'payout.failed',
          updatedPayout.account,
          updatedPayout
        );
      }
    }
  }

  /**
   * Refunds the payout amount back to the account's available balance.
   * Used when a payout is canceled, blocked, or fails.
   *
   * @param payout - The payout to refund
   * @param session - Optional database session for transaction
   */
  private async RefundPayoutBalance(
    payout: PayoutType,
    session?: ClientSession
  ): Promise<void> {
    const balanceData = await this.balanceModule.GetBalance(payout.account, session);

    if (balanceData) {
      const updatedBalance = this.balanceModule.UpdateBalance(
        balanceData,
        payout.amount,
        payout.currency,
        'available'
      );
      await this.db.Update(
        'Balances',
        updatedBalance.id,
        { available: updatedBalance.available },
        session
      );
    }
  }

  /**
   * Creates a payout object with all required fields.
   */
  PayoutObject(params: {
    account: string;
    platformAccountId: string;
    amount: number;
    currency: string;
    destination: string;
    description?: string;
    method?: 'standard' | 'instant';
    metadata?: Record<string, string>;
    statementDescriptor?: string;
    automatic?: boolean;
  }): PayoutType {
    const {
      account,
      platformAccountId,
      amount,
      currency,
      destination,
      description,
      method = 'instant',
      metadata = {},
      statementDescriptor,
      automatic = false,
    } = params;

    const timestamp = Now();
    const payout: PayoutType = {
      id: GenerateId('po_z'),
      object: 'payout',
      account: account,
      platform_account: platformAccountId,
      amount: amount,
      arrival_date: timestamp,
      automatic: automatic,
      balance_transaction: null,
      created: timestamp,
      currency: currency,
      description: description || null,
      destination: destination,
      livemode: GetAppConfig().livemode,
      metadata: metadata,
      method: method,
      source_type: 'wallet',
      statement_descriptor: statementDescriptor || null,
      status: 'pending',
      type: 'wallet',
    };

    return payout;
  }
}
