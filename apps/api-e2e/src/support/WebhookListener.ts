import * as crypto from 'crypto';
import * as http from 'http';
import { AddressInfo } from 'net';
import { Event } from '@zoneless/shared-types';

interface ReceivedWebhook {
  event: Event;
  payload: string;
  signature: string;
}

/** Local HTTP server that records the webhooks the API delivers to it. */
export class WebhookListener {
  private readonly received: ReceivedWebhook[] = [];
  private readonly server = http.createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', () => {
      const payload = Buffer.concat(chunks).toString();
      this.received.push({
        event: JSON.parse(payload),
        payload,
        signature: String(req.headers['zoneless-signature']),
      });
      res.writeHead(200).end();
    });
  });

  async Start(): Promise<string> {
    await new Promise<void>((resolve) => this.server.listen(0, resolve));
    const { port } = this.server.address() as AddressInfo;
    return `http://localhost:${port}/webhooks`;
  }

  async Stop(): Promise<void> {
    await new Promise((resolve) => this.server.close(resolve));
  }

  async WaitFor(type: string, timeoutMs = 5000): Promise<ReceivedWebhook> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const match = this.received.find(
        (webhook) => webhook.event.type === type
      );
      if (match) return match;
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    throw new Error(
      `No ${type} webhook within ${timeoutMs}ms. Received: ${
        this.received.map((webhook) => webhook.event.type).join(', ') || 'none'
      }`
    );
  }
}

/** Recomputes the documented `t=<timestamp>,v1=<hmac>` signature. */
export function IsValidSignature(
  { payload, signature }: ReceivedWebhook,
  secret: string
): boolean {
  const { t, v1 } = Object.fromEntries(
    signature.split(',').map((part) => part.split('='))
  );
  const expected = crypto
    .createHmac('sha256', secret)
    .update(`${t}.${payload}`)
    .digest('hex');
  return v1 === expected;
}
