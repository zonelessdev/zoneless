import * as express from 'express';
import { AsyncHandler } from '../utils/AsyncHandler';
import { AppError } from '../utils/AppError';
import { ERRORS } from '../utils/Errors';
import { Logger } from '../utils/Logger';
import { ParseCreatedFilter, ParseTimestampFilter } from '../utils/ListHelper';
import { db } from '../modules/Database';
import { PayoutModule } from '../modules/Payout';
import { EventService } from '../modules/EventService';
import { ValidateRequest } from '../middleware/ValidateRequest';
import {
  RequirePlatform,
  RequireResourceOwnership,
  RequireConnectedAccountOwnership,
} from '../middleware/Authorization';
import {
  CreatePayoutSchema,
  UpdatePayoutSchema,
  BuildPayoutsBatchSchema,
  BroadcastPayoutsBatchSchema,
} from '../schemas/PayoutSchema';

const router = express.Router();

const eventService = new EventService(db);
const payoutModule = new PayoutModule(db, eventService);

/** Middleware to verify payout ownership and attach payout to request */
const requirePayoutOwnership = RequireResourceOwnership({
  fetchFn: (id: string) => payoutModule.GetPayout(id),
  notFoundError: ERRORS.PAYOUT_NOT_FOUND,
  requestKey: 'payout',
});

// Extend Request type for payout
declare global {
  namespace Express {
    interface Request {
      payout?: Awaited<ReturnType<typeof payoutModule.GetPayout>>;
    }
  }
}

/**
 * POST /v1/payouts
 * Create a payout to transfer funds from a connected account to an external wallet.
 *
 * Required parameters:
 * - amount: Amount in cents to payout
 *
 * Optional parameters:
 * - currency: Currency code (default: 'usdc')
 * - destination: External wallet ID (must belong to the connected account)
 * - description: Description for the payout
 * - method: 'standard' or 'instant' (default: 'instant')
 * - metadata: Key-value pairs to store with the payout
 * - statement_descriptor: String to display on recipient's statement (max 22 chars)
 *
 * Platform authentication is required. Use Zoneless-Account header
 * to specify the connected account to debit.
 *
 * @see https://docs.stripe.com/api/payouts/create
 */
router.post(
  '/',
  RequirePlatform(),
  RequireConnectedAccountOwnership('zoneless-account', 'header'),
  ValidateRequest(CreatePayoutSchema),
  AsyncHandler(async (req: express.Request, res: express.Response) => {
    // The connected account is verified by RequireConnectedAccountOwnership middleware
    const connectedAccount = req.connectedAccount!.id;

    const {
      amount,
      currency,
      destination,
      description,
      method,
      metadata,
      statement_descriptor,
    } = req.body;

    Logger.info('Processing payout request', {
      connectedAccount,
      amount,
      destination,
    });

    const payout = await payoutModule.CreatePayout(connectedAccount, {
      amount,
      currency: currency || 'usdc',
      destination,
      description,
      method: method || 'instant',
      metadata: metadata || {},
      statement_descriptor,
    });

    Logger.info('Payout created successfully', {
      payoutId: payout.id,
      amount: payout.amount,
      destination: payout.destination,
    });

    Logger.info('Payout created', {
      payoutId: payout.id,
      status: payout.status,
    });

    res.status(201).json(payout);
  })
);

/**
 * POST /v1/payouts/build
 * Build an unsigned batch payout transaction for multiple pending payouts.
 * This enables self-custodial payouts where the platform signs transactions locally.
 *
 * Required parameters:
 * - payouts: Array of payout IDs to include in the batch (max 10)
 *
 * Returns:
 * - unsigned_transaction: Base64-encoded unsigned transaction ready for signing
 * - estimated_fee_lamports: Estimated transaction fee in lamports
 * - blockhash: The blockhash used for the transaction
 * - last_valid_block_height: Block height after which the transaction expires
 * - payouts: Array of payout objects included in the transaction
 * - total_amount: Total amount in cents being paid out
 * - recipients_count: Number of recipients in the transaction
 *
 * Platform authentication is required.
 */
router.post(
  '/build',
  RequirePlatform(),
  ValidateRequest(BuildPayoutsBatchSchema),
  AsyncHandler(async (req: express.Request, res: express.Response) => {
    const platformAccountId = req.user.account;
    const { payouts } = req.body;

    Logger.info('Building batch payout transaction', {
      platformAccountId,
      payoutCount: payouts.length,
    });

    const result = await payoutModule.BuildPayoutsBatch(platformAccountId, {
      payouts,
    });

    Logger.info('Batch payout transaction built successfully', {
      platformAccountId,
      payoutCount: result.payouts.length,
      totalAmount: result.total_amount,
      blockhash: result.blockhash,
    });

    res.json(result);
  })
);

/**
 * POST /v1/payouts/broadcast
 * Broadcast a signed batch payout transaction to the Solana network.
 * Updates all included payouts to 'paid' or 'failed' status based on the result.
 *
 * Required parameters:
 * - signed_transaction: Base64-encoded signed transaction
 * - payouts: Array of payout IDs included in the transaction
 *
 * Returns:
 * - signature: The transaction signature
 * - status: 'paid' or 'failed'
 * - viewer_url: URL to view the transaction on Solana Explorer
 * - payouts: Array of updated payout objects
 * - failure_message: Error message if the transaction failed
 *
 * Platform authentication is required.
 * Webhooks (payout.paid or payout.failed) are sent for each payout.
 */
router.post(
  '/broadcast',
  RequirePlatform(),
  ValidateRequest(BroadcastPayoutsBatchSchema),
  AsyncHandler(async (req: express.Request, res: express.Response) => {
    const platformAccountId = req.user.account;
    const { signed_transaction, payouts, blockhash, last_valid_block_height } =
      req.body;

    Logger.info('Broadcasting batch payout transaction', {
      platformAccountId,
      payoutCount: payouts.length,
    });

    const result = await payoutModule.BroadcastPayoutsBatch(platformAccountId, {
      signed_transaction,
      payouts,
      blockhash,
      last_valid_block_height,
    });

    Logger.info('Batch payout transaction broadcast completed', {
      platformAccountId,
      status: result.status,
      signature: result.signature,
      payoutCount: result.payouts.length,
    });

    res.json(result);
  })
);

/**
 * POST /v1/payouts/:id
 * Update a payout's metadata.
 *
 * @see https://docs.stripe.com/api/payouts/update
 */
router.post(
  '/:id',
  requirePayoutOwnership,
  ValidateRequest(UpdatePayoutSchema),
  AsyncHandler(async (req: express.Request, res: express.Response) => {
    const id = req.params.id;
    const { metadata } = req.body;

    const updatedPayout = await payoutModule.UpdatePayout(id, { metadata });

    res.json(updatedPayout);
  })
);

/**
 * POST /v1/payouts/:id/cancel
 * Cancel a pending payout and refund the account balance.
 *
 * @see https://docs.stripe.com/api/payouts/cancel
 */
router.post(
  '/:id/cancel',
  requirePayoutOwnership,
  AsyncHandler(async (req: express.Request, res: express.Response) => {
    const id = req.params.id;

    Logger.info('Canceling payout', { payoutId: id });

    const canceledPayout = await payoutModule.CancelPayout(id);

    Logger.info('Payout canceled successfully', {
      payoutId: canceledPayout.id,
      amount: canceledPayout.amount,
    });

    res.json(canceledPayout);
  })
);

/**
 * GET /v1/payouts/:id
 * Retrieve a single payout by ID.
 *
 * @see https://docs.stripe.com/api/payouts/retrieve
 */
router.get(
  '/:id',
  requirePayoutOwnership,
  AsyncHandler(async (req: express.Request, res: express.Response) => {
    // Payout is already fetched and validated by middleware
    res.json(req.payout);
  })
);

/**
 * GET /v1/payouts
 * List all payouts with optional filtering and pagination.
 *
 * For platforms: Lists payouts for all their connected accounts.
 * For connected accounts: Lists only their own payouts.
 *
 * Query parameters:
 * - limit: Number of results (1-100, default: 10)
 * - starting_after: Cursor for forward pagination
 * - ending_before: Cursor for backward pagination
 * - status: Filter by payout status (pending, in_transit, paid, failed, canceled)
 * - destination: Filter by destination external wallet ID
 * - created: Filter by creation timestamp
 * - arrival_date: Filter by expected arrival date
 *
 * @see https://docs.stripe.com/api/payouts/list
 */
router.get(
  '/',
  AsyncHandler(async (req: express.Request, res: express.Response) => {
    const limit = req.query.limit
      ? parseInt(req.query.limit as string, 10)
      : 10;
    const startingAfter = req.query.starting_after as string | undefined;
    const endingBefore = req.query.ending_before as string | undefined;
    const status = req.query.status as string | undefined;
    const destination = req.query.destination as string | undefined;
    const created = ParseCreatedFilter(req.query as Record<string, unknown>);
    const arrivalDate = ParseTimestampFilter(
      req.query as Record<string, unknown>,
      'arrival_date'
    );

    const statusFilter = status as
      | 'pending'
      | 'processing'
      | 'in_transit'
      | 'paid'
      | 'failed'
      | 'canceled'
      | undefined;

    try {
      // For platforms, get payouts for all connected accounts using platform_account
      // For connected accounts, only get their own payouts
      if (req.user.platform) {
        const result = await payoutModule.ListPayoutsByPlatform({
          platformAccount: req.user.account,
          limit,
          startingAfter,
          endingBefore,
          status: statusFilter,
          destination,
          created,
          arrivalDate,
        });

        res.json(result);
      } else {
        // Connected account - only their own payouts
        const result = await payoutModule.ListPayouts({
          account: req.user.account,
          limit,
          startingAfter,
          endingBefore,
          status: statusFilter,
          destination,
          created,
          arrivalDate,
        });

        res.json(result);
      }
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
