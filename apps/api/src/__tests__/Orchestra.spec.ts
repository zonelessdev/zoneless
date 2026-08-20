import { CheckoutPaymentModule } from '../modules/CheckoutPayment';
import { CheckoutSessionModule } from '../modules/CheckoutSession';
import { ChargeModule } from '../modules/Charge';
import { Database } from '../modules/Database';
import { EventService } from '../modules/EventService';
import { ExternalWalletModule } from '../modules/ExternalWallet';
import { PaymentIntentModule } from '../modules/PaymentIntent';
import { ProductModule } from '../modules/Product';
import { OrchestraClient } from '../modules/orchestra/OrchestraClient';
import { OrchestraModule } from '../modules/orchestra/OrchestraModule';
import {
  CentsToFiatUsd,
  CentsToUsdcSmallest,
  IsNativeSolanaUsdc,
  UsdcSmallestToCents,
} from '../modules/orchestra/OrchestraRails';
import {
  CheckoutSession,
  CheckoutSessionLineItem,
  ExternalWallet,
  Payout,
  Price,
} from '@zoneless/shared-types';
import {
  CreateMockDatabase,
  DeterministicId,
  DeterministicUrlSlug,
  GetFixedTimestamp,
  ResetIdCounter,
} from './Setup';

jest.mock('../modules/Database');
jest.mock('../utils/IdGenerator', () => ({
  GenerateId: jest.fn((prefix: string) => DeterministicId(prefix)),
  GenerateUrlSlug: jest.fn(() => DeterministicUrlSlug()),
}));
jest.mock('../utils/Timestamp', () => ({
  Now: jest.fn(() => GetFixedTimestamp()),
}));
jest.mock('../modules/AppConfig', () => ({
  GetAppConfig: jest.fn(() => ({
    dashboardUrl: 'http://localhost:4200',
    checkoutUrl: 'http://localhost:4200',
    paymentLinkUrl: 'http://localhost:4200',
    livemode: false,
    appSecret: 'test-secret',
    settlement_rail: 'simulated',
    orchestraApiUrl: '',
    orchestraApiKey: '',
  })),
  IsCheckoutFeeSponsored: jest.fn(() => false),
  IsOrchestraLive: jest.fn(() => false),
}));

function BuildPrice(overrides: Partial<Price> = {}): Price {
  return {
    id: 'price_z_1',
    active: true,
    currency: 'usdc',
    metadata: {},
    nickname: null,
    product: 'prod_z_1',
    recurring: null,
    tax_behavior: 'unspecified',
    type: 'one_time',
    unit_amount: 1000,
    object: 'price',
    billing_scheme: 'per_unit',
    currency_options: null,
    created: 1700000000,
    custom_unit_amount: null,
    livemode: false,
    lookup_key: null,
    tiers: null,
    tiers_mode: null,
    transform_quantity: null,
    unit_amount_decimal: '1000',
    platform_account: 'acct_z_platform',
    subscription_plan_pda: null,
    ...overrides,
  };
}

function BuildLineItem(
  overrides: Partial<CheckoutSessionLineItem> = {}
): CheckoutSessionLineItem {
  return {
    id: 'li_z_1',
    object: 'item',
    amount_discount: 0,
    amount_subtotal: 1000,
    amount_tax: 0,
    amount_total: 1000,
    currency: 'usdc',
    description: 'Test Product',
    discounts: null,
    metadata: {},
    price: BuildPrice(),
    quantity: 1,
    taxes: null,
    ...overrides,
  };
}

describe('Orchestra', () => {
  let mockDb: jest.Mocked<Database>;
  let checkoutSessionModule: CheckoutSessionModule;
  let checkoutPaymentModule: CheckoutPaymentModule;
  let orchestraModule: OrchestraModule;
  let mockExternalWalletModule: jest.Mocked<
    Pick<ExternalWalletModule, 'GetDefaultWallet' | 'GetExternalWallet'>
  >;

  const platformWallet = {
    id: 'ew_z_platform',
    object: 'wallet' as const,
    account: 'acct_z_platform',
    wallet_address: 'MerchantWallet111111111111111111111111111',
    network: 'solana',
    currency: 'usdc',
    default_for_currency: true,
    status: 'verified' as const,
    created: 1700000000,
    metadata: {},
    platform_account: 'acct_z_platform',
  } as unknown as ExternalWallet;

  beforeEach(() => {
    jest.clearAllMocks();
    ResetIdCounter();
    mockDb = CreateMockDatabase();

    const eventService = {
      Emit: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<EventService>;
    const productModule = new ProductModule(mockDb);
    const paymentIntentModule = new PaymentIntentModule(mockDb, eventService);
    const chargeModule = new ChargeModule(mockDb, eventService);
    checkoutSessionModule = new CheckoutSessionModule(
      mockDb,
      eventService,
      undefined,
      productModule,
      undefined,
      paymentIntentModule
    );

    mockExternalWalletModule = {
      GetDefaultWallet: jest.fn().mockResolvedValue(platformWallet),
      GetExternalWallet: jest.fn().mockResolvedValue(platformWallet),
    };

    checkoutPaymentModule = new CheckoutPaymentModule(
      mockDb,
      checkoutSessionModule,
      mockExternalWalletModule as unknown as ExternalWalletModule,
      productModule,
      paymentIntentModule,
      chargeModule
    );

    orchestraModule = new OrchestraModule(
      mockDb,
      checkoutSessionModule,
      mockExternalWalletModule as unknown as ExternalWalletModule,
      checkoutPaymentModule
    );
  });

  function BuildOpenSession(
    overrides: Partial<CheckoutSession> = {}
  ): CheckoutSession {
    return {
      ...checkoutSessionModule.CheckoutSessionObject(
        'acct_z_platform',
        { mode: 'payment', success_url: 'https://example.com/success' },
        [BuildLineItem()]
      ),
      payment_intent: 'pi_z_1',
      ...overrides,
    };
  }

  describe('Cents conversion', () => {
    it('converts cents to 6-decimal USDC units', () => {
      expect(CentsToUsdcSmallest(1000)).toBe('10000000');
      expect(UsdcSmallestToCents('10000000')).toBe(1000);
      expect(CentsToFiatUsd(1000)).toBe('10.00');
      expect(CentsToFiatUsd(1)).toBe('0.01');
    });

    it('floors partial smallest units when converting back to cents', () => {
      expect(UsdcSmallestToCents('10009999')).toBe(1000);
    });
  });

  describe('StartPayin', () => {
    it('starts a simulated Cash App intent with a cash_app_url', async () => {
      const session = BuildOpenSession();
      jest
        .spyOn(checkoutSessionModule, 'GetCheckoutSessionByUrlSlug')
        .mockResolvedValue(session);

      const result = await orchestraModule.StartPayin(session.url_slug, {
        method: 'cashapp',
      });

      expect(result.object).toBe('orchestra_payin');
      expect(result.checkout_session.id).toBe(session.id);
      expect(result.checkout_session.orchestra?.method).toBe('cashapp');
      expect(result.intent.method).toBe('cashapp');
      expect(result.intent.cash_app_url).toBe(
        `https://cash.app/launch/lightning/sim-${session.id}`
      );
      expect(result.intent.deposit_address).toBe('lnbc1sim');
      expect(result.intent.status).toBe('awaiting_deposit');
      expect(mockDb.Update).toHaveBeenCalledWith(
        'CheckoutSessions',
        session.id,
        expect.objectContaining({
          orchestra: expect.objectContaining({
            method: 'cashapp',
            cash_app_url: result.intent.cash_app_url,
          }),
        })
      );
    });

    it('starts a simulated deposit intent with a deposit_address', async () => {
      const session = BuildOpenSession();
      jest
        .spyOn(checkoutSessionModule, 'GetCheckoutSessionByUrlSlug')
        .mockResolvedValue(session);

      const result = await orchestraModule.StartPayin(session.url_slug, {
        method: 'deposit',
        source_chain: 'base',
        source_asset: 'usdc',
      });

      expect(result.intent.method).toBe('deposit');
      expect(result.intent.source_chain).toBe('base');
      expect(result.intent.deposit_address).toBe(
        '0xSimulatedOrchestraDeposit0000000000000001'
      );
      expect(result.intent.amount_in).toBe('10000000');
      expect(result.intent.status).toBe('awaiting_deposit');
    });

    it('rejects subscription mode', async () => {
      const session = BuildOpenSession({ mode: 'subscription' });
      jest
        .spyOn(checkoutSessionModule, 'GetCheckoutSessionByUrlSlug')
        .mockResolvedValue(session);

      await expect(
        orchestraModule.StartPayin(session.url_slug, { method: 'cashapp' })
      ).rejects.toThrow(/payment-mode/);
    });

    it('always destinations to the platform wallet', async () => {
      const session = BuildOpenSession();
      jest
        .spyOn(checkoutSessionModule, 'GetCheckoutSessionByUrlSlug')
        .mockResolvedValue(session);

      await orchestraModule.StartPayin(session.url_slug, {
        method: 'deposit',
        source_chain: 'base',
        source_asset: 'usdc',
      });

      expect(mockExternalWalletModule.GetDefaultWallet).toHaveBeenCalledWith(
        'acct_z_platform'
      );
      expect(mockExternalWalletModule.GetDefaultWallet).toHaveBeenCalledTimes(1);
    });
  });

  describe('ConfirmPayin', () => {
    it('completes a simulated pay-in and records the ledger', async () => {
      const session = BuildOpenSession({
        orchestra: {
          method: 'cashapp',
          source_chain: 'lightning',
          source_asset: 'usd',
          quote_id: null,
          operation_id: null,
          deposit_address: 'lnbc1sim',
          deposit_memo: null,
          cash_app_url: 'https://cash.app/launch/lightning/sim-cs',
          amount_in: '10000000',
          estimated_out: '10000000',
          expires_at: null,
          status: 'awaiting_deposit',
        },
      });
      const completedSession = {
        ...session,
        status: 'complete' as const,
        payment_status: 'paid' as const,
        url: null,
        payment_details: {
          transaction_signature: `orch_sim:${session.id}`,
          payer_wallet: 'orchestra:simulated',
        },
      };

      jest
        .spyOn(checkoutSessionModule, 'GetCheckoutSessionByUrlSlug')
        .mockResolvedValue(session);
      jest
        .spyOn(checkoutSessionModule, 'GetCheckoutSession')
        .mockResolvedValue(completedSession);
      jest
        .spyOn(checkoutSessionModule, 'CompleteCheckoutSession')
        .mockResolvedValue(completedSession);

      mockDb.Get = jest.fn().mockResolvedValue({
        id: 'pi_z_1',
        object: 'payment_intent',
        status: 'requires_payment_method',
        payment_method: null,
        description: session.id,
        metadata: {},
        receipt_email: null,
        application_fee_amount: null,
        transfer_data: null,
        transfer_group: null,
      });
      mockDb.Find = jest.fn().mockResolvedValue([
        {
          id: 'bal_z_1',
          available: [{ amount: 0, currency: 'usdc' }],
          pending: [],
        },
      ]);
      mockDb.Find2Custom = jest.fn().mockResolvedValue([]);

      const result = await orchestraModule.ConfirmPayin(session.url_slug);

      expect(result.status).toBe('complete');
      expect(checkoutSessionModule.CompleteCheckoutSession).toHaveBeenCalledWith(
        session.id,
        {
          transaction_signature: `orch_sim:${session.id}`,
          payer_wallet: 'orchestra:simulated',
        }
      );
      expect(mockDb.Set).toHaveBeenCalledWith(
        'BalanceTransactions',
        expect.any(String),
        expect.objectContaining({
          type: 'payment',
          source: session.id,
          amount: 1000,
        }),
        expect.anything()
      );
    });
  });

  describe('PreparePayout', () => {
    const basePayout = {
      id: 'po_z_1',
      object: 'payout',
      account: 'acct_z_seller',
      platform_account: 'acct_z_platform',
      amount: 2500,
      currency: 'usdc',
      destination: 'wa_z_base',
      status: 'pending',
      metadata: {},
    } as Payout;

    it('prepares a simulated base/usdc payout', async () => {
      mockExternalWalletModule.GetExternalWallet = jest.fn().mockResolvedValue({
        id: 'wa_z_base',
        wallet_address: '0x1111111111111111111111111111111111111111',
        network: 'base',
        currency: 'usdc',
      });

      const intent = await orchestraModule.PreparePayout(
        'acct_z_platform',
        basePayout
      );

      expect(intent).toEqual(
        expect.objectContaining({
          deposit_address: platformWallet.wallet_address,
          destination_chain: 'base',
          destination_asset: 'usdc',
          amount_in: '25000000',
          status: 'awaiting_deposit',
        })
      );
      expect(mockDb.Update).toHaveBeenCalledWith(
        'Payouts',
        'po_z_1',
        expect.objectContaining({
          orchestra: expect.objectContaining({
            destination_chain: 'base',
          }),
        })
      );
    });

    it('returns null for native solana/usdc so the existing path is used', async () => {
      mockExternalWalletModule.GetExternalWallet = jest.fn().mockResolvedValue({
        id: 'wa_z_sol',
        wallet_address: platformWallet.wallet_address,
        network: 'solana',
        currency: 'usdc',
      });

      const intent = await orchestraModule.PreparePayout('acct_z_platform', {
        ...basePayout,
        destination: 'wa_z_sol',
      });

      expect(intent).toBeNull();
      expect(IsNativeSolanaUsdc('solana', 'usdc')).toBe(true);
      expect(mockDb.Update).not.toHaveBeenCalled();
    });

    it('rejects an unknown dest chain', async () => {
      mockExternalWalletModule.GetExternalWallet = jest.fn().mockResolvedValue({
        id: 'wa_z_unknown',
        wallet_address: '0x1111111111111111111111111111111111111111',
        network: 'avalanche',
        currency: 'usdc',
      });

      await expect(
        orchestraModule.PreparePayout('acct_z_platform', {
          ...basePayout,
          destination: 'wa_z_unknown',
        })
      ).rejects.toThrow(/Unsupported Orchestra payout destination/);
    });
  });

  describe('OrchestraClient', () => {
    it('maps fetch failure to 502', async () => {
      const fetchMock = jest.fn().mockRejectedValue(new Error('network down'));
      const originalFetch = global.fetch;
      global.fetch = fetchMock as unknown as typeof fetch;

      const client = new OrchestraClient({
        apiUrl: 'https://orchestra.example',
        apiKey: 'fn_test',
      });

      await expect(
        client.CreateQuote({
          sourceChain: 'base',
          sourceAsset: 'USDC',
          destinationChain: 'solana',
          destinationAsset: 'USDC',
          recipientAddress: platformWallet.wallet_address,
          amount: '10000000',
          amountMode: 'exact_in',
          idempotencyKey: 'zoneless:payin:cs_z_1:base:usdc',
        })
      ).rejects.toMatchObject({
        message: 'Orchestra is unavailable',
        statusCode: 502,
      });

      global.fetch = originalFetch;
    });

    it('posts amountFiatUsd as a decimal string and polls /status', async () => {
      const fetchMock = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          orderId: 'ord_1',
          quoteId: 'q_1',
          status: 'completed',
          sourceAddress: '0xpayer',
        }),
      });
      const originalFetch = global.fetch;
      global.fetch = fetchMock as unknown as typeof fetch;

      const client = new OrchestraClient({
        apiUrl: 'https://orchestra.example',
        apiKey: 'fn_test',
      });

      await client.CreateOnramp({
        destinationChain: 'solana',
        destinationAsset: 'USDC',
        recipientAddress: platformWallet.wallet_address,
        amountFiatUsd: '10.00',
        idempotencyKey: 'zoneless:payin:cs_z_1:cashapp',
      });
      const onrampBody = JSON.parse(
        (fetchMock.mock.calls[0][1] as RequestInit).body as string
      );
      expect(fetchMock.mock.calls[0][0]).toBe(
        'https://orchestra.example/v1/orchestration/onramp'
      );
      expect(onrampBody.amountFiatUsd).toBe('10.00');

      await client.GetOrderStatus({ orderId: 'ord_1' });
      expect(fetchMock.mock.calls[1][0]).toBe(
        'https://orchestra.example/v1/orchestration/status?id=ord_1'
      );

      global.fetch = originalFetch;
    });
  });
});
