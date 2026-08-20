/**
 * @fileOverview Curated Orchestra stables and unit conversion.
 * Books stay USDC.sol; convert only at the Flashnet edges.
 *
 * @module OrchestraRails
 */

import { OrchestraSource } from '@zoneless/shared-types';
import { AppError } from '../../utils/AppError';
import { ERRORS } from '../../utils/Errors';

const BASE58_RE = /^[1-9A-HJ-NP-Za-km-z]+$/;
const EVM_ADDRESS_RE = /^0x[a-fA-F0-9]{40}$/;

const EVM_CHAINS = new Set([
  'base',
  'arbitrum',
  'ethereum',
  'optimism',
  'polygon',
]);

const PAYIN_SOURCES: OrchestraSource[] = [
  { chain: 'base', asset: 'usdc', label: 'USDC on Base' },
  { chain: 'arbitrum', asset: 'usdc', label: 'USDC on Arbitrum' },
  { chain: 'ethereum', asset: 'usdc', label: 'USDC on Ethereum' },
  { chain: 'optimism', asset: 'usdc', label: 'USDC on Optimism' },
  { chain: 'polygon', asset: 'usdc', label: 'USDC on Polygon' },
  { chain: 'tron', asset: 'usdt', label: 'USDT on Tron' },
];

const ORCHESTRA_PAYOUT_DESTS = new Set(
  PAYIN_SOURCES.map((source) => `${source.chain}:${source.asset}`)
);

/** 1 USDC = 1e6 smallest units = 100 cents → 1 cent = 10_000 smallest units. */
const SMALLEST_PER_CENT = 10_000;

export function ListOrchestraPayinSources(): OrchestraSource[] {
  return [...PAYIN_SOURCES];
}

export function IsNativeSolanaUsdc(
  network?: string | null,
  currency?: string | null
): boolean {
  return (
    NormalizeChain(network || 'solana') === 'solana' &&
    NormalizeAsset(currency || 'usdc') === 'usdc'
  );
}

export function IsOrchestraPayoutDest(
  network?: string | null,
  currency?: string | null
): boolean {
  const chain = NormalizeChain(network || '');
  const asset = NormalizeAsset(currency || '');
  return ORCHESTRA_PAYOUT_DESTS.has(`${chain}:${asset}`);
}

export function IsOrchestraPayinSource(chain: string, asset: string): boolean {
  const normalizedChain = NormalizeChain(chain);
  const normalizedAsset = NormalizeAsset(asset);
  return PAYIN_SOURCES.some(
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

  if (EVM_CHAINS.has(chain)) {
    if (!EVM_ADDRESS_RE.test(value)) {
      throw new AppError(
        'Wallet address must be a valid EVM address',
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

  throw new AppError(
    'Unsupported network',
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
