import { Injectable, signal, WritableSignal } from '@angular/core';
import { getWallets } from '@wallet-standard/app';
import type { Wallet, WalletAccount } from '@wallet-standard/base';

type ConnectFeature = {
  connect: () => Promise<{ accounts: readonly WalletAccount[] }>;
};

type DisconnectFeature = {
  disconnect: () => Promise<void>;
};

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
      if (!this.wallet()) this.wallet.set(nextWallet);
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

  GetAddress(): string {
    const connectedAccount = this.account();
    if (!connectedAccount) return '';
    return connectedAccount.address;
  }

  async SignAndSendUnsignedTransaction(
    unsignedTxBase64: string,
    chain: 'solana:devnet' | 'solana:mainnet' = 'solana:devnet'
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
    });
    return result[0].signature;
  }

  /**
   * Sign a (possibly partially signed) transaction without broadcasting.
   * Used for fee-payer-sponsored subscribe txs that the API relays.
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

  BytesToBase64(bytes: Uint8Array): string {
    let binary = '';
    for (let i = 0; i < bytes.length; i += 1) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
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
