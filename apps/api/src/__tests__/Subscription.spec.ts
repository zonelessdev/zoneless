import { SubscriptionModule } from '../modules/Subscription';
import { Database } from '../modules/Database';
import { EventService } from '../modules/EventService';
import { CustomerModule } from '../modules/Customer';
import { PriceModule } from '../modules/Price';
import { InvoiceModule } from '../modules/Invoice';
import { ListHelper } from '../utils/ListHelper';
import {
  CreateMockDatabase,
  DeterministicId,
  ResetIdCounter,
  GetFixedTimestamp,
} from './Setup';

jest.mock('../modules/Database');
jest.mock('../utils/IdGenerator', () => ({
  GenerateId: jest.fn((prefix: string) => DeterministicId(prefix)),
}));
jest.mock('../utils/Timestamp', () => ({
  Now: jest.fn(() => GetFixedTimestamp()),
}));
jest.mock('../modules/AppConfig', () => ({
  GetAppConfig: jest.fn(() => ({
    dashboardUrl: 'http://localhost:4200',
    livemode: false,
    appSecret: 'test-secret',
  })),
}));

const PLATFORM = 'acct_z_platform';
const CUSTOMER_ID = 'cus_z_1';
const PRICE_ID = 'price_z_1';

function MockCustomer(overrides: Record<string, unknown> = {}) {
  return {
    id: CUSTOMER_ID,
    object: 'customer',
    platform_account: PLATFORM,
    email: 'jennyrosen@example.com',
    name: 'Jenny Rosen',
    phone: null,
    address: null,
    shipping: null,
    tax_exempt: 'none',
    ...overrides,
  };
}

function MockRecurringPrice(overrides: Record<string, unknown> = {}) {
  return {
    id: PRICE_ID,
    object: 'price',
    platform_account: PLATFORM,
    product: 'prod_z_1',
    unit_amount: 2000,
    unit_amount_decimal: '2000',
    currency: 'usdc',
    type: 'recurring',
    recurring: {
      interval: 'month',
      interval_count: 1,
      trial_period_days: null,
      usage_type: 'licensed',
      meter: null,
    },
    subscription_plan_pda: null,
    ...overrides,
  };
}

describe('SubscriptionModule', () => {
  let module: SubscriptionModule;
  let mockDb: jest.Mocked<Database>;
  let eventService: jest.Mocked<EventService>;
  let customerModule: jest.Mocked<CustomerModule>;
  let priceModule: jest.Mocked<PriceModule>;
  let invoiceModule: jest.Mocked<InvoiceModule>;
  let store: Map<string, Record<string, unknown>>;

  function StoreKey(collection: string, id: string): string {
    return `${collection}:${id}`;
  }

  beforeEach(() => {
    jest.clearAllMocks();
    ResetIdCounter();
    store = new Map();

    mockDb = CreateMockDatabase();
    mockDb.Set = jest.fn(async (_collection, id, doc) => {
      store.set(StoreKey(_collection, id), {
        ...(doc as Record<string, unknown>),
      });
      return doc;
    }) as typeof mockDb.Set;
    mockDb.Get = jest.fn(async (_collection, id) => {
      return (store.get(StoreKey(_collection, id)) ?? null) as never;
    }) as typeof mockDb.Get;
    mockDb.Update = jest.fn(async (_collection, id, patch) => {
      const existing = store.get(StoreKey(_collection, id)) ?? {};
      const next = {
        ...existing,
        ...(patch as Record<string, unknown>),
      };
      store.set(StoreKey(_collection, id), next);
      return next as never;
    }) as typeof mockDb.Update;
    mockDb.Delete = jest.fn(async (_collection, id) => {
      store.delete(StoreKey(_collection, id));
      return { deletedCount: 1 };
    }) as typeof mockDb.Delete;
    mockDb.Query = jest.fn(async (options) => {
      const prefix = `${options.collection}:`;
      return [...store.entries()]
        .filter(([key]) => key.startsWith(prefix))
        .map(([, value]) => value) as never;
    }) as typeof mockDb.Query;

    eventService = {
      Emit: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<EventService>;

    customerModule = {
      GetCustomer: jest.fn().mockResolvedValue(MockCustomer()),
    } as unknown as jest.Mocked<CustomerModule>;

    priceModule = {
      GetPrice: jest.fn().mockResolvedValue(MockRecurringPrice()),
      CreatePrice: jest.fn(),
    } as unknown as jest.Mocked<PriceModule>;

    invoiceModule = {
      CreateSubscriptionInvoice: jest.fn().mockResolvedValue({
        id: 'in_z_1',
        object: 'invoice',
        status: 'paid',
        billing_reason: 'subscription_create',
        parent: {
          type: 'subscription_details',
          subscription_details: { subscription: 'sub_z_test001' },
        },
      }),
      GetInvoice: jest.fn(),
      DeleteInvoice: jest.fn(),
      VoidInvoice: jest.fn(),
    } as unknown as jest.Mocked<InvoiceModule>;

    module = new SubscriptionModule(
      mockDb,
      eventService,
      customerModule,
      priceModule,
      invoiceModule
    );
  });

  describe('CreateSubscription', () => {
    it('should create subscription items, invoice, and emit customer.subscription.created', async () => {
      const subscription = await module.CreateSubscription(PLATFORM, {
        customer: CUSTOMER_ID,
        items: [{ price: PRICE_ID }],
      });

      expect(subscription.object).toBe('subscription');
      expect(subscription.customer).toBe(CUSTOMER_ID);
      expect(subscription.currency).toBe('usdc');
      expect(subscription.status).toBe('active');
      expect(subscription.latest_invoice).toBe('in_z_1');
      expect(subscription.platform_account).toBe(PLATFORM);
      expect(subscription.items.data).toHaveLength(1);
      expect(subscription.items.data[0].price).toBe(PRICE_ID);
      expect(subscription.items.data[0].quantity).toBe(1);
      expect(subscription.items.url).toContain(subscription.id);

      expect(mockDb.Set).toHaveBeenCalledWith(
        'Subscriptions',
        subscription.id,
        expect.objectContaining({ id: subscription.id })
      );
      expect(invoiceModule.CreateSubscriptionInvoice).toHaveBeenCalledWith(
        PLATFORM,
        expect.objectContaining({
          customer: CUSTOMER_ID,
          subscription: subscription.id,
          billing_reason: 'subscription_create',
          finalize: true,
          collect: true,
          lineItems: [
            expect.objectContaining({
              price: PRICE_ID,
              quantity: 1,
            }),
          ],
        })
      );
      expect(eventService.Emit).toHaveBeenCalledWith(
        'customer.subscription.created',
        PLATFORM,
        expect.objectContaining({ id: subscription.id })
      );
    });

    it('should skip invoicing and set trialing when trial_period_days is set', async () => {
      const subscription = await module.CreateSubscription(PLATFORM, {
        customer: CUSTOMER_ID,
        items: [{ price: PRICE_ID }],
        trial_period_days: 14,
      });

      expect(subscription.status).toBe('trialing');
      expect(subscription.trial_start).toBe(GetFixedTimestamp());
      expect(subscription.trial_end).toBe(
        GetFixedTimestamp() + 14 * 24 * 60 * 60
      );
      expect(subscription.latest_invoice).toBeNull();
      expect(invoiceModule.CreateSubscriptionInvoice).not.toHaveBeenCalled();
      expect(eventService.Emit).toHaveBeenCalledWith(
        'customer.subscription.created',
        PLATFORM,
        expect.objectContaining({ id: subscription.id })
      );
      expect(eventService.Emit).not.toHaveBeenCalledWith(
        'customer.subscription.trial_will_end',
        expect.anything(),
        expect.anything()
      );
    });

    it('should emit trial_will_end when fewer than three days remain', async () => {
      const trialEnd = GetFixedTimestamp() + 2 * 24 * 60 * 60;
      const subscription = await module.CreateSubscription(PLATFORM, {
        customer: CUSTOMER_ID,
        items: [{ price: PRICE_ID }],
        trial_end: trialEnd,
      });

      expect(subscription.status).toBe('trialing');
      expect(eventService.Emit).toHaveBeenCalledWith(
        'customer.subscription.trial_will_end',
        PLATFORM,
        expect.objectContaining({ id: subscription.id })
      );
    });

    it('should finalize without collecting when payment_behavior is default_incomplete', async () => {
      invoiceModule.CreateSubscriptionInvoice = jest.fn().mockResolvedValue({
        id: 'in_z_open',
        object: 'invoice',
        status: 'open',
      });

      const subscription = await module.CreateSubscription(PLATFORM, {
        customer: CUSTOMER_ID,
        items: [{ price: PRICE_ID }],
        payment_behavior: 'default_incomplete',
      });

      expect(subscription.status).toBe('incomplete');
      expect(subscription.latest_invoice).toBe('in_z_open');
      expect(invoiceModule.CreateSubscriptionInvoice).toHaveBeenCalledWith(
        PLATFORM,
        expect.objectContaining({
          finalize: true,
          collect: false,
        })
      );
    });

    it('should reject customers that do not belong to the platform', async () => {
      customerModule.GetCustomer = jest.fn().mockResolvedValue({
        id: CUSTOMER_ID,
        platform_account: 'acct_z_other',
      });

      await expect(
        module.CreateSubscription(PLATFORM, {
          customer: CUSTOMER_ID,
          items: [{ price: PRICE_ID }],
        })
      ).rejects.toThrow('Customer not found');
    });

    it('should reject one-time prices', async () => {
      priceModule.GetPrice = jest.fn().mockResolvedValue(
        MockRecurringPrice({
          type: 'one_time',
          recurring: null,
        })
      );

      await expect(
        module.CreateSubscription(PLATFORM, {
          customer: CUSTOMER_ID,
          items: [{ price: PRICE_ID }],
        })
      ).rejects.toThrow('Subscription items require a recurring price');
    });

    it('should reject unsupported currencies', async () => {
      await expect(
        module.CreateSubscription(PLATFORM, {
          customer: CUSTOMER_ID,
          items: [{ price: PRICE_ID }],
          currency: 'usd',
        })
      ).rejects.toThrow("Currency 'usd' is not supported");
    });
  });

  describe('UpdateSubscription', () => {
    it('should update metadata and emit customer.subscription.updated', async () => {
      const created = await module.CreateSubscription(PLATFORM, {
        customer: CUSTOMER_ID,
        items: [{ price: PRICE_ID }],
      });

      const updated = await module.UpdateSubscription(created.id, {
        metadata: { order_id: '6735' },
      });

      expect(updated.metadata).toEqual({ order_id: '6735' });
      expect(mockDb.Update).toHaveBeenCalledWith(
        'Subscriptions',
        created.id,
        expect.objectContaining({ metadata: { order_id: '6735' } })
      );
      expect(eventService.Emit).toHaveBeenCalledWith(
        'customer.subscription.updated',
        PLATFORM,
        expect.objectContaining({ id: created.id }),
        expect.objectContaining({ previousAttributes: expect.any(Object) })
      );
    });

    it('should schedule cancel at period end without changing status', async () => {
      const created = await module.CreateSubscription(PLATFORM, {
        customer: CUSTOMER_ID,
        items: [{ price: PRICE_ID }],
      });
      const periodEnd = created.items.data[0].current_period_end;

      const updated = await module.UpdateSubscription(created.id, {
        cancel_at_period_end: true,
      });

      expect(updated.status).toBe('active');
      expect(updated.cancel_at_period_end).toBe(true);
      expect(updated.cancel_at).toBe(periodEnd);
      expect(updated.canceled_at).toBe(GetFixedTimestamp());
      expect(updated.cancellation_details?.reason).toBe(
        'cancellation_requested'
      );
      expect(updated.ended_at).toBeNull();
    });

    it('should clear scheduled cancel when cancel_at_period_end is false', async () => {
      const created = await module.CreateSubscription(PLATFORM, {
        customer: CUSTOMER_ID,
        items: [{ price: PRICE_ID }],
      });

      await module.UpdateSubscription(created.id, {
        cancel_at_period_end: true,
      });

      const resumed = await module.UpdateSubscription(created.id, {
        cancel_at_period_end: false,
      });

      expect(resumed.status).toBe('active');
      expect(resumed.cancel_at_period_end).toBe(false);
      expect(resumed.cancel_at).toBeNull();
      expect(resumed.canceled_at).toBeNull();
      expect(resumed.cancellation_details?.reason).toBeNull();
    });
  });

  describe('CancelSubscription', () => {
    it('should cancel immediately and emit deleted', async () => {
      const created = await module.CreateSubscription(PLATFORM, {
        customer: CUSTOMER_ID,
        items: [{ price: PRICE_ID }],
      });

      const canceled = await module.CancelSubscription(created.id, {
        cancellation_details: { feedback: 'too_expensive' },
      });

      expect(canceled.status).toBe('canceled');
      expect(canceled.canceled_at).toBe(GetFixedTimestamp());
      expect(canceled.ended_at).toBe(GetFixedTimestamp());
      expect(canceled.cancel_at).toBeNull();
      expect(canceled.cancel_at_period_end).toBe(false);
      expect(canceled.cancellation_details?.feedback).toBe('too_expensive');
      expect(canceled.cancellation_details?.reason).toBe(
        'cancellation_requested'
      );
      expect(eventService.Emit).toHaveBeenCalledWith(
        'customer.subscription.deleted',
        PLATFORM,
        expect.objectContaining({ id: created.id })
      );
    });

    it('should reject already canceled subscriptions', async () => {
      const created = await module.CreateSubscription(PLATFORM, {
        customer: CUSTOMER_ID,
        items: [{ price: PRICE_ID }],
      });

      await module.CancelSubscription(created.id, {});

      await expect(module.CancelSubscription(created.id, {})).rejects.toThrow(
        'Subscription is already canceled'
      );
    });

    it('should create a final invoice when invoice_now is true', async () => {
      const created = await module.CreateSubscription(PLATFORM, {
        customer: CUSTOMER_ID,
        items: [{ price: PRICE_ID }],
      });

      invoiceModule.CreateSubscriptionInvoice = jest.fn().mockResolvedValue({
        id: 'in_z_final',
        object: 'invoice',
        status: 'paid',
      });

      const canceled = await module.CancelSubscription(created.id, {
        invoice_now: true,
      });

      expect(invoiceModule.CreateSubscriptionInvoice).toHaveBeenCalledWith(
        PLATFORM,
        expect.objectContaining({
          billing_reason: 'subscription_update',
          finalize: true,
          collect: true,
        })
      );
      expect(canceled.latest_invoice).toBe('in_z_final');
    });
  });

  describe('FinalizeCancelAtPeriodEnd', () => {
    it('should mark canceled and emit deleted', async () => {
      const created = await module.CreateSubscription(PLATFORM, {
        customer: CUSTOMER_ID,
        items: [{ price: PRICE_ID }],
      });

      await module.UpdateSubscription(created.id, {
        cancel_at_period_end: true,
      });

      const finalized = await module.FinalizeCancelAtPeriodEnd(created.id);

      expect(finalized.status).toBe('canceled');
      expect(finalized.ended_at).toBe(GetFixedTimestamp());
      expect(finalized.cancel_at_period_end).toBe(false);
      expect(eventService.Emit).toHaveBeenCalledWith(
        'customer.subscription.deleted',
        PLATFORM,
        expect.objectContaining({ id: created.id })
      );
    });
  });

  describe('MigrateSubscription', () => {
    it('should set billing_mode to flexible and emit updated', async () => {
      const created = await module.CreateSubscription(PLATFORM, {
        customer: CUSTOMER_ID,
        items: [{ price: PRICE_ID }],
      });

      const migrated = await module.MigrateSubscription(created.id, {
        billing_mode: { type: 'flexible' },
      });

      expect(migrated.billing_mode.type).toBe('flexible');
      expect(migrated.billing_mode.updated_at).toBe(GetFixedTimestamp());
      expect(eventService.Emit).toHaveBeenCalledWith(
        'customer.subscription.updated',
        PLATFORM,
        expect.objectContaining({ id: created.id }),
        expect.objectContaining({ previousAttributes: expect.any(Object) })
      );
    });
  });

  describe('ResumeSubscription', () => {
    it('should reject non-paused subscriptions', async () => {
      const created = await module.CreateSubscription(PLATFORM, {
        customer: CUSTOMER_ID,
        items: [{ price: PRICE_ID }],
      });

      await expect(module.ResumeSubscription(created.id, {})).rejects.toThrow(
        'Only paused subscriptions can be resumed'
      );
    });

    it('should invoice, activate, and emit resumed when paused', async () => {
      const created = await module.CreateSubscription(PLATFORM, {
        customer: CUSTOMER_ID,
        items: [{ price: PRICE_ID }],
      });

      await mockDb.Update('Subscriptions', created.id, { status: 'paused' });

      invoiceModule.CreateSubscriptionInvoice = jest.fn().mockResolvedValue({
        id: 'in_z_resume',
        object: 'invoice',
        status: 'paid',
      });

      const resumed = await module.ResumeSubscription(created.id, {
        billing_cycle_anchor: 'now',
      });

      expect(resumed.status).toBe('active');
      expect(resumed.latest_invoice).toBe('in_z_resume');
      expect(invoiceModule.CreateSubscriptionInvoice).toHaveBeenCalledWith(
        PLATFORM,
        expect.objectContaining({
          billing_reason: 'subscription_update',
          finalize: true,
          collect: true,
        })
      );
      expect(eventService.Emit).toHaveBeenCalledWith(
        'customer.subscription.resumed',
        PLATFORM,
        expect.objectContaining({ id: created.id })
      );
    });
  });

  describe('ListSubscriptions', () => {
    it('should list via ListHelper and attach items', async () => {
      const created = await module.CreateSubscription(PLATFORM, {
        customer: CUSTOMER_ID,
        items: [{ price: PRICE_ID }],
      });

      const listSpy = jest
        .spyOn(ListHelper.prototype, 'List')
        .mockResolvedValue({
          object: 'list',
          data: [store.get(StoreKey('Subscriptions', created.id)) as never],
          has_more: false,
          url: '/v1/subscriptions',
        });

      const result = await module.ListSubscriptions({
        account: PLATFORM,
        limit: 10,
      });

      expect(listSpy).toHaveBeenCalled();
      expect(result.data).toHaveLength(1);
      expect(result.data[0].items.data).toHaveLength(1);
      listSpy.mockRestore();
    });
  });

  describe('GetSubscription', () => {
    it('should return null when missing', async () => {
      await expect(module.GetSubscription('sub_missing')).resolves.toBeNull();
    });
  });
});
