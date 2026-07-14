import * as crypto from 'crypto';

const URL_SAFE_CHARS =
  '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';

/**
 * Generates a random ID with a prefix, similar to Stripe IDs.
 * e.g. acct_1SVYFEIS97JJCA0T
 *
 * @param prefix The prefix for the ID (e.g. 'acct', 'ch', 'cus')
 * @param length The length of the random part (default 16)
 * @returns The generated ID string
 */
export function GenerateId(prefix: string, length: number = 16): string {
  return `${prefix}_${RandomAlphanumeric(length)}`;
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
  const slug = RandomAlphanumeric(length);
  return livemode ? slug : `test_${slug}`;
}

function RandomAlphanumeric(length: number): string {
  const randomBytes = crypto.randomBytes(length);
  let result = '';

  for (let i = 0; i < length; i++) {
    result += URL_SAFE_CHARS[randomBytes[i] % URL_SAFE_CHARS.length];
  }

  return result;
}
