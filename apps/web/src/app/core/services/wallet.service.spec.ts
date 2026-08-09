/** @jest-environment node */

import { Keypair, SystemProgram, Transaction } from '@solana/web3.js';
import bs58 from 'bs58';
import { SolanaWalletService } from './wallet.service';

const mockTransact = jest.fn();

jest.mock('@solana-mobile/mobile-wallet-adapter-protocol', () => ({
  transact: (...args: unknown[]) => mockTransact(...args),
}));

describe('SolanaWalletService local key signing', () => {
  let service: SolanaWalletService;

  beforeEach(() => {
    mockTransact.mockReset();
    service = new SolanaWalletService();
  });

  afterEach(() => {
    delete (globalThis as { window?: unknown }).window;
  });

  it('derives the signer address from a base58 private key', async () => {
    const keypair = Keypair.generate();

    await expect(
      service.GetSecretKeyAddress(bs58.encode(keypair.secretKey))
    ).resolves.toBe(keypair.publicKey.toBase58());
  });

  it('rejects malformed private keys', async () => {
    await expect(service.GetSecretKeyAddress('not a key')).rejects.toThrow(
      'Invalid base58 Solana private key'
    );
  });

  it('identifies Mobile Wallet Adapter errors through wrapped causes', () => {
    const walletError = Object.assign(new Error('Wallet unavailable'), {
      code: 'ERROR_WALLET_NOT_FOUND',
    });

    expect(
      service.IsMobileWalletNotFoundError(
        Object.assign(new Error('Could not connect'), { cause: walletError })
      )
    ).toBe(true);
  });

  it('falls back to broadcast when mobile capabilities are unavailable', async () => {
    const payer = Keypair.generate();
    const signature = new Uint8Array([1, 2, 3]);
    const authorize = jest.fn().mockResolvedValue({
      accounts: [
        {
          address: Buffer.from(payer.publicKey.toBytes()).toString('base64'),
        },
      ],
    });
    const signAndSendTransactions = jest.fn().mockResolvedValue({
      signatures: [Buffer.from(signature).toString('base64')],
    });
    const getCapabilities = jest
      .fn()
      .mockRejectedValue(new Error('Unsupported method'));
    mockTransact.mockImplementation(async (callback) =>
      callback({ authorize, getCapabilities, signAndSendTransactions })
    );
    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      value: { location: { origin: 'https://buy.zoneless.com' } },
    });

    const result = await service.TransactWithMobileWallet(
      'solana:mainnet',
      (session) => {
        expect(session.payerWallet).toBe(payer.publicKey.toBase58());
        expect(session.canSignTransaction).toBe(false);
        return session.SignAndSendUnsignedTransaction('transaction', 90);
      }
    );

    expect(result).toEqual(signature);
    expect(authorize).toHaveBeenCalledWith({
      chain: 'solana:mainnet',
      identity: {
        name: 'Zoneless',
        uri: 'https://buy.zoneless.com',
        icon: 'assets/favicon/favicon-32x32.png',
      },
    });
    expect(signAndSendTransactions).toHaveBeenCalledWith({
      payloads: ['transaction'],
      options: { min_context_slot: 90 },
    });
  });

  it('uses sign-only when the mobile wallet advertises support', async () => {
    const payer = Keypair.generate();
    const signedTransaction = new Uint8Array([4, 5, 6]);
    const authorize = jest.fn().mockResolvedValue({
      accounts: [
        {
          address: Buffer.from(payer.publicKey.toBytes()).toString('base64'),
        },
      ],
    });
    const getCapabilities = jest.fn().mockResolvedValue({
      features: ['solana:signTransactions'],
    });
    const signTransactions = jest.fn().mockResolvedValue({
      signed_payloads: [Buffer.from(signedTransaction).toString('base64')],
    });
    mockTransact.mockImplementation(async (callback) =>
      callback({ authorize, getCapabilities, signTransactions })
    );
    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      value: { location: { origin: 'https://buy.zoneless.com' } },
    });

    const result = await service.TransactWithMobileWallet(
      'solana:mainnet',
      (session) => {
        expect(session.canSignTransaction).toBe(true);
        return session.SignUnsignedTransaction('transaction');
      }
    );

    expect(result).toEqual(signedTransaction);
    expect(signTransactions).toHaveBeenCalledWith({
      payloads: ['transaction'],
    });
  });

  it('signs a payout transaction with the matching private key', async () => {
    const signer = Keypair.generate();
    const recipient = Keypair.generate().publicKey;
    const transaction = new Transaction({
      feePayer: signer.publicKey,
      recentBlockhash: Keypair.generate().publicKey.toBase58(),
    }).add(
      SystemProgram.transfer({
        fromPubkey: signer.publicKey,
        toPubkey: recipient,
        lamports: 1,
      })
    );
    const unsignedTransaction = transaction
      .serialize({ requireAllSignatures: false })
      .toString('base64');

    const signedBytes = await service.SignUnsignedTransactionWithSecretKey(
      unsignedTransaction,
      bs58.encode(signer.secretKey),
      signer.publicKey.toBase58()
    );
    const signedTransaction = Transaction.from(signedBytes);

    expect(signedTransaction.verifySignatures()).toBe(true);
  });

  it('rejects a private key for a different platform wallet', async () => {
    const signer = Keypair.generate();
    const expectedSigner = Keypair.generate();
    const transaction = new Transaction({
      feePayer: expectedSigner.publicKey,
      recentBlockhash: Keypair.generate().publicKey.toBase58(),
    }).add(
      SystemProgram.transfer({
        fromPubkey: expectedSigner.publicKey,
        toPubkey: Keypair.generate().publicKey,
        lamports: 1,
      })
    );
    const unsignedTransaction = transaction
      .serialize({ requireAllSignatures: false })
      .toString('base64');

    await expect(
      service.SignUnsignedTransactionWithSecretKey(
        unsignedTransaction,
        bs58.encode(signer.secretKey),
        expectedSigner.publicKey.toBase58()
      )
    ).rejects.toThrow(
      'Private key does not match the configured platform wallet'
    );
  });
});
