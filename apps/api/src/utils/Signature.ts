/**
 * @fileOverview Webhook signature computation utilities
 *
 *
 * @module Signature
 */

import * as crypto from 'crypto';

/**
 * Computes a Stripe-compatible HMAC signature for webhook payloads.
 *
 * @param payload - The JSON stringified payload
 * @param secret - The webhook signing secret
 * @param timestamp - Unix timestamp in seconds (matching Stripe's format)
 * @returns The signature string in format: t={timestamp},v1={signature}
 */
export function ComputeSignature(
  payload: string,
  secret: string,
  timestamp: number
): string {
  const signedPayload = `${timestamp}.${payload}`;
  const signature = crypto
    .createHmac('sha256', secret)
    .update(signedPayload)
    .digest('hex');
  return `t=${timestamp},v1=${signature}`;
}
