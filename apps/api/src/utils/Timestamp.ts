/**
 * Unix timestamp utilities.
 *
 * All timestamps in the Zoneless API are in seconds since Unix epoch,
 * matching Stripe's convention for consistency and compatibility.
 */

/**
 * Returns the current Unix timestamp in seconds.
 * This matches Stripe's timestamp format.
 *
 * @returns Unix timestamp in seconds
 */
export function Now(): number {
  return Math.floor(Date.now() / 1000);
}

/**
 * Converts a JavaScript Date object to a Unix timestamp in seconds.
 *
 * @param date - Date object to convert
 * @returns Unix timestamp in seconds
 */
export function FromDate(date: Date): number {
  return Math.floor(date.getTime() / 1000);
}

/**
 * Converts a Unix timestamp in seconds to a JavaScript Date object.
 *
 * @param timestamp - Unix timestamp in seconds
 * @returns Date object
 */
export function ToDate(timestamp: number): Date {
  return new Date(timestamp * 1000);
}
