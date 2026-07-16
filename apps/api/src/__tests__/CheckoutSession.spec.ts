import { CheckoutSessionModule } from '../modules/CheckoutSession';
import { Database } from '../modules/Database';
import {
  CheckoutSession,
  CheckoutSessionLineItem,
  Price,
  Product,
} from '@zoneless/shared-types';
import { EventService } from '../modules/EventService';
import { PriceModule } from '../modules/Price';
import { ProductModule } from '../modules/Product';
import { CustomerModule } from '../modules/Customer';
import { PaymentIntentModule } from '../modules/PaymentIntent';
import { ListHelper } from '../utils/ListHelper';
import {
  CreateMockDatabase,
  DeterministicId,
  DeterministicUrlSlug,
  ResetIdCounter,
  GetFixedTimestamp,
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
  })),
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

describe('CheckoutSessionModule', () => {
  let module: CheckoutSessionModule;
  let mockDb: jest.Mocked<Database>;
  let eventService: jest.Mocked<EventService>;
  let paymentIntentModule: PaymentIntentModule;

  beforeEach(() => {
    jest.clearAllMocks();
    ResetIdCounter();
    mockDb = CreateMockDatabase();
    eventService = {
      Emit: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<EventService>;

    const productModule = new ProductModule(mockDb);
    const priceModule = new PriceModule(mockDb, undefined, productModule);
    const customerModule = new CustomerModule(mockDb);
    paymentIntentModule = new PaymentIntentModule(
      mockDb,
      eventService,
      customerModule
    );
    module = new CheckoutSessionModule(
      mockDb,
      eventService,
      priceModule,
      productModule,
      customerModule,
      paymentIntentModule
    );
  });

  function BuildOpenSession(
    lineItems: CheckoutSessionLineItem[] = [BuildLineItem()]
  ): CheckoutSession {
    return module.CheckoutSessionObject(
      'acct_z_platform',
      { mode: 'payment', success_url: 'https://example.com/success' },
      lineItems
    );
  }

  describe('CheckoutSessionObject', () => {
    it('should create a session with sensible defaults', () => {
      const session = BuildOpenSession();

      expect(session.object).toBe('checkout.session');
      expect(session.platform_account).toBe('acct_z_platform');
      expect(session.mode).toBe('payment');
      expect(session.status).toBe('open');
      expect(session.payment_status).toBe('unpaid');
      expect(session.created).toBe(1700000000);
      expect(session.expires_at).toBe(1700000000 + 24 * 60 * 60);
      expect(session.livemode).toBe(false);

      expect(session.ui_mode).toBe('hosted_page');
      expect(session.url_slug).toBeTruthy();
      expect(session.url).toBe(`http://localhost:4200/c/${session.url_slug}`);
      expect(session.url).not.toContain(session.id);
      expect(session.client_secret).toBeNull();
      expect(session.success_url).toBe('https://example.com/success');
      expect(session.cancel_url).toBeNull();
      expect(session.redirect_on_completion).toBeNull();

      expect(session.currency).toBe('usdc');
      expect(session.amount_subtotal).toBe(1000);
      expect(session.amount_total).toBe(1000);
      expect(session.total_details).toEqual({
        amount_discount: 0,
        amount_shipping: 0,
        amount_tax: 0,
        breakdown: null,
      });

      expect(session.metadata).toEqual({});
      expect(session.payment_method_types).toEqual(['crypto']);
      expect(session.payment_method_collection).toBe('always');
      expect(session.customer_creation).toBe('if_required');
      expect(session.customer).toBeNull();
      expect(session.customer_details).toBeNull();
      expect(session.payment_intent).toBeNull();
      expect(session.subscription).toBeNull();
      expect(session.setup_intent).toBeNull();
      expect(session.invoice).toBeNull();
      expect(session.discounts).toBeNull();
      expect(session.shipping_options).toEqual([]);
      expect(session.custom_fields).toEqual([]);
      expect(session.phone_number_collection).toEqual({ enabled: false });

      expect(session.automatic_tax).toEqual({
        enabled: false,
        liability: null,
        provider: null,
        status: null,
      });
      expect(session.custom_text).toEqual({
        after_submit: null,
        shipping_address: null,
        submit: null,
        terms_of_service_acceptance: null,
      });

      expect(session.line_items).toEqual({
        object: 'list',
        data: [expect.objectContaining({ id: 'li_z_1' })],
        has_more: false,
        url: `/v1/checkout/sessions/${session.id}/line_items`,
      });
    });

    it('should not compute payment amounts in setup mode', () => {
      const session = module.CheckoutSessionObject(
        'acct_z_platform',
        { mode: 'setup', success_url: 'https://example.com/success' },
        []
      );

      expect(session.mode).toBe('setup');
      expect(session.payment_status).toBe('no_payment_required');
      expect(session.amount_subtotal).toBeNull();
      expect(session.amount_total).toBeNull();
      expect(session.total_details).toBeNull();
      expect(session.customer_creation).toBeNull();
      expect(session.currency).toBeNull();
    });

    it('should issue a client_secret instead of a url for embedded sessions', () => {
      const session = module.CheckoutSessionObject(
        'acct_z_platform',
        {
          mode: 'payment',
          ui_mode: 'embedded_page',
          return_url: 'https://example.com/return',
        },
        [BuildLineItem()]
      );

      expect(session.url).toBeNull();
      expect(session.client_secret).toContain(`${session.id}_secret`);
      expect(session.redirect_on_completion).toBe('always');
      expect(session.return_url).toBe('https://example.com/return');
    });

    it('should map custom fields, filling unset values with null', () => {
      const session = module.CheckoutSessionObject(
        'acct_z_platform',
        {
          mode: 'payment',
          success_url: 'https://example.com/success',
          custom_fields: [
            {
              key: 'engraving',
              label: { custom: 'Engraving', type: 'custom' },
              type: 'text',
              text: { maximum_length: 20 },
            },
          ],
        },
        [BuildLineItem()]
      );

      expect(session.custom_fields).toEqual([
        {
          dropdown: null,
          key: 'engraving',
          label: { custom: 'Engraving', type: 'custom' },
          numeric: null,
          optional: false,
          text: {
            default_value: null,
            maximum_length: 20,
            minimum_length: null,
            value: null,
          },
          type: 'text',
        },
      ]);
    });
  });

  describe('CreateCheckoutSession', () => {
    it('should resolve line item prices, create a PaymentIntent, and persist the session', async () => {
      mockDb.Get = jest
        .fn()
        .mockImplementation(async (collection: string, id: string) => {
          if (collection === 'Prices' && id === 'price_z_1') {
            return BuildPrice();
          }
          if (collection === 'Products' && id === 'prod_z_1') {
            return { id: 'prod_z_1', name: 'Test Product' } as Product;
          }
          return null;
        });

      const session = await module.CreateCheckoutSession('acct_z_platform', {
        mode: 'payment',
        success_url: 'https://example.com/success',
        line_items: [{ price: 'price_z_1', quantity: 2 }],
      });

      expect(mockDb.Set).toHaveBeenCalledWith(
        'PaymentIntents',
        expect.stringContaining('pi_z'),
        expect.objectContaining({
          object: 'payment_intent',
          amount: 2000,
          currency: 'usdc',
          status: 'requires_payment_method',
          platform_account: 'acct_z_platform',
        })
      );
      expect(mockDb.Set).toHaveBeenCalledWith(
        'CheckoutSessions',
        session.id,
        session
      );
      expect(session.payment_intent).toEqual(expect.stringContaining('pi_z'));
      expect(session.line_items?.data).toEqual([
        expect.objectContaining({
          object: 'item',
          amount_subtotal: 2000,
          amount_total: 2000,
          currency: 'usdc',
          description: 'Test Product',
          quantity: 2,
          price: expect.objectContaining({ id: 'price_z_1' }),
        }),
      ]);
      expect(session.amount_subtotal).toBe(2000);
      expect(session.amount_total).toBe(2000);
      expect(eventService.Emit).toHaveBeenCalledWith(
        'payment_intent.created',
        'acct_z_platform',
        expect.objectContaining({
          id: session.payment_intent,
          amount: 2000,
          status: 'requires_payment_method',
        })
      );
      expect(eventService.Emit).toHaveBeenCalledTimes(1);
    });

    it('should pass payment_intent_data through to the linked PaymentIntent', async () => {
      mockDb.Get = jest
        .fn()
        .mockImplementation(async (collection: string, id: string) => {
          if (collection === 'Prices' && id === 'price_z_1') {
            return BuildPrice();
          }
          if (collection === 'Products' && id === 'prod_z_1') {
            return { id: 'prod_z_1', name: 'Test Product' } as Product;
          }
          return null;
        });

      const session = await module.CreateCheckoutSession('acct_z_platform', {
        mode: 'payment',
        success_url: 'https://example.com/success',
        line_items: [{ price: 'price_z_1', quantity: 1 }],
        payment_intent_data: {
          description: 'Order #42',
          metadata: { order_id: '42' },
          statement_descriptor: 'ZONELESS',
        },
      });

      expect(mockDb.Set).toHaveBeenCalledWith(
        'PaymentIntents',
        session.payment_intent,
        expect.objectContaining({
          description: 'Order #42',
          metadata: { order_id: '42' },
          statement_descriptor: 'ZONELESS',
        })
      );
    });

    it('should not create a PaymentIntent in setup mode', async () => {
      const session = await module.CreateCheckoutSession('acct_z_platform', {
        mode: 'setup',
        success_url: 'https://example.com/success',
      });

      expect(session.payment_intent).toBeNull();
      expect(mockDb.Set).toHaveBeenCalledWith(
        'CheckoutSessions',
        session.id,
        session
      );
      expect(mockDb.Set).not.toHaveBeenCalledWith(
        'PaymentIntents',
        expect.anything(),
        expect.anything()
      );
      expect(eventService.Emit).not.toHaveBeenCalled();
    });

    it('should create an inline price (and product) from price_data', async () => {
      const store = new Map<string, unknown>();
      mockDb.Set = jest
        .fn()
        .mockImplementation(
          async (collection: string, id: string, doc: unknown) => {
            store.set(`${collection}:${id}`, doc);
          }
        );
      mockDb.Get = jest
        .fn()
        .mockImplementation(
          async (collection: string, id: string) =>
            store.get(`${collection}:${id}`) ?? null
        );

      const session = await module.CreateCheckoutSession('acct_z_platform', {
        mode: 'payment',
        success_url: 'https://example.com/success',
        line_items: [
          {
            price_data: {
              currency: 'usdc',
              unit_amount: 2500,
              product_data: { name: 'Inline Product' },
            },
            quantity: 2,
          },
        ],
      });

      expect(mockDb.Set).toHaveBeenCalledWith(
        'Prices',
        expect.stringContaining('price_z'),
        expect.objectContaining({ unit_amount: 2500 })
      );
      expect(mockDb.Set).toHaveBeenCalledWith(
        'Products',
        expect.stringContaining('prod_z'),
        expect.objectContaining({ name: 'Inline Product' })
      );
      expect(session.line_items?.data[0]).toEqual(
        expect.objectContaining({
          amount_subtotal: 5000,
          amount_total: 5000,
          description: 'Inline Product',
        })
      );
    });

    it('should throw when a line item price belongs to another platform', async () => {
      mockDb.Get = jest
        .fn()
        .mockResolvedValue(BuildPrice({ platform_account: 'acct_z_other' }));

      await expect(
        module.CreateCheckoutSession('acct_z_platform', {
          mode: 'payment',
          success_url: 'https://example.com/success',
          line_items: [{ price: 'price_z_1', quantity: 1 }],
        })
      ).rejects.toThrow('Price not found');
      expect(mockDb.Set).not.toHaveBeenCalled();
    });

    it('should throw when the provided customer does not exist', async () => {
      mockDb.Get = jest.fn().mockResolvedValue(null);

      await expect(
        module.CreateCheckoutSession('acct_z_platform', {
          mode: 'payment',
          success_url: 'https://example.com/success',
          customer: 'cus_z_missing',
          line_items: [{ price: 'price_z_1', quantity: 1 }],
        })
      ).rejects.toThrow('Customer not found');
      expect(mockDb.Set).not.toHaveBeenCalled();
    });

    it('should throw a validation error when line_items are missing in payment mode', async () => {
      await expect(
        module.CreateCheckoutSession('acct_z_platform', {
          mode: 'payment',
          success_url: 'https://example.com/success',
        })
      ).rejects.toThrow();
      expect(mockDb.Set).not.toHaveBeenCalled();
    });

    it('should throw a validation error when success_url is missing for hosted sessions', async () => {
      await expect(
        module.CreateCheckoutSession('acct_z_platform', {
          mode: 'payment',
          line_items: [{ price: 'price_z_1', quantity: 1 }],
        })
      ).rejects.toThrow();
      expect(mockDb.Set).not.toHaveBeenCalled();
    });

    it('should allow omitting success_url when creating from a payment link', async () => {
      mockDb.Get = jest
        .fn()
        .mockImplementation(async (collection: string, id: string) => {
          if (collection === 'Prices' && id === 'price_z_1') {
            return BuildPrice();
          }
          if (collection === 'Products' && id === 'prod_z_1') {
            return { id: 'prod_z_1', name: 'Test Product' } as Product;
          }
          return null;
        });

      const session = await module.CreateCheckoutSession(
        'acct_z_platform',
        {
          mode: 'payment',
          line_items: [{ price: 'price_z_1', quantity: 1 }],
          ui_mode: 'hosted_page',
        },
        { payment_link: 'plink_z_1' }
      );

      expect(session.success_url).toBeNull();
      expect(session.payment_link).toBe('plink_z_1');
      expect(mockDb.Set).toHaveBeenCalledWith(
        'CheckoutSessions',
        session.id,
        expect.objectContaining({
          success_url: null,
          payment_link: 'plink_z_1',
        })
      );
    });
  });

  describe('UpdateCheckoutSession', () => {
    it('should update session metadata', async () => {
      const existingSession = BuildOpenSession();
      const updatedSession = {
        ...existingSession,
        metadata: { order_id: '12345' },
      };
      mockDb.Get = jest
        .fn()
        .mockResolvedValueOnce(existingSession)
        .mockResolvedValueOnce(updatedSession);

      const result = await module.UpdateCheckoutSession(existingSession.id, {
        metadata: { order_id: '12345' },
      });

      expect(mockDb.Update).toHaveBeenCalledWith(
        'CheckoutSessions',
        existingSession.id,
        expect.objectContaining({ metadata: { order_id: '12345' } })
      );
      expect(result).toEqual(updatedSession);
    });

    it('should throw when session not found', async () => {
      mockDb.Get = jest.fn().mockResolvedValue(null);

      await expect(
        module.UpdateCheckoutSession('nonexistent', { metadata: {} })
      ).rejects.toThrow('Checkout session not found');
      expect(mockDb.Update).not.toHaveBeenCalled();
    });

    it('should throw when session is not open', async () => {
      const expiredSession = { ...BuildOpenSession(), status: 'expired' };
      mockDb.Get = jest.fn().mockResolvedValue(expiredSession);

      await expect(
        module.UpdateCheckoutSession(expiredSession.id, { metadata: {} })
      ).rejects.toThrow(
        'Only Checkout Sessions with an `open` status can be updated'
      );
      expect(mockDb.Update).not.toHaveBeenCalled();
    });

    it('should retain, update, add and remove line items, recomputing totals', async () => {
      const existingSession = BuildOpenSession([
        BuildLineItem({ id: 'li_z_1' }),
        BuildLineItem({ id: 'li_z_2' }),
      ]);
      mockDb.Get = jest
        .fn()
        .mockImplementation(async (collection: string, id: string) => {
          if (collection === 'CheckoutSessions') return existingSession;
          if (collection === 'Prices' && id === 'price_z_2') {
            return BuildPrice({ id: 'price_z_2', unit_amount: 500 });
          }
          if (collection === 'Products') {
            return { id: 'prod_z_1', name: 'Test Product' } as Product;
          }
          return null;
        });

      // Retain li_z_1 with a new quantity, add a new item, omit (remove) li_z_2
      await module.UpdateCheckoutSession(existingSession.id, {
        line_items: [
          { id: 'li_z_1', quantity: 3 },
          { price: 'price_z_2', quantity: 2 },
        ],
      });

      expect(mockDb.Update).toHaveBeenCalledWith(
        'CheckoutSessions',
        existingSession.id,
        expect.objectContaining({
          amount_subtotal: 4000,
          amount_total: 4000,
          line_items: expect.objectContaining({
            data: [
              expect.objectContaining({
                id: 'li_z_1',
                quantity: 3,
                amount_total: 3000,
              }),
              expect.objectContaining({
                quantity: 2,
                amount_total: 1000,
                price: expect.objectContaining({ id: 'price_z_2' }),
              }),
            ],
          }),
        })
      );
    });

    it('should throw when updating an unknown line item id', async () => {
      const existingSession = BuildOpenSession();
      mockDb.Get = jest.fn().mockResolvedValue(existingSession);

      await expect(
        module.UpdateCheckoutSession(existingSession.id, {
          line_items: [{ id: 'li_z_unknown', quantity: 2 }],
        })
      ).rejects.toThrow('No such line item');
      expect(mockDb.Update).not.toHaveBeenCalled();
    });

    it('should map collected shipping details, filling missing address fields with null', async () => {
      const existingSession = BuildOpenSession();
      mockDb.Get = jest.fn().mockResolvedValue(existingSession);

      await module.UpdateCheckoutSession(existingSession.id, {
        collected_information: {
          shipping_details: {
            address: { country: 'US', line1: '123 Main St' },
            name: 'Test Recipient',
          },
        },
      });

      expect(mockDb.Update).toHaveBeenCalledWith(
        'CheckoutSessions',
        existingSession.id,
        expect.objectContaining({
          collected_information: {
            business_name: null,
            individual_name: null,
            shipping_details: {
              address: {
                city: null,
                country: 'US',
                line1: '123 Main St',
                line2: null,
                postal_code: null,
                state: null,
              },
              name: 'Test Recipient',
            },
          },
        })
      );
    });
  });

  describe('ExpireCheckoutSession', () => {
    it('should expire an open session, cancel its PaymentIntent, and emit events', async () => {
      const openSession = {
        ...BuildOpenSession(),
        payment_intent: 'pi_z_1',
      };
      const paymentIntent = paymentIntentModule.PaymentIntentObject(
        'acct_z_platform',
        { amount: 1000, currency: 'usdc' }
      );
      paymentIntent.id = 'pi_z_1';
      const canceledPaymentIntent = {
        ...paymentIntent,
        status: 'canceled' as const,
        canceled_at: GetFixedTimestamp(),
        cancellation_reason: 'abandoned' as const,
        next_action: null,
        amount_capturable: 0,
      };
      const expiredSession = { ...openSession, status: 'expired', url: null };

      mockDb.Get = jest
        .fn()
        .mockResolvedValueOnce(openSession)
        // CancelPaymentIntent: RequirePaymentIntent before + after update
        .mockResolvedValueOnce(paymentIntent)
        .mockResolvedValueOnce(canceledPaymentIntent)
        // ExpireCheckoutSession: reload after status update
        .mockResolvedValueOnce(expiredSession);

      const result = await module.ExpireCheckoutSession(openSession.id);

      expect(mockDb.Update).toHaveBeenCalledWith(
        'PaymentIntents',
        'pi_z_1',
        expect.objectContaining({
          status: 'canceled',
          cancellation_reason: 'abandoned',
        })
      );
      expect(mockDb.Update).toHaveBeenCalledWith(
        'CheckoutSessions',
        openSession.id,
        { status: 'expired', url: null }
      );
      expect(eventService.Emit.mock.calls.map((call) => call[0])).toEqual([
        'payment_intent.canceled',
        'checkout.session.expired',
      ]);
      expect(eventService.Emit).toHaveBeenCalledWith(
        'payment_intent.canceled',
        'acct_z_platform',
        expect.objectContaining({
          id: 'pi_z_1',
          status: 'canceled',
          cancellation_reason: 'abandoned',
        })
      );
      expect(eventService.Emit).toHaveBeenCalledWith(
        'checkout.session.expired',
        'acct_z_platform',
        expiredSession
      );
      expect(result).toEqual(expiredSession);
    });

    it('should expire a session without a PaymentIntent', async () => {
      const openSession = BuildOpenSession();
      const expiredSession = { ...openSession, status: 'expired', url: null };
      mockDb.Get = jest
        .fn()
        .mockResolvedValueOnce(openSession)
        .mockResolvedValueOnce(expiredSession);

      const result = await module.ExpireCheckoutSession(openSession.id);

      expect(mockDb.Update).toHaveBeenCalledWith(
        'CheckoutSessions',
        openSession.id,
        { status: 'expired', url: null }
      );
      expect(eventService.Emit).toHaveBeenCalledWith(
        'checkout.session.expired',
        'acct_z_platform',
        expiredSession
      );
      expect(eventService.Emit).toHaveBeenCalledTimes(1);
      expect(result).toEqual(expiredSession);
    });

    it('should throw when session not found', async () => {
      await expect(module.ExpireCheckoutSession('nonexistent')).rejects.toThrow(
        'Checkout session not found'
      );
      expect(mockDb.Update).not.toHaveBeenCalled();
    });

    it('should throw when session is not open', async () => {
      const completeSession = { ...BuildOpenSession(), status: 'complete' };
      mockDb.Get = jest.fn().mockResolvedValue(completeSession);

      await expect(
        module.ExpireCheckoutSession(completeSession.id)
      ).rejects.toThrow(
        'Only Checkout Sessions with an `open` status can be expired'
      );
      expect(mockDb.Update).not.toHaveBeenCalled();
      expect(eventService.Emit).not.toHaveBeenCalled();
    });
  });

  describe('CompleteCheckoutSession', () => {
    it('should complete an open session and emit checkout.session.completed', async () => {
      const openSession = {
        ...BuildOpenSession(),
        payment_intent: 'pi_z_1',
      };
      const completedSession = {
        ...openSession,
        status: 'complete' as const,
        payment_status: 'paid' as const,
        url: null,
        payment_details: {
          transaction_signature: 'sig_abc',
          payer_wallet: 'payer_wallet_1',
        },
      };
      mockDb.Get = jest
        .fn()
        .mockResolvedValueOnce(openSession)
        .mockResolvedValueOnce(completedSession);

      const result = await module.CompleteCheckoutSession(openSession.id, {
        transaction_signature: 'sig_abc',
        payer_wallet: 'payer_wallet_1',
      });

      expect(mockDb.Update).toHaveBeenCalledWith(
        'CheckoutSessions',
        openSession.id,
        {
          status: 'complete',
          payment_status: 'paid',
          url: null,
          payment_details: {
            transaction_signature: 'sig_abc',
            payer_wallet: 'payer_wallet_1',
          },
        }
      );
      expect(eventService.Emit).toHaveBeenCalledWith(
        'checkout.session.completed',
        'acct_z_platform',
        completedSession
      );
      expect(result).toEqual(completedSession);
    });
  });

  describe('ListCheckoutSessions', () => {
    it('should pass account and session filters to ListHelper', async () => {
      const listSpy = jest
        .spyOn(ListHelper.prototype, 'List')
        .mockResolvedValue({
          object: 'list',
          data: [],
          has_more: false,
          url: '/v1/checkout/sessions',
        });
      await module.ListCheckoutSessions({
        account: 'acct_z_platform',
        limit: 25,
        customer: 'cus_z_1',
        customer_details: { email: 'test@example.com' },
        payment_intent: 'pi_z_1',
        status: 'open',
        subscription: 'sub_z_1',
      });
      expect(listSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          account: 'acct_z_platform',
          limit: 25,
          filters: expect.objectContaining({
            customer: 'cus_z_1',
            'customer_details.email': 'test@example.com',
            payment_intent: 'pi_z_1',
            status: 'open',
            subscription: 'sub_z_1',
          }),
        })
      );
      listSpy.mockRestore();
    });

    it('should omit optional filters when not provided', async () => {
      const listSpy = jest
        .spyOn(ListHelper.prototype, 'List')
        .mockResolvedValue({
          object: 'list',
          data: [],
          has_more: false,
          url: '/v1/checkout/sessions',
        });
      await module.ListCheckoutSessions({ account: 'acct_z_platform' });
      expect(listSpy).toHaveBeenCalledWith(
        expect.objectContaining({ filters: {} })
      );
      listSpy.mockRestore();
    });
  });

  describe('ListLineItems', () => {
    function BuildSessionWithThreeItems(): CheckoutSession {
      return BuildOpenSession([
        BuildLineItem({ id: 'li_z_1' }),
        BuildLineItem({ id: 'li_z_2' }),
        BuildLineItem({ id: 'li_z_3' }),
      ]);
    }

    it('should return a page of line items with has_more', () => {
      const session = BuildSessionWithThreeItems();

      const result = module.ListLineItems(session, { limit: 2 });

      expect(result.object).toBe('list');
      expect(result.data.map((item) => item.id)).toEqual(['li_z_1', 'li_z_2']);
      expect(result.has_more).toBe(true);
      expect(result.url).toBe(`/v1/checkout/sessions/${session.id}/line_items`);
    });

    it('should paginate forwards with starting_after', () => {
      const session = BuildSessionWithThreeItems();

      const result = module.ListLineItems(session, {
        startingAfter: 'li_z_1',
      });

      expect(result.data.map((item) => item.id)).toEqual(['li_z_2', 'li_z_3']);
      expect(result.has_more).toBe(false);
    });

    it('should paginate backwards with ending_before', () => {
      const session = BuildSessionWithThreeItems();

      const result = module.ListLineItems(session, {
        endingBefore: 'li_z_3',
      });

      expect(result.data.map((item) => item.id)).toEqual(['li_z_1', 'li_z_2']);
      expect(result.has_more).toBe(false);
    });

    it('should throw on an invalid cursor', () => {
      const session = BuildSessionWithThreeItems();

      expect(() =>
        module.ListLineItems(session, { startingAfter: 'li_z_unknown' })
      ).toThrow('Invalid starting_after ID');
    });
  });
});
