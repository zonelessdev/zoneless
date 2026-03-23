/**
 * @fileOverview Methods for BalanceTransactions
 *
 *
 * @module BalanceTransaction
 */

import { Database } from './Database';
import { EventService } from './EventService';
import { AccountModule } from './Account';
import { GetPlatformAccountId } from './PlatformAccess';
import { GenerateId } from '../utils/IdGenerator';
import { Now } from '../utils/Timestamp';
import {
  BalanceTransaction as BalanceTransactionType,
  BalanceTransactionBalanceType,
  BalanceTransactionStatus,
  BalanceTransactionType as BalanceTransactionTypeEnum,
  BalanceTransactionFeeDetail,
} from '@zoneless/shared-types';
import { ListHelper, ListOptions, ListResult } from '../utils/ListHelper';
import { ValidateUpdate } from './Util';
import {
  CreateBalanceTransactionSchema,
  CreateBalanceTransactionInput,
} from '../schemas/BalanceTransactionSchema';

export class BalanceTransactionModule {
  db: Database;
  private readonly listHelper: ListHelper<BalanceTransactionType>;
  private readonly eventService: EventService | null;
  private readonly accountModule: AccountModule;

  constructor(db: Database, eventService?: EventService) {
    this.db = db;
    this.eventService = eventService || null;
    this.accountModule = new AccountModule(db);
    this.listHelper = new ListHelper<BalanceTransactionType>(db, {
      collection: 'BalanceTransactions',
      orderByField: 'created',
      orderDirection: 'desc',
      urlPath: '/v1/balance_transactions',
    });
  }

  /**
   * Get a balance transaction by ID
   */
  async GetBalanceTransaction(
    id: string
  ): Promise<BalanceTransactionType | null> {
    return this.db.Get('BalanceTransactions', id);
  }

  /**
   * List balance transactions with cursor-based pagination
   */
  async ListBalanceTransactions(
    options: ListOptions & {
      type?: BalanceTransactionTypeEnum;
      source?: string;
      currency?: string;
      payout?: string;
    }
  ): Promise<ListResult<BalanceTransactionType>> {
    const { type, source, currency, payout, ...listOptions } = options;

    const filters: Record<string, unknown> = {};
    if (type) filters.type = type;
    if (source) filters.source = source;
    if (currency) filters.currency = currency;
    if (payout) {
      // For payout filter, we need to find balance transactions where source matches a payout ID
      // This is a bit complex - we'll filter by source matching payout pattern
      // In practice, payout balance transactions have source = payout.id
      filters.source = payout;
    }

    return this.listHelper.List({
      ...listOptions,
      filters: { ...listOptions.filters, ...filters },
    });
  }

  /**
   * Creates a balance transaction and saves it to the database.
   * Emits a 'balance_transaction.created' event if EventService is configured.
   *
   * @param input - Balance transaction creation input (validated against schema)
   * @returns The created balance transaction
   */
  async CreateBalanceTransaction(
    input: CreateBalanceTransactionInput
  ): Promise<BalanceTransactionType> {
    // Validate input if provided
    const validatedInput = ValidateUpdate(
      CreateBalanceTransactionSchema,
      input
    );

    // Get the account to determine the platform
    const account = await this.accountModule.GetAccount(
      validatedInput.account!
    );
    const platformAccountId = account
      ? GetPlatformAccountId(account)
      : validatedInput.account!;

    const balanceTransaction = this.BalanceTransactionObject({
      ...validatedInput,
      platformAccountId,
    });
    await this.db.Set(
      'BalanceTransactions',
      balanceTransaction.id,
      balanceTransaction
    );

    // Emit balance_transaction.created event
    if (this.eventService) {
      await this.eventService.Emit(
        'balance_transaction.created',
        validatedInput.account!,
        balanceTransaction
      );
    }

    return balanceTransaction;
  }

  /**
   * Creates a balance transaction object without saving to database.
   * Use CreateBalanceTransaction to save and emit events.
   *
   * @param input - Balance transaction creation input (must include platformAccountId)
   * @returns The balance transaction object
   */
  BalanceTransactionObject(
    input: CreateBalanceTransactionInput & { platformAccountId: string }
  ): BalanceTransactionType {
    const timestamp = Now();
    const amount = input.amount!;
    const currency = input.currency!;
    const account = input.account!;
    const platformAccountId = input.platformAccountId;
    const type = input.type!;
    const source = input.source ?? null;
    const description = input.description ?? null;
    const metadata = input.metadata ?? {};
    const fee = input.fee ?? 0;
    const feeDetails = input.fee_details ?? [];
    const balanceType = input.balance_type ?? 'payments';
    const status = input.status ?? 'pending';
    const availableOn = input.available_on ?? timestamp;

    // Calculate net amount (amount - fee)
    const net = amount - fee;

    // Determine reporting_category from type
    // For most types, reporting_category matches the type
    // Some types map to specific reporting categories
    let reportingCategory = type;
    if (
      type === 'transfer' ||
      type === 'transfer_cancel' ||
      type === 'transfer_failure' ||
      type === 'transfer_refund'
    ) {
      reportingCategory = 'transfer';
    } else if (
      type === 'payout' ||
      type === 'payout_cancel' ||
      type === 'payout_failure'
    ) {
      reportingCategory = 'payout';
    } else if (type === 'topup' || type === 'topup_reversal') {
      reportingCategory = 'topup';
    }

    const balanceTransaction: BalanceTransactionType = {
      id: GenerateId('txn_z'),
      object: 'balance_transaction',
      amount: amount,
      available_on: availableOn,
      balance_type: balanceType,
      created: timestamp,
      currency: currency.toLowerCase(),
      description: description,
      fee: fee,
      fee_details: feeDetails,
      net: net,
      reporting_category: reportingCategory,
      source: source,
      status: status,
      type: type,
      account: account,
      platform_account: platformAccountId,
      metadata: metadata,
    };
    return balanceTransaction;
  }
}
