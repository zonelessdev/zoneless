/**
 * Validates a Solana wallet address
 * Solana addresses are base58-encoded strings of 32-44 characters
 */
export function ValidateSolanaAddress(address: string): boolean {
  if (!address) return false;

  // Solana addresses are 32-44 characters (typically 43-44)
  if (address.length < 32 || address.length > 44) {
    return false;
  }

  // Base58 character set (excludes 0, O, I, l)
  const base58Regex = /^[1-9A-HJ-NP-Za-km-z]+$/;
  return base58Regex.test(address);
}

/**
 * Returns a validation error message for a Solana address, or empty string if valid
 */
export function GetSolanaAddressError(address: string): string {
  if (!address || !address.trim()) {
    return 'Please enter a wallet address';
  }

  if (address.length < 32) {
    return 'Wallet address is too short';
  }

  if (address.length > 44) {
    return 'Wallet address is too long';
  }

  const base58Regex = /^[1-9A-HJ-NP-Za-km-z]+$/;
  if (!base58Regex.test(address)) {
    return 'Invalid wallet address format';
  }

  return '';
}

export const SOLANA_NETWORK = 'solana';
export const SOLANA_CURRENCY = 'USDC';
