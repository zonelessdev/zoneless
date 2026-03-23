/**
 * @fileOverview Transfer routes
 *
 * Handles creating, retrieving, updating, and listing transfers.
 * Transfers move funds between connected accounts as part of Connect.
 *
 * @see https://docs.stripe.com/api/transfers
 */

import * as express from 'express';
import { AsyncHandler } from '../utils/AsyncHandler';
import { AppError } from '../utils/AppError';
import { ERRORS } from '../utils/Errors';
import { Logger } from '../utils/Logger';
import { ParseCreatedFilter } from '../utils/ListHelper';
import { db } from '../modules/Database';
import { TransferModule } from '../modules/Transfer';
import { AccountModule } from '../modules/Account';
import { EventService } from '../modules/EventService';
import { CanAccessAccount } from '../modules/PlatformAccess';
import { ValidateRequest } from '../middleware/ValidateRequest';
import {
  RequirePlatform,
  RequireResourceOwnership,
} from '../middleware/Authorization';
import {
  CreateTransferSchema,
  UpdateTransferSchema,
} from '../schemas/TransferSchema';
import { Transfer as TransferType } from '@zoneless/shared-types';

const router = express.Router();

const eventService = new EventService(db);
const transferModule = new TransferModule(db, eventService);
const accountModule = new AccountModule(db);

// Extend Request type for transfer
declare global {
  namespace Express {
    interface Request {
      transfer?: TransferType | null;
    }
  }
}

/** Middleware to verify transfer ownership and attach transfer to request */
const requireTransferOwnership = RequireResourceOwnership<TransferType>({
  fetchFn: (id: string) => transferModule.GetTransfer(id),
  notFoundError: ERRORS.TRANSFER_NOT_FOUND,
  requestKey: 'transfer',
});

/**
 * Middleware to verify transfer access for reading.
 * Allows both the sender (account) and receiver (destination) to view the transfer.
 * Platforms can only access transfers involving their own connected accounts.
 */
const requireTransferReadAccess = AsyncHandler(
  async (
    req: express.Request,
    res: express.Response,
    next: express.NextFunction
  ) => {
    const transferId = req.params.id;

    if (!req.user) {
      throw new AppError(
        ERRORS.UNAUTHORIZED.message,
        ERRORS.UNAUTHORIZED.status,
        ERRORS.UNAUTHORIZED.type
      );
    }

    const transfer = await transferModule.GetTransfer(transferId);

    if (!transfer) {
      throw new AppError(
        ERRORS.TRANSFER_NOT_FOUND.message,
        ERRORS.TRANSFER_NOT_FOUND.status,
        ERRORS.TRANSFER_NOT_FOUND.type
      );
    }

    // Platform can only access transfers involving their connected accounts
    if (req.user.platform) {
      // Check if either sender or receiver belongs to this platform
      const senderAccount = await accountModule.GetAccount(transfer.account);
      const receiverAccount = await accountModule.GetAccount(
        transfer.destination
      );

      const canAccessSender =
        senderAccount && CanAccessAccount(req.user.account, senderAccount);
      const canAccessReceiver =
        receiverAccount && CanAccessAccount(req.user.account, receiverAccount);

      if (!canAccessSender && !canAccessReceiver) {
        throw new AppError(
          ERRORS.NOT_RESOURCE_OWNER.message,
          ERRORS.NOT_RESOURCE_OWNER.status,
          ERRORS.NOT_RESOURCE_OWNER.type
        );
      }

      req.transfer = transfer;
      return next();
    }

    // Connected account: Allow access if user is the sender OR the receiver
    const isOwner = transfer.account === req.user.account;
    const isReceiver = transfer.destination === req.user.account;

    if (!isOwner && !isReceiver) {
      throw new AppError(
        ERRORS.NOT_RESOURCE_OWNER.message,
        ERRORS.NOT_RESOURCE_OWNER.status,
        ERRORS.NOT_RESOURCE_OWNER.type
      );
    }

    req.transfer = transfer;
    next();
  }
);

// ─────────────────────────────────────────────────────────────────────────────
// POST /v1/transfers - Create a transfer
// @see https://docs.stripe.com/api/transfers/create
// ─────────────────────────────────────────────────────────────────────────────
router.post(
  '/',
  RequirePlatform(),
  ValidateRequest(CreateTransferSchema),
  AsyncHandler(async (req: express.Request, res: express.Response) => {
    const platformAccountId = req.user.account;
    const { destination } = req.body;

    // Verify the destination account belongs to this platform
    const destinationAccount = await accountModule.GetAccount(destination);

    if (!destinationAccount) {
      throw new AppError(
        ERRORS.NO_SUCH_CONNECTED_ACCOUNT.message,
        ERRORS.NO_SUCH_CONNECTED_ACCOUNT.status,
        ERRORS.NO_SUCH_CONNECTED_ACCOUNT.type
      );
    }

    // Ensure the destination is a connected account owned by this platform
    if (destinationAccount.platform_account !== platformAccountId) {
      throw new AppError(
        ERRORS.NO_SUCH_CONNECTED_ACCOUNT.message,
        ERRORS.NO_SUCH_CONNECTED_ACCOUNT.status,
        ERRORS.NO_SUCH_CONNECTED_ACCOUNT.type
      );
    }

    Logger.info('Creating transfer', {
      account: platformAccountId,
      amount: req.body.amount,
      destination: req.body.destination,
    });

    const transfer = await transferModule.CreateTransfer(
      platformAccountId,
      req.body
    );

    Logger.info('Transfer created successfully', {
      transferId: transfer.id,
      amount: transfer.amount,
      destination: transfer.destination,
    });

    res.status(201).json(transfer);
  })
);

// ─────────────────────────────────────────────────────────────────────────────
// POST /v1/transfers/:id - Update a transfer
// @see https://docs.stripe.com/api/transfers/update
// ─────────────────────────────────────────────────────────────────────────────
router.post(
  '/:id',
  requireTransferOwnership,
  ValidateRequest(UpdateTransferSchema),
  AsyncHandler(async (req: express.Request, res: express.Response) => {
    const id = req.params.id;

    Logger.info('Updating transfer', { transferId: id });

    const updatedTransfer = await transferModule.UpdateTransfer(id, req.body);

    Logger.info('Transfer updated successfully', { transferId: id });

    res.json(updatedTransfer);
  })
);

// ─────────────────────────────────────────────────────────────────────────────
// GET /v1/transfers/:id - Retrieve a transfer
// @see https://docs.stripe.com/api/transfers/retrieve
// ─────────────────────────────────────────────────────────────────────────────
router.get(
  '/:id',
  requireTransferReadAccess,
  AsyncHandler(async (req: express.Request, res: express.Response) => {
    // Transfer is already fetched and validated by middleware
    res.json(req.transfer);
  })
);

// ─────────────────────────────────────────────────────────────────────────────
// GET /v1/transfers - List all transfers
// @see https://docs.stripe.com/api/transfers/list
// ─────────────────────────────────────────────────────────────────────────────
router.get(
  '/',
  RequirePlatform(),
  AsyncHandler(async (req: express.Request, res: express.Response) => {
    const account = req.user.account;

    const limit = req.query.limit
      ? parseInt(req.query.limit as string, 10)
      : 10;
    const startingAfter = req.query.starting_after as string | undefined;
    const endingBefore = req.query.ending_before as string | undefined;
    const destination = req.query.destination as string | undefined;
    const transferGroup = req.query.transfer_group as string | undefined;
    const created = ParseCreatedFilter(req.query as Record<string, unknown>);

    Logger.info('Listing transfers', {
      account,
      limit,
      startingAfter,
      endingBefore,
      destination,
      transferGroup,
    });

    try {
      const result = await transferModule.ListTransfers({
        account,
        limit,
        startingAfter,
        endingBefore,
        destination,
        transferGroup,
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

export default router;
