/**
 * Shared identity lite validators used by the API IdentityLite module.
 * Format/sanity checks only — no SMS OTP or document IDV.
 */

import {
  parsePhoneNumberFromString,
  type CountryCode,
} from 'libphonenumber-js';
import { IsRejectedAccountReason } from './AccountSchema';

/** Stripe-shaped requirement field paths for an individual */
export const IDENTITY_REQUIREMENT_FIELDS = {
  firstName: 'individual.first_name',
  lastName: 'individual.last_name',
  email: 'individual.email',
  phone: 'individual.phone',
  dob: 'individual.dob',
  addressLine1: 'individual.address.line1',
  addressCity: 'individual.address.city',
  addressPostalCode: 'individual.address.postal_code',
  addressCountry: 'individual.address.country',
  tosAcceptanceIp: 'tos_acceptance.ip',
  externalAccount: 'external_account',
  /** Document IDV — promoted by platform identity threshold rules */
  verificationDocument: 'individual.verification.document',
} as const;

/** Machine-readable requirement error codes (Stripe-compatible where possible) */
export const IDENTITY_ERROR_CODES = {
  invalidValue: 'invalid_value',
  invalidAddress: 'invalid_address',
  invalidDobAge: 'invalid_dob_age_under_minimum',
  invalidPhone: 'invalid_value',
  /** Document IDV failed or was declined by the provider */
  verificationFailed: 'verification_failed',
  /** Non-blocking review signals — distinct from hard-fail codes */
  disposableEmail: 'identity_lite.disposable_email',
  roleEmail: 'identity_lite.role_email',
  voipPhone: 'identity_lite.voip_phone',
  ipCountryMismatch: 'identity_lite.ip_country_mismatch',
  phoneCountryMismatch: 'identity_lite.phone_country_mismatch',
  accountCountryMismatch: 'identity_lite.account_country_mismatch',
  duplicateEmail: 'identity_lite.duplicate_email',
  duplicatePhone: 'identity_lite.duplicate_phone',
  duplicateWallet: 'identity_lite.duplicate_wallet',
  duplicateIp: 'identity_lite.duplicate_ip',
} as const;

const FAKE_NAME_VALUES = new Set([
  'test',
  'tester',
  'testing',
  'asdf',
  'asdfasdf',
  'qwerty',
  'xxx',
  'xxxx',
  'aaaa',
  'abc',
  'abcd',
  'foo',
  'bar',
  'baz',
  'none',
  'n/a',
  'na',
  'null',
  'undefined',
  'admin',
  'user',
  'seller',
  'buyer',
  'firstname',
  'lastname',
  'fname',
  'lname',
]);

/** Common disposable / throwaway email domains */
const DISPOSABLE_EMAIL_DOMAINS = new Set([
  'mailinator.com',
  'guerrillamail.com',
  'guerrillamail.net',
  'sharklasers.com',
  'tempmail.com',
  'temp-mail.org',
  'throwaway.email',
  'yopmail.com',
  'trashmail.com',
  '10minutemail.com',
  'getnada.com',
  'maildrop.cc',
  'discard.email',
  'mailnesia.com',
]);

/** Role-style local parts that are often not a real person */
const ROLE_EMAIL_LOCAL_PARTS = new Set([
  'admin',
  'administrator',
  'info',
  'support',
  'sales',
  'contact',
  'help',
  'noreply',
  'no-reply',
  'donotreply',
]);

/**
 * Postal code patterns for common countries.
 * Unknown countries use a permissive alphanumeric fallback.
 */
export const POSTAL_CODE_PATTERNS: Record<string, RegExp> = {
  US: /^\d{5}(-\d{4})?$/,
  CA: /^[A-Za-z]\d[A-Za-z][ -]?\d[A-Za-z]\d$/,
  GB: /^[A-Za-z]{1,2}\d[A-Za-z\d]?\s?\d[A-Za-z]{2}$/,
  AU: /^\d{4}$/,
  NZ: /^\d{4}$/,
  DE: /^\d{5}$/,
  FR: /^\d{5}$/,
  NL: /^\d{4}\s?[A-Za-z]{2}$/,
  BE: /^\d{4}$/,
  ES: /^\d{5}$/,
  IT: /^\d{5}$/,
  PT: /^\d{4}-\d{3}$/,
  IE: /^[A-Za-z]\d{2}\s?[A-Za-z\d]{4}$/,
  IN: /^\d{6}$/,
  JP: /^\d{3}-?\d{4}$/,
  SG: /^\d{6}$/,
  BR: /^\d{5}-?\d{3}$/,
  MX: /^\d{5}$/,
  CH: /^\d{4}$/,
  AT: /^\d{4}$/,
  SE: /^\d{3}\s?\d{2}$/,
  NO: /^\d{4}$/,
  DK: /^\d{4}$/,
  FI: /^\d{5}$/,
  PL: /^\d{2}-\d{3}$/,
};

const PERMISSIVE_POSTAL = /^[A-Za-z0-9][A-Za-z0-9\s-]{1,11}$/;

const ISO_COUNTRY_RE = /^[A-Z]{2}$/;

export interface ValidityResult {
  valid: boolean;
  reason?: string;
}

export interface PhoneCheckResult extends ValidityResult {
  e164: string | null;
  /** ISO country inferred from the number (e.g. US), when known */
  country: string | null;
  isVoip: boolean;
}

/**
 * Check whether a person name looks legitimate (not empty / placeholder / digits-only).
 */
export function CheckPersonName(
  name: string | null | undefined
): ValidityResult {
  if (!name || !name.trim()) {
    return { valid: false, reason: 'Name is required' };
  }

  const trimmed = name.trim();
  if (trimmed.length < 2) {
    return { valid: false, reason: 'Name must be at least 2 characters' };
  }

  if (/^\d+$/.test(trimmed)) {
    return { valid: false, reason: 'Name cannot be only numbers' };
  }

  if (/^(.)\1+$/i.test(trimmed)) {
    return { valid: false, reason: 'Name looks invalid' };
  }

  const normalized = trimmed.toLowerCase().replace(/[^a-z]/g, '');
  if (normalized && FAKE_NAME_VALUES.has(normalized)) {
    return { valid: false, reason: 'Please enter a real name' };
  }

  if (!/[a-zA-Z]/.test(trimmed)) {
    return { valid: false, reason: 'Name must contain letters' };
  }

  return { valid: true };
}

/**
 * Parse and validate a phone number, normalizing to E.164 when valid.
 */
export function CheckPhoneNumber(
  phone: string | null | undefined,
  defaultCountry?: string | null
): PhoneCheckResult {
  if (!phone || !phone.trim()) {
    return {
      valid: false,
      e164: null,
      country: null,
      isVoip: false,
      reason: 'Phone number is required',
    };
  }

  const country =
    defaultCountry && ISO_COUNTRY_RE.test(defaultCountry.toUpperCase())
      ? (defaultCountry.toUpperCase() as CountryCode)
      : undefined;

  const parsed = parsePhoneNumberFromString(phone.trim(), country);
  if (!parsed || !parsed.isValid()) {
    return {
      valid: false,
      e164: null,
      country: null,
      isVoip: false,
      reason: 'Phone number is invalid',
    };
  }

  const numberType = parsed.getType();
  const isVoip = numberType === 'VOIP';

  return {
    valid: true,
    e164: parsed.format('E.164'),
    country: parsed.country ? parsed.country.toUpperCase() : null,
    isVoip,
  };
}

/**
 * Validate date of birth is complete and age is between 13 and 120.
 */
export function CheckDob(
  dob:
    | { day: number | null; month: number | null; year: number | null }
    | null
    | undefined
): ValidityResult {
  if (!dob || dob.day == null || dob.month == null || dob.year == null) {
    return { valid: false, reason: 'Date of birth is required' };
  }

  const { day, month, year } = dob;
  if (day < 1 || day > 31 || month < 1 || month > 12) {
    return { valid: false, reason: 'Date of birth is invalid' };
  }

  const birthDate = new Date(year, month - 1, day);
  if (
    birthDate.getFullYear() !== year ||
    birthDate.getMonth() !== month - 1 ||
    birthDate.getDate() !== day
  ) {
    return { valid: false, reason: 'Date of birth is invalid' };
  }

  const today = new Date();
  let age = today.getFullYear() - year;
  const monthDiff = today.getMonth() - (month - 1);
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < day)) {
    age--;
  }

  if (age < 13) {
    return { valid: false, reason: 'You must be at least 13 years old' };
  }

  if (age > 120) {
    return { valid: false, reason: 'Date of birth is invalid' };
  }

  return { valid: true };
}

/**
 * Validate postal code shape for a country (permissive fallback for unknown countries).
 */
export function CheckPostalCode(
  postalCode: string | null | undefined,
  country: string | null | undefined
): ValidityResult {
  if (!postalCode || !postalCode.trim()) {
    return { valid: false, reason: 'Postal code is required' };
  }

  const trimmed = postalCode.trim();
  const countryCode = country?.toUpperCase() ?? '';
  const pattern = POSTAL_CODE_PATTERNS[countryCode] ?? PERMISSIVE_POSTAL;

  if (!pattern.test(trimmed)) {
    return {
      valid: false,
      reason: `Postal code is invalid for ${countryCode || 'this country'}`,
    };
  }

  return { valid: true };
}

/**
 * Validate ISO 3166-1 alpha-2 country code.
 */
export function CheckCountryCode(
  country: string | null | undefined
): ValidityResult {
  if (!country || !country.trim()) {
    return { valid: false, reason: 'Country is required' };
  }

  if (!ISO_COUNTRY_RE.test(country.trim().toUpperCase())) {
    return {
      valid: false,
      reason: 'Country must be a 2-character ISO code',
    };
  }

  return { valid: true };
}

/**
 * True when two ISO country codes are compatible for lite checks.
 * NANP (US/CA) share +1 and are treated as compatible for phone↔address.
 */
export function CountriesCompatible(
  a: string | null | undefined,
  b: string | null | undefined
): boolean {
  if (!a || !b) return true;
  const left = a.toUpperCase();
  const right = b.toUpperCase();
  if (left === right) return true;

  const nanp = new Set(['US', 'CA']);
  if (nanp.has(left) && nanp.has(right)) return true;

  return false;
}

/**
 * Normalize an IP for duplicate comparison (strip IPv6-mapped IPv4 prefix).
 */
export function NormalizeIpAddress(
  ip: string | null | undefined
): string | null {
  if (!ip || !ip.trim()) return null;
  let value = ip.trim();
  // x-forwarded-for may be a list
  if (value.includes(',')) {
    value = value.split(',')[0].trim();
  }
  if (value.startsWith('::ffff:')) {
    value = value.slice(7);
  }
  if (value === '::1') return '127.0.0.1';
  return value;
}

/**
 * True when the email domain looks disposable / throwaway.
 */
export function IsDisposableEmail(email: string | null | undefined): boolean {
  if (!email || !email.includes('@')) return false;
  const domain = email.split('@')[1]?.toLowerCase().trim();
  if (!domain) return false;
  return DISPOSABLE_EMAIL_DOMAINS.has(domain);
}

/**
 * True when the email local part looks like a role inbox rather than a person.
 */
export function IsRoleEmail(email: string | null | undefined): boolean {
  if (!email || !email.includes('@')) return false;
  const local = email.split('@')[0]?.toLowerCase().trim();
  if (!local) return false;
  return ROLE_EMAIL_LOCAL_PARTS.has(local);
}

/**
 * Legacy disabled_reason value. Lite checks use pending_verification instead.
 */
export const IDENTITY_UNDER_REVIEW = 'under_review';

/** Account.metadata key: operator dismissed lite identity review signals */
export const IDENTITY_LITE_REVIEW_METADATA_KEY = 'identity_lite_review';
export const IDENTITY_LITE_REVIEW_DISMISSED = 'dismissed';

/** Error codes for non-blocking lite review signals */
export const IDENTITY_REVIEW_ERROR_CODES: ReadonlySet<string> = new Set([
  IDENTITY_ERROR_CODES.disposableEmail,
  IDENTITY_ERROR_CODES.roleEmail,
  IDENTITY_ERROR_CODES.voipPhone,
  IDENTITY_ERROR_CODES.ipCountryMismatch,
  IDENTITY_ERROR_CODES.phoneCountryMismatch,
  IDENTITY_ERROR_CODES.accountCountryMismatch,
  IDENTITY_ERROR_CODES.duplicateEmail,
  IDENTITY_ERROR_CODES.duplicatePhone,
  IDENTITY_ERROR_CODES.duplicateWallet,
  IDENTITY_ERROR_CODES.duplicateIp,
]);

/**
 * Whether account requirements block enabling / keeping payouts for
 * hard-invalid form fields or rejection. Hosted document IDV
 * (`individual.verification.document`) is excluded — it soft-pauses
 * payouts via IdentityLite evaluation instead, and must not block
 * wallet attach / onboarding.
 */
export function IsIdentityBlockingPayouts(
  requirements:
    | {
        currently_due?: string[] | null;
        disabled_reason?: string | null;
      }
    | null
    | undefined
): boolean {
  if (!requirements) return false;

  if (GetFormBlockingIdentityRequirements(requirements.currently_due).length > 0) {
    return true;
  }

  const reason = requirements.disabled_reason;
  if (IsRejectedAccountReason(reason)) return true;

  return false;
}

/**
 * currently_due fields that must be fixed via account/person forms.
 * Excludes hosted document verification, which is remediable only via
 * an identity VerificationSession.
 */
export function GetFormBlockingIdentityRequirements(
  currentlyDue: string[] | null | undefined
): string[] {
  return (currentlyDue ?? []).filter(
    (field) => field !== IDENTITY_REQUIREMENT_FIELDS.verificationDocument
  );
}
