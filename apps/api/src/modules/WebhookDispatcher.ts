/**
 * @fileOverview Webhook dispatcher for sending events to webhook endpoints
 *
 *
 * @module WebhookDispatcher
 */

import {
  Event as EventType,
  WebhookDeliveryAttemptResult,
} from '@zoneless/shared-types';
import { ComputeSignature } from '../utils/Signature';
import { Now } from '../utils/Timestamp';
import { Logger } from '../utils/Logger';

export interface WebhookResponse {
  result: WebhookDeliveryAttemptResult;
  statusCode: number | null;
  error: string | null;
  durationMs: number;
}

export const WEBHOOK_REQUEST_TIMEOUT_SECONDS = 30;

export class WebhookDispatcher {
  private readonly defaultTimeout = WEBHOOK_REQUEST_TIMEOUT_SECONDS * 1000;

  /**
   * Sends an event to a webhook URL.
   *
   * @param event - The event to send
   * @param url - The webhook URL
   * @param secret - Optional signing secret
   * @returns Promise resolving to the response status
   */
  async Send(
    event: EventType,
    url: string,
    secret?: string
  ): Promise<WebhookResponse> {
    const timestamp = Now();
    const payload = JSON.stringify(event);
    const startedAt = Date.now();

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    if (secret) {
      const signature = ComputeSignature(payload, secret, timestamp);
      headers['Zoneless-Signature'] = signature;
    }

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers,
        body: payload,
        signal: AbortSignal.timeout(this.defaultTimeout),
      });

      const durationMs = Date.now() - startedAt;

      if (!response.ok) {
        Logger.warn('Webhook delivery failed', {
          eventId: event.id,
          statusCode: response.status,
          url,
        });

        return {
          result: 'http_error',
          statusCode: response.status,
          error: `HTTP ${response.status}`,
          durationMs,
        };
      }

      Logger.info('Webhook delivered successfully', {
        eventId: event.id,
        eventType: event.type,
        url,
      });

      return {
        result: 'succeeded',
        statusCode: response.status,
        error: null,
        durationMs,
      };
    } catch (error) {
      const durationMs = Date.now() - startedAt;
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      // AbortSignal.timeout rejects with a TimeoutError.
      const result =
        error instanceof Error && error.name === 'TimeoutError'
          ? 'timed_out'
          : 'network_error';

      Logger.error('Webhook delivery error', error, {
        eventId: event.id,
        url,
      });

      return {
        result,
        statusCode: null,
        error: errorMessage,
        durationMs,
      };
    }
  }
}
