import * as crypto from 'crypto';

/**
 * Generates a random ID with a prefix, similar to Stripe IDs.
 * e.g. acct_1SVYFEIS97JJCA0T
 *
 * @param prefix The prefix for the ID (e.g. 'acct', 'ch', 'cus')
 * @param length The length of the random part (default 16)
 * @returns The generated ID string
 */
export function GenerateId(prefix: string, length: number = 16): string {
  const chars =
    '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
  const randomBytes = crypto.randomBytes(length);
  let result = '';

  for (let i = 0; i < length; i++) {
    result += chars[randomBytes[i] % chars.length];
  }

  return `${prefix}_${result}`;
}
