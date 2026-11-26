import axios, { AxiosError, AxiosInstance } from 'axios';
import { Keypair } from '@solana/web3.js';
import { SetupResponse } from '@zoneless/shared-types';
import { API_URL } from './Config';

export interface Platform {
  id: string;
  api: AxiosInstance;
}

export function NewWalletAddress(): string {
  return Keypair.generate().publicKey.toBase58();
}

const WALLET_ADDRESS = /[1-9A-HJ-NP-Za-km-z]{32,}/g;

/**
 * Axios hides the response body in its error message. Put the API's own
 * error in the message so a failing run says what the API rejected. Wallet
 * addresses are left out, because the live checks log publicly.
 */
function DescribeApiError(error: AxiosError): never {
  const { config, response } = error;
  if (response) {
    error.message = `${config?.method?.toUpperCase()} ${config?.url} → ${
      response.status
    } ${JSON.stringify(response.data)}`.replace(WALLET_ADDRESS, '[address]');
  }
  throw error;
}

export function CreateClient(
  baseURL: string,
  headers: Record<string, string> = {}
): AxiosInstance {
  const client = axios.create({ baseURL, headers });
  client.interceptors.response.use(undefined, DescribeApiError);
  return client;
}

/** Creates a fresh platform so each spec file owns its own ledger. */
export async function CreatePlatform(name: string): Promise<Platform> {
  const baseURL = `${API_URL}/v1`;
  const { data } = await CreateClient(baseURL).post<SetupResponse>('/setup', {
    platform_name: name,
    solana_public_key: NewWalletAddress(),
  });

  return {
    id: data.platform_account_id,
    api: CreateClient(baseURL, { 'x-api-key': data.api_key }),
  };
}

/** Acts on a connected account with the platform's key. */
export function AsAccount(accountId: string) {
  return { headers: { 'Zoneless-Account': accountId } };
}

export async function GetAvailable(
  api: AxiosInstance,
  accountId?: string
): Promise<number> {
  const { data } = await api.get(
    '/balance',
    accountId ? AsAccount(accountId) : undefined
  );
  return data.available.find(
    (entry: { currency: string }) => entry.currency === 'usdc'
  ).amount;
}

/** Sum of every balance transaction's net, which must equal the balance. */
export async function GetLedgerTotal(
  api: AxiosInstance,
  accountId?: string
): Promise<number> {
  const { data } = await api.get('/balance_transactions', {
    params: { limit: 100 },
    ...(accountId ? AsAccount(accountId) : {}),
  });
  expect(data.has_more).toBe(false);
  return data.data.reduce(
    (total: number, transaction: { net: number }) => total + transaction.net,
    0
  );
}
