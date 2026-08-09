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
  const signMobileTransaction = jest.fn();
  const signAndSendMobileTransaction = jest.fn();
  const walletService = {
    HasWallet: jest.fn(),
    SupportsMobileWalletAdapter: jest.fn(),
    TransactWithMobileWallet: jest.fn(),
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
    min_context_slot: 90,
  } satisfies CheckoutPaymentTransaction;
  const completedSession = {
    ...checkoutSession,
    status: 'complete',
  } as CheckoutSession;
  let canSignMobileTransaction = false;
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
    walletService.SupportsMobileWalletAdapter.mockReturnValue(false);
    walletService.IsMobileWalletNotFoundError.mockReturnValue(false);
    walletService.GetAddress.mockReturnValue('');
    walletService.Connect.mockResolvedValue(undefined);
    canSignMobileTransaction = false;
    signMobileTransaction.mockResolvedValue(new Uint8Array([4, 5, 6]));
    signAndSendMobileTransaction.mockResolvedValue(new Uint8Array([1, 2, 3]));
    walletService.TransactWithMobileWallet.mockImplementation(
      async (_chain, callback) =>
        callback({
          payerWallet: 'payer-wallet',
          canSignTransaction: canSignMobileTransaction,
          SignUnsignedTransaction: signMobileTransaction,
          SignAndSendUnsignedTransaction: signAndSendMobileTransaction,
        })
    );
    walletService.SignAndSendUnsignedTransaction.mockResolvedValue(
      new Uint8Array([1, 2, 3])
    );
    walletService.SignUnsignedTransaction.mockResolvedValue(
      new Uint8Array([4, 5, 6])
    );
    walletService.BytesToBase64.mockReturnValue('signed-transaction');
    checkoutSessionService.PreparePayment.mockResolvedValue(preparedPayment);
    checkoutSessionService.ConfirmPayment.mockResolvedValue(completedSession);
  });

  afterEach(() => {
    jest.restoreAllMocks();
    jest.clearAllMocks();
  });

  it('requests a wallet-browser handoff when MWA is unavailable', () => {
    jest
      .spyOn(navigator, 'userAgent', 'get')
      .mockReturnValue(
        'Mozilla/5.0 (iPhone; CPU iPhone OS 19_0 like Mac OS X)'
      );
    walletService.HasWallet.mockReturnValue(false);

    expect(component.NeedsMobileWalletHandoff()).toBe(true);
  });

  it('keeps the checkout form when Mobile Wallet Adapter is supported', () => {
    jest
      .spyOn(navigator, 'userAgent', 'get')
      .mockReturnValue('Mozilla/5.0 (Linux; Android 16) Chrome/140 Mobile');
    walletService.HasWallet.mockReturnValue(false);
    walletService.SupportsMobileWalletAdapter.mockReturnValue(true);

    expect(component.NeedsMobileWalletHandoff()).toBe(false);
  });

  it('keeps the existing no-wallet behavior on desktop', () => {
    jest
      .spyOn(navigator, 'userAgent', 'get')
      .mockReturnValue('Mozilla/5.0 (Macintosh; Intel Mac OS X) Chrome/140');
    walletService.HasWallet.mockReturnValue(false);

    expect(component.NeedsMobileWalletHandoff()).toBe(false);
  });

  it('authorizes, prepares, and signs in one mobile wallet session', async () => {
    walletService.HasWallet.mockReturnValue(false);
    walletService.SupportsMobileWalletAdapter.mockReturnValue(true);

    await component.Pay();

    expect(walletService.TransactWithMobileWallet).toHaveBeenCalledTimes(1);
    expect(walletService.TransactWithMobileWallet).toHaveBeenCalledWith(
      'solana:devnet',
      expect.any(Function)
    );
    expect(walletService.Connect).not.toHaveBeenCalled();
    expect(checkoutSessionService.PreparePayment).toHaveBeenCalledTimes(1);
    expect(signAndSendMobileTransaction).toHaveBeenCalledWith(
      preparedPayment.unsigned_transaction,
      preparedPayment.min_context_slot
    );
    expect(checkoutSessionService.ConfirmPayment).toHaveBeenCalledTimes(1);
    expect(component.paymentPhase()).toBe('complete');
  });

  it('relays sponsored MWA transactions when sign-only is supported', async () => {
    walletService.HasWallet.mockReturnValue(false);
    walletService.SupportsMobileWalletAdapter.mockReturnValue(true);
    canSignMobileTransaction = true;
    checkoutSessionService.PreparePayment.mockResolvedValue({
      ...preparedPayment,
      fee_sponsored: true,
    });

    await component.Pay();

    expect(walletService.SignUnsignedTransaction).not.toHaveBeenCalled();
    expect(signMobileTransaction).toHaveBeenCalledWith(
      preparedPayment.unsigned_transaction
    );
    expect(signAndSendMobileTransaction).not.toHaveBeenCalled();
    expect(checkoutSessionService.ConfirmPayment).toHaveBeenCalledWith(
      checkoutSession.url_slug,
      { signed_transaction: 'signed-transaction' }
    );
  });

  it('keeps wallet broadcast as the sponsored MWA fallback', async () => {
    walletService.HasWallet.mockReturnValue(false);
    walletService.SupportsMobileWalletAdapter.mockReturnValue(true);
    checkoutSessionService.PreparePayment.mockResolvedValue({
      ...preparedPayment,
      fee_sponsored: true,
    });

    await component.Pay();

    expect(signMobileTransaction).not.toHaveBeenCalled();
    expect(signAndSendMobileTransaction).toHaveBeenCalledWith(
      preparedPayment.unsigned_transaction,
      preparedPayment.min_context_slot
    );
    expect(checkoutSessionService.ConfirmPayment).toHaveBeenCalledWith(
      checkoutSession.url_slug,
      { signature: expect.any(String) }
    );
  });

  it('keeps sponsored desktop transactions on the existing relay flow', async () => {
    walletService.GetAddress.mockReturnValue('payer-wallet');
    checkoutSessionService.PreparePayment.mockResolvedValue({
      ...preparedPayment,
      fee_sponsored: true,
    });

    await component.Pay();

    expect(walletService.SignUnsignedTransaction).toHaveBeenCalledWith(
      preparedPayment.unsigned_transaction,
      'solana:devnet'
    );
    expect(walletService.SignAndSendUnsignedTransaction).not.toHaveBeenCalled();
    expect(checkoutSessionService.ConfirmPayment).toHaveBeenCalledWith(
      checkoutSession.url_slug,
      { signed_transaction: 'signed-transaction' }
    );
  });

  it('relays both sponsored subscription steps in one mobile session', async () => {
    const subscriptionSession = {
      ...checkoutSession,
      mode: 'subscription',
    } as CheckoutSession;
    const initAuthority = {
      ...preparedPayment,
      unsigned_transaction: 'init-authority',
      fee_sponsored: true,
      subscription_step: 'init_authority' as const,
    };
    const subscribe = {
      ...preparedPayment,
      unsigned_transaction: 'subscribe',
      fee_sponsored: true,
      subscription_step: 'subscribe' as const,
    };
    component.checkoutSession.set(subscriptionSession);
    walletService.HasWallet.mockReturnValue(false);
    walletService.SupportsMobileWalletAdapter.mockReturnValue(true);
    canSignMobileTransaction = true;
    checkoutSessionService.PreparePayment.mockResolvedValueOnce(
      initAuthority
    ).mockResolvedValueOnce(subscribe);
    checkoutSessionService.ConfirmPayment.mockResolvedValueOnce(
      subscriptionSession
    ).mockResolvedValueOnce({
      ...subscriptionSession,
      status: 'complete',
    });

    await component.Pay();

    expect(walletService.TransactWithMobileWallet).toHaveBeenCalledTimes(1);
    expect(signMobileTransaction.mock.calls).toEqual([
      ['init-authority'],
      ['subscribe'],
    ]);
    expect(checkoutSessionService.ConfirmPayment.mock.calls).toEqual([
      [
        subscriptionSession.url_slug,
        {
          signed_transaction: 'signed-transaction',
          subscription_step: 'init_authority',
        },
      ],
      [
        subscriptionSession.url_slug,
        {
          signed_transaction: 'signed-transaction',
          subscription_step: 'subscribe',
        },
      ],
    ]);
    expect(component.paymentPhase()).toBe('complete');
  });

  it('shows wallet-browser choices when MWA cannot find a wallet', async () => {
    jest
      .spyOn(navigator, 'userAgent', 'get')
      .mockReturnValue('Mozilla/5.0 (Linux; Android 16) Chrome/140 Mobile');
    walletService.HasWallet.mockReturnValue(false);
    walletService.SupportsMobileWalletAdapter.mockReturnValue(true);
    walletService.IsMobileWalletNotFoundError.mockReturnValue(true);
    walletService.TransactWithMobileWallet.mockRejectedValue({
      code: 'ERROR_WALLET_NOT_FOUND',
    });

    await component.Pay();

    expect(component.mobileWalletHandoffRequested()).toBe(true);
    expect(component.NeedsMobileWalletHandoff()).toBe(true);
    expect(component.paymentError()).toBeNull();
  });
});
