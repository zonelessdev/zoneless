/**
 * @fileOverview Identity VerificationSession CRUD and provider webhook handling.
 *
 * Stripe-shaped VerificationSessions backed by a pluggable provider (Didit).
 * The session `url` is the provider-hosted verification link.
 *
 * @see https://docs.stripe.com/api/identity/verification_sessions
 *
 * @module IdentityVerificationSession
 */

import { Database } from './Database';
import { EventService } from './EventService';
import { AccountModule } from './Account';
import { PersonModule } from './Person';
import { IdentityLiteModule } from './identity/IdentityLite';
import { GetAppConfig } from './AppConfig';
import { ResolveIdentityProvider } from './identity/ResolveIdentityProvider';
import { DecryptIdentitySecret } from './identity/IdentitySettingsCrypto';
import { GenerateId } from '../utils/IdGenerator';
import { Now } from '../utils/Timestamp';
import { AppError } from '../utils/AppError';
import { ERRORS } from '../utils/Errors';
import { Logger } from '../utils/Logger';
import { ValidateUpdate } from './Util';
import { ListHelper, ListOptions, ListResult } from '../utils/ListHelper';
import {
  Account as AccountType,
  EventType,
  IdentityVerificationSession as IdentityVerificationSessionType,
  IdentityVerificationSessionStatus,
  Person as PersonType,
} from '@zoneless/shared-types';
import {
  CreateIdentityVerificationSessionInput,
  CreateIdentityVerificationSessionSchema,
  IDENTITY_ERROR_CODES,
  UpdateIdentityVerificationSessionInput,
  UpdateIdentityVerificationSessionSchema,
} from '@zoneless/shared-schemas';
import { ProviderWebhookHeaders } from './identity/IdentityVerificationProvider';
import { diditProvider } from './identity/DiditProvider';

export class IdentityVerificationSessionModule {
  private readonly db: Database;
  private readonly eventService: EventService | null;
  private readonly accountModule: AccountModule;
  private readonly personModule: PersonModule;
  private readonly identityLiteModule: IdentityLiteModule;
  private readonly listHelper: ListHelper<IdentityVerificationSessionType>;

  constructor(db: Database, eventService?: EventService) {
    this.db = db;
    this.eventService = eventService || null;
    this.accountModule = new AccountModule(db, eventService);
    this.personModule = new PersonModule(db, eventService);
    this.identityLiteModule = new IdentityLiteModule(db, eventService);
    this.listHelper = new ListHelper<IdentityVerificationSessionType>(db, {
      collection: 'VerificationSessions',
      orderByField: 'created',
      orderDirection: 'desc',
      urlPath: '/v1/identity/verification_sessions',
      accountField: 'platform_account',
    });
  }

  async Create(
    platformAccountId: string,
    input: CreateIdentityVerificationSessionInput
  ): Promise<IdentityVerificationSessionType> {
    const validated = ValidateUpdate(
      CreateIdentityVerificationSessionSchema,
      input
    );

    const relatedAccount = await this.RequirePlatformOwnedAccount(
      validated.related_account,
      platformAccountId
    );

    const platformAccount = await this.accountModule.GetAccount(
      platformAccountId
    );
    if (!platformAccount) {
      throw new AppError(
        ERRORS.ACCOUNT_NOT_FOUND.message,
        ERRORS.ACCOUNT_NOT_FOUND.status,
        ERRORS.ACCOUNT_NOT_FOUND.type
      );
    }

    const person = await this.ResolvePerson(
      relatedAccount,
      validated.related_person
    );

    const resolved = ResolveIdentityProvider(platformAccount);
    const sessionId = GenerateId('vs_z');

    const providerSession = await resolved.provider.CreateSession(
      resolved.apiKey,
      {
        workflowId: resolved.workflowId,
        vendorData: sessionId,
        callbackUrl: validated.return_url,
        email: validated.provided_details?.email,
        phone: validated.provided_details?.phone,
        metadata: validated.metadata,
      }
    );

    const session: IdentityVerificationSessionType = {
      id: sessionId,
      object: 'identity.verification_session',
      client_secret: providerSession.sessionToken ?? null,
      created: Now(),
      last_error: null,
      last_verification_report: null,
      livemode: GetAppConfig().livemode,
      metadata: validated.metadata ?? {},
      options: validated.options ?? null,
      provided_details: validated.provided_details ?? null,
      redaction: null,
      status: resolved.provider.MapStatus(providerSession.status),
      type: validated.type ?? resolved.provider.DefaultSessionType(),
      url: providerSession.url,
      related_account: relatedAccount.id,
      related_person: person.id,
      platform_account: platformAccountId,
      provider: 'didit',
      provider_session_id: providerSession.providerSessionId,
    };

    await this.db.Set('VerificationSessions', session.id, session);

    await this.personModule.UpdatePersonInternal(person.id, {
      verification: {
        ...person.verification,
        status: 'pending',
        details: null,
        details_code: null,
        document: person.verification?.document ?? {
          back: null,
          details: null,
          details_code: null,
          front: null,
        },
        additional_document: person.verification?.additional_document ?? null,
      },
    });

    // Re-evaluate so document stays currently_due / pending_verification while blocking
    await this.identityLiteModule.EvaluateAndApply(relatedAccount.id);

    if (this.eventService) {
      await this.eventService.Emit(
        'identity.verification_session.created',
        relatedAccount.id,
        session
      );
    }

    return session;
  }

  async Get(
    sessionId: string
  ): Promise<IdentityVerificationSessionType | null> {
    return this.db.Get<IdentityVerificationSessionType>(
      'VerificationSessions',
      sessionId
    );
  }

  async GetByProviderSessionId(
    providerSessionId: string
  ): Promise<IdentityVerificationSessionType | null> {
    const results = await this.db.FindCustom<IdentityVerificationSessionType>(
      'VerificationSessions',
      'provider_session_id',
      '==',
      providerSessionId
    );
    return results[0] ?? null;
  }

  async RequireSession(
    sessionId: string,
    platformAccountId: string
  ): Promise<IdentityVerificationSessionType> {
    const session = await this.Get(sessionId);
    if (!session || session.platform_account !== platformAccountId) {
      throw new AppError(
        ERRORS.VERIFICATION_SESSION_NOT_FOUND.message,
        ERRORS.VERIFICATION_SESSION_NOT_FOUND.status,
        ERRORS.VERIFICATION_SESSION_NOT_FOUND.type
      );
    }
    return session;
  }

  async List(
    options: ListOptions & {
      relatedAccount?: string;
      status?: IdentityVerificationSessionStatus;
    }
  ): Promise<ListResult<IdentityVerificationSessionType>> {
    const filters: Record<string, unknown> = {
      ...(options.filters || {}),
    };

    if (options.relatedAccount) {
      filters.related_account = options.relatedAccount;
    }
    if (options.status) {
      filters.status = options.status;
    }

    return this.listHelper.List({
      ...options,
      filters,
    });
  }

  async Update(
    sessionId: string,
    platformAccountId: string,
    input: UpdateIdentityVerificationSessionInput
  ): Promise<IdentityVerificationSessionType> {
    const session = await this.RequireSession(sessionId, platformAccountId);
    if (session.status !== 'requires_input') {
      throw new AppError(
        'Only sessions in requires_input status can be updated',
        400,
        'invalid_request_error'
      );
    }

    const validated = ValidateUpdate(
      UpdateIdentityVerificationSessionSchema,
      input
    );

    const update: Partial<IdentityVerificationSessionType> = {};
    if (validated.metadata !== undefined) {
      update.metadata = { ...session.metadata, ...validated.metadata };
    }
    if (validated.provided_details !== undefined) {
      update.provided_details = {
        ...session.provided_details,
        ...validated.provided_details,
      };
    }
    if (validated.options !== undefined) {
      update.options = {
        ...session.options,
        ...validated.options,
      };
    }

    await this.db.Update('VerificationSessions', sessionId, update);
    const updated = await this.Get(sessionId);
    if (!updated) {
      throw new AppError(
        ERRORS.VERIFICATION_SESSION_NOT_FOUND.message,
        ERRORS.VERIFICATION_SESSION_NOT_FOUND.status,
        ERRORS.VERIFICATION_SESSION_NOT_FOUND.type
      );
    }
    return updated;
  }

  async Cancel(
    sessionId: string,
    platformAccountId: string
  ): Promise<IdentityVerificationSessionType> {
    const session = await this.RequireSession(sessionId, platformAccountId);
    if (session.status === 'canceled' || session.status === 'verified') {
      throw new AppError(
        `Cannot cancel a session with status ${session.status}`,
        400,
        'invalid_request_error'
      );
    }

    await this.db.Update('VerificationSessions', sessionId, {
      status: 'canceled' as const,
      url: null,
      client_secret: null,
    });

    const updated = await this.Get(sessionId);
    if (!updated) {
      throw new AppError(
        ERRORS.VERIFICATION_SESSION_NOT_FOUND.message,
        ERRORS.VERIFICATION_SESSION_NOT_FOUND.status,
        ERRORS.VERIFICATION_SESSION_NOT_FOUND.type
      );
    }

    await this.personModule.UpdatePersonInternal(session.related_person, {
      verification: {
        additional_document: null,
        details: 'Verification canceled',
        details_code: 'canceled',
        document: {
          back: null,
          details: null,
          details_code: null,
          front: null,
        },
        status: 'unverified',
      },
    });

    await this.identityLiteModule.EvaluateAndApply(session.related_account);

    if (this.eventService) {
      await this.eventService.Emit(
        'identity.verification_session.canceled',
        session.related_account,
        updated
      );
    }

    return updated;
  }

  async Redact(
    sessionId: string,
    platformAccountId: string
  ): Promise<IdentityVerificationSessionType> {
    const session = await this.RequireSession(sessionId, platformAccountId);

    await this.db.Update('VerificationSessions', sessionId, {
      redaction: { status: 'redacted' as const },
      url: null,
      client_secret: null,
      provided_details: null,
      metadata: {},
    });

    const updated = await this.Get(sessionId);
    if (!updated) {
      throw new AppError(
        ERRORS.VERIFICATION_SESSION_NOT_FOUND.message,
        ERRORS.VERIFICATION_SESSION_NOT_FOUND.status,
        ERRORS.VERIFICATION_SESSION_NOT_FOUND.type
      );
    }

    if (this.eventService) {
      await this.eventService.Emit(
        'identity.verification_session.redacted',
        session.related_account,
        updated
      );
    }

    return updated;
  }

  /**
   * Handle an inbound Didit webhook after the route has parsed the JSON body.
   * Looks up the session by provider_session_id, verifies the signature using
   * the platform's BYO webhook secret, then applies the outcome.
   */
  async HandleDiditWebhook(
    body: Record<string, unknown>,
    headers: ProviderWebhookHeaders
  ): Promise<void> {
    const providerSessionId =
      typeof body.session_id === 'string' ? body.session_id : null;
    if (!providerSessionId) {
      throw new AppError(
        'Missing session_id in Didit webhook',
        400,
        'invalid_request_error'
      );
    }

    const session = await this.GetByProviderSessionId(providerSessionId);
    if (!session) {
      Logger.warn('Didit webhook for unknown session', { providerSessionId });
      // Return quietly so Didit does not retry forever for orphaned sessions
      return;
    }

    const platformAccount = await this.accountModule.GetAccount(
      session.platform_account
    );
    if (!platformAccount) {
      Logger.warn('Didit webhook platform account missing', {
        platformAccountId: session.platform_account,
      });
      return;
    }

    const webhookSecret = DecryptIdentitySecret(
      platformAccount.settings?.identity?.didit?.webhook_secret
    );
    if (!webhookSecret) {
      throw new AppError(
        'Didit webhook secret is not configured on the platform account',
        400,
        'invalid_request_error'
      );
    }

    if (!diditProvider.VerifyWebhook(webhookSecret, body, headers)) {
      throw new AppError(
        'Invalid Didit webhook signature',
        401,
        'authentication_error'
      );
    }

    const providerStatus =
      typeof body.status === 'string' ? body.status : 'Not Started';
    await this.ApplyProviderStatus(session, providerStatus);
  }

  private async ApplyProviderStatus(
    session: IdentityVerificationSessionType,
    providerStatus: string
  ): Promise<void> {
    if (session.status === 'canceled' || session.redaction) {
      return;
    }

    const mapped = diditProvider.MapStatus(providerStatus);
    const previousStatus = session.status;

    const update: Partial<IdentityVerificationSessionType> = {
      status: mapped,
    };

    if (mapped === 'verified' || mapped === 'canceled') {
      update.url = null;
      update.client_secret = null;
    }

    if (mapped === 'requires_input' && providerStatus.toLowerCase() === 'declined') {
      update.last_error = {
        code: IDENTITY_ERROR_CODES.verificationFailed,
        reason: 'Identity verification was declined',
      };
    }

    await this.db.Update('VerificationSessions', session.id, update);
    const updated = (await this.Get(session.id))!;

    const person = await this.personModule.GetPerson(session.related_person);
    if (person) {
      if (mapped === 'verified') {
        await this.personModule.UpdatePersonInternal(person.id, {
          verification: {
            ...person.verification,
            status: 'verified',
            details: null,
            details_code: null,
            document: person.verification?.document ?? {
              back: null,
              details: null,
              details_code: null,
              front: null,
            },
            additional_document:
              person.verification?.additional_document ?? null,
          },
        });
      } else if (
        mapped === 'requires_input' &&
        providerStatus.toLowerCase() === 'declined'
      ) {
        await this.personModule.UpdatePersonInternal(person.id, {
          verification: {
            ...person.verification,
            status: 'unverified',
            details: 'Identity verification was declined',
            details_code: IDENTITY_ERROR_CODES.verificationFailed,
            document: person.verification?.document ?? {
              back: null,
              details: null,
              details_code: null,
              front: null,
            },
            additional_document:
              person.verification?.additional_document ?? null,
          },
        });
      } else if (mapped === 'processing') {
        await this.personModule.UpdatePersonInternal(person.id, {
          verification: {
            ...person.verification,
            status: 'pending',
            document: person.verification?.document ?? {
              back: null,
              details: null,
              details_code: null,
              front: null,
            },
            additional_document:
              person.verification?.additional_document ?? null,
          },
        });
      }
    }

    await this.identityLiteModule.EvaluateAndApply(session.related_account);

    if (mapped === 'verified') {
      await this.identityLiteModule.RestorePayoutsIfEligible(
        session.related_account
      );
    }

    if (this.eventService && mapped !== previousStatus) {
      const eventType = this.EventTypeForStatus(mapped);
      if (eventType) {
        await this.eventService.Emit(
          eventType,
          session.related_account,
          updated
        );
      }
    }
  }

  private EventTypeForStatus(
    status: IdentityVerificationSessionStatus
  ): EventType | null {
    switch (status) {
      case 'verified':
        return 'identity.verification_session.verified';
      case 'processing':
        return 'identity.verification_session.processing';
      case 'requires_input':
        return 'identity.verification_session.requires_input';
      case 'canceled':
        return 'identity.verification_session.canceled';
      default:
        return null;
    }
  }

  private async RequirePlatformOwnedAccount(
    accountId: string,
    platformAccountId: string
  ): Promise<AccountType> {
    const account = await this.accountModule.GetAccount(accountId);
    if (!account) {
      throw new AppError(
        ERRORS.ACCOUNT_NOT_FOUND.message,
        ERRORS.ACCOUNT_NOT_FOUND.status,
        ERRORS.ACCOUNT_NOT_FOUND.type
      );
    }
    if (account.platform_account !== platformAccountId) {
      throw new AppError(
        ERRORS.NO_SUCH_CONNECTED_ACCOUNT.message,
        ERRORS.NO_SUCH_CONNECTED_ACCOUNT.status,
        ERRORS.NO_SUCH_CONNECTED_ACCOUNT.type
      );
    }
    return account;
  }

  private async ResolvePerson(
    account: AccountType,
    relatedPersonId?: string
  ): Promise<PersonType> {
    if (relatedPersonId) {
      const person = await this.personModule.GetPerson(relatedPersonId);
      if (!person || person.account !== account.id) {
        throw new AppError(
          ERRORS.PERSON_NOT_FOUND.message,
          ERRORS.PERSON_NOT_FOUND.status,
          ERRORS.PERSON_NOT_FOUND.type
        );
      }
      return person;
    }

    const person = await this.personModule.GetPersonByAccount(account.id);
    if (!person) {
      throw new AppError(
        'No person found on this account. Create a person before starting identity verification.',
        400,
        'invalid_request_error'
      );
    }
    return person;
  }
}
