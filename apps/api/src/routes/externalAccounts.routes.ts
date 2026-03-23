import * as express from 'express';
import { AsyncHandler } from '../utils/AsyncHandler';
import { AppError } from '../utils/AppError';
import { ERRORS } from '../utils/Errors';
import { Logger } from '../utils/Logger';
import { ParseCreatedFilter } from '../utils/ListHelper';

import { db } from '../modules/Database';
import { EventService } from '../modules/EventService';
import { AccountModule } from '../modules/Account';
import { ExternalWalletModule } from '../modules/ExternalWallet';

import { ValidateRequest } from '../middleware/ValidateRequest';
import { RequireAccountOwnership } from '../middleware/Authorization';

import {
  CreateExternalWalletSchema,
  UpdateExternalWalletSchema,
} from '../schemas/ExternalWalletSchema';

const router = express.Router();

const eventService = new EventService(db);
const accountModule = new AccountModule(db, eventService);
const externalWalletModule = new ExternalWalletModule(db, eventService);

// POST /v1/accounts/:id/external_accounts
router.post(
  '/:id/external_accounts',
  RequireAccountOwnership('id'),
  ValidateRequest(CreateExternalWalletSchema),
  AsyncHandler(async (req: express.Request, res: express.Response) => {
    const accountId = req.params.id;

    Logger.info('Creating external wallet', {
      accountId,
      fields: Object.keys(req.body),
    });

    const externalWallet = await externalWalletModule.CreateExternalWallet(
      accountId,
      req.body
    );

    // Enable payouts on the account now that a wallet is set up
    await accountModule.PayoutsEnabled(accountId);

    Logger.info('External wallet created successfully', {
      externalWalletId: externalWallet.id,
    });

    res.status(201).json(externalWallet);
  })
);

// GET /v1/accounts/:id/external_accounts
router.get(
  '/:id/external_accounts',
  RequireAccountOwnership('id'),
  AsyncHandler(async (req: express.Request, res: express.Response) => {
    const { id } = req.params;
    const { limit, starting_after, ending_before } = req.query;

    Logger.info('Listing external wallets', {
      accountId: id,
      limit,
      starting_after,
      ending_before,
    });

    const result = await externalWalletModule.ListExternalWallets(id, {
      limit: limit ? parseInt(String(limit), 10) : undefined,
      startingAfter: starting_after as string | undefined,
      endingBefore: ending_before as string | undefined,
      created: ParseCreatedFilter(req.query as Record<string, unknown>),
    });

    res.json(result);
  })
);

// GET /v1/accounts/:id/external_accounts/:externalAccountId
router.get(
  '/:id/external_accounts/:externalAccountId',
  RequireAccountOwnership('id'),
  AsyncHandler(async (req: express.Request, res: express.Response) => {
    const { id, externalAccountId } = req.params;

    const externalWallet = await externalWalletModule.GetExternalWallet(
      externalAccountId
    );

    if (!externalWallet) {
      throw new AppError(
        ERRORS.EXTERNAL_WALLET_NOT_FOUND.message,
        ERRORS.EXTERNAL_WALLET_NOT_FOUND.status,
        ERRORS.EXTERNAL_WALLET_NOT_FOUND.type
      );
    }

    if (externalWallet.account !== id) {
      throw new AppError(
        ERRORS.EXTERNAL_WALLET_NOT_FOUND.message,
        ERRORS.EXTERNAL_WALLET_NOT_FOUND.status,
        ERRORS.EXTERNAL_WALLET_NOT_FOUND.type
      );
    }

    res.json(externalWallet);
  })
);

// POST /v1/accounts/:id/external_accounts/:externalAccountId - Update an external wallet
router.post(
  '/:id/external_accounts/:externalAccountId',
  RequireAccountOwnership('id'),
  ValidateRequest(UpdateExternalWalletSchema),
  AsyncHandler(async (req: express.Request, res: express.Response) => {
    const { id, externalAccountId } = req.params;

    // Verify wallet exists and belongs to account
    const existingWallet = await externalWalletModule.GetExternalWallet(
      externalAccountId
    );

    if (!existingWallet) {
      throw new AppError(
        ERRORS.EXTERNAL_WALLET_NOT_FOUND.message,
        ERRORS.EXTERNAL_WALLET_NOT_FOUND.status,
        ERRORS.EXTERNAL_WALLET_NOT_FOUND.type
      );
    }

    if (existingWallet.account !== id) {
      throw new AppError(
        ERRORS.EXTERNAL_WALLET_NOT_FOUND.message,
        ERRORS.EXTERNAL_WALLET_NOT_FOUND.status,
        ERRORS.EXTERNAL_WALLET_NOT_FOUND.type
      );
    }

    Logger.info('Updating external wallet', {
      externalAccountId,
      fields: Object.keys(req.body),
    });

    const externalWallet = await externalWalletModule.UpdateExternalWallet(
      externalAccountId,
      req.body
    );

    Logger.info('External wallet updated successfully', { externalAccountId });

    res.json(externalWallet);
  })
);

// DELETE /v1/accounts/:id/external_accounts/:externalAccountId
router.delete(
  '/:id/external_accounts/:externalAccountId',
  RequireAccountOwnership('id'),
  AsyncHandler(async (req: express.Request, res: express.Response) => {
    const { id, externalAccountId } = req.params;

    const existingWallet = await externalWalletModule.GetExternalWallet(
      externalAccountId
    );

    if (!existingWallet) {
      throw new AppError(
        ERRORS.EXTERNAL_WALLET_NOT_FOUND.message,
        ERRORS.EXTERNAL_WALLET_NOT_FOUND.status,
        ERRORS.EXTERNAL_WALLET_NOT_FOUND.type
      );
    }

    // Platform/master key bypasses ownership check
    if (!req.user.platform) {
      if (existingWallet.account !== id) {
        throw new AppError(
          ERRORS.EXTERNAL_WALLET_NOT_FOUND.message,
          ERRORS.EXTERNAL_WALLET_NOT_FOUND.status,
          ERRORS.EXTERNAL_WALLET_NOT_FOUND.type
        );
      }
    }

    Logger.info('Deleting external wallet', { externalAccountId });

    const result = await externalWalletModule.DeleteExternalWallet(
      externalAccountId
    );

    Logger.info('External wallet deleted successfully', { externalAccountId });

    res.json(result);
  })
);

export default router;
