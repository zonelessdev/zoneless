import * as express from 'express';
import { AsyncHandler } from '../utils/AsyncHandler';
import { AppError } from '../utils/AppError';
import { ERRORS } from '../utils/Errors';
import { Logger } from '../utils/Logger';
import { Database } from '../modules/Database';
import { AccountLinkModule } from '../modules/AccountLink';
import { AccountModule } from '../modules/Account';
import { ValidateRequest } from '../middleware/ValidateRequest';
import { RequirePlatform } from '../middleware/Authorization';
import { CreateAccountLinkSchema } from '../schemas/AccountLinkSchema';

const router = express.Router();
const db = new Database();
const accountLinkModule = new AccountLinkModule(db);
const accountModule = new AccountModule(db);

/**
 * POST /v1/account_links
 *
 * Creates an AccountLink object that includes a single-use Zoneless URL
 * that the platform can redirect their user to in order to take them
 * through the Connect Onboarding flow.
 *
 * @see https://docs.stripe.com/api/account_links/create
 */
router.post(
  '/',
  RequirePlatform(),
  ValidateRequest(CreateAccountLinkSchema),
  AsyncHandler(async (req: express.Request, res: express.Response) => {
    const platformAccountId = req.user.account;
    const { account, type, refresh_url, return_url } = req.body;

    // Verify the account belongs to this platform
    const targetAccount = await accountModule.GetAccount(account);

    if (!targetAccount) {
      throw new AppError(
        ERRORS.NO_SUCH_CONNECTED_ACCOUNT.message,
        ERRORS.NO_SUCH_CONNECTED_ACCOUNT.status,
        ERRORS.NO_SUCH_CONNECTED_ACCOUNT.type
      );
    }

    // Ensure the account is a connected account owned by this platform
    if (targetAccount.platform_account !== platformAccountId) {
      throw new AppError(
        ERRORS.NO_SUCH_CONNECTED_ACCOUNT.message,
        ERRORS.NO_SUCH_CONNECTED_ACCOUNT.status,
        ERRORS.NO_SUCH_CONNECTED_ACCOUNT.type
      );
    }

    Logger.info('Creating account link', {
      account,
      type,
    });

    const accountLink = await accountLinkModule.CreateAccountLink(
      account,
      type,
      refresh_url,
      return_url
    );

    Logger.info('Account link created', {
      url: accountLink.url,
      expiresAt: accountLink.expires_at,
    });

    res.json(accountLink);
  })
);

export default router;
