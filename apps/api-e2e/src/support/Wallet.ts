import { Keypair, Transaction } from '@solana/web3.js';
import { decodeTransferCheckedInstruction } from '@solana/spl-token';
import bs58 from 'bs58';

const USDC_UNITS_PER_CENT = 10_000;

export function LoadWallet(secretKey: string): Keypair {
  return Keypair.fromSecretKey(bs58.decode(secretKey));
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
