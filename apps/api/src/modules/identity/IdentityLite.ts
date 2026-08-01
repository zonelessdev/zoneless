/**
 * @fileOverview Open-source lite identity checks for connected accounts.
 *
 * Stripe-shaped behavior:
 * - Hard-invalid fields → requirements.currently_due (soft-block payouts until fixed)
 * - Soft signals → requirements.errors + pending_verification (operator flag only;
 *   onboarding and payouts are not blocked; platform may dismiss or reject later)
 *
 * Soft signals include: disposable/role email, VOIP phone, country mismatches
 * (phone↔address, account↔address, IP↔address), and platform-scoped duplicates
 * of email / phone / wallet / signup IP.
 *
 * Document IDV (`individual.verification.document`) is driven by platform
 * identity threshold rules and IdentityVerificationSession outcomes. Person
 * `verification.status = verified` is set by the VerificationSession webhook
 * path, not by these lite checks. Crossing the threshold soft-disables
 * payouts; clearing the document requirement (verified) restores them when
 * no hard form dues remain and a payout wallet exists.
 *
 * @module IdentityLite
 */

import { Database } from '../Database';
import { AccountModule } from '../Account';
import { PersonModule } from '../Person';
import { ExternalWalletModule } from '../ExternalWallet';
import { EventService } from '../EventService';
import { Logger } from '../../utils/Logger';
import { AppError } from '../../utils/AppError';
import { ERRORS } from '../../utils/Errors';
import { HeaderIpGeoProvider, IpGeoProvider } from './IpGeo';
import { GetPlatformAccountId } from '../PlatformAccess';
import {
  Account as AccountType,
  AccountRequirementError,
  ExternalWallet as ExternalWalletType,
  Person as PersonType,
  PersonRequirementError,
  PersonRequirements,
} from '@zoneless/shared-types';
import {
  CheckCountryCode,
  CheckDob,
  CheckPersonName,
  CheckPhoneNumber,
  CheckPostalCode,
  CountriesCompatible,
  IDENTITY_ERROR_CODES,
  IDENTITY_LITE_REVIEW_DISMISSED,
  IDENTITY_LITE_REVIEW_METADATA_KEY,
  IDENTITY_REQUIREMENT_FIELDS,
  IDENTITY_REVIEW_ERROR_CODES,
  IDENTITY_UNDER_REVIEW,
  IsDisposableEmail,
  IsIdentityBlockingPayouts,
  IsRejectedAccountReason,
  IsRoleEmail,
  GetFormBlockingIdentityRequirements,
  NormalizeIpAddress,
} from '@zoneless/shared-schemas';
import { GetLifetimePaidPayoutVolumeCents } from './IdentityPayoutVolume';

export interface IdentityLiteEvaluation {
  currentlyDue: string[];
  pendingVerification: string[];
  eventuallyDue: string[];
  errors: AccountRequirementError[];
  normalizedPhone: string | null;
  /** True when hard-invalid currently_due would block payouts */
  blocking: boolean;
}

export interface EvaluateOptions {
  /** Skip recording soft review signals (operator already dismissed this review) */
  skipReview?: boolean;
  /** Clear operator dismiss so review signals can be recorded again */
  clearReviewDismiss?: boolean;
  /** Optional signup IP for duplicate / geo checks */
  ip?: string | null;
  /** Optional wallet address for duplicate checks */
  walletAddress?: string | null;
  headers?: Record<string, string | string[] | undefined>;
}

export class IdentityLiteModule {
  private readonly db: Database;
  private readonly accountModule: AccountModule;
  private readonly personModule: PersonModule;
  private readonly externalWalletModule: ExternalWalletModule;
  private readonly ipGeo: IpGeoProvider;

  constructor(
    db: Database,
    eventService?: EventService | null,
    ipGeo?: IpGeoProvider
  ) {
    this.db = db;
    this.accountModule = new AccountModule(db, eventService ?? undefined);
    this.personModule = new PersonModule(db, eventService ?? undefined);
    this.externalWalletModule = new ExternalWalletModule(db);
    this.ipGeo = ipGeo ?? new HeaderIpGeoProvider();
  }

  /**
   * Evaluate person fields and apply requirements to Account + Person.
   * Normalizes phone to E.164 when valid.
   */
  async EvaluateAndApply(
    accountId: string,
    person?: PersonType | null,
    options: EvaluateOptions = {}
  ): Promise<IdentityLiteEvaluation> {
    let account = await this.accountModule.GetAccount(accountId);
    if (!account) {
      throw new AppError(
        ERRORS.ACCOUNT_NOT_FOUND.message,
        ERRORS.ACCOUNT_NOT_FOUND.status,
        ERRORS.ACCOUNT_NOT_FOUND.type
      );
    }

    if (options.clearReviewDismiss) {
      account = await this.ClearReviewDismissMetadata(account);
    }

    const resolvedPerson =
      person ?? (await this.personModule.GetPersonsByAccount(accountId))[0];

    if (!resolvedPerson) {
      return {
        currentlyDue: [],
        pendingVerification: [],
        eventuallyDue: [],
        errors: [],
        normalizedPhone: null,
        blocking: IsIdentityBlockingPayouts(account.requirements),
      };
    }

    const skipReview =
      options.skipReview === true || this.IsReviewDismissed(account);

    const evaluation = this.EvaluatePerson(resolvedPerson, account, skipReview);

    if (!skipReview) {
      await this.AppendDuplicateSignals(evaluation, account, resolvedPerson, {
        ip: options.ip,
        walletAddress: options.walletAddress,
      });

      if (options.ip || options.headers) {
        await this.AppendIpCountrySignal(
          evaluation,
          resolvedPerson,
          options.ip,
          options.headers
        );
      }
    }

    this.FinalizePendingVerification(evaluation);
    await this.AppendIdentityVerificationRequirements(
      evaluation,
      account,
      resolvedPerson
    );
    await this.ApplyEvaluation(account, resolvedPerson, evaluation);

    Logger.info('Identity lite evaluation applied', {
      accountId,
      currentlyDue: evaluation.currentlyDue,
      pendingVerification: evaluation.pendingVerification,
    });

    return evaluation;
  }

  /**
   * Platform operator dismisses lite identity review signals.
   */
  async ApproveIdentity(accountId: string): Promise<AccountType> {
    const account = await this.accountModule.GetAccount(accountId);
    if (!account) {
      throw new AppError(
        ERRORS.ACCOUNT_NOT_FOUND.message,
        ERRORS.ACCOUNT_NOT_FOUND.status,
        ERRORS.ACCOUNT_NOT_FOUND.type
      );
    }

    if (IsRejectedAccountReason(account.requirements?.disabled_reason)) {
      throw new AppError(
        'Cannot approve identity for a rejected account',
        400,
        'invalid_request_error'
      );
    }

    if (account.requirements?.disabled_reason === IDENTITY_UNDER_REVIEW) {
      await this.accountModule.UpdateRequirements(accountId, {
        disabled_reason: null,
      });
    }

    await this.accountModule.UpdateAccount(accountId, {
      metadata: {
        ...account.metadata,
        [IDENTITY_LITE_REVIEW_METADATA_KEY]: IDENTITY_LITE_REVIEW_DISMISSED,
      },
    });

    await this.EvaluateAndApply(accountId, null, { skipReview: true });

    const updated = await this.accountModule.GetAccount(accountId);
    if (!updated) {
      throw new AppError(
        ERRORS.ACCOUNT_NOT_FOUND.message,
        ERRORS.ACCOUNT_NOT_FOUND.status,
        ERRORS.ACCOUNT_NOT_FOUND.type
      );
    }

    return updated;
  }

  /**
   * Assert the account may attach a wallet / enable payouts.
   * Hosted document IDV does not block wallet attach — payouts are
   * soft-paused separately when that requirement is currently_due.
   */
  AssertCanEnablePayouts(account: AccountType): void {
    if (!IsIdentityBlockingPayouts(account.requirements)) {
      return;
    }

    const due = GetFormBlockingIdentityRequirements(
      account.requirements?.currently_due
    );
    const reason = account.requirements?.disabled_reason;
    let message =
      'This account has outstanding identity requirements and cannot enable payouts yet.';

    if (reason?.startsWith('rejected.')) {
      message = 'This account has been rejected and cannot enable payouts.';
    } else if (due.length > 0) {
      message = `Outstanding identity requirements: ${due.join(', ')}`;
    }

    throw new AppError(message, 400, 'invalid_request_error');
  }

  private EvaluatePerson(
    person: PersonType,
    account: AccountType,
    skipReview = false
  ): IdentityLiteEvaluation {
    const currentlyDue: string[] = [];
    const hardErrors: AccountRequirementError[] = [];
    const reviewErrors: AccountRequirementError[] = [];
    let normalizedPhone: string | null = null;

    const PushHard = (
      requirement: string,
      code: string,
      reason: string
    ): void => {
      currentlyDue.push(requirement);
      hardErrors.push({ code, reason, requirement });
    };

    const PushReview = (
      requirement: string,
      code: string,
      reason: string
    ): void => {
      if (skipReview) return;
      reviewErrors.push({ code, reason, requirement });
    };

    const firstNameCheck = CheckPersonName(person.first_name);
    if (!firstNameCheck.valid) {
      PushHard(
        IDENTITY_REQUIREMENT_FIELDS.firstName,
        IDENTITY_ERROR_CODES.invalidValue,
        firstNameCheck.reason ?? 'Invalid first name'
      );
    }

    const lastNameCheck = CheckPersonName(person.last_name);
    if (!lastNameCheck.valid) {
      PushHard(
        IDENTITY_REQUIREMENT_FIELDS.lastName,
        IDENTITY_ERROR_CODES.invalidValue,
        lastNameCheck.reason ?? 'Invalid last name'
      );
    }

    const dobCheck = CheckDob(person.dob);
    if (!dobCheck.valid) {
      PushHard(
        IDENTITY_REQUIREMENT_FIELDS.dob,
        IDENTITY_ERROR_CODES.invalidDobAge,
        dobCheck.reason ?? 'Invalid date of birth'
      );
    }

    const address = person.address;
    const countryCheck = CheckCountryCode(address?.country);
    if (!countryCheck.valid) {
      PushHard(
        IDENTITY_REQUIREMENT_FIELDS.addressCountry,
        IDENTITY_ERROR_CODES.invalidAddress,
        countryCheck.reason ?? 'Invalid country'
      );
    }

    if (!address?.line1?.trim()) {
      PushHard(
        IDENTITY_REQUIREMENT_FIELDS.addressLine1,
        IDENTITY_ERROR_CODES.invalidAddress,
        'Address line 1 is required'
      );
    }

    if (!address?.city?.trim()) {
      PushHard(
        IDENTITY_REQUIREMENT_FIELDS.addressCity,
        IDENTITY_ERROR_CODES.invalidAddress,
        'City is required'
      );
    }

    const postalCheck = CheckPostalCode(address?.postal_code, address?.country);
    if (!postalCheck.valid) {
      PushHard(
        IDENTITY_REQUIREMENT_FIELDS.addressPostalCode,
        IDENTITY_ERROR_CODES.invalidAddress,
        postalCheck.reason ?? 'Invalid postal code'
      );
    }

    const addressCountry = address?.country?.toUpperCase() ?? null;
    const accountCountry = account.country?.toUpperCase() || null;

    const phoneCheck = CheckPhoneNumber(
      person.phone,
      address?.country ?? account.country
    );
    if (!phoneCheck.valid) {
      PushHard(
        IDENTITY_REQUIREMENT_FIELDS.phone,
        IDENTITY_ERROR_CODES.invalidPhone,
        phoneCheck.reason ?? 'Invalid phone number'
      );
    } else {
      normalizedPhone = phoneCheck.e164;
      if (phoneCheck.isVoip) {
        PushReview(
          IDENTITY_REQUIREMENT_FIELDS.phone,
          IDENTITY_ERROR_CODES.voipPhone,
          'Phone number appears to be a VOIP / virtual number'
        );
      }

      if (
        phoneCheck.country &&
        addressCountry &&
        !CountriesCompatible(phoneCheck.country, addressCountry)
      ) {
        PushReview(
          IDENTITY_REQUIREMENT_FIELDS.phone,
          IDENTITY_ERROR_CODES.phoneCountryMismatch,
          `Phone country (${phoneCheck.country}) does not match address country (${addressCountry})`
        );
      }
    }

    if (
      accountCountry &&
      addressCountry &&
      !CountriesCompatible(accountCountry, addressCountry)
    ) {
      PushReview(
        IDENTITY_REQUIREMENT_FIELDS.addressCountry,
        IDENTITY_ERROR_CODES.accountCountryMismatch,
        `Account country (${accountCountry}) does not match address country (${addressCountry})`
      );
    }

    if (IsDisposableEmail(person.email)) {
      PushReview(
        IDENTITY_REQUIREMENT_FIELDS.email,
        IDENTITY_ERROR_CODES.disposableEmail,
        'Email appears to use a disposable / throwaway domain'
      );
    } else if (IsRoleEmail(person.email)) {
      PushReview(
        IDENTITY_REQUIREMENT_FIELDS.email,
        IDENTITY_ERROR_CODES.roleEmail,
        'Email looks like a role inbox rather than a personal address'
      );
    }

    return {
      currentlyDue: [...new Set(currentlyDue)],
      pendingVerification: [],
      eventuallyDue: [],
      errors: [...hardErrors, ...reviewErrors],
      normalizedPhone,
      blocking: currentlyDue.length > 0,
    };
  }

  private FinalizePendingVerification(
    evaluation: IdentityLiteEvaluation
  ): void {
    evaluation.pendingVerification = [
      ...new Set(
        evaluation.errors
          .filter((e) => IDENTITY_REVIEW_ERROR_CODES.has(e.code))
          .map((e) => e.requirement)
      ),
    ];
    evaluation.blocking = evaluation.currentlyDue.length > 0;
  }

  /**
   * Promote / foreshadow `individual.verification.document` based on the
   * platform's payout-volume threshold and the person's verification status.
   */
  private async AppendIdentityVerificationRequirements(
    evaluation: IdentityLiteEvaluation,
    account: AccountType,
    person: PersonType
  ): Promise<void> {
    const platformId = GetPlatformAccountId(account);
    const platform =
      platformId === account.id
        ? account
        : await this.accountModule.GetAccount(platformId);

    const threshold =
      platform?.settings?.identity?.rules?.payout_volume_threshold_cents ??
      null;

    if (threshold === null || threshold === undefined) {
      return;
    }

    const docField = IDENTITY_REQUIREMENT_FIELDS.verificationDocument;
    const verificationStatus = person.verification?.status ?? 'unverified';

    if (verificationStatus === 'verified') {
      evaluation.currentlyDue = evaluation.currentlyDue.filter(
        (f) => f !== docField
      );
      evaluation.eventuallyDue = evaluation.eventuallyDue.filter(
        (f) => f !== docField
      );
      evaluation.pendingVerification = evaluation.pendingVerification.filter(
        (f) => f !== docField
      );
      evaluation.errors = evaluation.errors.filter(
        (e) => e.requirement !== docField
      );
      evaluation.blocking = evaluation.currentlyDue.length > 0;
      return;
    }

    const volume = await GetLifetimePaidPayoutVolumeCents(this.db, account.id);
    const overThreshold = volume >= threshold;

    if (overThreshold) {
      if (!evaluation.currentlyDue.includes(docField)) {
        evaluation.currentlyDue.push(docField);
      }
      evaluation.eventuallyDue = evaluation.eventuallyDue.filter(
        (f) => f !== docField
      );

      if (verificationStatus === 'pending') {
        if (!evaluation.pendingVerification.includes(docField)) {
          evaluation.pendingVerification.push(docField);
        }
      }

      if (
        person.verification?.details_code ===
        IDENTITY_ERROR_CODES.verificationFailed
      ) {
        const hasError = evaluation.errors.some(
          (e) => e.requirement === docField
        );
        if (!hasError) {
          evaluation.errors.push({
            code: IDENTITY_ERROR_CODES.verificationFailed,
            reason:
              person.verification?.details ??
              'Identity verification was declined',
            requirement: docField,
          });
        }
      }

      evaluation.blocking = true;
    } else {
      evaluation.currentlyDue = evaluation.currentlyDue.filter(
        (f) => f !== docField
      );
      if (!evaluation.eventuallyDue.includes(docField)) {
        evaluation.eventuallyDue.push(docField);
      }
      evaluation.blocking = evaluation.currentlyDue.length > 0;
    }
  }

  private PushReviewError(
    evaluation: IdentityLiteEvaluation,
    requirement: string,
    code: string,
    reason: string
  ): void {
    evaluation.errors.push({ code, reason, requirement });
  }

  private async AppendIpCountrySignal(
    evaluation: IdentityLiteEvaluation,
    person: PersonType,
    ip?: string | null,
    headers?: Record<string, string | string[] | undefined>
  ): Promise<void> {
    const ipCountry = await this.ipGeo.LookupCountry(ip, headers);
    const addressCountry = person.address?.country?.toUpperCase() ?? null;

    if (
      ipCountry &&
      addressCountry &&
      !CountriesCompatible(ipCountry, addressCountry)
    ) {
      this.PushReviewError(
        evaluation,
        IDENTITY_REQUIREMENT_FIELDS.addressCountry,
        IDENTITY_ERROR_CODES.ipCountryMismatch,
        `Signup IP country (${ipCountry}) does not match address country (${addressCountry})`
      );
    }
  }

  /**
   * Platform-scoped duplicate checks for email, phone, wallet, and signup IP.
   */
  private async AppendDuplicateSignals(
    evaluation: IdentityLiteEvaluation,
    account: AccountType,
    person: PersonType,
    context: { ip?: string | null; walletAddress?: string | null }
  ): Promise<void> {
    const platformId = GetPlatformAccountId(account);
    const phone = evaluation.normalizedPhone ?? person.phone ?? null;
    const email = person.email?.trim() ?? null;

    if (email) {
      const dupes = await this.CountDuplicatePersons({
        platformId,
        excludeAccountId: account.id,
        field: 'email',
        values: this.EmailLookupValues(email),
      });
      if (dupes > 0) {
        this.PushReviewError(
          evaluation,
          IDENTITY_REQUIREMENT_FIELDS.email,
          IDENTITY_ERROR_CODES.duplicateEmail,
          `Email is already used by ${dupes} other connected account${
            dupes === 1 ? '' : 's'
          } on this platform`
        );
      }
    }

    if (phone) {
      const dupes = await this.CountDuplicatePersons({
        platformId,
        excludeAccountId: account.id,
        field: 'phone',
        values: [phone],
      });
      if (dupes > 0) {
        this.PushReviewError(
          evaluation,
          IDENTITY_REQUIREMENT_FIELDS.phone,
          IDENTITY_ERROR_CODES.duplicatePhone,
          `Phone number is already used by ${dupes} other connected account${
            dupes === 1 ? '' : 's'
          } on this platform`
        );
      }
    }

    if (context.walletAddress?.trim()) {
      const dupes = await this.CountDuplicateWallets(
        platformId,
        account.id,
        context.walletAddress.trim()
      );
      if (dupes > 0) {
        this.PushReviewError(
          evaluation,
          IDENTITY_REQUIREMENT_FIELDS.externalAccount,
          IDENTITY_ERROR_CODES.duplicateWallet,
          `Wallet address is already used by ${dupes} other connected account${
            dupes === 1 ? '' : 's'
          } on this platform`
        );
      }
    }

    const normalizedIp = NormalizeIpAddress(context.ip);
    if (normalizedIp && !this.IsPrivateIp(normalizedIp)) {
      const dupes = await this.CountDuplicateSignupIps(
        platformId,
        account.id,
        normalizedIp
      );
      if (dupes > 0) {
        this.PushReviewError(
          evaluation,
          IDENTITY_REQUIREMENT_FIELDS.tosAcceptanceIp,
          IDENTITY_ERROR_CODES.duplicateIp,
          `Signup IP is already used by ${dupes} other connected account${
            dupes === 1 ? '' : 's'
          } on this platform`
        );
      }
    }
  }

  private EmailLookupValues(email: string): string[] {
    const trimmed = email.trim();
    const lower = trimmed.toLowerCase();
    return trimmed === lower ? [trimmed] : [trimmed, lower];
  }

  private async CountDuplicatePersons(input: {
    platformId: string;
    excludeAccountId: string;
    field: 'email' | 'phone';
    values: string[];
  }): Promise<number> {
    const accountIds = new Set<string>();

    for (const value of input.values) {
      const matches = await this.db.Find2Custom<PersonType>(
        'Persons',
        input.field,
        '==',
        value,
        'platform_account',
        '==',
        input.platformId
      );

      for (const match of matches) {
        if (match.account !== input.excludeAccountId) {
          accountIds.add(match.account);
        }
      }
    }

    return accountIds.size;
  }

  private async CountDuplicateWallets(
    platformId: string,
    excludeAccountId: string,
    walletAddress: string
  ): Promise<number> {
    const matches = await this.db.Find2Custom<ExternalWalletType>(
      'ExternalWallets',
      'wallet_address',
      '==',
      walletAddress,
      'platform_account',
      '==',
      platformId
    );

    const accountIds = new Set(
      matches
        .filter(
          (w) => w.account !== excludeAccountId && w.status !== 'archived'
        )
        .map((w) => w.account)
    );
    return accountIds.size;
  }

  private async CountDuplicateSignupIps(
    platformId: string,
    excludeAccountId: string,
    ip: string
  ): Promise<number> {
    const matches = await this.db.Find2Custom<AccountType>(
      'Accounts',
      'tos_acceptance.ip',
      '==',
      ip,
      'platform_account',
      '==',
      platformId
    );

    const accountIds = new Set(
      matches.filter((match) => match.id !== excludeAccountId).map((m) => m.id)
    );
    return accountIds.size;
  }

  private IsPrivateIp(ip: string): boolean {
    return (
      ip === '127.0.0.1' ||
      ip.startsWith('10.') ||
      ip.startsWith('192.168.') ||
      /^172\.(1[6-9]|2\d|3[0-1])\./.test(ip)
    );
  }

  private IsReviewDismissed(account: AccountType): boolean {
    return (
      account.metadata?.[IDENTITY_LITE_REVIEW_METADATA_KEY] ===
      IDENTITY_LITE_REVIEW_DISMISSED
    );
  }

  private async ClearReviewDismissMetadata(
    account: AccountType
  ): Promise<AccountType> {
    if (!this.IsReviewDismissed(account)) {
      return account;
    }

    const metadata = { ...account.metadata };
    delete metadata[IDENTITY_LITE_REVIEW_METADATA_KEY];

    return this.accountModule.UpdateAccount(account.id, { metadata });
  }

  /**
   * Re-enable payouts after identity document verification clears, when the
   * account is otherwise eligible (not rejected, no hard form dues, has a
   * payout wallet). Soft review signals do not prevent restore.
   */
  async RestorePayoutsIfEligible(
    accountId: string
  ): Promise<AccountType | null> {
    const account = await this.accountModule.GetAccount(accountId);
    if (!account || account.payouts_enabled) {
      return account;
    }

    if (IsRejectedAccountReason(account.requirements?.disabled_reason)) {
      return account;
    }

    if (IsIdentityBlockingPayouts(account.requirements)) {
      return account;
    }

    const wallet = await this.externalWalletModule.GetDefaultWallet(accountId);
    if (!wallet) {
      return account;
    }

    const updated = await this.accountModule.PayoutsEnabled(accountId);
    Logger.info('Restored payouts after identity requirements cleared', {
      accountId,
    });
    return updated;
  }

  private async ApplyEvaluation(
    account: AccountType,
    person: PersonType,
    evaluation: IdentityLiteEvaluation
  ): Promise<void> {
    const existingReason = account.requirements?.disabled_reason ?? null;
    const disabledReason = IsRejectedAccountReason(existingReason)
      ? existingReason
      : existingReason === IDENTITY_UNDER_REVIEW
      ? null
      : existingReason;

    const accountErrors = evaluation.errors.filter(
      (e) =>
        evaluation.currentlyDue.includes(e.requirement) ||
        IDENTITY_REVIEW_ERROR_CODES.has(e.code)
    );

    await this.accountModule.UpdateRequirements(account.id, {
      currently_due: evaluation.currentlyDue,
      eventually_due: evaluation.eventuallyDue,
      pending_verification: evaluation.pendingVerification,
      errors: accountErrors,
      disabled_reason: disabledReason,
    });

    const personRequirements: PersonRequirements = {
      alternatives: person.requirements?.alternatives ?? [],
      currently_due: evaluation.currentlyDue,
      errors: accountErrors as PersonRequirementError[],
      eventually_due: evaluation.eventuallyDue,
      past_due: person.requirements?.past_due ?? [],
      pending_verification: evaluation.pendingVerification,
    };

    const personUpdate: Partial<PersonType> = {
      requirements: personRequirements,
    };

    if (evaluation.normalizedPhone) {
      personUpdate.phone = evaluation.normalizedPhone;
    }

    if (evaluation.blocking && account.payouts_enabled) {
      await this.accountModule.PayoutsDisabled(account.id);
    }

    await this.personModule.UpdatePersonInternal(person.id, personUpdate);
  }
}
