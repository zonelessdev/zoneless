import * as express from 'express';
import { AsyncHandler } from '../utils/AsyncHandler';
import { AppError } from '../utils/AppError';
import { ERRORS } from '../utils/Errors';
import { Logger } from '../utils/Logger';
import { ParseCreatedFilter } from '../utils/ListHelper';

import { db } from '../modules/Database';
import { BalanceTransactionModule } from '../modules/BalanceTransaction';
import { AccountModule } from '../modules/Account';
import { CanAccessAccount } from '../modules/PlatformAccess';

const router = express.Router();

const balanceTransactionModule = new BalanceTransactionModule(db);
const accountModule = new AccountModule(db);

/**
 * GET /v1/balance_transactions
 *
 * Returns a list of transactions that have contributed to the account balance
 * (e.g., transfers, payouts, topups). The transactions are returned in sorted
 * order, with the most recent transactions appearing first.
 *
 * Query parameters:
 * - limit: Maximum number of items to return (1-100, default 10)
 * - starting_after: Cursor for pagination - returns items after this ID
 * - ending_before: Cursor for pagination - returns items before this ID
 * - created: Filter by created timestamp (supports created[gt], created[gte], etc.)
 * - type: Only returns transactions of the given type
 * - source: Only returns transactions associated with the given object
 * - currency: Only returns transactions in a certain currency
 * - payout: For automatic payouts only, only returns transactions that were paid out on the specified payout ID
 */
router.get(
  '/',
  AsyncHandler(async (req: express.Request, res: express.Response) => {
    const accountId = req.user.account;

    Logger.info('Listing balance transactions', { accountId });

    const limit = req.query.limit
      ? parseInt(req.query.limit as string, 10)
      : 10;
    const startingAfter = req.query.starting_after as string | undefined;
    const endingBefore = req.query.ending_before as string | undefined;
    const type = req.query.type as string | undefined;
    const source = req.query.source as string | undefined;
    const currency = req.query.currency as string | undefined;
    const payout = req.query.payout as string | undefined;
    const created = ParseCreatedFilter(req.query as Record<string, unknown>);

    const result = await balanceTransactionModule.ListBalanceTransactions({
      account: accountId,
      limit,
      startingAfter,
      endingBefore,
      created,
      type: type as any,
      source,
      currency,
      payout,
    });

    Logger.info('Balance transactions listed successfully', {
      accountId,
      count: result.data.length,
      hasMore: result.has_more,
    });

    res.json(result);
  })
);

/**
 * GET /v1/balance_transactions/:id
 *
 * Retrieves the balance transaction with the given ID.
 * Platforms can access their connected accounts' transactions.
 */
router.get(
  '/:id',
  AsyncHandler(async (req: express.Request, res: express.Response) => {
    const userAccountId = req.user.account;
    const transactionId = req.params.id;

    Logger.info('Retrieving balance transaction', {
      accountId: userAccountId,
      transactionId,
    });

    const transaction = await balanceTransactionModule.GetBalanceTransaction(
      transactionId
    );

    if (!transaction) {
      throw new AppError(
        ERRORS.BALANCE_TRANSACTION_NOT_FOUND.message,
        ERRORS.BALANCE_TRANSACTION_NOT_FOUND.status,
        ERRORS.BALANCE_TRANSACTION_NOT_FOUND.type
      );
    }

    // Direct ownership check
    if (transaction.account === userAccountId) {
      Logger.info('Balance transaction retrieved successfully', {
        accountId: userAccountId,
        transactionId,
      });
      return res.json(transaction);
    }

    // Platform hierarchy check - look up the transaction owner's account
    const transactionOwnerAccount = await accountModule.GetAccount(
      transaction.account
    );

    if (
      transactionOwnerAccount &&
      CanAccessAccount(userAccountId, transactionOwnerAccount)
    ) {
      Logger.info('Balance transaction retrieved successfully', {
        accountId: userAccountId,
        transactionId,
      });
      return res.json(transaction);
    }

    throw new AppError(
      ERRORS.NOT_RESOURCE_OWNER.message,
      ERRORS.NOT_RESOURCE_OWNER.status,
      ERRORS.NOT_RESOURCE_OWNER.type
    );
  })
);

export default router;
