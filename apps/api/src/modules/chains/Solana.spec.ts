import {
  AccountInfo,
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
} from '@solana/web3.js';
import {
  ACCOUNT_SIZE,
  AccountLayout,
  AccountState,
  TOKEN_PROGRAM_ID,
} from '@solana/spl-token';
import { Solana, ValidateSponsoredCheckoutTransaction } from './Solana';

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

describe('Solana batch payout wallet checks', () => {
  const sender = Keypair.generate().publicKey;
  const recipient = Keypair.generate().publicKey.toBase58();
  const LAMPORTS = 10_000_000;

  function WalletInfo(lamports: number): AccountInfo<Buffer> {
    return {
      data: Buffer.alloc(0),
      executable: false,
      lamports,
      owner: SystemProgram.programId,
    };
  }

  function UsdcInfo(solana: Solana, cents: number): AccountInfo<Buffer> {
    const data = Buffer.alloc(ACCOUNT_SIZE);
    AccountLayout.encode(
      {
        mint: new PublicKey(solana.GetUSDCMintAddress()),
        owner: sender,
        amount: BigInt(cents) * BigInt(10000),
        delegateOption: 0,
        delegate: PublicKey.default,
        state: AccountState.Initialized,
        isNativeOption: 0,
        isNative: BigInt(0),
        delegatedAmount: BigInt(0),
        closeAuthorityOption: 0,
        closeAuthority: PublicKey.default,
      },
      data
    );
    return {
      data,
      executable: false,
      lamports: 2_039_280,
      owner: TOKEN_PROGRAM_ID,
    };
  }

  /** A Solana whose RPC returns the given sender wallet, sender USDC account and recipient account. */
  function StubSolana(
    walletLamports: number | null,
    usdcCents: number | null,
    recipientExists = true
  ) {
    const solana = new Solana();
    const getMultipleAccountsInfo = jest
      .fn()
      .mockResolvedValue([
        walletLamports === null ? null : WalletInfo(walletLamports),
        usdcCents === null ? null : UsdcInfo(solana, usdcCents),
        recipientExists ? UsdcInfo(solana, 0) : null,
      ]);
    Object.assign(solana.connection, {
      getMultipleAccountsInfo,
      getLatestBlockhash: jest.fn().mockResolvedValue({
        blockhash: Keypair.generate().publicKey.toBase58(),
        lastValidBlockHeight: 100,
      }),
      getFeeForMessage: jest.fn().mockResolvedValue({ value: 5000 }),
    });
    return { solana, getMultipleAccountsInfo };
  }

  const Build = (solana: Solana, destinationAddress = recipient) =>
    solana.BuildBatchPayoutTransaction(sender.toBase58(), [
      { destinationAddress, amountInCents: 5800 },
    ]);

  it('builds with a single account read when the wallet can pay', async () => {
    const { solana, getMultipleAccountsInfo } = StubSolana(LAMPORTS, 5821);

    const result = await Build(solana);

    expect(result.recipients_count).toBe(1);
    expect(getMultipleAccountsInfo).toHaveBeenCalledTimes(1);
  });

  it('rejects a destination that is the platform wallet itself', async () => {
    const { solana, getMultipleAccountsInfo } = StubSolana(LAMPORTS, 5821);

    await expect(Build(solana, sender.toBase58())).rejects.toMatchObject({
      statusCode: 400,
      message: expect.stringContaining('is the platform wallet'),
    });
    expect(getMultipleAccountsInfo).not.toHaveBeenCalled();
  });

  it('rejects when the platform wallet holds too little USDC', async () => {
    const { solana } = StubSolana(LAMPORTS, 1000);

    await expect(Build(solana)).rejects.toMatchObject({
      statusCode: 402,
      type: 'insufficient_funds',
      message: expect.stringContaining(
        'holds 10.00 USDC, but this payout needs 58.00 USDC'
      ),
    });
  });

  it('rejects when the platform wallet has no USDC account', async () => {
    const { solana } = StubSolana(LAMPORTS, null);

    await expect(Build(solana)).rejects.toMatchObject({ statusCode: 402 });
  });

  it('rejects when the platform wallet has no SOL for fees', async () => {
    const { solana } = StubSolana(null, 5821);

    await expect(Build(solana)).rejects.toMatchObject({
      statusCode: 400,
      message: expect.stringContaining('needs at least 0.000005 SOL'),
    });
  });

  it('counts the rent for recipient token accounts it must create', async () => {
    const { solana } = StubSolana(1_000_000, 5821, false);

    await expect(Build(solana)).rejects.toMatchObject({
      message: expect.stringContaining('needs at least 0.00204428 SOL'),
    });
  });
});
