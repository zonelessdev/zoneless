/**
 * @fileOverview Verification for Webhooks
 *
 *
 * @module WebhookVerify
 */

import * as crypto from 'crypto';

export class WebhookVerify {
  /**
   * Constructs and verifies the event from the webhook payload and signature.
   * Throws an Error if the signature is invalid or the timestamp is out of tolerance.
   *
   * @param payload - The raw body of the request (must be a string/buffer)
   * @param header - The 'Zoneless-Signature' header value
   * @param secret - The webhook signing secret (whsec_...)
   * @param tolerance - Time tolerance in seconds (default 300s)
   * @returns The parsed JSON event object
   */
  ConstructEvent(
    payload: string | Buffer,
    header: string,
    secret: string,
    tolerance: number = 300
  ): any {
    this.Verify(payload.toString(), header, secret, tolerance);
    return JSON.parse(payload.toString());
  }

  private Verify(
    payload: string,
    header: string,
    secret: string,
    tolerance: number
  ): boolean {
    const details = this.ParseHeader(header);

    if (!details.t || !details.v1) {
      throw new Error('Unable to extract timestamp and signatures from header');
    }

    const timestampStr = Array.isArray(details.t) ? details.t[0] : details.t;
    const timestamp = parseInt(timestampStr, 10);
    const now = Math.floor(Date.now() / 1000); // Current time in seconds

    if (tolerance > 0 && now - timestamp > tolerance) {
      throw new Error('Timestamp outside the tolerance zone');
    }

    const signedPayload = `${timestamp}.${payload}`;
    const expectedSignature = crypto
      .createHmac('sha256', secret)
      .update(signedPayload)
      .digest('hex');

    const signatures = Array.isArray(details.v1) ? details.v1 : [details.v1];

    const match = signatures.some((sig) => {
      const a = Buffer.from(sig);
      const b = Buffer.from(expectedSignature);

      if (a.length !== b.length) return false;
      return crypto.timingSafeEqual(a as any, b as any);
    });

    if (!match) {
      throw new Error(
        'No signatures found matching the expected signature for payload'
      );
    }

    return true;
  }

  private ParseHeader(header: string): Record<string, string | string[]> {
    return header.split(',').reduce((acc, item) => {
      const [key, value] = item.split('=');
      if (key && value) {
        if (acc[key]) {
          if (Array.isArray(acc[key])) {
            (acc[key] as string[]).push(value);
          } else {
            acc[key] = [acc[key] as string, value];
          }
        } else {
          acc[key] = value;
        }
      }
      return acc;
    }, {} as Record<string, string | string[]>);
  }
}
