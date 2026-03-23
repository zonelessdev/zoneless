/**
 * @fileOverview Methods for Accounts
 * @module Account
 */

import { Database } from './Database';
import { EventService } from './EventService';
import { ExtractChangedFields } from './Event';
import { GetPlatformAccountId } from './PlatformAccess';
import { GenerateId } from '../utils/IdGenerator';
import { Now } from '../utils/Timestamp';
import { ListHelper, ListOptions, ListResult } from '../utils/ListHelper';
import { AppError } from '../utils/AppError';
import { ERRORS } from '../utils/Errors';
import {
  Account as AccountType,
  AccountCapabilities,
  AccountRequirements,
  AccountFutureRequirements,
  AccountSettings,
  AccountController,
  AccountBusinessProfile,
} from '@zoneless/shared-types';
import { ValidateUpdate } from './Util';
import {
  CreateAccountSchema,
  CreateAccountInput,
  UpdateAccountSchema,
  UpdateAccountInput,
  RejectAccountInput,
} from '../schemas/AccountSchema';

export class AccountModule {
  private readonly db: Database;
  private readonly eventService: EventService | null;
  private readonly listHelper: ListHelper<
    AccountType & { platform_account: string }
  >;

  constructor(db: Database, eventService?: EventService) {
    this.db = db;
    this.eventService = eventService || null;
    this.listHelper = new ListHelper<
      AccountType & { platform_account: string }
    >(db, {
      collection: 'Accounts',
      orderByField: 'created',
      orderDirection: 'desc',
      urlPath: '/v1/accounts',
      accountField: 'platform_account',
    });
  }

  /**
   * Creates a new connected account under a platform.
   * All fields are optional - defaults will be applied for missing fields.
   * Emits an 'account.created' event if EventService is configured.
   *
   * @param input - Optional object containing account fields
   * @param platformAccountId - The platform account creating this connected account (null for platform accounts)
   * @returns The created account
   */
  async CreateAccount(
    input: CreateAccountInput = {},
    platformAccountId?: string | null
  ): Promise<AccountType> {
    // Validate input if provided
    const validatedInput = ValidateUpdate(CreateAccountSchema, input);
    const account = this.CreateAccountObject(validatedInput, platformAccountId);
    await this.db.Set<AccountType>('Accounts', account.id, account);

    // Emit account.created event
    if (this.eventService) {
      // Use provided platformAccountId, or the account itself if it's a platform
      const targetPlatform = platformAccountId ?? account.id;
      await this.eventService.Emit('account.created', targetPlatform, account);
    }

    return account;
  }

  CreateAccountObject(
    input: CreateAccountInput = {},
    platformAccountId?: string | null
  ): AccountType {
    const now = Now();

    // Build default capabilities based on account type
    const defaultCapabilities: AccountCapabilities = {
      transfers: 'inactive',
      usdc_payouts: 'inactive',
    };

    // Handle capabilities from input - convert { requested: true } format to status
    const capabilities = this.ProcessCapabilitiesInput(
      input.capabilities,
      defaultCapabilities
    );

    // Build default requirements
    const defaultRequirements: AccountRequirements = {
      alternatives: [],
      current_deadline: null,
      currently_due: [],
      disabled_reason: null,
      errors: [],
      eventually_due: [],
      past_due: [],
      pending_verification: [],
    };

    // Build default future_requirements
    const defaultFutureRequirements: AccountFutureRequirements = {
      alternatives: [],
      current_deadline: null,
      currently_due: [],
      disabled_reason: null,
      errors: [],
      eventually_due: [],
      past_due: [],
      pending_verification: [],
    };

    // Build default controller based on account type
    const accountType = input.type ?? 'express';
    const defaultController: AccountController = {
      is_controller: true,
      type: 'application',
      fees: {
        payer:
          accountType === 'express'
            ? 'application_express'
            : accountType === 'custom'
            ? 'application_custom'
            : 'application',
      },
      losses: { payments: 'application' },
      requirement_collection:
        accountType === 'custom' ? 'application' : 'zoneless',
      zoneless_dashboard: {
        type:
          accountType === 'express'
            ? 'express'
            : accountType === 'standard'
            ? 'full'
            : 'none',
      },
    };

    // Merge provided controller with defaults
    const controller: AccountController = input.controller
      ? { ...defaultController, ...input.controller }
      : defaultController;

    // Build default settings
    const defaultSettings: AccountSettings = {
      branding: {
        icon: null,
        logo: null,
        primary_color: null,
        secondary_color: null,
      },
      dashboard: {
        display_name: null,
        timezone: 'Etc/UTC',
      },
      payouts: {
        debit_negative_balances: true,
        schedule: {
          delay_days: 2,
          interval: 'daily',
        },
        statement_descriptor: null,
      },
    };

    // Deep merge settings
    const settings = this.MergeSettings(defaultSettings, input.settings);

    // Build default business profile
    const defaultBusinessProfile: AccountBusinessProfile = {
      mcc: null,
      name: null,
      product_description: null,
      support_email: null,
      support_phone: null,
      support_url: null,
      url: null,
    };

    const businessProfile: AccountBusinessProfile = input.business_profile
      ? { ...defaultBusinessProfile, ...input.business_profile }
      : defaultBusinessProfile;

    const accountId = GenerateId('acct_z');

    const account: AccountType = {
      id: accountId,
      object: 'account',
      type: accountType,
      business_type: input.business_type ?? 'individual',
      business_profile: businessProfile,
      email: input.email ?? null,
      country: input.country ?? '',
      default_currency: input.default_currency ?? 'usdc',
      created: now,
      charges_enabled: false,
      payouts_enabled: false,
      details_submitted: false,
      capabilities,
      controller,
      requirements: defaultRequirements,
      future_requirements: defaultFutureRequirements,
      settings,
      tos_acceptance: input.tos_acceptance ?? null,
      metadata: input.metadata ?? {},
      // For connected accounts: platform_account = the platform's ID
      // For platform accounts: platform_account = self (self-referential)
      platform_account: platformAccountId ?? accountId,
    };

    return account;
  }

  /**
   * Process capabilities input from API to internal format.
   * Converts { transfers: { requested: true } } to { transfers: 'pending' }
   */
  private ProcessCapabilitiesInput(
    input: CreateAccountInput['capabilities'] | undefined,
    defaults: AccountCapabilities
  ): AccountCapabilities {
    if (!input) {
      return defaults;
    }

    const result = { ...defaults };

    if (input.transfers?.requested) {
      result.transfers = 'pending';
    }
    if (input.usdc_payouts?.requested) {
      result.usdc_payouts = 'pending';
    }

    return result;
  }

  /**
   * Deep merge settings objects.
   */
  private MergeSettings(
    defaults: AccountSettings,
    input: CreateAccountInput['settings'] | undefined
  ): AccountSettings {
    if (!input) {
      return defaults;
    }

    return {
      ...defaults,
      branding: input.branding
        ? { ...defaults.branding, ...input.branding }
        : defaults.branding,
      dashboard: input.dashboard
        ? { ...defaults.dashboard, ...input.dashboard }
        : defaults.dashboard,
      payouts: input.payouts
        ? {
            ...defaults.payouts,
            ...input.payouts,
            schedule: input.payouts.schedule
              ? { ...defaults.payouts?.schedule, ...input.payouts.schedule }
              : defaults.payouts?.schedule,
          }
        : defaults.payouts,
      // Platform-specific settings
      terms_url: input.terms_url ?? defaults.terms_url,
      privacy_url: input.privacy_url ?? defaults.privacy_url,
    };
  }

  async GetAccount(accountId: string): Promise<AccountType | null> {
    return this.db.Get<AccountType>('Accounts', accountId);
  }

  /**
   * Get all platform accounts (accounts where platform_account equals their own id).
   * These are root accounts that own connected accounts.
   *
   * @returns Array of platform accounts
   */
  async GetPlatformAccounts(): Promise<AccountType[]> {
    // Query all accounts and filter to platforms (self-referential platform_account)
    const allAccounts = await this.db.Query<AccountType>({
      collection: 'Accounts',
      method: 'READ',
      orderBy: [{ key: 'created', direction: 'asc' }],
    });

    // Filter to only platform accounts (platform_account === id)
    return allAccounts.filter(
      (account) => account.platform_account === account.id
    );
  }

  async IsOwnerOfAccount(accountId: string, uid: string): Promise<boolean> {
    const account = await this.db.Get<AccountType & { owner_id?: string }>(
      'Accounts',
      accountId
    );
    if (!account) {
      return false;
    }
    return account.owner_id === uid;
  }

  /**
   * List connected accounts for a platform with cursor-based pagination.
   *
   * @param platformAccountId - The platform account ID to list accounts for
   * @param options - Pagination and filter options
   * @returns Paginated list of accounts
   */
  async ListAccounts(
    platformAccountId: string,
    options: Omit<ListOptions, 'account' | 'filters'> & {
      created?: ListOptions['created'];
    } = {}
  ): Promise<ListResult<AccountType>> {
    return this.listHelper.List({
      account: platformAccountId,
      ...options,
      filters: {},
    });
  }

  /**
   * Updates an account with the provided fields.
   * Only updatable fields will be accepted - protected fields like id, created,
   * payouts_enabled, details_submitted, and tos_acceptance are ignored.
   * Emits an 'account.updated' event if EventService is configured.
   *
   * @param accountId - The ID of the account to update
   * @param input - Object containing the fields to update
   * @returns The updated account
   */
  async UpdateAccount(
    accountId: string,
    input: UpdateAccountInput
  ): Promise<AccountType> {
    // Validate the input against the schema
    const validatedUpdate = ValidateUpdate(UpdateAccountSchema, input);

    // Only update if there are valid fields
    if (Object.keys(validatedUpdate).length === 0) {
      const account = await this.GetAccount(accountId);
      if (!account) {
        throw new AppError(
          ERRORS.ACCOUNT_NOT_FOUND.message,
          ERRORS.ACCOUNT_NOT_FOUND.status,
          ERRORS.ACCOUNT_NOT_FOUND.type
        );
      }
      return account;
    }

    // Convert the validated update to account-compatible format
    const processedUpdate = await this.ProcessUpdateInput(
      accountId,
      validatedUpdate
    );

    return this.UpdateAccountInternal(accountId, processedUpdate);
  }

  /**
   * Process update input to convert schema types to Account types.
   * Handles conversion of capabilities from { requested: boolean } to CapabilityStatus.
   */
  private async ProcessUpdateInput(
    accountId: string,
    input: UpdateAccountInput
  ): Promise<Partial<AccountType>> {
    const account = await this.GetAccount(accountId);
    const result: Partial<AccountType> = {};

    // Copy simple fields
    if (input.email !== undefined) result.email = input.email;
    if (input.business_type !== undefined)
      result.business_type = input.business_type;
    if (input.default_currency !== undefined)
      result.default_currency = input.default_currency;
    if (input.metadata !== undefined) result.metadata = input.metadata;

    // Handle nested objects with proper merging
    if (input.business_profile !== undefined) {
      result.business_profile = {
        ...account?.business_profile,
        ...input.business_profile,
      };
    }

    if (input.settings !== undefined) {
      result.settings = this.MergeSettings(
        account?.settings || {},
        input.settings
      );
    }

    if (input.tos_acceptance !== undefined) {
      result.tos_acceptance = {
        ...account?.tos_acceptance,
        ...input.tos_acceptance,
      };
    }

    // Process capabilities - convert { requested: true } to 'pending'
    if (input.capabilities !== undefined) {
      result.capabilities = this.ProcessCapabilitiesInput(
        input.capabilities,
        account?.capabilities || {}
      );
    }

    return result;
  }

  /**
   * Internal method to update an account with any fields.
   * Bypasses public API validation - use only for internal operations.
   * Emits an 'account.updated' event if EventService is configured.
   *
   * @param accountId - The ID of the account to update
   * @param update - Object containing the fields to update
   * @returns The updated account
   */
  private async UpdateAccountInternal(
    accountId: string,
    update: Partial<AccountType>
  ): Promise<AccountType> {
    // Get previous state for the event (before update)
    const previousAccount = this.eventService
      ? await this.GetAccount(accountId)
      : null;

    await this.db.Update<AccountType>('Accounts', accountId, update);

    const account = await this.GetAccount(accountId);
    if (!account) {
      throw new AppError(
        ERRORS.ACCOUNT_NOT_FOUND.message,
        ERRORS.ACCOUNT_NOT_FOUND.status,
        ERRORS.ACCOUNT_NOT_FOUND.type
      );
    }

    // Emit account.updated event
    if (this.eventService) {
      const previousAttributes = previousAccount
        ? ExtractChangedFields(
            previousAccount as unknown as Record<string, unknown>,
            update as Record<string, unknown>
          )
        : null;

      // Route event to the platform that owns this account
      const targetPlatform = GetPlatformAccountId(account);
      await this.eventService.Emit('account.updated', targetPlatform, account, {
        previousAttributes,
      });
    }

    return account;
  }

  /**
   * Delete an account.
   * Connected accounts can only be deleted by the platform that created them.
   * Emits an 'account.deleted' event if EventService is configured (Stripe-compatible).
   *
   * @param accountId - The ID of the account to delete
   * @returns Object with id and deleted status
   */
  async DeleteAccount(
    accountId: string
  ): Promise<{ id: string; object: 'account'; deleted: boolean }> {
    const account = await this.GetAccount(accountId);

    if (!account) {
      throw new AppError(
        ERRORS.ACCOUNT_NOT_FOUND.message,
        ERRORS.ACCOUNT_NOT_FOUND.status,
        ERRORS.ACCOUNT_NOT_FOUND.type
      );
    }

    await this.db.Delete('Accounts', accountId);

    // Note: In a production system, you'd also want to:
    // 1. Cancel any pending payouts
    // 2. Handle any remaining balance
    // 3. Delete associated resources (persons, external wallets, etc.)

    return {
      id: accountId,
      object: 'account',
      deleted: true,
    };
  }

  /**
   * Reject an account.
   * Platforms can reject accounts that violate their terms of service.
   * This prevents the account from accepting payments or receiving payouts.
   * Emits an 'account.updated' event with the rejection status.
   *
   * @param accountId - The ID of the account to reject
   * @param input - Object containing the rejection reason
   * @returns The rejected account
   */
  async RejectAccount(
    accountId: string,
    input: RejectAccountInput
  ): Promise<AccountType> {
    const account = await this.GetAccount(accountId);

    if (!account) {
      throw new AppError(
        ERRORS.ACCOUNT_NOT_FOUND.message,
        ERRORS.ACCOUNT_NOT_FOUND.status,
        ERRORS.ACCOUNT_NOT_FOUND.type
      );
    }

    // Update the account with rejection status
    const update: Partial<AccountType> = {
      charges_enabled: false,
      payouts_enabled: false,
      requirements: {
        ...account.requirements,
        disabled_reason: `rejected.${input.reason}`,
        currently_due: [],
        eventually_due: [],
        past_due: [],
        pending_verification: [],
      },
    };

    return this.UpdateAccountInternal(accountId, update);
  }

  async DetailsSubmitted(accountId: string): Promise<void> {
    await this.UpdateAccountInternal(accountId, {
      details_submitted: true,
    });
  }

  async PayoutsEnabled(accountId: string): Promise<void> {
    const account = await this.GetAccount(accountId);

    const update: Partial<AccountType> = {
      payouts_enabled: true,
      capabilities: {
        ...account?.capabilities,
        usdc_payouts: 'active',
        transfers: 'active',
      },
    };

    await this.UpdateAccountInternal(accountId, update);
  }

  async ChargesEnabled(accountId: string): Promise<void> {
    await this.UpdateAccountInternal(accountId, {
      charges_enabled: true,
    });
  }

  async TOSAccepted(
    accountId: string,
    ip?: string,
    userAgent?: string
  ): Promise<void> {
    await this.UpdateAccountInternal(accountId, {
      tos_acceptance: {
        date: Now(),
        ip: ip ?? null,
        user_agent: userAgent ?? null,
        service_agreement: 'full',
      },
    });
  }

  /**
   * Update account requirements.
   * Used internally to update what information is needed from the account.
   *
   * @param accountId - The ID of the account
   * @param requirements - The updated requirements
   */
  async UpdateRequirements(
    accountId: string,
    requirements: Partial<AccountRequirements>
  ): Promise<void> {
    const account = await this.GetAccount(accountId);

    if (!account) {
      throw new AppError(
        ERRORS.ACCOUNT_NOT_FOUND.message,
        ERRORS.ACCOUNT_NOT_FOUND.status,
        ERRORS.ACCOUNT_NOT_FOUND.type
      );
    }

    await this.UpdateAccountInternal(accountId, {
      requirements: {
        ...account.requirements,
        ...requirements,
      },
    });
  }
}
