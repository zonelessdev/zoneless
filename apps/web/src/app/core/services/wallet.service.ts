import { Injectable, signal, WritableSignal } from '@angular/core';
import { getWallets } from '@wallet-standard/app';
import type { Wallet, WalletAccount } from '@wallet-standard/base';

type ConnectFeature = {
  connect: () => Promise<{ accounts: readonly WalletAccount[] }>;
};

type DisconnectFeature = {
  disconnect: () => Promise<void>;
};

const MOBILE_WALLET_ADAPTER_NAME = 'Mobile Wallet Adapter';

@Injectable({ providedIn: 'root' })
export class SolanaWalletService {
  private readonly walletStore = getWallets();

  wallet: WritableSignal<Wallet | null> = signal(null);
  account: WritableSignal<WalletAccount | null> = signal(null);

  constructor() {
    // Auto-pick first discovered wallet
    const discoveredWallet = this.walletStore.get()[0] ?? null;
    this.wallet.set(discoveredWallet);

    this.walletStore.on('register', (nextWallet) => {
      const selectedWallet = this.wallet();
      if (
        !selectedWallet ||
        selectedWallet.name === MOBILE_WALLET_ADAPTER_NAME
      ) {
        this.wallet.set(nextWallet);
      }
    });
  }

  async Connect(): Promise<void> {
    const selectedWallet = this.wallet();
    if (!selectedWallet) throw new Error('No wallet found');

    const connectFeature = selectedWallet.features['standard:connect'] as
      | ConnectFeature
      | undefined;
    if (!connectFeature) throw new Error('Wallet does not support connect');

    const connected = await connectFeature.connect();
    const connectedAccount = connected.accounts?.[0] ?? null;
    this.account.set(connectedAccount);
  }

  async Disconnect(): Promise<void> {
    const selectedWallet = this.wallet();
    const disconnectFeature = selectedWallet?.features[
      'standard:disconnect'
    ] as DisconnectFeature | undefined;
    if (disconnectFeature) await disconnectFeature.disconnect();
    this.account.set(null);
  }

  HasWallet(): boolean {
    return this.wallet() !== null;
  }

  IsMobileWalletAdapter(): boolean {
    return this.wallet()?.name === MOBILE_WALLET_ADAPTER_NAME;
  }

  IsMobileWalletNotFoundError(error: unknown): boolean {
    if (!this.IsMobileWalletAdapter()) return false;

    let currentError: unknown = error;
    for (let depth = 0; depth < 4; depth += 1) {
      if (!currentError || typeof currentError !== 'object') return false;
      const errorWithCause = currentError as {
        code?: unknown;
        message?: unknown;
        cause?: unknown;
      };
      if (errorWithCause.code === 'ERROR_WALLET_NOT_FOUND') return true;
      if (
        typeof errorWithCause.message === 'string' &&
        /can't find a wallet|no installed wallet|wallet not found|supports the mobile wallet protocol/i.test(
          errorWithCause.message
        )
      ) {
        return true;
      }
      currentError = errorWithCause.cause;
    }
    return false;
  }

  GetAddress(): string {
    const connectedAccount = this.account();
    if (!connectedAccount) return '';
    return connectedAccount.address;
  }

  async SignAndSendUnsignedTransaction(
    unsignedTxBase64: string,
    chain: 'solana:devnet' | 'solana:mainnet' = 'solana:devnet',
    minContextSlot?: number
  ): Promise<Uint8Array> {
    const selectedWallet = this.wallet();
    const connectedAccount = this.account();
    if (!selectedWallet || !connectedAccount) {
      throw new Error('Connect wallet first');
    }
    const feature = selectedWallet.features['solana:signAndSendTransaction'] as
      | {
          signAndSendTransaction: (input: {
            account: WalletAccount;
            transaction: Uint8Array;
            chain?: string;
            options?: { minContextSlot?: number };
          }) => Promise<readonly { signature: Uint8Array }[]>;
        }
      | undefined;
    if (!feature) {
      throw new Error('Wallet does not support solana:signAndSendTransaction');
    }
    const transactionBytes = this.Base64ToBytes(unsignedTxBase64);
    const result = await feature.signAndSendTransaction({
      account: connectedAccount,
      transaction: transactionBytes,
      chain,
      ...(minContextSlot === undefined ? {} : { options: { minContextSlot } }),
    });
    return result[0].signature;
  }

  /**
   * Sign a (possibly partially signed) transaction without broadcasting.
   * Used when the API is responsible for relaying the signed transaction.
   */
  async SignUnsignedTransaction(
    unsignedTxBase64: string,
    chain: 'solana:devnet' | 'solana:mainnet' = 'solana:devnet'
  ): Promise<Uint8Array> {
    const selectedWallet = this.wallet();
    const connectedAccount = this.account();
    if (!selectedWallet || !connectedAccount) {
      throw new Error('Connect wallet first');
    }
    const feature = selectedWallet.features['solana:signTransaction'] as
      | {
          signTransaction: (input: {
            account: WalletAccount;
            transaction: Uint8Array;
            chain?: string;
          }) => Promise<readonly { signedTransaction: Uint8Array }[]>;
        }
      | undefined;
    if (!feature) {
      throw new Error('Wallet does not support solana:signTransaction');
    }
    const transactionBytes = this.Base64ToBytes(unsignedTxBase64);
    const result = await feature.signTransaction({
      account: connectedAccount,
      transaction: transactionBytes,
      chain,
    });
    return result[0].signedTransaction;
  }

  async GetSecretKeyAddress(secretKey: string): Promise<string> {
    const decodedSecret = await this.DecodeSecretKey(secretKey);
    try {
      const { Keypair } = await import('@solana/web3.js');
      return Keypair.fromSecretKey(decodedSecret).publicKey.toBase58();
    } catch {
      throw new Error('Invalid Solana private key');
    } finally {
      decodedSecret.fill(0);
    }
  }

  async SignUnsignedTransactionWithSecretKey(
    unsignedTxBase64: string,
    secretKey: string,
    expectedSigner: string
  ): Promise<Uint8Array> {
    const decodedSecret = await this.DecodeSecretKey(secretKey);
    let keypair: import('@solana/web3.js').Keypair | null = null;

    try {
      const { Keypair, Transaction } = await import('@solana/web3.js');
      keypair = Keypair.fromSecretKey(decodedSecret);
      const signerAddress = keypair.publicKey.toBase58();
      if (signerAddress !== expectedSigner) {
        throw new Error(
          'Private key does not match the configured platform wallet'
        );
      }

      const transaction = Transaction.from(
        this.Base64ToBytes(unsignedTxBase64)
      );
      if (transaction.feePayer?.toBase58() !== expectedSigner) {
        throw new Error(
          'Payout transaction does not match the configured platform wallet'
        );
      }

      const requiresSigner = transaction.signatures.some(
        ({ publicKey }) => publicKey.toBase58() === expectedSigner
      );
      if (!requiresSigner) {
        throw new Error('Platform wallet is not a required payout signer');
      }

      transaction.sign(keypair);
      return new Uint8Array(transaction.serialize());
    } catch (error) {
      if (error instanceof Error) throw error;
      throw new Error('Failed to sign payout transaction');
    } finally {
      decodedSecret.fill(0);
      keypair?.secretKey.fill(0);
    }
  }

  BytesToBase64(bytes: Uint8Array): string {
    let binary = '';
    for (let i = 0; i < bytes.length; i += 1) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  }

  private async DecodeSecretKey(secretKey: string): Promise<Uint8Array> {
    try {
      const bs58 = await import('bs58');
      return bs58.default.decode(secretKey.trim());
    } catch {
      throw new Error('Invalid base58 Solana private key');
    }
  }

  private Base64ToBytes(base64: string): Uint8Array {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
  }
}
