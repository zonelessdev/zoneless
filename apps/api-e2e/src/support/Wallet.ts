import { Keypair, PublicKey, Transaction } from '@solana/web3.js';
import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  decodeTransferCheckedInstruction,
  decodeTransferInstruction,
  getAssociatedTokenAddressSync,
} from '@solana/spl-token';
import bs58 from 'bs58';

const USDC_UNITS_PER_CENT = 10_000;
/** USDC on Solana mainnet. */
export const USDC_MINT = new PublicKey(
  'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'
);

/**
 * Accepts a secret key as base58, as 128 hex characters, or as the 64 hex
 * characters of its seed.
 */
export function LoadWallet(secretKey: string): Keypair {
  const hex = secretKey.trim().replace(/^0x/, '');
  if (/^[0-9a-fA-F]+$/.test(hex)) {
    if (hex.length === 128) {
      return Keypair.fromSecretKey(Buffer.from(hex, 'hex'));
    }
    if (hex.length === 64) return Keypair.fromSeed(Buffer.from(hex, 'hex'));
  }
  return Keypair.fromSecretKey(bs58.decode(secretKey.trim()));
}

/**
 * Signs a prepared checkout payment as the customer. It refuses anything
 * other than one USDC transfer of the expected amount with the network fee
 * sponsored, so a faulty API response cannot spend more of the wallet.
 */
export function SignCheckoutPayment(
  unsignedTransaction: string,
  wallet: Keypair,
  amountInCents: number
): string {
  const transaction = Transaction.from(
    Buffer.from(unsignedTransaction, 'base64')
  );

  if (transaction.feePayer?.equals(wallet.publicKey)) {
    throw new Error('Expected the network fee to be sponsored');
  }

  const signedByWallet = transaction.instructions.filter((instruction) =>
    instruction.keys.some(
      (key) => key.isSigner && key.pubkey.equals(wallet.publicKey)
    )
  );
  if (signedByWallet.length !== 1) {
    throw new Error(
      `Expected one instruction for the wallet to sign, found ${signedByWallet.length}`
    );
  }

  const { amount } = decodeTransferCheckedInstruction(signedByWallet[0]).data;
  if (amount !== BigInt(amountInCents * USDC_UNITS_PER_CENT)) {
    throw new Error(
      `Expected a transfer of ${amountInCents} cents, found ${amount} base units`
    );
  }

  transaction.partialSign(wallet);
  return transaction.serialize().toString('base64');
}

/**
 * Signs a built payout as the platform. It refuses anything other than one
 * USDC transfer of the expected amount from the platform wallet to
 * `destinationOwner`, plus creating that wallet's token account if needed.
 */
export function SignPayout(
  unsignedTransaction: string,
  wallet: Keypair,
  destinationOwner: PublicKey,
  amountInCents: number
): string {
  const transaction = Transaction.from(
    Buffer.from(unsignedTransaction, 'base64')
  );

  if (!transaction.feePayer?.equals(wallet.publicKey)) {
    throw new Error('Expected the platform wallet to pay the network fee');
  }

  const source = getAssociatedTokenAddressSync(USDC_MINT, wallet.publicKey);
  const destination = getAssociatedTokenAddressSync(
    USDC_MINT,
    destinationOwner
  );
  let transfers = 0;

  for (const instruction of transaction.instructions) {
    if (instruction.programId.equals(ASSOCIATED_TOKEN_PROGRAM_ID)) {
      if (!instruction.keys[1]?.pubkey.equals(destination)) {
        throw new Error(
          'Expected only the payout wallet to get a token account'
        );
      }
      continue;
    }

    const { keys, data } = decodeTransferInstruction(instruction);
    if (
      !keys.source.pubkey.equals(source) ||
      !keys.destination.pubkey.equals(destination)
    ) {
      throw new Error(
        'Expected a transfer from the platform wallet to the payout wallet'
      );
    }
    if (data.amount !== BigInt(amountInCents * USDC_UNITS_PER_CENT)) {
      throw new Error(
        `Expected a transfer of ${amountInCents} cents, found ${data.amount} base units`
      );
    }
    transfers++;
  }

  if (transfers !== 1) {
    throw new Error(`Expected one transfer, found ${transfers}`);
  }

  transaction.partialSign(wallet);
  return transaction.serialize().toString('base64');
}
