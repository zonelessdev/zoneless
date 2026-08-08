import { TestBed } from '@angular/core/testing';
import { ActivatedRoute } from '@angular/router';
import { CheckoutSession } from '@zoneless/shared-types';

import { MetaService, SolanaWalletService } from '../../core';
import {
  CheckoutPaymentTransaction,
  CheckoutSessionService,
} from '../../data/services/checkout-session.service';
import { CheckoutComponent } from './checkout.component';

describe('CheckoutComponent mobile wallet handoff', () => {
  const walletService = {
    HasWallet: jest.fn(),
    IsMobileWalletAdapter: jest.fn(),
    IsMobileWalletNotFoundError: jest.fn(),
    GetAddress: jest.fn(),
    Connect: jest.fn(),
    SignAndSendUnsignedTransaction: jest.fn(),
    SignUnsignedTransaction: jest.fn(),
    BytesToBase64: jest.fn(),
  };
  const checkoutSessionService = {
    PreparePayment: jest.fn(),
    ConfirmPayment: jest.fn(),
  };
  const checkoutSession = {
    id: 'cs_test',
    url_slug: 'test-session',
    mode: 'payment',
    status: 'open',
    livemode: false,
    amount_total: 100,
    amount_subtotal: 100,
    currency: 'usdc',
    line_items: [],
  } as unknown as CheckoutSession;
  const preparedPayment = {
    object: 'checkout.payment_transaction',
    checkout_session: 'cs_test',
    amount_total: 100,
    currency: 'usdc',
    merchant_wallet_address: 'merchant',
    unsigned_transaction: 'dGVzdA==',
    estimated_fee_lamports: 5000,
    blockhash: 'blockhash',
    last_valid_block_height: 100,
  } satisfies CheckoutPaymentTransaction;
  const completedSession = {
    ...checkoutSession,
    status: 'complete',
  } as CheckoutSession;
  let component: CheckoutComponent;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        {
          provide: ActivatedRoute,
          useValue: { snapshot: { paramMap: { get: () => null } } },
        },
        { provide: CheckoutSessionService, useValue: checkoutSessionService },
        { provide: MetaService, useValue: {} },
        { provide: SolanaWalletService, useValue: walletService },
      ],
    });
    component = TestBed.runInInjectionContext(() => new CheckoutComponent());
    component.checkoutSession.set(checkoutSession);
    component.email = 'payer@example.com';
    walletService.HasWallet.mockReturnValue(true);
    walletService.IsMobileWalletAdapter.mockReturnValue(false);
    walletService.IsMobileWalletNotFoundError.mockReturnValue(false);
    walletService.GetAddress.mockReturnValue('');
    walletService.Connect.mockResolvedValue(undefined);
    walletService.SignAndSendUnsignedTransaction.mockResolvedValue(
      new Uint8Array([1, 2, 3])
    );
    checkoutSessionService.PreparePayment.mockResolvedValue(preparedPayment);
    checkoutSessionService.ConfirmPayment.mockResolvedValue(completedSession);
  });

  afterEach(() => {
    jest.restoreAllMocks();
    jest.clearAllMocks();
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

  it('separates MWA connection and signing into explicit user actions', async () => {
    walletService.IsMobileWalletAdapter.mockReturnValue(true);
    walletService.Connect.mockImplementation(async () => {
      walletService.GetAddress.mockReturnValue('payer-wallet');
    });

    await component.Pay();

    expect(walletService.Connect).toHaveBeenCalledTimes(1);
    expect(checkoutSessionService.PreparePayment).toHaveBeenCalledTimes(1);
    expect(walletService.SignAndSendUnsignedTransaction).not.toHaveBeenCalled();
    expect(component.paymentPhase()).toBe('ready_to_sign');
    expect(component.SubmitLabel()).toBe('Confirm payment');

    await component.Pay();

    expect(walletService.SignAndSendUnsignedTransaction).toHaveBeenCalledWith(
      preparedPayment.unsigned_transaction,
      'solana:devnet'
    );
    expect(checkoutSessionService.ConfirmPayment).toHaveBeenCalledTimes(1);
    expect(component.paymentPhase()).toBe('complete');
  });

  it('shows wallet-browser choices when MWA cannot find a wallet', async () => {
    jest
      .spyOn(navigator, 'userAgent', 'get')
      .mockReturnValue('Mozilla/5.0 (Linux; Android 16) Chrome/140 Mobile');
    walletService.IsMobileWalletAdapter.mockReturnValue(true);
    walletService.IsMobileWalletNotFoundError.mockReturnValue(true);
    walletService.Connect.mockRejectedValue({
      code: 'ERROR_WALLET_NOT_FOUND',
    });

    await component.Pay();

    expect(component.mobileWalletHandoffRequested()).toBe(true);
    expect(component.NeedsMobileWalletHandoff()).toBe(true);
    expect(component.paymentError()).toBeNull();
  });
});
