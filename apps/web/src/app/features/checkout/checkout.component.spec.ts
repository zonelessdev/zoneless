import { TestBed } from '@angular/core/testing';
import { ActivatedRoute } from '@angular/router';

import { MetaService, SolanaWalletService } from '../../core';
import { CheckoutSessionService } from '../../data/services/checkout-session.service';
import { CheckoutComponent } from './checkout.component';

describe('CheckoutComponent mobile wallet handoff', () => {
  const walletService = {
    HasWallet: jest.fn(),
  };
  let component: CheckoutComponent;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        {
          provide: ActivatedRoute,
          useValue: { snapshot: { paramMap: { get: () => null } } },
        },
        { provide: CheckoutSessionService, useValue: {} },
        { provide: MetaService, useValue: {} },
        { provide: SolanaWalletService, useValue: walletService },
      ],
    });
    component = TestBed.runInInjectionContext(() => new CheckoutComponent());
  });

  afterEach(() => {
    jest.restoreAllMocks();
    walletService.HasWallet.mockReset();
  });

  it('requests a wallet-browser handoff on mobile without a wallet', () => {
    jest
      .spyOn(navigator, 'userAgent', 'get')
      .mockReturnValue('Mozilla/5.0 (Linux; Android 16) Chrome/140 Mobile');
    walletService.HasWallet.mockReturnValue(false);

    expect(component.NeedsMobileWalletHandoff()).toBe(true);
  });

  it('keeps the checkout form when Mobile Wallet Adapter is available', () => {
    jest
      .spyOn(navigator, 'userAgent', 'get')
      .mockReturnValue('Mozilla/5.0 (Linux; Android 16) Chrome/140 Mobile');
    walletService.HasWallet.mockReturnValue(true);

    expect(component.NeedsMobileWalletHandoff()).toBe(false);
  });

  it('keeps the existing no-wallet behavior on desktop', () => {
    jest
      .spyOn(navigator, 'userAgent', 'get')
      .mockReturnValue('Mozilla/5.0 (Macintosh; Intel Mac OS X) Chrome/140');
    walletService.HasWallet.mockReturnValue(false);

    expect(component.NeedsMobileWalletHandoff()).toBe(false);
  });
});
