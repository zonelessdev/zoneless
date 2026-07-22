import * as crypto from 'crypto';

const URL_SAFE_CHARS =
  '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';

/** Uppercase alphanumeric charset used for customer invoice prefixes (Stripe-shaped). */
const INVOICE_PREFIX_CHARS = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';

/**
 * Generates a random ID with a prefix, similar to Stripe IDs.
 * e.g. acct_1SVYFEIS97JJCA0T
 *
 * @param prefix The prefix for the ID (e.g. 'acct', 'ch', 'cus')
 * @param length The length of the random part (default 16)
 * @returns The generated ID string
 */
export function GenerateId(prefix: string, length: number = 16): string {
  return `${prefix}_${RandomFromCharset(URL_SAFE_CHARS, length)}`;
}

/**
 * Generates an opaque public URL slug (no object-id prefix).
 * Used in hosted Checkout Session and Payment Link URLs so the shareable
 * path does not expose the API object id (Stripe buy.stripe.com style).
 *
 * Test mode slugs are prefixed with `test_`, matching Stripe.
 */
export function GenerateUrlSlug(
  livemode: boolean = false,
  length: number = 18
): string {
  const slug = RandomFromCharset(URL_SAFE_CHARS, length);
  return livemode ? slug : `test_${slug}`;
}

/**
 * Generates a customer invoice prefix (3–12 uppercase letters/numbers).
 * Matches Stripe's default 8-character customer-level invoice prefixes.
 */
export function GenerateInvoicePrefix(length: number = 8): string {
  const clamped = Math.min(12, Math.max(3, length));
  return RandomFromCharset(INVOICE_PREFIX_CHARS, clamped);
}

function RandomFromCharset(charset: string, length: number): string {
  const randomBytes = crypto.randomBytes(length);
  let result = '';

  for (let i = 0; i < length; i++) {
    result += charset[randomBytes[i] % charset.length];
  }

  return result;
}
