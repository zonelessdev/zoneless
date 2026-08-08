import { bootstrapApplication } from '@angular/platform-browser';
import { appConfig } from './app/app.config';
import { AppComponent } from './app/app.component';

async function RegisterMobileWalletAdapter(): Promise<void> {
  if (!/Android/i.test(navigator.userAgent)) return;

  const { getWallets } = await import('@wallet-standard/app');
  if (getWallets().get().length > 0) return;

  const {
    createDefaultAuthorizationCache,
    createDefaultChainSelector,
    registerMwa,
  } = await import('@solana-mobile/wallet-standard-mobile');

  registerMwa({
    appIdentity: {
      name: 'Zoneless',
      uri: window.location.origin,
      icon: 'assets/favicon/favicon-32x32.png',
    },
    authorizationCache: createDefaultAuthorizationCache(),
    chains: ['solana:devnet', 'solana:mainnet'],
    chainSelector: createDefaultChainSelector(),
    onWalletNotFound: () => Promise.resolve(),
  });
}

async function Bootstrap(): Promise<void> {
  try {
    await RegisterMobileWalletAdapter();
  } catch (error) {
    console.warn('Mobile Wallet Adapter registration failed', error);
  }
  await bootstrapApplication(AppComponent, appConfig);
}

Bootstrap().catch((error) => console.error(error));
