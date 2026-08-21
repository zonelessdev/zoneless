import { GetSolanaAddressError, ValidateSolanaAddress } from './solana';

export const WALLET_NETWORKS = [
  { value: 'solana', label: 'Solana' },
  { value: 'base', label: 'Base' },
  { value: 'arbitrum', label: 'Arbitrum' },
  { value: 'ethereum', label: 'Ethereum' },
  { value: 'polygon', label: 'Polygon' },
  { value: 'hyperevm', label: 'HyperEVM' },
  { value: 'tron', label: 'Tron' },
] as const;

export const WALLET_CURRENCIES = [
  { value: 'usdc', label: 'USDC' },
  { value: 'usdt', label: 'USDT' },
] as const;

export function CurrencyOptionsForNetwork(
  network: string
): { value: string; label: string }[] {
  const normalized = network.toLowerCase();
  if (normalized === 'tron') {
    return WALLET_CURRENCIES.filter((option) => option.value === 'usdt');
  }
  if (normalized === 'hyperevm') {
    return WALLET_CURRENCIES.filter((option) => option.value === 'usdc');
  }
  return [...WALLET_CURRENCIES];
}

const EVM_NETWORKS = new Set([
  'base',
  'arbitrum',
  'ethereum',
  'optimism',
  'polygon',
  'hyperevm',
]);

const EVM_ADDRESS = /^0x[a-fA-F0-9]{40}$/;

export function FormatNetworkLabel(network?: string | null): string {
  if (!network) return 'Solana';
  const known = WALLET_NETWORKS.find((item) => item.value === network);
  if (known) return known.label;
  return network.charAt(0).toUpperCase() + network.slice(1);
}

export function FormatAssetLabel(currency?: string | null): string {
  return (currency || 'usdc').toUpperCase();
}

export function FormatDestinationLabel(
  network?: string | null,
  currency?: string | null
): string {
  return `${FormatAssetLabel(currency)} on ${FormatNetworkLabel(network)}`;
}

export function IsSolanaUsdcDestination(
  network?: string | null,
  currency?: string | null
): boolean {
  return (
    (network || 'solana').toLowerCase() === 'solana' &&
    (currency || 'usdc').toLowerCase() === 'usdc'
  );
}

export function ValidateEvmAddress(address: string): boolean {
  return EVM_ADDRESS.test(address);
}

export function ValidateTronAddress(address: string): boolean {
  return (
    address.startsWith('T') && address.length >= 33 && address.length <= 35
  );
}

export function ValidateWalletAddress(
  address: string,
  network: string
): boolean {
  if (!address) return false;
  if (network === 'solana') return ValidateSolanaAddress(address);
  if (network === 'tron') return ValidateTronAddress(address);
  if (EVM_NETWORKS.has(network)) return ValidateEvmAddress(address);
  return false;
}

export function GetWalletAddressError(
  address: string,
  network: string
): string {
  if (!address || !address.trim()) {
    return 'Please enter a wallet address';
  }
  if (network === 'solana') {
    return GetSolanaAddressError(address);
  }
  if (network === 'tron') {
    return ValidateTronAddress(address)
      ? ''
      : 'Enter a valid Tron address (starts with T)';
  }
  if (EVM_NETWORKS.has(network)) {
    return ValidateEvmAddress(address)
      ? ''
      : 'Enter a valid 0x address for this network';
  }
  return 'Unsupported network';
}
