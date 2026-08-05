import { ApiError, InvalidInput } from './Errors';
import type {
  PaymentLinkResponse,
  PriceResponse,
  ProductResponse,
  PublicConfig,
} from './Types';

export type FetchLike = (
  input: string | URL | Request,
  init?: RequestInit
) => Promise<Response>;

interface RequestOptions {
  body?: Record<string, unknown>;
  idempotencyKey?: string;
}

export class ZonelessClient {
  private readonly apiRoot: string;

  constructor(
    apiUrl: string,
    private readonly apiKey: string,
    private readonly fetchRequest: FetchLike = fetch
  ) {
    this.apiRoot = NormalizeApiRoot(apiUrl);
  }

  GetApiUrl(): string {
    return this.apiRoot;
  }

  GetConfig(): Promise<PublicConfig> {
    return this.Request<PublicConfig>('GET', '/config');
  }

  async VerifyAuthentication(): Promise<void> {
    await this.Request('GET', '/products?limit=1');
  }

  CreateProduct(
    body: Record<string, unknown>,
    idempotencyKey: string
  ): Promise<ProductResponse> {
    return this.Request<ProductResponse>('POST', '/products', {
      body,
      idempotencyKey,
    });
  }

  CreatePrice(
    body: Record<string, unknown>,
    idempotencyKey: string
  ): Promise<PriceResponse> {
    return this.Request<PriceResponse>('POST', '/prices', {
      body,
      idempotencyKey,
    });
  }

  CreatePaymentLink(
    body: Record<string, unknown>,
    idempotencyKey: string
  ): Promise<PaymentLinkResponse> {
    return this.Request<PaymentLinkResponse>('POST', '/payment_links', {
      body,
      idempotencyKey,
    });
  }

  private async Request<T>(
    method: 'GET' | 'POST',
    resourcePath: string,
    options: RequestOptions = {}
  ): Promise<T> {
    const headers: Record<string, string> = {
      accept: 'application/json',
      'user-agent': 'zoneless-cli/experimental',
      'x-api-key': this.apiKey,
    };
    if (options.body) headers['content-type'] = 'application/json';
    if (options.idempotencyKey) {
      headers['idempotency-key'] = options.idempotencyKey;
    }

    let response: Response;
    try {
      response = await this.fetchRequest(`${this.apiRoot}${resourcePath}`, {
        method,
        headers,
        body: options.body ? JSON.stringify(options.body) : undefined,
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Unknown network error';
      throw new ApiError(`Unable to reach Zoneless: ${message}`, 0);
    }

    const responseText = await response.text();
    const responseBody = ParseResponseBody(responseText);
    if (!response.ok) {
      throw new ApiError(
        GetApiErrorMessage(responseBody, response.status),
        response.status,
        response.headers.get('x-request-id') ?? undefined
      );
    }

    return responseBody as T;
  }
}

function NormalizeApiRoot(apiUrl: string): string {
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(apiUrl);
  } catch {
    throw InvalidInput('ZONELESS_API_URL must be a valid URL.');
  }

  if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
    throw InvalidInput('ZONELESS_API_URL must use http or https.');
  }

  parsedUrl.search = '';
  parsedUrl.hash = '';
  parsedUrl.pathname = parsedUrl.pathname.replace(/\/+$/, '');
  if (!parsedUrl.pathname.endsWith('/v1')) {
    parsedUrl.pathname = `${parsedUrl.pathname}/v1`.replace(/\/{2,}/g, '/');
  }
  return parsedUrl.toString().replace(/\/$/, '');
}

function ParseResponseBody(responseText: string): unknown {
  if (!responseText) return null;
  try {
    return JSON.parse(responseText);
  } catch {
    return responseText;
  }
}

function GetApiErrorMessage(responseBody: unknown, status: number): string {
  if (typeof responseBody === 'object' && responseBody !== null) {
    const record = responseBody as Record<string, unknown>;
    if (typeof record['message'] === 'string') return record['message'];

    const nestedError = record['error'];
    if (typeof nestedError === 'object' && nestedError !== null) {
      const nestedMessage = (nestedError as Record<string, unknown>)['message'];
      if (typeof nestedMessage === 'string') return nestedMessage;
    }
  }

  if (typeof responseBody === 'string' && responseBody.trim()) {
    return responseBody;
  }
  return `Zoneless API request failed with status ${status}.`;
}
