import bs58 from 'bs58';
import { CreateWalletBackup } from './Wallet';

describe('Wallet backup', () => {
  it('exports an SDK-compatible base58 key while preserving base64 backups', () => {
    const secretKey = Buffer.from(
      Array.from({ length: 64 }, (_, index) => index)
    );
    const backup = CreateWalletBackup(
      'wallet-public-key',
      secretKey.toString('base64')
    );

    expect(backup).toEqual({
      publicKey: 'wallet-public-key',
      secretKeyBase58: bs58.encode(secretKey),
      secretKeyBase64: secretKey.toString('base64'),
      version: 2,
    });
  });

  it('rejects malformed stored wallet keys', () => {
    expect(() =>
      CreateWalletBackup(
        'wallet-public-key',
        Buffer.alloc(32).toString('base64')
      )
    ).toThrow('The stored wallet key is invalid.');
  });
});
