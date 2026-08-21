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
import { GetSettlement, IsSimulatedSettlement } from './chains/Settlement';
import { GetPlatformAccountId } from './PlatformAccess';
import { GetAppConfig, IsOrchestraLive } from './AppConfig';
import { OrchestraModule } from './orchestra/OrchestraModule';
import {
  IsNativeSolanaUsdc,
  IsOrchestraPayoutDest,
} from './orchestra/OrchestraRails';
import { GenerateId } from '../utils/IdGenerator';
import { Now } from '../utils/Timestamp';
import { AppError } from '../utils/AppError';
import { ERRORS } from '../utils/Errors';
import { Logger } from '../utils/Logger';
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
  IsRejectedAccountReason,
} from '@zoneless/shared-schemas';
import { IdentityLiteModule } from './identity/IdentityLite';

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
  private readonly solana: ReturnType<typeof GetSettlement>;
  private orchestraModule: OrchestraModule | null;

  constructor(
    db: Database,
    eventService?: EventService,
    orchestraModule?: OrchestraModule
  ) {
    this.db = db;
    this.eventService = eventService || null;
    this.orchestraModule = orchestraModule || null;
    this.accountModule = new AccountModule(db);
    this.externalWalletModule = new ExternalWalletModule(db);
    this.balanceModule = new BalanceModule(db);
    this.balanceTransactionModule = new BalanceTransactionModule(db);
    this.solana = GetSettlement();
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

    const accountRecord = await this.accountModule.GetAccount(account);
    if (!accountRecord) {
      throw new AppError(
        ERRORS.ACCOUNT_NOT_FOUND.message,
        ERRORS.ACCOUNT_NOT_FOUND.status,
        ERRORS.ACCOUNT_NOT_FOUND.type
      );
    }

    if (IsRejectedAccountReason(accountRecord.requirements?.disabled_reason)) {
      throw new AppError(
        'This account has been rejected and cannot create payouts.',
        400,
        'invalid_request_error'
      );
    }

    if (!accountRecord.payouts_enabled) {
      throw new AppError(
        'Payouts are not enabled for this account. Complete onboarding and identity requirements first.',
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
      const wallets =
        await this.externalWalletModule.GetExternalWalletsByAccount(account);

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

    if (
      !IsOrchestraPayoutDest(wallet.network, wallet.currency) &&
      IsNativeSolanaUsdc(wallet.network, wallet.currency)
    ) {
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
    } else if (!IsOrchestraPayoutDest(wallet.network, wallet.currency)) {
      throw new AppError(
        'Unsupported payout destination',
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
        const balanceData = await this.balanceModule.GetBalance(
          account,
          session
        );
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

    const destKinds: Array<'native' | 'orchestra'> = [];
    const walletsByPayoutId = new Map<
      string,
      { wallet_address: string; network: string; currency: string }
    >();

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

      walletsByPayoutId.set(payout.id, wallet);

      if (IsNativeSolanaUsdc(wallet.network, wallet.currency)) {
        destKinds.push('native');
      } else if (IsOrchestraPayoutDest(wallet.network, wallet.currency)) {
        destKinds.push('orchestra');
      } else {
        throw new AppError(
          'Unsupported payout destination',
          400,
          'invalid_request_error'
        );
      }
    }

    const hasOrchestra = destKinds.includes('orchestra');
    const hasNative = destKinds.includes('native');
    if (hasOrchestra && (payouts.length !== 1 || hasNative)) {
      throw new AppError(
        'Orchestra payouts must be built one at a time and cannot be mixed with native solana:USDC dests',
        400,
        'invalid_request_error'
      );
    }

    let orchestraIntent = null;
    const recipients: { destinationAddress: string; amountInCents: number }[] =
      [];

    if (hasOrchestra) {
      orchestraIntent = await this.GetOrchestraModule().PreparePayout(
        platformAccountId,
        payouts[0]
      );
      if (!orchestraIntent?.deposit_address) {
        throw new AppError(
          'Orchestra did not return a deposit address for this payout',
          ERRORS.INVALID_REQUEST.status,
          ERRORS.INVALID_REQUEST.type
        );
      }
      recipients.push({
        destinationAddress: orchestraIntent.deposit_address,
        amountInCents: payouts[0].amount,
      });
      const refreshed = await this.GetPayout(payouts[0].id);
      if (refreshed) payouts[0] = refreshed;
    } else {
      for (const payout of payouts) {
        const wallet = walletsByPayoutId.get(payout.id)!;
        recipients.push({
          destinationAddress: wallet.wallet_address,
          amountInCents: payout.amount,
        });
      }
    }

    const platformWalletPublicKey = await this.GetPlatformWalletPublicKey(
      platformAccountId
    );

    const transactionData = await this.solana.BuildBatchPayoutTransaction(
      platformWalletPublicKey,
      recipients
    );

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
      ...(orchestraIntent ? { orchestra: orchestraIntent } : {}),
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
    const { signed_transaction, payouts: payoutIds } = input;

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

      // Accept legacy processing payouts as well as newly built pending payouts.
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
      signed_transaction
    );

    // Update all payouts based on result
    const updatedPayouts: PayoutType[] = [];

    if (result.status === 'paid') {
      const hasOrchestra = payouts.some((payout) => !!payout.orchestra);

      for (const payout of payouts) {
        if (payout.orchestra) {
          await this.MarkPayoutFundingInTransit(payout, {
            network: payout.orchestra.destination_chain,
            blockchain_tx: result.signature,
            viewer_url: result.viewer_url,
          });
        } else {
          await this.MarkPayoutPaid(payout, {
            network: IsSimulatedSettlement() ? 'simulated' : 'solana',
            blockchain_tx: result.signature,
            gas_fee: 0,
            gas_fee_currency: 'sol',
            viewer_url: result.viewer_url,
          });
        }

        const updatedPayout = await this.GetPayout(payout.id);
        if (updatedPayout) {
          updatedPayouts.push(updatedPayout);
        }
      }

      return {
        object: 'payout_batch_broadcast',
        signature: result.signature,
        status: hasOrchestra ? 'in_transit' : 'paid',
        viewer_url: result.viewer_url,
        payouts: updatedPayouts,
        failure_message: result.failure_message,
      };
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
   * Refresh an Orchestra payout after the funding tx. Native dests are a no-op.
   */
  async SyncPayout(
    platformAccountId: string,
    payoutId: string
  ): Promise<PayoutType> {
    const payout = await this.RequirePlatformPayout(platformAccountId, payoutId);

    if (!payout.orchestra) {
      return payout;
    }

    if (payout.status === 'paid' || payout.status === 'canceled') {
      return payout;
    }

    if (!IsOrchestraLive()) {
      await this.MarkPayoutPaid(payout, {
        network: payout.orchestra.destination_chain,
        blockchain_tx:
          typeof payout.metadata?.blockchain_tx === 'string'
            ? payout.metadata.blockchain_tx
            : `orch_sim:${payout.id}`,
        gas_fee: 0,
        gas_fee_currency: 'sol',
        viewer_url:
          typeof payout.metadata?.viewer_url === 'string'
            ? payout.metadata.viewer_url
            : '',
      });
      return (await this.GetPayout(payout.id)) ?? payout;
    }

    const order = await this.GetOrchestraModule().RefreshPayoutStatus(payout);
    if (!order) {
      return payout;
    }

    if (order.status === 'completed') {
      await this.MarkPayoutPaid(payout, {
        network: payout.orchestra.destination_chain,
        blockchain_tx:
          typeof payout.metadata?.blockchain_tx === 'string'
            ? payout.metadata.blockchain_tx
            : order.id ?? payout.id,
        gas_fee: 0,
        gas_fee_currency: 'sol',
        viewer_url:
          typeof payout.metadata?.viewer_url === 'string'
            ? payout.metadata.viewer_url
            : '',
      });
    } else if (order.status === 'failed' || order.status === 'refunded') {
      await this.MarkPayoutFailed(
        payout,
        'blockchain_error',
        'Orchestra payout failed'
      );
    }

    return (await this.GetPayout(payout.id)) ?? payout;
  }

  private GetOrchestraModule(): OrchestraModule {
    if (!this.orchestraModule) {
      this.orchestraModule = new OrchestraModule(this.db);
    }
    return this.orchestraModule;
  }

  private async RequirePlatformPayout(
    platformAccountId: string,
    payoutId: string
  ): Promise<PayoutType> {
    const payout = await this.GetPayout(payoutId);
    if (!payout) {
      throw new AppError(
        ERRORS.PAYOUT_NOT_FOUND.message,
        ERRORS.PAYOUT_NOT_FOUND.status,
        ERRORS.PAYOUT_NOT_FOUND.type
      );
    }

    const payoutAccount = await this.accountModule.GetAccount(payout.account);
    if (!payoutAccount) {
      throw new AppError(
        ERRORS.ACCOUNT_NOT_FOUND.message,
        ERRORS.ACCOUNT_NOT_FOUND.status,
        ERRORS.ACCOUNT_NOT_FOUND.type
      );
    }

    if (GetPlatformAccountId(payoutAccount) !== platformAccountId) {
      throw new AppError(
        `Payout ${payoutId} does not belong to your platform`,
        403,
        'permission_denied'
      );
    }

    return payout;
  }

  /**
   * Funding tx landed; Orchestra swap is still in flight.
   */
  private async MarkPayoutFundingInTransit(
    payout: PayoutType,
    response: {
      network: string;
      blockchain_tx: string;
      viewer_url: string;
    }
  ): Promise<void> {
    const orchestra = payout.orchestra
      ? { ...payout.orchestra, status: 'processing' }
      : payout.orchestra;

    await this.db.Update('Payouts', payout.id, {
      status: 'in_transit',
      orchestra,
      'metadata.network': response.network,
      'metadata.blockchain_tx': response.blockchain_tx,
      'metadata.viewer_url': response.viewer_url,
    });
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

    // Re-evaluate identity requirements (payout volume threshold → IDV)
    try {
      const identityLite = new IdentityLiteModule(this.db, this.eventService);
      await identityLite.EvaluateAndApply(payout.account);
    } catch (err) {
      // Payout already settled — soft-fail identity re-eval
      Logger.warn('Identity re-evaluation after payout.paid failed', {
        accountId: payout.account,
        payoutId: payout.id,
        error: err instanceof Error ? err.message : String(err),
      });
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
    const balanceData = await this.balanceModule.GetBalance(
      payout.account,
      session
    );

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
