/**
 * @fileOverview Routes for LoginLinks
 *
 * Login Links are single-use URLs that take an Express account to the login page
 * for their Zoneless dashboard.
 *
 * @see https://docs.stripe.com/api/accounts/login_link
 */

import * as express from 'express';
import { AsyncHandler } from '../utils/AsyncHandler';
import { AppError } from '../utils/AppError';
import { ERRORS } from '../utils/Errors';
import { Logger } from '../utils/Logger';
import { db } from '../modules/Database';
import { LoginLinkModule } from '../modules/LoginLink';
import { AccountModule } from '../modules/Account';
import { RequirePlatform } from '../middleware/Authorization';

const router = express.Router();
const loginLinkModule = new LoginLinkModule(db);
const accountModule = new AccountModule(db);

// ─────────────────────────────────────────────────────────────────────────────
// POST /v1/accounts/:id/login_links - Create a login link
// @see https://docs.stripe.com/api/accounts/login_link/create
// ─────────────────────────────────────────────────────────────────────────────
router.post(
  '/:id/login_links',
  RequirePlatform(),
  AsyncHandler(async (req: express.Request, res: express.Response) => {
    const accountId = req.params.id;
    const platformAccountId = req.user.account;

    Logger.info('Creating login link', { account: accountId });

    // Verify the account exists and belongs to this platform
    const account = await accountModule.GetAccount(accountId);

    if (!account) {
      throw new AppError(
        ERRORS.ACCOUNT_NOT_FOUND.message,
        ERRORS.ACCOUNT_NOT_FOUND.status,
        ERRORS.ACCOUNT_NOT_FOUND.type
      );
    }

    // Ensure the platform owns this account
    if (account.platform_account !== platformAccountId) {
      throw new AppError(
        ERRORS.NO_SUCH_CONNECTED_ACCOUNT.message,
        ERRORS.NO_SUCH_CONNECTED_ACCOUNT.status,
        ERRORS.NO_SUCH_CONNECTED_ACCOUNT.type
      );
    }

    // Get the platform's display name for the login link
    const platformAccount = await accountModule.GetAccount(platformAccountId);
    const platformName =
      platformAccount?.settings?.dashboard?.display_name ||
      platformAccount?.business_profile?.name ||
      'Platform';

    const loginLink = await loginLinkModule.CreateLoginLink(
      accountId,
      platformName
    );

    Logger.info('Login link created successfully', {
      account: accountId,
      url: loginLink.url,
    });

    res.json(loginLink);
  })
);

export default router;
