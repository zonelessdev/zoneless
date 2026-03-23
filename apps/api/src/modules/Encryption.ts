/**
 * @fileOverview Encryption and key derivation utilities.
 *
 * Provides:
 * - AES-256 encryption/decryption via the Encryption class
 * - HKDF key derivation from master secrets
 *
 *
 * @module Encryption
 */

import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  hkdfSync,
} from 'crypto';

// HKDF salt for deterministic key derivation
const HKDF_SALT = 'zoneless-v1';

/**
 * Derive a key from a master secret using HKDF (SHA-256).
 *
 * @param masterSecret - The master secret (hex-encoded)
 * @param info - Purpose identifier (e.g., 'jwt-signing-key', 'encryption-key')
 * @param length - Desired key length in bytes
 * @returns Hex-encoded derived key
 */
export function DeriveKey(
  masterSecret: string,
  info: string,
  length: number
): string {
  const derived = hkdfSync(
    'sha256',
    Buffer.from(masterSecret, 'hex'),
    HKDF_SALT,
    info,
    length
  );
  return Buffer.from(derived).toString('hex');
}

export class Encryption {
  /**
   * AES-256 encryption key (64 hex characters = 32 bytes).
   * Must be set before calling EncryptString/DecryptString.
   */
  secretKey: string = '';

  /**
   * Validates that the secret key is properly configured.
   * @throws Error if secret key is not set or invalid length
   */
  private ValidateSecretKey(): void {
    if (!this.secretKey) {
      throw new Error(
        'Encryption key not configured. Set secretKey before encrypting/decrypting.'
      );
    }
    if (this.secretKey.length !== 64) {
      throw new Error(
        'Encryption key must be 64 hex characters (256 bits). ' +
          `Got ${this.secretKey.length} characters.`
      );
    }
  }

  EncryptString(textString: string): string {
    this.ValidateSecretKey();
    const iv = randomBytes(16);
    const cipher = createCipheriv(
      'aes-256-cbc',
      Buffer.from(this.secretKey, 'hex'),
      iv
    );
    let encrypted = cipher.update(textString);
    encrypted = Buffer.concat([encrypted, cipher.final()]);
    return iv.toString('hex') + ':' + encrypted.toString('hex');
  }

  DecryptString(encryptedString: string): string {
    this.ValidateSecretKey();
    const textParts = encryptedString.split(':');
    if (
      textParts.length < 2 ||
      textParts[0] === undefined ||
      textParts[1] === undefined
    ) {
      throw new Error('Invalid encrypted string format');
    }
    const iv = Buffer.from(textParts[0], 'hex');
    const encryptedText = Buffer.from(textParts[1], 'hex');
    const decipher = createDecipheriv(
      'aes-256-cbc',
      Buffer.from(this.secretKey, 'hex'),
      iv
    );
    let decrypted = decipher.update(encryptedText);
    decrypted = Buffer.concat([decrypted, decipher.final()]);
    return decrypted.toString();
  }
}
