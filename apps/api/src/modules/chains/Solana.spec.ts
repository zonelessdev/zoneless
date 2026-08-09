import {
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
} from '@solana/web3.js';
import { ValidateSponsoredCheckoutTransaction } from './Solana';

jest.mock('@solana/kit', () => ({}));
jest.mock('@solana/kit-plugin-rpc', () => ({}));
jest.mock('@solana/kit-plugin-signer', () => ({}));
jest.mock('@solana-program/token', () => ({}));
jest.mock('@solana/subscriptions', () => ({}));

function BuildTransferTransaction(
  feePayer: PublicKey,
  sender: PublicKey,
  recipient: PublicKey
): Transaction {
  return new Transaction({
    feePayer,
    recentBlockhash: Keypair.generate().publicKey.toBase58(),
  }).add(
    SystemProgram.transfer({
      fromPubkey: sender,
      toPubkey: recipient,
      lamports: 1,
    })
  );
}

function SerializePartiallySignedTransaction(transaction: Transaction): string {
  return transaction
    .serialize({
      requireAllSignatures: false,
      verifySignatures: false,
    })
    .toString('base64');
}

describe('Solana sponsored checkout transactions', () => {
  it('accepts the unchanged transaction signed by the sponsor and customer', () => {
    const sponsor = Keypair.generate();
    const customer = Keypair.generate();
    const transaction = BuildTransferTransaction(
      sponsor.publicKey,
      customer.publicKey,
      Keypair.generate().publicKey
    );
    transaction.partialSign(sponsor, customer);
    const signedTransaction = transaction.serialize().toString('base64');

    expect(
      ValidateSponsoredCheckoutTransaction(signedTransaction, sponsor.publicKey)
    ).toBe(signedTransaction);
  });

  it('rejects an arbitrary transfer from the sponsor wallet', () => {
    const sponsor = Keypair.generate();
    const transaction = BuildTransferTransaction(
      sponsor.publicKey,
      sponsor.publicKey,
      Keypair.generate().publicKey
    );

    expect(() =>
      ValidateSponsoredCheckoutTransaction(
        SerializePartiallySignedTransaction(transaction),
        sponsor.publicKey
      )
    ).toThrow('Sponsored checkout fee payer signature is missing');
  });

  it('rejects a transaction with a different fee payer', () => {
    const sponsor = Keypair.generate();
    const attacker = Keypair.generate();
    const transaction = BuildTransferTransaction(
      attacker.publicKey,
      attacker.publicKey,
      Keypair.generate().publicKey
    );
    transaction.sign(attacker);

    expect(() =>
      ValidateSponsoredCheckoutTransaction(
        transaction.serialize().toString('base64'),
        sponsor.publicKey
      )
    ).toThrow('Sponsored checkout fee payer does not match');
  });

  it('rejects a transaction missing the customer signature', () => {
    const sponsor = Keypair.generate();
    const customer = Keypair.generate();
    const transaction = BuildTransferTransaction(
      sponsor.publicKey,
      customer.publicKey,
      Keypair.generate().publicKey
    );
    transaction.partialSign(sponsor);

    expect(() =>
      ValidateSponsoredCheckoutTransaction(
        SerializePartiallySignedTransaction(transaction),
        sponsor.publicKey
      )
    ).toThrow('Sponsored checkout transaction signatures are invalid');
  });

  it('rejects transaction instructions changed after preparation', () => {
    const sponsor = Keypair.generate();
    const customer = Keypair.generate();
    const transaction = BuildTransferTransaction(
      sponsor.publicKey,
      customer.publicKey,
      Keypair.generate().publicKey
    );
    transaction.partialSign(sponsor, customer);
    transaction.instructions[0].data[0] ^= 1;

    expect(() =>
      ValidateSponsoredCheckoutTransaction(
        SerializePartiallySignedTransaction(transaction),
        sponsor.publicKey
      )
    ).toThrow('Sponsored checkout transaction signatures are invalid');
  });
});
