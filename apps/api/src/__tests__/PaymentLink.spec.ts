import { PaymentLinkModule } from '../modules/PaymentLink';
import { Database } from '../modules/Database';
import {
  CheckoutSession,
  CheckoutSessionLineItem,
  PaymentLink,
  Price,
  Product,
} from '@zoneless/shared-types';
import { EventService } from '../modules/EventService';
import { PriceModule } from '../modules/Price';
import { ProductModule } from '../modules/Product';
import { CheckoutSessionModule } from '../modules/CheckoutSession';
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
    paymentLinkUrl: 'http://pay.localhost:4200',
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
    description: 'Gold Plan',
    discounts: null,
    metadata: {},
    price: BuildPrice(),
    quantity: 1,
    taxes: null,
    ...overrides,
  };
}

function BuildPaymentLink(overrides: Partial<PaymentLink> = {}): PaymentLink {
  return {
    id: 'plink_z_1',
    object: 'payment_link',
    active: true,
    created: GetFixedTimestamp(),
    after_completion: {
      type: 'hosted_confirmation',
      hosted_confirmation: { custom_message: null },
      redirect: null,
    },
    allow_promotion_codes: false,
    application: null,
    application_fee_amount: null,
    application_fee_percent: null,
    automatic_tax: { enabled: false, liability: null },
    billing_address_collection: 'auto',
    consent_collection: null,
    currency: 'usdc',
    custom_fields: [],
    custom_text: {
      after_submit: null,
      shipping_address: null,
      submit: null,
      terms_of_service_acceptance: null,
    },
    customer_creation: 'if_required',
    inactive_message: null,
    invoice_creation: {
      enabled: false,
      invoice_data: {
        account_tax_ids: null,
        custom_fields: null,
        description: null,
        footer: null,
        issuer: null,
        metadata: {},
        rendering_options: null,
      },
    },
    line_items: {
      object: 'list',
      data: [BuildLineItem()],
      has_more: false,
      url: '/v1/payment_links/plink_z_1/line_items',
    },
    livemode: false,
    managed_payments: null,
    metadata: {},
    name_collection: null,
    on_behalf_of: null,
    optional_items: null,
    payment_intent_data: null,
    payment_method_collection: 'always',
    payment_method_options: null,
    payment_method_types: null,
    phone_number_collection: { enabled: false },
    restrictions: null,
    shipping_address_collection: null,
    shipping_options: [],
    submit_type: 'auto',
    subscription_data: null,
    tax_id_collection: { enabled: false },
    transfer_data: null,
    url: 'http://pay.localhost:4200/b/test_slug_plink',
    url_slug: 'test_slug_plink',
    platform_account: 'acct_z_platform',
    ...overrides,
  };
}

describe('PaymentLinkModule', () => {
  let module: PaymentLinkModule;
  let mockDb: jest.Mocked<Database>;
  let eventService: jest.Mocked<EventService>;
  let priceModule: jest.Mocked<Pick<PriceModule, 'GetPrice' | 'CreatePrice'>>;
  let productModule: jest.Mocked<Pick<ProductModule, 'GetProduct'>>;
  let checkoutSessionModule: jest.Mocked<
    Pick<CheckoutSessionModule, 'CreateCheckoutSession'>
  >;

  beforeEach(() => {
    jest.clearAllMocks();
    ResetIdCounter();
    mockDb = CreateMockDatabase();
    eventService = {
      Emit: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<EventService>;

    priceModule = {
      GetPrice: jest.fn().mockResolvedValue(BuildPrice()),
      CreatePrice: jest
        .fn()
        .mockResolvedValue(BuildPrice({ id: 'price_z_new' })),
    };

    productModule = {
      GetProduct: jest.fn().mockResolvedValue({
        id: 'prod_z_1',
        name: 'Gold Plan',
      } as Product),
    };

    checkoutSessionModule = {
      CreateCheckoutSession: jest.fn().mockResolvedValue({
        id: 'cs_z_1',
        payment_link: 'plink_z_1',
        url_slug: 'test_slug_cs',
        url: 'http://localhost:4200/c/test_slug_cs',
      } as CheckoutSession),
    };

    module = new PaymentLinkModule(
      mockDb,
      eventService,
      priceModule as unknown as PriceModule,
      productModule as unknown as ProductModule,
      checkoutSessionModule as unknown as CheckoutSessionModule
    );
  });

  describe('CreatePaymentLink', () => {
    it('should persist a payment link with defaults and url', async () => {
      const paymentLink = await module.CreatePaymentLink('acct_z_platform', {
        line_items: [{ price: 'price_z_1', quantity: 1 }],
      });

      expect(paymentLink.object).toBe('payment_link');
      expect(paymentLink.active).toBe(true);
      expect(paymentLink.url_slug).toBeTruthy();
      expect(paymentLink.url).toBe(
        `http://pay.localhost:4200/b/${paymentLink.url_slug}`
      );
      expect(paymentLink.url).not.toContain(paymentLink.id);
      expect(paymentLink.billing_address_collection).toBe('auto');
      expect(paymentLink.customer_creation).toBe('if_required');
      expect(paymentLink.line_items?.data).toHaveLength(1);
      expect(mockDb.Set).toHaveBeenCalledWith(
        'PaymentLinks',
        paymentLink.id,
        paymentLink
      );
      expect(eventService.Emit).toHaveBeenCalledWith(
        'payment_link.created',
        'acct_z_platform',
        paymentLink
      );
    });

    it('should create from price_data', async () => {
      await module.CreatePaymentLink('acct_z_platform', {
        line_items: [
          {
            quantity: 1,
            price_data: {
              currency: 'usdc',
              unit_amount: 2500,
              product_data: { name: 'Inline Product' },
            },
          },
        ],
      });

      expect(priceModule.CreatePrice).toHaveBeenCalled();
    });

    it('should reject prices from another platform', async () => {
      priceModule.GetPrice = jest
        .fn()
        .mockResolvedValue(BuildPrice({ platform_account: 'acct_z_other' }));

      await expect(
        module.CreatePaymentLink('acct_z_platform', {
          line_items: [{ price: 'price_z_1', quantity: 1 }],
        })
      ).rejects.toThrow('Price not found');
    });
  });

  describe('UpdatePaymentLink', () => {
    it('should update metadata and emit payment_link.updated', async () => {
      const existing = BuildPaymentLink();
      mockDb.Get = jest.fn().mockResolvedValue(existing);

      await module.UpdatePaymentLink(existing.id, {
        metadata: { order_id: '6735' },
        active: false,
      });

      expect(mockDb.Update).toHaveBeenCalledWith(
        'PaymentLinks',
        existing.id,
        expect.objectContaining({
          metadata: { order_id: '6735' },
          active: false,
        })
      );
      expect(eventService.Emit).toHaveBeenCalledWith(
        'payment_link.updated',
        'acct_z_platform',
        existing,
        expect.objectContaining({ previousAttributes: expect.any(Object) })
      );
    });

    it('should update existing line items by id', async () => {
      const existing = BuildPaymentLink();
      mockDb.Get = jest.fn().mockResolvedValue(existing);

      await module.UpdatePaymentLink(existing.id, {
        line_items: [{ id: 'li_z_1', quantity: 3 }],
      });

      expect(mockDb.Update).toHaveBeenCalledWith(
        'PaymentLinks',
        existing.id,
        expect.objectContaining({
          line_items: expect.objectContaining({
            data: [
              expect.objectContaining({
                id: 'li_z_1',
                quantity: 3,
                amount_total: 3000,
              }),
            ],
          }),
        })
      );
    });
  });

  describe('GetPaymentLink', () => {
    it('should return the payment link when found', async () => {
      const existing = BuildPaymentLink();
      mockDb.Get = jest.fn().mockResolvedValue(existing);
      await expect(module.GetPaymentLink(existing.id)).resolves.toEqual(
        existing
      );
    });

    it('should return null when not found', async () => {
      await expect(module.GetPaymentLink('missing')).resolves.toBeNull();
    });
  });

  describe('ListPaymentLinks', () => {
    it('should delegate to ListHelper with active filter', async () => {
      const listSpy = jest
        .spyOn(ListHelper.prototype, 'List')
        .mockResolvedValue({
          object: 'list',
          data: [],
          has_more: false,
          url: '/v1/payment_links',
        });

      await module.ListPaymentLinks({
        account: 'acct_z_platform',
        active: true,
        limit: 3,
      });

      expect(listSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          account: 'acct_z_platform',
          filters: { active: true },
          limit: 3,
        })
      );
    });
  });

  describe('ListLineItems', () => {
    it('should paginate embedded line items', () => {
      const paymentLink = BuildPaymentLink({
        line_items: {
          object: 'list',
          data: [
            BuildLineItem({ id: 'li_z_1' }),
            BuildLineItem({ id: 'li_z_2' }),
            BuildLineItem({ id: 'li_z_3' }),
          ],
          has_more: false,
          url: '/v1/payment_links/plink_z_1/line_items',
        },
      });

      const page = module.ListLineItems(paymentLink, {
        limit: 2,
        startingAfter: 'li_z_1',
      });

      expect(page.data.map((item) => item.id)).toEqual(['li_z_2', 'li_z_3']);
      expect(page.has_more).toBe(false);
    });
  });

  describe('OpenPaymentLink', () => {
    it('should create a checkout session from the payment link', async () => {
      const existing = BuildPaymentLink();
      mockDb.FindCustom = jest.fn().mockResolvedValue([existing]);

      const session = await module.OpenPaymentLink(existing.url_slug);

      expect(checkoutSessionModule.CreateCheckoutSession).toHaveBeenCalledWith(
        'acct_z_platform',
        expect.objectContaining({
          mode: 'payment',
          line_items: [{ price: 'price_z_1', quantity: 1 }],
          ui_mode: 'hosted_page',
          optional_items: undefined,
        }),
        { payment_link: existing.id }
      );
      expect(session.payment_link).toBe('plink_z_1');
    });

    it('should reject inactive payment links', async () => {
      mockDb.FindCustom = jest.fn().mockResolvedValue([
        BuildPaymentLink({
          active: false,
          inactive_message: 'Sold out',
        }),
      ]);

      await expect(module.OpenPaymentLink('test_slug_plink')).rejects.toThrow(
        'Sold out'
      );
    });

    it('should reject links that hit the completed_sessions limit', async () => {
      mockDb.FindCustom = jest.fn().mockResolvedValue([
        BuildPaymentLink({
          restrictions: {
            completed_sessions: { count: 5, limit: 5 },
          },
        }),
      ]);

      await expect(module.OpenPaymentLink('test_slug_plink')).rejects.toThrow(
        'completion limit'
      );
    });
  });

  describe('RecordCompletedSession', () => {
    it('should increment completed_sessions count', async () => {
      mockDb.Get = jest.fn().mockResolvedValue(
        BuildPaymentLink({
          restrictions: {
            completed_sessions: { count: 1, limit: 5 },
          },
        })
      );

      await module.RecordCompletedSession('plink_z_1');

      expect(mockDb.Update).toHaveBeenCalledWith(
        'PaymentLinks',
        'plink_z_1',
        expect.objectContaining({
          restrictions: {
            completed_sessions: { count: 2, limit: 5 },
          },
        })
      );
    });
  });
});
