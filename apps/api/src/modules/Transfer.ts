/**
 * @fileOverview Methods for Transfers
 *
 * A Transfer is created when you move funds between accounts as part of Connect.
 * This module handles creating, retrieving, updating, and listing transfers.
 *
 *
 * @module Transfer
 * @see https://docs.stripe.com/api/transfers
 */

import { ClientSession } from 'mongoose';
import { Database } from './Database';
import { EventService } from './EventService';
import { ExtractChangedFields } from './Event';
import { AccountModule } from './Account';
import { BalanceTransactionModule } from './BalanceTransaction';
import { BalanceModule } from './Balance';
import { GetAppConfig } from './AppConfig';
import { GetPlatformAccountId } from './PlatformAccess';
import { GenerateId } from '../utils/IdGenerator';
import { Now } from '../utils/Timestamp';
import { AppError } from '../utils/AppError';
import { ERRORS } from '../utils/Errors';
import {
  Transfer as TransferType,
  TransferSourceType,
} from '@zoneless/shared-types';
import { ListHelper, ListOptions, ListResult } from '../utils/ListHelper';
import { ValidateUpdate } from './Util';
import {
  CreateTransferSchema,
  CreateTransferInput,
  UpdateTransferSchema,
  UpdateTransferInput,
} from '../schemas/TransferSchema';

/**
 * Extended list options for transfers with additional filters
 */
export interface TransferListOptions extends Omit<ListOptions, 'filters'> {
  destination?: string;
  transferGroup?: string;
}

export class TransferModule {
  private readonly db: Database;
  private readonly eventService: EventService | null;
  private readonly listHelper: ListHelper<TransferType>;
  private readonly accountModule: AccountModule;

  constructor(db: Database, eventService?: EventService) {
    this.db = db;
    this.eventService = eventService || null;
    this.accountModule = new AccountModule(db);
    this.listHelper = new ListHelper<TransferType>(db, {
      collection: 'Transfers',
      orderByField: 'created',
      orderDirection: 'desc',
      urlPath: '/v1/transfers',
    });
  }

  /**
   * Retrieves a transfer by ID.
   *
   * @param id - The transfer ID
   * @returns The transfer if found, null otherwise
   */
  async GetTransfer(id: string): Promise<TransferType | null> {
    return this.db.Get('Transfers', id);
  }

  /**
   * Updates a transfer's description and/or metadata.
   * Only these fields are updatable per Stripe API.
   * Emits a 'transfer.updated' event if EventService is configured.
   *
   * @param id - The transfer ID
   * @param input - Update parameters (description, metadata)
   * @returns The updated transfer
   */
  async UpdateTransfer(
    id: string,
    input: UpdateTransferInput
  ): Promise<TransferType> {
    const validatedInput = ValidateUpdate(UpdateTransferSchema, input);

    // Get previous state for the event
    const previousTransfer = this.eventService
      ? await this.GetTransfer(id)
      : null;

    const update: Partial<TransferType> = {};
    if (validatedInput.description !== undefined) {
      update.description = validatedInput.description;
    }
    if (validatedInput.metadata !== undefined) {
      update.metadata = validatedInput.metadata;
    }

    if (Object.keys(update).length > 0) {
      await this.db.Update('Transfers', id, update);
    }

    const transfer = await this.GetTransfer(id);

    if (!transfer) {
      throw new AppError(
        ERRORS.TRANSFER_NOT_FOUND.message,
        ERRORS.TRANSFER_NOT_FOUND.status,
        ERRORS.TRANSFER_NOT_FOUND.type
      );
    }

    // Emit transfer.updated event
    if (this.eventService && previousTransfer) {
      const previousAttributes = ExtractChangedFields(
        previousTransfer as unknown as Record<string, unknown>,
        update as Record<string, unknown>
      );

      await this.eventService.Emit(
        'transfer.updated',
        transfer.account,
        transfer,
        { previousAttributes }
      );
    }

    return transfer;
  }

  /**
   * List transfers with cursor-based pagination.
   * Follows Stripe's list API pattern.
   *
   * @param options - Pagination and filter options
   * @returns Paginated list of transfers
   */
  async ListTransfers(
    options: TransferListOptions
  ): Promise<ListResult<TransferType>> {
    const { destination, transferGroup, ...listOptions } = options;

    const filters: Record<string, unknown> = {};
    if (destination) filters.destination = destination;
    if (transferGroup) filters.transfer_group = transferGroup;

    return this.listHelper.List({
      ...listOptions,
      filters,
    });
  }

  /**
   * Creates a new transfer from one account to another.
   * Validates sufficient funds and destination account.
   * Emits a 'transfer.created' event if EventService is configured.
   *
   * @param sourceAccount - The account sending the funds
   * @param input - Transfer creation parameters
   * @returns The created transfer
   */
  async CreateTransfer(
    sourceAccount: string,
    input: CreateTransferInput
  ): Promise<TransferType> {
    const validatedInput = ValidateUpdate(CreateTransferSchema, input);

    const {
      amount,
      currency,
      destination,
      description,
      metadata,
      source_transaction,
      source_type,
      transfer_group,
    } = validatedInput;

    if (sourceAccount === destination) {
      throw new AppError(
        'Cannot transfer to the same account.',
        400,
        'invalid_request_error'
      );
    }

    // Verify destination is a valid connected account
    const destinationAccountData = await this.accountModule.GetAccount(
      destination
    );
    if (!destinationAccountData) {
      throw new AppError(
        `${ERRORS.NO_SUCH_CONNECTED_ACCOUNT.message}: '${destination}'`,
        ERRORS.NO_SUCH_CONNECTED_ACCOUNT.status,
        ERRORS.NO_SUCH_CONNECTED_ACCOUNT.type
      );
    }

    // Get source account to determine platform
    const sourceAccountData = await this.accountModule.GetAccount(
      sourceAccount
    );
    if (!sourceAccountData) {
      throw new AppError(
        ERRORS.ACCOUNT_NOT_FOUND.message,
        ERRORS.ACCOUNT_NOT_FOUND.status,
        ERRORS.ACCOUNT_NOT_FOUND.type
      );
    }
    const sourcePlatformAccountId = GetPlatformAccountId(sourceAccountData);
    const destPlatformAccountId = GetPlatformAccountId(destinationAccountData);

    const transfer = await this.db.RunTransaction(
      async (session: ClientSession) => {
        const balanceTransactionModule = new BalanceTransactionModule(this.db);
        const balanceModule = new BalanceModule(this.db);

        const transferObj = this.TransferObject({
          amount,
          currency,
          sourceAccount,
          platformAccountId: sourcePlatformAccountId,
          destination,
          description: description ?? null,
          metadata: metadata ?? {},
          sourceTransaction: source_transaction ?? null,
          sourceType: source_type ?? 'wallet',
          transferGroup: transfer_group ?? null,
        });

        const timestamp = Now();
        const balanceTransactionA =
          balanceTransactionModule.BalanceTransactionObject({
            amount: -amount,
            currency: currency,
            account: sourceAccount,
            platformAccountId: sourcePlatformAccountId,
            type: 'transfer',
            source: transferObj.id,
            description: description ?? null,
            metadata: {},
            status: 'available',
            available_on: timestamp,
          });
        const balanceTransactionB =
          balanceTransactionModule.BalanceTransactionObject({
            amount: amount,
            currency: currency,
            account: destination,
            platformAccountId: destPlatformAccountId,
            type: 'transfer',
            source: transferObj.id,
            description: description ?? null,
            metadata: {},
            status: 'available',
            available_on: timestamp,
          });

        transferObj.balance_transaction = balanceTransactionA.id;

        // Generate a destination payment ID for the receiving account
        transferObj.destination_payment = GenerateId('py_z');

        const balanceDataA = await balanceModule.GetBalance(
          sourceAccount,
          session
        );
        if (!balanceDataA) {
          throw new AppError(
            `Balance not found for account ${sourceAccount}`,
            404,
            'resource_missing'
          );
        }

        // Check for sufficient funds
        const sourceBalanceItem = (balanceDataA.available || []).find(
          (b) => b.currency === currency
        );
        const availableAmount = sourceBalanceItem
          ? sourceBalanceItem.amount
          : 0;

        if (availableAmount < amount) {
          throw new AppError('Insufficient funds.', 402, 'insufficient_funds');
        }

        const balanceDataB = await balanceModule.GetBalance(
          destination,
          session
        );
        if (!balanceDataB) {
          throw new AppError(
            `Balance not found for account ${destination}`,
            404,
            'resource_missing'
          );
        }

        await this.db.Set('Transfers', transferObj.id, transferObj, session);
        await this.db.Set(
          'BalanceTransactions',
          balanceTransactionA.id,
          balanceTransactionA,
          session
        );
        await this.db.Set(
          'BalanceTransactions',
          balanceTransactionB.id,
          balanceTransactionB,
          session
        );

        const updatedBalanceA = balanceModule.UpdateBalance(
          balanceDataA,
          -amount,
          currency,
          'available'
        );
        await this.db.Update(
          'Balances',
          updatedBalanceA.id,
          { available: updatedBalanceA.available },
          session
        );

        const updatedBalanceB = balanceModule.UpdateBalance(
          balanceDataB,
          amount,
          currency,
          'available'
        );
        await this.db.Update(
          'Balances',
          updatedBalanceB.id,
          { available: updatedBalanceB.available },
          session
        );

        return transferObj;
      }
    );

    // Emit transfer.created event (routes to the platform based on source account)
    if (this.eventService) {
      await this.eventService.Emit(
        'transfer.created',
        transfer.account,
        transfer
      );
    }

    return transfer;
  }

  /**
   * Creates a Transfer object with all required fields.
   *
   * @param params - Transfer parameters
   * @returns A complete Transfer object
   */
  TransferObject(params: {
    amount: number;
    currency: string;
    sourceAccount: string;
    platformAccountId: string;
    destination: string;
    description: string | null;
    metadata: Record<string, string>;
    sourceTransaction: string | null;
    sourceType: TransferSourceType;
    transferGroup: string | null;
  }): TransferType {
    const {
      amount,
      currency,
      sourceAccount,
      platformAccountId,
      destination,
      description,
      metadata,
      sourceTransaction,
      sourceType,
      transferGroup,
    } = params;

    const timestamp = Now();
    const transferId = GenerateId('tr_z');

    const transfer: TransferType = {
      id: transferId,
      object: 'transfer',
      amount: amount,
      amount_reversed: 0,
      balance_transaction: null,
      created: timestamp,
      currency: currency.toLowerCase(),
      description: description,
      destination: destination,
      destination_payment: null,
      livemode: GetAppConfig().livemode,
      metadata: metadata,
      reversals: {
        object: 'list',
        data: [],
        has_more: false,
        url: `/v1/transfers/${transferId}/reversals`,
      },
      reversed: false,
      source_transaction: sourceTransaction,
      source_type: sourceType,
      transfer_group: transferGroup,
      account: sourceAccount,
      platform_account: platformAccountId,
    };

    return transfer;
  }
}
