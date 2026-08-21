/**
 * @fileOverview Orchestra stables from Flashnet's live route table.
 * Books stay USDC.sol; convert only at the Flashnet edges.
 *
 * @module OrchestraRails
 */

import { OrchestraSource } from '@zoneless/shared-types';
import { AppError } from '../../utils/AppError';
import { ERRORS } from '../../utils/Errors';
import { IsOrchestraLive } from '../AppConfig';
import {
  OrchestraClient,
  OrchestraRoute,
  OrchestraRouteEndpoint,
} from './OrchestraClient';

const BASE58_RE = /^[1-9A-HJ-NP-Za-km-z]+$/;
const EVM_ADDRESS_RE = /^0x[a-fA-F0-9]{40}$/;

const LEDGER_CHAIN = 'solana';
const LEDGER_ASSET = 'usdc';
const STABLE_ASSETS = new Set(['usdc', 'usdt']);
const REQUIRED_DECIMALS = 6;
const ROUTE_CACHE_MS = 10 * 60 * 1000;

/**
 * Offline / simulated snapshot of 6-decimal USDC/USDT pairs that actually
 * route both ways with solana:USDC. Pulled from GET /v1/orchestration/routes.
 * Optimism USDT exists on Flashnet only as BTC/Lightning/Spark, not Solana.
 */
const FALLBACK_SOURCES: OrchestraSource[] = [
  { chain: 'arbitrum', asset: 'usdc', label: 'USDC on Arbitrum' },
  { chain: 'arbitrum', asset: 'usdt', label: 'USDT on Arbitrum' },
  { chain: 'base', asset: 'usdc', label: 'USDC on Base' },
  { chain: 'base', asset: 'usdt', label: 'USDT on Base' },
  { chain: 'ethereum', asset: 'usdc', label: 'USDC on Ethereum' },
  { chain: 'ethereum', asset: 'usdt', label: 'USDT on Ethereum' },
  { chain: 'hyperevm', asset: 'usdc', label: 'USDC on HyperEVM' },
  { chain: 'polygon', asset: 'usdc', label: 'USDC on Polygon' },
  { chain: 'polygon', asset: 'usdt', label: 'USDT on Polygon' },
  { chain: 'solana', asset: 'usdt', label: 'USDT on Solana' },
  { chain: 'tron', asset: 'usdt', label: 'USDT on Tron' },
];

let cachedSources: OrchestraSource[] = FALLBACK_SOURCES;
let cachedAt = 0;
let cacheIsLive = false;
let refreshInFlight: Promise<void> | null = null;

/** 1 USDC = 1e6 smallest units = 100 cents → 1 cent = 10_000 smallest units. */
const SMALLEST_PER_CENT = 10_000;

export function ListOrchestraPayinSources(): OrchestraSource[] {
  return [...cachedSources];
}

export function IsNativeSolanaUsdc(
  network?: string | null,
  currency?: string | null
): boolean {
  return (
    NormalizeChain(network || 'solana') === LEDGER_CHAIN &&
    NormalizeAsset(currency || 'usdc') === LEDGER_ASSET
  );
}

export function IsOrchestraPayoutDest(
  network?: string | null,
  currency?: string | null
): boolean {
  const chain = NormalizeChain(network || '');
  const asset = NormalizeAsset(currency || '');
  return cachedSources.some(
    (source) => source.chain === chain && source.asset === asset
  );
}

export function IsOrchestraPayinSource(chain: string, asset: string): boolean {
  const normalizedChain = NormalizeChain(chain);
  const normalizedAsset = NormalizeAsset(asset);
  return cachedSources.some(
    (source) =>
      source.chain === normalizedChain && source.asset === normalizedAsset
  );
}

/** Lowercase internal chain id (base, arbitrum, ethereum, …). */
export function NormalizeChain(network: string): string {
  return network.trim().toLowerCase();
}

/**
 * Lowercase for Zoneless storage (usdc). Uppercase at the Flashnet boundary (USDC).
 */
export function NormalizeAsset(currency: string): string {
  return currency.trim().toLowerCase();
}

export function ToFlashnetAsset(currency: string): string {
  return NormalizeAsset(currency).toUpperCase();
}

export function CentsToUsdcSmallest(cents: number): string {
  return String(Math.trunc(cents) * SMALLEST_PER_CENT);
}

/** Flashnet `amountFiatUsd` is a decimal string, e.g. `"10.00"`. */
export function CentsToFiatUsd(cents: number): string {
  return (Math.trunc(cents) / 100).toFixed(2);
}

export function UsdcSmallestToCents(amount: string): number {
  const parsed = Number(amount);
  if (!Number.isFinite(parsed)) return 0;
  return Math.floor(parsed / SMALLEST_PER_CENT);
}

export function DeriveOrchestraStableSources(
  routes: OrchestraRoute[]
): OrchestraSource[] {
  const payin = new Map<string, OrchestraSource>();
  const payout = new Set<string>();

  for (const route of routes) {
    const sourceChain = NormalizeChain(route.sourceChain || '');
    const sourceAsset = NormalizeAsset(route.sourceAsset || '');
    const destChain = NormalizeChain(route.destinationChain || '');
    const destAsset = NormalizeAsset(route.destinationAsset || '');

    if (
      destChain === LEDGER_CHAIN &&
      destAsset === LEDGER_ASSET &&
      STABLE_ASSETS.has(sourceAsset) &&
      !IsNativeSolanaUsdc(sourceChain, sourceAsset) &&
      HasRequiredDecimals(route.source) &&
      IsAddressableStable(sourceChain, route.source)
    ) {
      const key = `${sourceChain}:${sourceAsset}`;
      payin.set(key, {
        chain: sourceChain,
        asset: sourceAsset,
        label: SourceLabel(sourceChain, sourceAsset, route.source),
      });
    }

    if (
      sourceChain === LEDGER_CHAIN &&
      sourceAsset === LEDGER_ASSET &&
      STABLE_ASSETS.has(destAsset) &&
      !IsNativeSolanaUsdc(destChain, destAsset) &&
      HasRequiredDecimals(route.destination) &&
      IsAddressableStable(destChain, route.destination)
    ) {
      payout.add(`${destChain}:${destAsset}`);
    }
  }

  return [...payin.values()]
    .filter((source) => payout.has(`${source.chain}:${source.asset}`))
    .sort(
      (left, right) =>
        left.chain.localeCompare(right.chain) ||
        left.asset.localeCompare(right.asset)
    );
}

export function ApplyOrchestraRoutes(routes: OrchestraRoute[]): OrchestraSource[] {
  const derived = DeriveOrchestraStableSources(routes);
  if (derived.length > 0) {
    cachedSources = derived;
    cachedAt = Date.now();
    cacheIsLive = true;
  }
  return [...cachedSources];
}

export function ResetOrchestraRouteCache(): void {
  cachedSources = FALLBACK_SOURCES;
  cachedAt = 0;
  cacheIsLive = false;
}

export async function RefreshOrchestraRoutes(
  client?: OrchestraClient
): Promise<void> {
  if (!IsOrchestraLive()) return;
  if (cacheIsLive && Date.now() - cachedAt < ROUTE_CACHE_MS) return;
  if (refreshInFlight) return refreshInFlight;

  refreshInFlight = (async () => {
    try {
      const orchestra = client ?? new OrchestraClient();
      ApplyOrchestraRoutes(await orchestra.ListRoutes());
    } catch {
      // Keep the last good list (fallback or previous live pull).
    } finally {
      refreshInFlight = null;
    }
  })();

  return refreshInFlight;
}

export function ValidateWalletAddress(network: string, address: string): void {
  const chain = NormalizeChain(network);
  const value = address.trim();

  if (chain === 'solana') {
    if (value.length < 32 || value.length > 44 || !BASE58_RE.test(value)) {
      throw new AppError(
        'Wallet address must be a valid base58 Solana address',
        ERRORS.VALIDATION_ERROR.status,
        ERRORS.VALIDATION_ERROR.type
      );
    }
    return;
  }

  if (chain === 'tron') {
    if (!value.startsWith('T') || !BASE58_RE.test(value)) {
      throw new AppError(
        'Wallet address must be a valid Tron address',
        ERRORS.VALIDATION_ERROR.status,
        ERRORS.VALIDATION_ERROR.type
      );
    }
    return;
  }

  if (EVM_ADDRESS_RE.test(value)) {
    return;
  }

  throw new AppError(
    'Wallet address must be a valid EVM address',
    ERRORS.VALIDATION_ERROR.status,
    ERRORS.VALIDATION_ERROR.type
  );
}

export function SimulatedDepositAddress(chain: string): string {
  const normalized = NormalizeChain(chain);
  if (normalized === 'tron') {
    return 'TSimu1atedOrchestraDepositAddr111';
  }
  if (normalized === 'solana') {
    return 'Sim1rchDeposit111111111111111111111111111';
  }
  return '0xSimulatedOrchestraDeposit0000000000000001';
}

function HasRequiredDecimals(endpoint?: OrchestraRouteEndpoint): boolean {
  return (endpoint?.decimals ?? REQUIRED_DECIMALS) === REQUIRED_DECIMALS;
}

function IsAddressableStable(
  chain: string,
  endpoint?: OrchestraRouteEndpoint
): boolean {
  if (chain === 'solana' || chain === 'tron') return true;
  const chainId = String(endpoint?.chainId ?? '');
  const contract = endpoint?.contractAddress ?? '';
  return /^\d+$/.test(chainId) && EVM_ADDRESS_RE.test(contract);
}

function SourceLabel(
  chain: string,
  asset: string,
  endpoint?: OrchestraRouteEndpoint
): string {
  const chainLabel =
    endpoint?.chainDisplayName?.trim() ||
    chain.charAt(0).toUpperCase() + chain.slice(1);
  return `${asset.toUpperCase()} on ${chainLabel}`;
}
