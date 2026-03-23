/**
 * @fileOverview Webhook dispatcher for sending events to webhook endpoints
 *
 *
 * @module WebhookDispatcher
 */

import { Event as EventType } from '@zoneless/shared-types';
import { ComputeSignature } from '../utils/Signature';
import { Now } from '../utils/Timestamp';
import { Logger } from '../utils/Logger';

interface WebhookResponse {
  success: boolean;
  statusCode?: number;
  error?: string;
}

export class WebhookDispatcher {
  private readonly defaultTimeout = 30000; // 30 seconds

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

      if (!response.ok) {
        Logger.warn('Webhook delivery failed', {
          eventId: event.id,
          statusCode: response.status,
          url,
        });

        return {
          success: false,
          statusCode: response.status,
          error: `HTTP ${response.status}`,
        };
      }

      Logger.info('Webhook delivered successfully', {
        eventId: event.id,
        eventType: event.type,
        url,
      });

      return {
        success: true,
        statusCode: response.status,
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';

      Logger.error('Webhook delivery error', error, {
        eventId: event.id,
        url,
      });

      return {
        success: false,
        error: errorMessage,
      };
    }
  }
}
