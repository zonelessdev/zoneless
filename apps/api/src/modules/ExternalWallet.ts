/**
 * @fileOverview Methods for ExternalWallets
 *
 *
 * @module ExternalWallet
 */

import { Database } from './Database';
import { EventService } from './EventService';
import { ExtractChangedFields } from './Event';
import { AccountModule } from './Account';
import { GetPlatformAccountId } from './PlatformAccess';
import { GenerateId } from '../utils/IdGenerator';
import { Now } from '../utils/Timestamp';
import { ListHelper, ListOptions, ListResult } from '../utils/ListHelper';
import {
  ExternalWallet as ExternalWalletType,
  QueryOperators,
} from '@zoneless/shared-types';
import { ValidateUpdate } from './Util';
import { SanctionsScreeningModule } from './SanctionsScreening';
import { AppError } from '../utils/AppError';
import { ERRORS } from '../utils/Errors';
import {
  CreateExternalWalletSchema,
  CreateExternalWalletInput,
  UpdateExternalWalletSchema,
  UpdateExternalWalletInput,
} from '../schemas/ExternalWalletSchema';

/** Response object for deleted external wallet */
export interface DeletedExternalWallet {
  id: string;
  object: 'wallet';
  deleted: boolean;
}

export class ExternalWalletModule {
  private readonly db: Database;
  private readonly eventService: EventService | null;
  private readonly listHelper: ListHelper<ExternalWalletType>;
  private readonly accountModule: AccountModule;

  constructor(db: Database, eventService?: EventService) {
    this.db = db;
    this.eventService = eventService || null;
    this.accountModule = new AccountModule(db);
    this.listHelper = new ListHelper<ExternalWalletType>(db, {
      collection: 'ExternalWallets',
      orderByField: 'created',
      orderDirection: 'desc',
      urlPath: '/v1/accounts/:account/external_accounts',
    });
  }

  /**
   * Creates a new external wallet with the provided fields.
   * Only wallet_address is required - other fields have sensible defaults.
   *
   * Performs OFAC sanctions screening before saving the wallet.
   * Emits an 'external_account.created' event if EventService is configured.
   *
   * @param account - The account ID this wallet belongs to
   * @param input - Object containing wallet fields
   * @returns The created external wallet
   */
  async CreateExternalWallet(
    account: string,
    input: CreateExternalWalletInput
  ): Promise<ExternalWalletType> {
    const validatedInput = ValidateUpdate(CreateExternalWalletSchema, input);

    // Screen wallet address against OFAC sanctions list
    const sanctionsModule = new SanctionsScreeningModule();
    const screeningResult = await sanctionsModule.CheckWalletAddress(
      validatedInput.wallet_address
    );

    if (screeningResult.isSanctioned) {
      throw new AppError(
        'This wallet address cannot be added due to compliance restrictions',
        403,
        'compliance_error'
      );
    }

    // Get the account to determine the platform
    const accountData = await this.accountModule.GetAccount(account);
    if (!accountData) {
      throw new AppError(
        ERRORS.ACCOUNT_NOT_FOUND.message,
        ERRORS.ACCOUNT_NOT_FOUND.status,
        ERRORS.ACCOUNT_NOT_FOUND.type
      );
    }
    const platformAccountId = GetPlatformAccountId(accountData);

    const externalWallet = this.ExternalWalletObject(
      account,
      platformAccountId,
      validatedInput
    );
    await this.db.Set('ExternalWallets', externalWallet.id, externalWallet);

    // Emit external_account.created event (routed to platform via EventService)
    if (this.eventService) {
      await this.eventService.Emit(
        'external_account.created',
        externalWallet.account,
        externalWallet
      );
    }

    return externalWallet;
  }

  ExternalWalletObject(
    account: string,
    platformAccountId: string,
    input: CreateExternalWalletInput
  ): ExternalWalletType {
    const walletAddress = input.wallet_address;
    const externalWallet: ExternalWalletType = {
      id: GenerateId('wa_z'),
      object: 'wallet',
      account: account,
      platform_account: platformAccountId,
      account_holder_name: input.account_holder_name ?? null,
      account_holder_type: input.account_holder_type ?? null,
      available_payout_methods: ['standard', 'instant'],
      created: Now(),
      country: '',
      currency: input.currency ?? 'usdc',
      customer: null,
      default_for_currency: input.default_for_currency ?? null,
      fingerprint: null,
      future_requirements: null,
      last4: walletAddress.slice(-4),
      metadata: input.metadata ?? null,
      network: input.network ?? 'solana',
      requirements: null,
      status: 'new',
      wallet_address: walletAddress,
    };
    return externalWallet;
  }

  /**
   * Updates an external wallet with the provided fields.
   * Only updatable fields will be accepted.
   * Emits an 'external_account.updated' event if EventService is configured.
   *
   * @param walletId - The ID of the wallet to update
   * @param input - Object containing the fields to update
   * @returns The updated external wallet
   */
  async UpdateExternalWallet(
    walletId: string,
    input: UpdateExternalWalletInput
  ): Promise<ExternalWalletType> {
    const validatedUpdate = ValidateUpdate(UpdateExternalWalletSchema, input);

    // Get previous state for the event (before update)
    const previousWallet = this.eventService
      ? await this.GetExternalWallet(walletId)
      : null;

    if (Object.keys(validatedUpdate).length > 0) {
      await this.db.Update<ExternalWalletType>(
        'ExternalWallets',
        walletId,
        validatedUpdate as Partial<ExternalWalletType>
      );
    }

    const wallet = await this.GetExternalWallet(walletId);
    if (!wallet) {
      throw new AppError(
        ERRORS.EXTERNAL_WALLET_NOT_FOUND.message,
        ERRORS.EXTERNAL_WALLET_NOT_FOUND.status,
        ERRORS.EXTERNAL_WALLET_NOT_FOUND.type
      );
    }

    // Emit external_account.updated event (routed to platform via EventService)
    if (this.eventService) {
      const previousAttributes = previousWallet
        ? ExtractChangedFields(
            previousWallet as unknown as Record<string, unknown>,
            validatedUpdate as Record<string, unknown>
          )
        : null;

      await this.eventService.Emit(
        'external_account.updated',
        wallet.account,
        wallet,
        { previousAttributes }
      );
    }

    return wallet;
  }

  async GetExternalWallet(
    walletId: string
  ): Promise<ExternalWalletType | null> {
    return this.db.Get<ExternalWalletType>('ExternalWallets', walletId);
  }

  /**
   * Get all external wallets for an account (without pagination).
   * Excludes archived wallets by default.
   *
   * @param account - The account ID to get wallets for
   * @param includeArchived - Whether to include archived wallets (default: false)
   * @returns Array of external wallets
   */
  async GetExternalWalletsByAccount(
    account: string,
    includeArchived = false
  ): Promise<ExternalWalletType[]> {
    if (includeArchived) {
      const externalWallets = await this.db.Find<ExternalWalletType>(
        'ExternalWallets',
        'account',
        account
      );
      return externalWallets || [];
    }

    const externalWallets = await this.db.Find2Custom<ExternalWalletType>(
      'ExternalWallets',
      'account',
      '==',
      account,
      'status',
      '!=',
      'archived'
    );
    return externalWallets || [];
  }

  /**
   * List external wallets for an account with cursor-based pagination.
   *
   * @param account - The account ID to list wallets for
   * @param options - Pagination options
   * @returns Paginated list of external wallets
   */
  async ListExternalWallets(
    account: string,
    options: Omit<ListOptions, 'account' | 'filters'> & {
      created?: ListOptions['created'];
    } = {}
  ): Promise<ListResult<ExternalWalletType>> {
    const { limit = 10, startingAfter, endingBefore, created } = options;

    const result = await this.listHelper.List({
      account,
      limit,
      startingAfter,
      endingBefore,
      created,
      filters: {
        status: { operator: QueryOperators['!='], value: 'archived' },
      },
    });

    // Update the URL to include the account ID
    return {
      ...result,
      url: `/v1/accounts/${account}/external_accounts`,
    };
  }

  /**
   * Archives an external wallet by ID (soft-delete).
   * The wallet record is preserved for audit trails and payout history,
   * but excluded from active wallet queries.
   * Emits an 'external_account.deleted' event if EventService is configured.
   *
   * @param walletId - The ID of the wallet to archive
   * @returns Object indicating whether the deletion was successful (Stripe format)
   */
  async DeleteExternalWallet(walletId: string): Promise<DeletedExternalWallet> {
    const wallet = await this.GetExternalWallet(walletId);

    if (!wallet) {
      throw new AppError(
        ERRORS.EXTERNAL_WALLET_NOT_FOUND.message,
        ERRORS.EXTERNAL_WALLET_NOT_FOUND.status,
        ERRORS.EXTERNAL_WALLET_NOT_FOUND.type
      );
    }

    await this.db.Update<ExternalWalletType>('ExternalWallets', walletId, {
      status: 'archived',
    });

    if (this.eventService) {
      await this.eventService.Emit(
        'external_account.deleted',
        wallet.account,
        wallet
      );
    }

    return {
      id: walletId,
      object: 'wallet',
      deleted: true,
    };
  }
}
