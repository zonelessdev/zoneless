import {
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
  TransactionInstruction,
} from '@solana/web3.js';
import {
  createAssociatedTokenAccountIdempotentInstruction,
  createTransferCheckedInstruction,
  getAssociatedTokenAddressSync,
} from '@solana/spl-token';
import { SignCheckoutPayment } from './Wallet';

const MEMO_PROGRAM_ID = new PublicKey(
  'MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr'
);
const USDC_MINT = new PublicKey('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v');

const wallet = Keypair.generate();
const sponsor = Keypair.generate();
const merchant = Keypair.generate().publicKey;

/** Mirrors the fee-sponsored transaction the API prepares for checkout. */
function PrepareTransaction(
  amountInBaseUnits: number,
  options: { feePayer?: Keypair; extra?: TransactionInstruction } = {}
): string {
  const feePayer = options.feePayer ?? sponsor;
  const merchantTokenAccount = getAssociatedTokenAddressSync(
    USDC_MINT,
    merchant
  );

  const transaction = new Transaction().add(
    createAssociatedTokenAccountIdempotentInstruction(
      feePayer.publicKey,
      merchantTokenAccount,
      merchant,
      USDC_MINT
    ),
    createTransferCheckedInstruction(
      getAssociatedTokenAddressSync(USDC_MINT, wallet.publicKey),
      USDC_MINT,
      merchantTokenAccount,
      wallet.publicKey,
      amountInBaseUnits,
      6
    ),
    new TransactionInstruction({
      programId: MEMO_PROGRAM_ID,
      keys: [],
      data: Buffer.from('cs_z_example', 'utf8'),
    })
  );
  if (options.extra) transaction.add(options.extra);

  transaction.feePayer = feePayer.publicKey;
  transaction.recentBlockhash = Keypair.generate().publicKey.toBase58();
  if (feePayer !== wallet) transaction.partialSign(feePayer);

  return transaction
    .serialize({ requireAllSignatures: false })
    .toString('base64');
}

describe('SignCheckoutPayment', () => {
  it('signs a sponsored transfer of the expected amount', () => {
    const signed = SignCheckoutPayment(PrepareTransaction(10_000), wallet, 1);

    const transaction = Transaction.from(Buffer.from(signed, 'base64'));
    expect(transaction.verifySignatures()).toBe(true);
  });

  it('refuses a transfer of a different amount', () => {
    expect(() =>
      SignCheckoutPayment(PrepareTransaction(5_000_000), wallet, 1)
    ).toThrow('Expected a transfer of 1 cents');
  });

  it('refuses a second instruction that needs the wallet to sign', () => {
    const extra = SystemProgram.transfer({
      fromPubkey: wallet.publicKey,
      toPubkey: merchant,
      lamports: 1,
    });

    expect(() =>
      SignCheckoutPayment(PrepareTransaction(10_000, { extra }), wallet, 1)
    ).toThrow('Expected one instruction for the wallet to sign, found 2');
  });

  it('refuses to pay the network fee itself', () => {
    expect(() =>
      SignCheckoutPayment(
        PrepareTransaction(10_000, { feePayer: wallet }),
        wallet,
        1
      )
    ).toThrow('Expected the network fee to be sponsored');
  });
});
