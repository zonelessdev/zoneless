/**
 * @fileOverview Methods for Persons
 *
 * Persons represent individuals associated with a Zoneless account,
 * such as business owners, directors, or representatives.
 *
 *
 * @module Person
 */

import {
  Person as PersonType,
  PersonDeleted,
  PersonRequirements,
  PersonVerification,
  PersonRelationship,
  QueryOperators,
  Account as AccountType,
} from '@zoneless/shared-types';
import { GetPlatformAccountId } from './PlatformAccess';
import { AccountModule } from './Account';
import { Database } from './Database';
import { EventService } from './EventService';
import { ExtractChangedFields } from './Event';
import { GenerateId } from '../utils/IdGenerator';
import { Now } from '../utils/Timestamp';
import { ValidateUpdate } from './Util';
import { ListHelper, ListResult, ListOptions } from '../utils/ListHelper';
import { AppError } from '../utils/AppError';
import { ERRORS } from '../utils/Errors';
import {
  CreatePersonSchema,
  CreatePersonInput,
  UpdatePersonSchema,
  UpdatePersonInput,
  RelationshipFilters,
} from '../schemas/PersonSchema';

export class PersonModule {
  private readonly db: Database;
  private readonly eventService: EventService | null;
  private readonly listHelper: ListHelper<PersonType>;
  private readonly accountModule: AccountModule;

  constructor(db: Database, eventService?: EventService) {
    this.db = db;
    this.eventService = eventService || null;
    this.accountModule = new AccountModule(db);
    this.listHelper = new ListHelper<PersonType>(db, {
      collection: 'Persons',
      orderByField: 'created',
      orderDirection: 'desc',
      urlPath: '/v1/accounts/:account/persons',
    });
  }

  /**
   * Creates a new person associated with an account.
   * Emits a 'person.created' event if EventService is configured.
   *
   * @param accountId - The account ID this person is associated with
   * @param input - Optional person creation input
   * @returns The created person
   */
  async CreatePerson(
    accountId: string,
    input: CreatePersonInput = {}
  ): Promise<PersonType> {
    // Get the account to determine the platform
    const account = await this.accountModule.GetAccount(accountId);
    if (!account) {
      throw new AppError(
        ERRORS.ACCOUNT_NOT_FOUND.message,
        ERRORS.ACCOUNT_NOT_FOUND.status,
        ERRORS.ACCOUNT_NOT_FOUND.type
      );
    }
    const platformAccountId = GetPlatformAccountId(account);

    // Validate input if provided
    const validatedInput = ValidateUpdate(CreatePersonSchema, input);
    const person = this.CreatePersonObject(
      accountId,
      platformAccountId,
      validatedInput
    );
    await this.db.Set('Persons', person.id, person);

    // Emit person.created event (routed to platform via EventService)
    if (this.eventService) {
      await this.eventService.Emit('person.created', person.account, person);
    }

    return person;
  }

  /**
   * Creates a person object without saving to database.
   *
   * @param accountId - The account ID this person is associated with
   * @param platformAccountId - The platform account ID that owns this resource
   * @param input - Optional person creation input
   * @returns The person object (not persisted)
   */
  CreatePersonObject(
    accountId: string,
    platformAccountId: string,
    input: CreatePersonInput = {}
  ): PersonType {
    const now = Now();

    // Build default requirements
    const defaultRequirements: PersonRequirements = {
      alternatives: [],
      currently_due: [],
      errors: [],
      eventually_due: [],
      past_due: [],
      pending_verification: [],
    };

    // Build default verification
    const defaultVerification: PersonVerification = {
      additional_document: null,
      details: null,
      details_code: null,
      document: {
        back: null,
        details: null,
        details_code: null,
        front: null,
      },
      status: 'unverified',
    };

    // Build default relationship
    const defaultRelationship: PersonRelationship = {
      authorizer: null,
      director: false,
      executive: false,
      legal_guardian: null,
      owner: false,
      percent_ownership: null,
      representative: false,
      title: null,
    };

    // Merge input relationship with defaults
    const relationship: PersonRelationship = input.relationship
      ? { ...defaultRelationship, ...input.relationship }
      : defaultRelationship;

    // Process verification input if provided
    let verification = defaultVerification;
    if (input.verification) {
      verification = {
        ...defaultVerification,
        document: {
          back: input.verification.document?.back ?? null,
          details: null,
          details_code: null,
          front: input.verification.document?.front ?? null,
        },
        additional_document: input.verification.additional_document
          ? {
              back: input.verification.additional_document.back ?? null,
              details: null,
              details_code: null,
              front: input.verification.additional_document.front ?? null,
            }
          : null,
      };
    }

    // Convert input.dob to PersonDob if provided
    const dob = input.dob
      ? {
          day: input.dob.day ?? null,
          month: input.dob.month ?? null,
          year: input.dob.year ?? null,
        }
      : null;

    // Convert input.address to PersonAddress if provided
    const address = input.address
      ? {
          city: input.address.city ?? null,
          country: input.address.country ?? null,
          line1: input.address.line1 ?? null,
          line2: input.address.line2 ?? null,
          postal_code: input.address.postal_code ?? null,
          state: input.address.state ?? null,
        }
      : null;

    const person: PersonType = {
      id: GenerateId('person_z'),
      object: 'person',
      account: accountId,
      platform_account: platformAccountId,
      created: now,
      dob,
      email: input.email ?? null,
      first_name: input.first_name ?? null,
      future_requirements: defaultRequirements,
      id_number_provided: !!input.id_number,
      last_name: input.last_name ?? null,
      metadata: input.metadata ?? {},
      phone: input.phone ?? null,
      relationship,
      requirements: defaultRequirements,
      ssn_last_4_provided: !!input.ssn_last_4,
      verification,
      address,
    };

    return person;
  }

  /**
   * Retrieves a person by ID.
   *
   * @param personId - The ID of the person to retrieve
   * @returns The person or null if not found
   */
  async GetPerson(personId: string): Promise<PersonType | null> {
    return this.db.Get<PersonType>('Persons', personId);
  }

  /**
   * Retrieves the first person associated with an account.
   * Used for getting the individual associated with an individual account.
   *
   * @param accountId - The account ID to find persons for
   * @returns The first person or null if none found
   */
  async GetPersonByAccount(accountId: string): Promise<PersonType | null> {
    const persons = await this.db.Find<PersonType>(
      'Persons',
      'account',
      accountId
    );
    if (persons && persons.length > 0) {
      return persons[0];
    }
    return null;
  }

  /**
   * Lists all persons for an account with pagination and filtering.
   *
   * @param accountId - The account ID to list persons for
   * @param options - Pagination and filter options
   * @returns Paginated list of persons
   */
  async ListPersons(
    accountId: string,
    options: {
      limit?: number;
      startingAfter?: string;
      endingBefore?: string;
      relationship?: RelationshipFilters;
    } = {}
  ): Promise<ListResult<PersonType>> {
    const { limit = 10, startingAfter, endingBefore, relationship } = options;

    // Build filters from relationship options
    const filters: Record<string, unknown> = {};
    if (relationship) {
      if (relationship.authorizer !== undefined) {
        filters['relationship.authorizer'] = relationship.authorizer;
      }
      if (relationship.director !== undefined) {
        filters['relationship.director'] = relationship.director;
      }
      if (relationship.executive !== undefined) {
        filters['relationship.executive'] = relationship.executive;
      }
      if (relationship.legal_guardian !== undefined) {
        filters['relationship.legal_guardian'] = relationship.legal_guardian;
      }
      if (relationship.owner !== undefined) {
        filters['relationship.owner'] = relationship.owner;
      }
      if (relationship.representative !== undefined) {
        filters['relationship.representative'] = relationship.representative;
      }
    }

    // Use ListHelper for consistent pagination
    const result = await this.listHelper.List({
      account: accountId,
      limit,
      startingAfter,
      endingBefore,
      filters,
    });

    // Update URL to include account ID
    return {
      ...result,
      url: `/v1/accounts/${accountId}/persons`,
    };
  }

  /**
   * Updates a person with the provided fields.
   * Only updatable fields will be accepted - protected fields like id, object,
   * account, created are ignored.
   * Emits a 'person.updated' event if EventService is configured.
   *
   * @param personId - The ID of the person to update
   * @param input - Object containing the fields to update
   * @returns The updated person
   */
  async UpdatePerson(
    personId: string,
    input: UpdatePersonInput
  ): Promise<PersonType> {
    // Validate the input against the schema
    const validatedUpdate = ValidateUpdate(UpdatePersonSchema, input);

    // Get previous state for the event (before update)
    const previousPerson = this.eventService
      ? await this.GetPerson(personId)
      : null;

    if (!previousPerson && this.eventService) {
      throw new AppError(
        ERRORS.PERSON_NOT_FOUND.message,
        ERRORS.PERSON_NOT_FOUND.status,
        ERRORS.PERSON_NOT_FOUND.type
      );
    }

    // Process the update to handle nested objects and special fields
    const processedUpdate = await this.ProcessUpdateInput(
      personId,
      validatedUpdate
    );

    // Only update if there are valid fields
    if (Object.keys(processedUpdate).length > 0) {
      await this.db.Update<PersonType>('Persons', personId, processedUpdate);
    }

    const person = await this.GetPerson(personId);
    if (!person) {
      throw new AppError(
        ERRORS.PERSON_NOT_FOUND.message,
        ERRORS.PERSON_NOT_FOUND.status,
        ERRORS.PERSON_NOT_FOUND.type
      );
    }

    // Emit person.updated event (routed to platform via EventService)
    if (this.eventService && previousPerson) {
      const previousAttributes = ExtractChangedFields(
        previousPerson as unknown as Record<string, unknown>,
        processedUpdate as Record<string, unknown>
      );

      await this.eventService.Emit('person.updated', person.account, person, {
        previousAttributes,
      });
    }

    return person;
  }

  /**
   * Process update input to merge nested objects properly.
   */
  private async ProcessUpdateInput(
    personId: string,
    input: UpdatePersonInput
  ): Promise<Partial<PersonType>> {
    const person = await this.GetPerson(personId);
    const result: Partial<PersonType> = {};

    // Copy simple fields
    if (input.email !== undefined) result.email = input.email;
    if (input.first_name !== undefined) result.first_name = input.first_name;
    if (input.last_name !== undefined) result.last_name = input.last_name;
    if (input.phone !== undefined) result.phone = input.phone;
    if (input.metadata !== undefined) result.metadata = input.metadata;

    // Handle dob with proper conversion
    if (input.dob !== undefined) {
      result.dob = {
        day: input.dob.day ?? null,
        month: input.dob.month ?? null,
        year: input.dob.year ?? null,
      };
    }

    // Handle address with proper merging
    if (input.address !== undefined) {
      result.address = {
        city: input.address.city ?? person?.address?.city ?? null,
        country: input.address.country ?? person?.address?.country ?? null,
        line1: input.address.line1 ?? person?.address?.line1 ?? null,
        line2: input.address.line2 ?? person?.address?.line2 ?? null,
        postal_code:
          input.address.postal_code ?? person?.address?.postal_code ?? null,
        state: input.address.state ?? person?.address?.state ?? null,
      };
    }

    // Handle relationship with proper merging
    if (input.relationship !== undefined) {
      result.relationship = {
        ...person?.relationship,
        ...input.relationship,
      };
    }

    // Handle verification documents
    if (input.verification !== undefined) {
      const currentVerification = person?.verification || {
        additional_document: null,
        details: null,
        details_code: null,
        document: {
          back: null,
          details: null,
          details_code: null,
          front: null,
        },
        status: 'unverified' as const,
      };

      result.verification = {
        ...currentVerification,
        document: {
          ...currentVerification.document,
          back:
            input.verification.document?.back ??
            currentVerification.document.back,
          front:
            input.verification.document?.front ??
            currentVerification.document.front,
        },
        additional_document: input.verification.additional_document
          ? {
              back: input.verification.additional_document.back ?? null,
              details: null,
              details_code: null,
              front: input.verification.additional_document.front ?? null,
            }
          : currentVerification.additional_document,
      };
    }

    // Handle ssn_last_4 - update the flag if provided
    if (input.ssn_last_4 !== undefined) {
      result.ssn_last_4_provided = true;
      // Note: We don't store the actual SSN, just mark it as provided
    }

    // Handle id_number - update the flag if provided
    if (input.id_number !== undefined) {
      result.id_number_provided = true;
      // Note: We don't store the actual ID number, just mark it as provided
    }

    return result;
  }

  /**
   * Deletes a person.
   * Emits a 'person.deleted' event if EventService is configured.
   *
   * @param personId - The ID of the person to delete
   * @returns Object with id and deleted status
   */
  async DeletePerson(personId: string): Promise<PersonDeleted> {
    const person = await this.GetPerson(personId);

    if (!person) {
      throw new AppError(
        ERRORS.PERSON_NOT_FOUND.message,
        ERRORS.PERSON_NOT_FOUND.status,
        ERRORS.PERSON_NOT_FOUND.type
      );
    }

    await this.db.Delete('Persons', personId);

    // Emit person.deleted event (routed to platform via EventService)
    if (this.eventService) {
      await this.eventService.Emit('person.deleted', person.account, person);
    }

    return {
      id: personId,
      object: 'person',
      deleted: true,
    };
  }

  /**
   * Checks if a person belongs to a specific account.
   *
   * @param personId - The ID of the person
   * @param accountId - The account ID to check ownership against
   * @returns True if the person belongs to the account
   */
  async IsOwnerOfPerson(personId: string, accountId: string): Promise<boolean> {
    const person = await this.db.Get<PersonType>('Persons', personId);
    if (!person) {
      return false;
    }
    return person.account === accountId;
  }

  /**
   * Gets all persons for an account.
   * Used internally for account cleanup and similar operations.
   *
   * @param accountId - The account ID to get persons for
   * @returns Array of persons
   */
  async GetPersonsByAccount(accountId: string): Promise<PersonType[]> {
    return this.db.Find<PersonType>('Persons', 'account', accountId);
  }
}
