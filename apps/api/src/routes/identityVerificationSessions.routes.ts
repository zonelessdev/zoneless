import * as express from 'express';
import { AsyncHandler } from '../utils/AsyncHandler';
import { AppError } from '../utils/AppError';
import { ERRORS } from '../utils/Errors';
import { Logger } from '../utils/Logger';
import { ParseCreatedFilter } from '../utils/ListHelper';

import { db } from '../modules/Database';
import { AccountModule } from '../modules/Account';
import { EventService } from '../modules/EventService';
import { IdentityVerificationSessionModule } from '../modules/IdentityVerificationSession';

import { ValidateRequest } from '../middleware/ValidateRequest';
import { RequirePlatform } from '../middleware/Authorization';

import {
  CreateIdentityVerificationSessionSchema,
  UpdateIdentityVerificationSessionSchema,
} from '@zoneless/shared-schemas';

const router = express.Router();

const eventService = new EventService(db);
const sessionModule = new IdentityVerificationSessionModule(db, eventService);
const accountModule = new AccountModule(db);

/**
 * POST /v1/identity/verification_sessions
 * Create a VerificationSession. The returned `url` is the provider hosted link.
 *
 * Platforms may create sessions for their connected accounts.
 * Connected accounts may create a session for themselves only.
 * @see https://docs.stripe.com/api/identity/verification_sessions/create
 */
router.post(
  '/',
  ValidateRequest(CreateIdentityVerificationSessionSchema),
  AsyncHandler(async (req: express.Request, res: express.Response) => {
    let platformAccountId: string;
    let input = { ...req.body };

    if (req.user.platform) {
      platformAccountId = req.user.account;
    } else {
      // Connected account — may only verify themselves
      const selfId = req.user.account;
      if (input.related_account && input.related_account !== selfId) {
        throw new AppError(
          ERRORS.PERMISSION_DENIED.message,
          ERRORS.PERMISSION_DENIED.status,
          ERRORS.PERMISSION_DENIED.type
        );
      }

      const account = await accountModule.GetAccount(selfId);
      if (!account) {
        throw new AppError(
          ERRORS.ACCOUNT_NOT_FOUND.message,
          ERRORS.ACCOUNT_NOT_FOUND.status,
          ERRORS.ACCOUNT_NOT_FOUND.type
        );
      }

      platformAccountId = account.platform_account;
      input = { ...input, related_account: selfId };
    }

    Logger.info('Creating identity verification session', {
      relatedAccount: input.related_account,
      caller: req.user.account,
    });

    const session = await sessionModule.Create(platformAccountId, input);

    Logger.info('Identity verification session created', {
      sessionId: session.id,
      providerSessionId: session.provider_session_id,
    });

    res.status(201).json(session);
  })
);

/**
 * GET /v1/identity/verification_sessions
 * List VerificationSessions for the platform.
 */
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
    const relatedAccount = req.query.related_account as string | undefined;
    const status = req.query.status as
      | 'requires_input'
      | 'processing'
      | 'verified'
      | 'canceled'
      | 'requires_action'
      | undefined;
    const created = ParseCreatedFilter(req.query as Record<string, unknown>);

    const result = await sessionModule.List({
      account: platformAccountId,
      limit,
      startingAfter,
      endingBefore,
      created,
      relatedAccount,
      status,
    });

    res.json(result);
  })
);

/**
 * GET /v1/identity/verification_sessions/:id
 */
router.get(
  '/:id',
  RequirePlatform(),
  AsyncHandler(async (req: express.Request, res: express.Response) => {
    const session = await sessionModule.RequireSession(
      req.params.id,
      req.user.account
    );
    res.json(session);
  })
);

/**
 * POST /v1/identity/verification_sessions/:id
 * Update a VerificationSession (requires_input only).
 */
router.post(
  '/:id',
  RequirePlatform(),
  ValidateRequest(UpdateIdentityVerificationSessionSchema),
  AsyncHandler(async (req: express.Request, res: express.Response) => {
    const session = await sessionModule.Update(
      req.params.id,
      req.user.account,
      req.body
    );
    res.json(session);
  })
);

/**
 * POST /v1/identity/verification_sessions/:id/cancel
 */
router.post(
  '/:id/cancel',
  RequirePlatform(),
  AsyncHandler(async (req: express.Request, res: express.Response) => {
    const session = await sessionModule.Cancel(
      req.params.id,
      req.user.account
    );
    res.json(session);
  })
);

/**
 * POST /v1/identity/verification_sessions/:id/redact
 */
router.post(
  '/:id/redact',
  RequirePlatform(),
  AsyncHandler(async (req: express.Request, res: express.Response) => {
    const session = await sessionModule.Redact(
      req.params.id,
      req.user.account
    );
    res.json(session);
  })
);

export default router;
