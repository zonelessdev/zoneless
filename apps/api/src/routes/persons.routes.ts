/**
 * @fileOverview Person API routes
 *
 * Implements Stripe-compatible person endpoints for managing individuals
 * associated with accounts.
 *
 * @see https://docs.stripe.com/api/persons
 */

import * as express from 'express';
import { AsyncHandler } from '../utils/AsyncHandler';
import { AppError } from '../utils/AppError';
import { ERRORS } from '../utils/Errors';
import { Logger } from '../utils/Logger';

import { db } from '../modules/Database';
import { PersonModule } from '../modules/Person';
import { AccountModule } from '../modules/Account';
import { EventService } from '../modules/EventService';

import { ValidateRequest } from '../middleware/ValidateRequest';
import {
  RequireAccountOwnership,
  RequirePlatform,
} from '../middleware/Authorization';

import {
  CreatePersonSchema,
  UpdatePersonSchema,
  ParseRelationshipFilters,
} from '../schemas/PersonSchema';

import { Person as PersonType } from '@zoneless/shared-types';

const router = express.Router();

const eventService = new EventService(db);
const accountModule = new AccountModule(db, eventService);
const personModule = new PersonModule(db, eventService);

// ─────────────────────────────────────────────────────────────────────────────
// POST /v1/accounts/:id/persons - Create a person
// @see https://docs.stripe.com/api/persons/create
// ─────────────────────────────────────────────────────────────────────────────
router.post(
  '/:id/persons',
  RequireAccountOwnership('id'),
  ValidateRequest(CreatePersonSchema),
  AsyncHandler(async (req: express.Request, res: express.Response) => {
    const accountId = req.params.id;

    Logger.info('Creating person', {
      accountId,
      fields: Object.keys(req.body),
    });

    // Verify account exists
    const account = await accountModule.GetAccount(accountId);
    if (!account) {
      throw new AppError(
        ERRORS.ACCOUNT_NOT_FOUND.message,
        ERRORS.ACCOUNT_NOT_FOUND.status,
        ERRORS.ACCOUNT_NOT_FOUND.type
      );
    }

    const person = await personModule.CreatePerson(accountId, req.body);

    Logger.info('Person created successfully', {
      personId: person.id,
      accountId,
    });

    res.status(201).json(person);
  })
);

// ─────────────────────────────────────────────────────────────────────────────
// GET /v1/accounts/:id/persons - List all persons
// @see https://docs.stripe.com/api/persons/list
// ─────────────────────────────────────────────────────────────────────────────
router.get(
  '/:id/persons',
  RequireAccountOwnership('id'),
  AsyncHandler(async (req: express.Request, res: express.Response) => {
    const accountId = req.params.id;

    // Parse query parameters
    const limit = req.query.limit
      ? parseInt(req.query.limit as string, 10)
      : 10;
    const startingAfter = req.query.starting_after as string | undefined;
    const endingBefore = req.query.ending_before as string | undefined;
    const relationship = ParseRelationshipFilters(
      req.query as Record<string, unknown>
    );

    Logger.info('Listing persons', {
      accountId,
      limit,
      startingAfter,
      endingBefore,
      relationship,
    });

    // Verify account exists
    const account = await accountModule.GetAccount(accountId);
    if (!account) {
      throw new AppError(
        ERRORS.ACCOUNT_NOT_FOUND.message,
        ERRORS.ACCOUNT_NOT_FOUND.status,
        ERRORS.ACCOUNT_NOT_FOUND.type
      );
    }

    try {
      const result = await personModule.ListPersons(accountId, {
        limit,
        startingAfter,
        endingBefore,
        relationship,
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
// GET /v1/accounts/:id/persons/:personId - Retrieve a person
// @see https://docs.stripe.com/api/persons/retrieve
// ─────────────────────────────────────────────────────────────────────────────
router.get(
  '/:id/persons/:personId',
  RequireAccountOwnership('id'),
  AsyncHandler(async (req: express.Request, res: express.Response) => {
    const accountId = req.params.id;
    const personId = req.params.personId;

    Logger.info('Retrieving person', { personId, accountId });

    // Verify account exists
    const account = await accountModule.GetAccount(accountId);
    if (!account) {
      throw new AppError(
        ERRORS.ACCOUNT_NOT_FOUND.message,
        ERRORS.ACCOUNT_NOT_FOUND.status,
        ERRORS.ACCOUNT_NOT_FOUND.type
      );
    }

    const person = await personModule.GetPerson(personId);

    if (!person) {
      throw new AppError(
        ERRORS.PERSON_NOT_FOUND.message,
        ERRORS.PERSON_NOT_FOUND.status,
        ERRORS.PERSON_NOT_FOUND.type
      );
    }

    // Verify person belongs to the account
    if (person.account !== accountId) {
      throw new AppError(
        ERRORS.PERSON_NOT_FOUND.message,
        ERRORS.PERSON_NOT_FOUND.status,
        ERRORS.PERSON_NOT_FOUND.type
      );
    }

    res.json(person);
  })
);

// ─────────────────────────────────────────────────────────────────────────────
// POST /v1/accounts/:id/persons/:personId - Update a person
// @see https://docs.stripe.com/api/persons/update
// ─────────────────────────────────────────────────────────────────────────────
router.post(
  '/:id/persons/:personId',
  RequireAccountOwnership('id'),
  ValidateRequest(UpdatePersonSchema),
  AsyncHandler(async (req: express.Request, res: express.Response) => {
    const accountId = req.params.id;
    const personId = req.params.personId;

    Logger.info('Updating person', {
      personId,
      accountId,
      fields: Object.keys(req.body),
    });

    // Verify account exists
    const account = await accountModule.GetAccount(accountId);
    if (!account) {
      throw new AppError(
        ERRORS.ACCOUNT_NOT_FOUND.message,
        ERRORS.ACCOUNT_NOT_FOUND.status,
        ERRORS.ACCOUNT_NOT_FOUND.type
      );
    }

    // Verify person exists and belongs to the account
    const existingPerson = await personModule.GetPerson(personId);
    if (!existingPerson) {
      throw new AppError(
        ERRORS.PERSON_NOT_FOUND.message,
        ERRORS.PERSON_NOT_FOUND.status,
        ERRORS.PERSON_NOT_FOUND.type
      );
    }

    if (existingPerson.account !== accountId) {
      throw new AppError(
        ERRORS.PERSON_NOT_FOUND.message,
        ERRORS.PERSON_NOT_FOUND.status,
        ERRORS.PERSON_NOT_FOUND.type
      );
    }

    const person = await personModule.UpdatePerson(personId, req.body);

    // Mark account as having details submitted
    await accountModule.DetailsSubmitted(accountId);

    Logger.info('Person updated successfully', { personId, accountId });

    res.json(person);
  })
);

// ─────────────────────────────────────────────────────────────────────────────
// DELETE /v1/accounts/:id/persons/:personId - Delete a person
// @see https://docs.stripe.com/api/persons/delete
// ─────────────────────────────────────────────────────────────────────────────
router.delete(
  '/:id/persons/:personId',
  RequireAccountOwnership('id'),
  AsyncHandler(async (req: express.Request, res: express.Response) => {
    const accountId = req.params.id;
    const personId = req.params.personId;

    Logger.info('Deleting person', { personId, accountId });

    // Verify account exists
    const account = await accountModule.GetAccount(accountId);
    if (!account) {
      throw new AppError(
        ERRORS.ACCOUNT_NOT_FOUND.message,
        ERRORS.ACCOUNT_NOT_FOUND.status,
        ERRORS.ACCOUNT_NOT_FOUND.type
      );
    }

    // Verify person exists and belongs to the account
    const existingPerson = await personModule.GetPerson(personId);
    if (!existingPerson) {
      throw new AppError(
        ERRORS.PERSON_NOT_FOUND.message,
        ERRORS.PERSON_NOT_FOUND.status,
        ERRORS.PERSON_NOT_FOUND.type
      );
    }

    if (existingPerson.account !== accountId) {
      throw new AppError(
        ERRORS.PERSON_NOT_FOUND.message,
        ERRORS.PERSON_NOT_FOUND.status,
        ERRORS.PERSON_NOT_FOUND.type
      );
    }

    const result = await personModule.DeletePerson(personId);

    Logger.info('Person deleted successfully', { personId, accountId });

    res.json(result);
  })
);

export default router;
