import * as express from 'express';
import { AsyncHandler } from '../utils/AsyncHandler';
import { AppError } from '../utils/AppError';
import { ERRORS } from '../utils/Errors';
import { Logger } from '../utils/Logger';
import { ParseCreatedFilter } from '../utils/ListHelper';

import { db } from '../modules/Database';
import { AccountModule } from '../modules/Account';
import { PersonModule } from '../modules/Person';
import { BalanceModule } from '../modules/Balance';
import { ExternalWalletModule } from '../modules/ExternalWallet';
import { LoginLinkModule, ToLoginLinkResponse } from '../modules/LoginLink';
import { EventService } from '../modules/EventService';

import { ValidateRequest } from '../middleware/ValidateRequest';
import {
  RequireAccountOwnership,
  RequirePlatform,
} from '../middleware/Authorization';

import {
  CreateAccountSchema,
  UpdateAccountSchema,
  RejectAccountSchema,
} from '../schemas/AccountSchema';

import { Account as AccountType } from '@zoneless/shared-types';

const router = express.Router();

const eventService = new EventService(db);
const accountModule = new AccountModule(db, eventService);
const personModule = new PersonModule(db, eventService);
const balanceModule = new BalanceModule(db, eventService);
const externalWalletModule = new ExternalWalletModule(db);
const loginLinkModule = new LoginLinkModule(db);

// ─────────────────────────────────────────────────────────────────────────────
// Helper: Populate account with related resources
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Populates an account with related resources (individual, external_accounts, login_links).
 * This matches Stripe's behavior where these fields are embedded in the account response.
 *
 * @param account - The account to populate
 * @param isPlatformRequest - Whether this is a platform/controller request
 * @returns The populated account
 */
async function PopulateAccountResources(
  account: AccountType,
  isPlatformRequest: boolean
): Promise<AccountType> {
  // Fetch person (individual) for all requests
  const person = await personModule.GetPersonByAccount(account.id);
  if (person) {
    account.individual = person;
  }

  // External accounts and login links are only returned when controller.is_controller is true
  if (isPlatformRequest && account.controller?.is_controller) {
    const [externalWallets, loginLinkRecords] = await Promise.all([
      externalWalletModule.GetExternalWalletsByAccount(account.id),
      loginLinkModule.GetLoginLinksByAccount(account.id),
    ]);

    // Convert login link records to Stripe-compatible API responses
    const loginLinks = loginLinkRecords.map(ToLoginLinkResponse);

    account.external_accounts = {
      object: 'list',
      data: externalWallets,
      has_more: false,
      total_count: externalWallets.length,
      url: `/v1/accounts/${account.id}/external_accounts`,
    };

    account.login_links = {
      object: 'list',
      data: loginLinks,
      has_more: false,
      total_count: loginLinks.length,
      url: `/v1/accounts/${account.id}/login_links`,
    };
  }

  return account;
}

// ─────────────────────────────────────────────────────────────────────────────
// POST /v1/accounts - Create an account
// @see https://docs.stripe.com/api/accounts/create
// ─────────────────────────────────────────────────────────────────────────────
router.post(
  '/',
  RequirePlatform(),
  ValidateRequest(CreateAccountSchema),
  AsyncHandler(async (req: express.Request, res: express.Response) => {
    Logger.info('Creating account', { fields: Object.keys(req.body) });

    // Pass the platform account ID to link this connected account to its platform
    const account = await accountModule.CreateAccount(
      req.body,
      req.user.account
    );

    const [person] = await Promise.all([
      personModule.CreatePerson(account.id, {
        email: account.email ?? undefined,
      }),
      balanceModule.CreateBalance(account.id),
    ]);
    account.individual = person;

    // Initialize empty external_accounts and login_links for newly created accounts
    account.external_accounts = {
      object: 'list',
      data: [],
      has_more: false,
      total_count: 0,
      url: `/v1/accounts/${account.id}/external_accounts`,
    };

    account.login_links = {
      object: 'list',
      data: [],
      has_more: false,
      total_count: 0,
      url: `/v1/accounts/${account.id}/login_links`,
    };

    Logger.info('Account created successfully', { accountId: account.id });

    res.status(201).json(account);
  })
);

// ─────────────────────────────────────────────────────────────────────────────
// GET /v1/accounts - List all connected accounts
// @see https://docs.stripe.com/api/accounts/list
// ─────────────────────────────────────────────────────────────────────────────
router.get(
  '/',
  RequirePlatform(),
  AsyncHandler(async (req: express.Request, res: express.Response) => {
    const platformAccountId = req.user.account;

    const limit = req.query.limit
      ? parseInt(req.query.limit as string, 10)
      : 10;
    const startingAfter = req.query.starting_after as string | undefined;
    const endingBefore = req.query.ending_before as string | undefined;
    const created = ParseCreatedFilter(req.query as Record<string, unknown>);

    Logger.info('Listing accounts', {
      platformAccountId,
      limit,
      startingAfter,
      endingBefore,
    });

    try {
      const result = await accountModule.ListAccounts(platformAccountId, {
        limit,
        startingAfter,
        endingBefore,
        created,
      });

      res.json(result);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unknown error';

      if (
        message ===
          'You cannot parameterize both starting_after and ending_before.' ||
        message === 'Invalid starting_after ID' ||
        message === 'Invalid ending_before ID'
      ) {
        throw new AppError(
          message,
          ERRORS.INVALID_REQUEST.status,
          ERRORS.INVALID_REQUEST.type
        );
      }
      throw error;
    }
  })
);

// ─────────────────────────────────────────────────────────────────────────────
// GET /v1/accounts/me - Retrieve the authenticated account
// This is a Zoneless extension, not in Stripe API
// ─────────────────────────────────────────────────────────────────────────────
router.get(
  '/me',
  AsyncHandler(async (req: express.Request, res: express.Response) => {
    const account = await accountModule.GetAccount(req.user.account);

    if (!account) {
      throw new AppError(
        ERRORS.ACCOUNT_NOT_FOUND.message,
        ERRORS.ACCOUNT_NOT_FOUND.status,
        ERRORS.ACCOUNT_NOT_FOUND.type
      );
    }

    // Connected accounts accessing their own data - not a platform request
    const populatedAccount = await PopulateAccountResources(account, false);

    res.json(populatedAccount);
  })
);

// ─────────────────────────────────────────────────────────────────────────────
// GET /v1/accounts/:id - Retrieve a specific account
// @see https://docs.stripe.com/api/accounts/retrieve
// ─────────────────────────────────────────────────────────────────────────────
router.get(
  '/:id',
  RequireAccountOwnership('id'),
  AsyncHandler(async (req: express.Request, res: express.Response) => {
    const accountId = req.params.id;
    const isPlatformRequest = !!req.user.platform;

    const account = await accountModule.GetAccount(accountId);

    if (!account) {
      throw new AppError(
        ERRORS.ACCOUNT_NOT_FOUND.message,
        ERRORS.ACCOUNT_NOT_FOUND.status,
        ERRORS.ACCOUNT_NOT_FOUND.type
      );
    }

    const populatedAccount = await PopulateAccountResources(
      account,
      isPlatformRequest
    );

    res.json(populatedAccount);
  })
);

// ─────────────────────────────────────────────────────────────────────────────
// POST /v1/accounts/:id - Update an account
// @see https://docs.stripe.com/api/accounts/update
// ─────────────────────────────────────────────────────────────────────────────
router.post(
  '/:id',
  RequireAccountOwnership('id'),
  ValidateRequest(UpdateAccountSchema),
  AsyncHandler(async (req: express.Request, res: express.Response) => {
    const accountId = req.params.id;
    const isPlatformRequest = !!req.user.platform;

    Logger.info('Updating account', {
      accountId,
      fields: Object.keys(req.body),
    });

    const account = await accountModule.UpdateAccount(accountId, req.body);
    const populatedAccount = await PopulateAccountResources(
      account,
      isPlatformRequest
    );

    Logger.info('Account updated successfully', { accountId });

    res.json(populatedAccount);
  })
);

// ─────────────────────────────────────────────────────────────────────────────
// DELETE /v1/accounts/:id - Delete an account
// @see https://docs.stripe.com/api/accounts/delete
// ─────────────────────────────────────────────────────────────────────────────
router.delete(
  '/:id',
  RequirePlatform(),
  AsyncHandler(async (req: express.Request, res: express.Response) => {
    const accountId = req.params.id;

    // Verify the account belongs to this platform
    const account = await accountModule.GetAccount(accountId);

    if (!account) {
      throw new AppError(
        ERRORS.ACCOUNT_NOT_FOUND.message,
        ERRORS.ACCOUNT_NOT_FOUND.status,
        ERRORS.ACCOUNT_NOT_FOUND.type
      );
    }

    // Ensure the platform owns this account
    if (account.platform_account !== req.user.account) {
      throw new AppError(
        ERRORS.NO_SUCH_CONNECTED_ACCOUNT.message,
        ERRORS.NO_SUCH_CONNECTED_ACCOUNT.status,
        ERRORS.NO_SUCH_CONNECTED_ACCOUNT.type
      );
    }

    Logger.info('Deleting account', { accountId });

    const result = await accountModule.DeleteAccount(accountId);

    Logger.info('Account deleted successfully', { accountId });

    res.json(result);
  })
);

// ─────────────────────────────────────────────────────────────────────────────
// POST /v1/accounts/:id/reject - Reject an account
// @see https://docs.stripe.com/api/account/reject
// ─────────────────────────────────────────────────────────────────────────────
router.post(
  '/:id/reject',
  RequirePlatform(),
  ValidateRequest(RejectAccountSchema),
  AsyncHandler(async (req: express.Request, res: express.Response) => {
    const accountId = req.params.id;

    // Verify the account belongs to this platform
    const existingAccount = await accountModule.GetAccount(accountId);

    if (!existingAccount) {
      throw new AppError(
        ERRORS.ACCOUNT_NOT_FOUND.message,
        ERRORS.ACCOUNT_NOT_FOUND.status,
        ERRORS.ACCOUNT_NOT_FOUND.type
      );
    }

    // Ensure the platform owns this account
    if (existingAccount.platform_account !== req.user.account) {
      throw new AppError(
        ERRORS.NO_SUCH_CONNECTED_ACCOUNT.message,
        ERRORS.NO_SUCH_CONNECTED_ACCOUNT.status,
        ERRORS.NO_SUCH_CONNECTED_ACCOUNT.type
      );
    }

    Logger.info('Rejecting account', { accountId, reason: req.body.reason });

    const account = await accountModule.RejectAccount(accountId, req.body);
    const populatedAccount = await PopulateAccountResources(account, true);

    Logger.info('Account rejected successfully', { accountId });

    res.json(populatedAccount);
  })
);

// ─────────────────────────────────────────────────────────────────────────────
// POST /v1/accounts/:id/agree_terms - Agree to terms of service
// This is a Zoneless extension that handles TOS acceptance from the frontend
// ─────────────────────────────────────────────────────────────────────────────
router.post(
  '/:id/agree_terms',
  RequireAccountOwnership('id'),
  AsyncHandler(async (req: express.Request, res: express.Response) => {
    const accountId = req.params.id;
    const ip =
      req.ip || req.headers['x-forwarded-for']?.toString() || undefined;
    const userAgent = req.headers['user-agent'] || undefined;

    Logger.info('Agreeing to terms', { accountId });

    await accountModule.TOSAccepted(accountId, ip, userAgent);

    const account = await accountModule.GetAccount(accountId);

    if (!account) {
      throw new AppError(
        ERRORS.ACCOUNT_NOT_FOUND.message,
        ERRORS.ACCOUNT_NOT_FOUND.status,
        ERRORS.ACCOUNT_NOT_FOUND.type
      );
    }

    const populatedAccount = await PopulateAccountResources(account, false);

    Logger.info('Terms agreed successfully', { accountId });

    res.json(populatedAccount);
  })
);

export default router;
