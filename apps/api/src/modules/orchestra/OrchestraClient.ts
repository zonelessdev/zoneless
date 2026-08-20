/**
 * @fileOverview Thin Flashnet Orchestra HTTP client.
 * Zoneless holds a server key (`fn_`) only. Never expose this to checkout FE.
 *
 * @module OrchestraClient
 */

import { GetAppConfig, IsOrchestraLive } from '../AppConfig';
import { AppError } from '../../utils/AppError';
import { ERRORS } from '../../utils/Errors';
import { Logger } from '../../utils/Logger';

export { IsOrchestraLive };

const REQUEST_TIMEOUT_MS = 15_000;

export interface OrchestraOnrampInput {
  destinationChain: string;
  destinationAsset: string;
  recipientAddress: string;
  /** Decimal USD string Flashnet requires, e.g. `"10.00"`. */
  amountFiatUsd: string;
  idempotencyKey: string;
}

export interface OrchestraQuoteInput {
  sourceChain: string;
  sourceAsset: string;
  destinationChain: string;
  destinationAsset: string;
  recipientAddress: string;
  amount: string;
  amountMode: string;
  idempotencyKey: string;
}

export interface OrchestraStatusInput {
  orderId?: string;
  quoteId?: string;
}

export interface OrchestraRouteEndpoint {
  chain?: string;
  asset?: string;
  assetDisplayName?: string;
  chainDisplayName?: string;
  contractAddress?: string | null;
  decimals?: number;
  chainId?: string | number | null;
}

export interface OrchestraRoute {
  sourceChain: string;
  sourceAsset: string;
  destinationChain: string;
  destinationAsset: string;
  source?: OrchestraRouteEndpoint;
  destination?: OrchestraRouteEndpoint;
}

/** Normalized partner order — Flashnet field names stay inside this client. */
export interface OrchestraPartnerOrder {
  id: string | null;
  quoteId: string | null;
  depositAddress: string | null;
  depositMemo: string | null;
  cashAppUrl: string | null;
  amountIn: string | null;
  estimatedOut: string | null;
  amountOut: string | null;
  destinationAddress: string | null;
  sourceAddress: string | null;
  expiresAt: string | null;
  status: string | null;
}

function ReadString(...values: unknown[]): string | null {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) return value;
  }
  return null;
}

function AsRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function NormalizeOrder(payload: unknown): OrchestraPartnerOrder {
  const data = AsRecord(payload) ?? {};
  const paymentLinks =
    AsRecord(data.paymentLinks) ?? AsRecord(data.payment_links) ?? {};

  return {
    id: ReadString(data.orderId, data.order_id, data.id),
    quoteId: ReadString(data.quoteId, data.quote_id),
    depositAddress: ReadString(data.depositAddress, data.deposit_address),
    depositMemo: ReadString(data.depositMemo, data.deposit_memo),
    cashAppUrl: ReadString(
      paymentLinks.cashApp,
      paymentLinks.cash_app,
      data.cashAppUrl,
      data.cash_app_url
    ),
    amountIn: ReadString(data.amountIn, data.amount_in),
    estimatedOut: ReadString(data.estimatedOut, data.estimated_out),
    amountOut: ReadString(data.amountOut, data.amount_out),
    destinationAddress: ReadString(
      data.destinationAddress,
      data.destination_address
    ),
    sourceAddress: ReadString(data.sourceAddress, data.source_address),
    expiresAt: ReadString(data.expiresAt, data.expires_at),
    status: ReadString(data.status)?.toLowerCase() ?? null,
  };
}

function Unavailable(): AppError {
  return new AppError(
    ERRORS.ORCHESTRA_UNAVAILABLE.message,
    ERRORS.ORCHESTRA_UNAVAILABLE.status,
    ERRORS.ORCHESTRA_UNAVAILABLE.type
  );
}

function ReadPartnerError(body: string): string | null {
  try {
    const parsed = JSON.parse(body) as {
      error?: { message?: string };
      message?: string;
    };
    return parsed.error?.message || parsed.message || null;
  } catch {
    return null;
  }
}

export class OrchestraClient {
  private readonly apiUrl: string;
  private readonly apiKey: string;

  constructor(options?: { apiUrl?: string; apiKey?: string }) {
    const config = GetAppConfig();
    this.apiUrl = (options?.apiUrl ?? config.orchestraApiUrl ?? '').replace(
      /\/$/,
      ''
    );
    this.apiKey = options?.apiKey ?? config.orchestraApiKey ?? '';
  }

  IsOrchestraLive(): boolean {
    return IsOrchestraLive();
  }

  async CreateOnramp(
    input: OrchestraOnrampInput
  ): Promise<OrchestraPartnerOrder> {
    return this.PostJson(
      '/v1/orchestration/onramp',
      {
        destinationChain: input.destinationChain,
        destinationAsset: input.destinationAsset,
        recipientAddress: input.recipientAddress,
        amountFiatUsd: input.amountFiatUsd,
      },
      input.idempotencyKey
    );
  }

  async CreateQuote(input: OrchestraQuoteInput): Promise<OrchestraPartnerOrder> {
    return this.PostJson(
      '/v1/orchestration/quote',
      {
        sourceChain: input.sourceChain,
        sourceAsset: input.sourceAsset,
        destinationChain: input.destinationChain,
        destinationAsset: input.destinationAsset,
        recipientAddress: input.recipientAddress,
        amount: input.amount,
        amountMode: input.amountMode,
      },
      input.idempotencyKey
    );
  }

  async ListRoutes(): Promise<OrchestraRoute[]> {
    const payload = await this.RequestJson('/v1/orchestration/routes', {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
      },
    });
    const data = AsRecord(payload);
    const routes = data?.routes;
    if (!Array.isArray(routes)) return [];
    return routes as OrchestraRoute[];
  }

  async GetOrderStatus(
    input: OrchestraStatusInput
  ): Promise<OrchestraPartnerOrder> {
    const attempts: string[] = [];
    if (input.orderId) {
      attempts.push(`id=${encodeURIComponent(input.orderId)}`);
    }
    if (input.quoteId) {
      attempts.push(`quoteId=${encodeURIComponent(input.quoteId)}`);
    }
    if (attempts.length === 0) {
      throw new AppError(
        'An Orchestra order or quote id is required',
        ERRORS.INVALID_REQUEST.status,
        ERRORS.INVALID_REQUEST.type
      );
    }

    let lastError: unknown = null;
    for (const query of attempts) {
      try {
        return await this.GetJson(`/v1/orchestration/status?${query}`);
      } catch (error) {
        lastError = error;
      }
    }
    throw lastError instanceof AppError ? lastError : Unavailable();
  }

  private async PostJson(
    path: string,
    body: Record<string, unknown>,
    idempotencyKey: string
  ): Promise<OrchestraPartnerOrder> {
    return NormalizeOrder(
      await this.RequestJson(path, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
          'X-Idempotency-Key': idempotencyKey,
        },
        body: JSON.stringify(body),
      })
    );
  }

  private async GetJson(path: string): Promise<OrchestraPartnerOrder> {
    return NormalizeOrder(
      await this.RequestJson(path, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
        },
      })
    );
  }

  private async RequestJson(
    path: string,
    init: RequestInit
  ): Promise<unknown> {
    if (!this.apiUrl || !this.apiKey) {
      throw Unavailable();
    }

    try {
      const response = await fetch(`${this.apiUrl}${path}`, {
        ...init,
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
      if (!response.ok) {
        const body = await response.text();
        Logger.warn('Orchestra request failed', {
          url: `${this.apiUrl}${path}`,
          status: response.status,
          body: body.slice(0, 500),
        });
        const partnerMessage = ReadPartnerError(body);
        throw new AppError(
          partnerMessage || ERRORS.ORCHESTRA_UNAVAILABLE.message,
          ERRORS.ORCHESTRA_UNAVAILABLE.status,
          ERRORS.ORCHESTRA_UNAVAILABLE.type
        );
      }
      return await response.json();
    } catch (error) {
      if (error instanceof AppError) throw error;
      throw Unavailable();
    }
  }
}
