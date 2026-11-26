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
  createTransferInstruction,
  getAssociatedTokenAddressSync,
} from '@solana/spl-token';
import bs58 from 'bs58';
import {
  LoadWallet,
  SignCheckoutPayment,
  SignPayout,
  USDC_MINT,
} from './Wallet';

const MEMO_PROGRAM_ID = new PublicKey(
  'MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr'
);

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

describe('LoadWallet', () => {
  const expected = wallet.publicKey.toBase58();

  it('reads a base58 secret key', () => {
    const key = bs58.encode(wallet.secretKey);

    expect(LoadWallet(key).publicKey.toBase58()).toBe(expected);
  });

  it('reads a hex secret key, with or without a 0x prefix', () => {
    const key = Buffer.from(wallet.secretKey).toString('hex');

    expect(LoadWallet(key).publicKey.toBase58()).toBe(expected);
    expect(LoadWallet(`0x${key}`).publicKey.toBase58()).toBe(expected);
  });

  it('reads the hex seed of a secret key', () => {
    const seed = Buffer.from(wallet.secretKey.slice(0, 32)).toString('hex');

    expect(LoadWallet(seed).publicKey.toBase58()).toBe(expected);
  });
});

describe('SignPayout', () => {
  const platformWallet = Keypair.generate();
  const platformTokenAccount = getAssociatedTokenAddressSync(
    USDC_MINT,
    platformWallet.publicKey
  );
  const payoutTokenAccount = getAssociatedTokenAddressSync(
    USDC_MINT,
    wallet.publicKey
  );

  /** Mirrors the batch payout transaction the API builds. */
  function BuildPayout(...instructions: TransactionInstruction[]): string {
    const transaction = new Transaction().add(...instructions);
    transaction.feePayer = platformWallet.publicKey;
    transaction.recentBlockhash = Keypair.generate().publicKey.toBase58();
    return transaction
      .serialize({ requireAllSignatures: false })
      .toString('base64');
  }

  function Transfer(
    amountInBaseUnits: number,
    destination = payoutTokenAccount
  ): TransactionInstruction {
    return createTransferInstruction(
      platformTokenAccount,
      destination,
      platformWallet.publicKey,
      amountInBaseUnits
    );
  }

  it('signs a one-cent payout to the expected wallet', () => {
    const signed = SignPayout(
      BuildPayout(Transfer(10_000)),
      platformWallet,
      wallet.publicKey,
      1
    );

    const transaction = Transaction.from(Buffer.from(signed, 'base64'));
    expect(transaction.verifySignatures()).toBe(true);
  });

  it("allows creating the payout wallet's token account", () => {
    const createTokenAccount =
      createAssociatedTokenAccountIdempotentInstruction(
        platformWallet.publicKey,
        payoutTokenAccount,
        wallet.publicKey,
        USDC_MINT
      );

    expect(() =>
      SignPayout(
        BuildPayout(createTokenAccount, Transfer(10_000)),
        platformWallet,
        wallet.publicKey,
        1
      )
    ).not.toThrow();
  });

  it('refuses a payout of a different amount', () => {
    expect(() =>
      SignPayout(
        BuildPayout(Transfer(5_000_000)),
        platformWallet,
        wallet.publicKey,
        1
      )
    ).toThrow('Expected a transfer of 1 cents');
  });

  it('refuses a payout to another wallet', () => {
    const elsewhere = getAssociatedTokenAddressSync(USDC_MINT, merchant);

    expect(() =>
      SignPayout(
        BuildPayout(Transfer(10_000, elsewhere)),
        platformWallet,
        wallet.publicKey,
        1
      )
    ).toThrow(
      'Expected a transfer from the platform wallet to the payout wallet'
    );
  });

  it('refuses a second transfer', () => {
    expect(() =>
      SignPayout(
        BuildPayout(Transfer(10_000), Transfer(10_000)),
        platformWallet,
        wallet.publicKey,
        1
      )
    ).toThrow('Expected one transfer, found 2');
  });

  it('refuses any other instruction', () => {
    const sendSol = SystemProgram.transfer({
      fromPubkey: platformWallet.publicKey,
      toPubkey: merchant,
      lamports: 1,
    });

    expect(() =>
      SignPayout(
        BuildPayout(Transfer(10_000), sendSol),
        platformWallet,
        wallet.publicKey,
        1
      )
    ).toThrow();
  });

  it('refuses when another wallet would pay the network fee', () => {
    const transaction = new Transaction().add(Transfer(10_000));
    transaction.feePayer = sponsor.publicKey;
    transaction.recentBlockhash = Keypair.generate().publicKey.toBase58();
    const unsigned = transaction
      .serialize({ requireAllSignatures: false })
      .toString('base64');

    expect(() =>
      SignPayout(unsigned, platformWallet, wallet.publicKey, 1)
    ).toThrow('Expected the platform wallet to pay the network fee');
  });
});
