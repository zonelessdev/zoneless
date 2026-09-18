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
import { AppError } from '../utils/AppError';

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
const SUBSCRIPTION_ID = 'sub_z_1';

describe('SubscriptionModule - Subscription Items', () => {
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
      const updated = { ...existing, ...(patch as Record<string, unknown>) };
      store.set(StoreKey(_collection, id), updated);
      return updated;
    }) as typeof mockDb.Update;
    mockDb.Delete = jest.fn(async (_collection, id) => {
      store.delete(StoreKey(_collection, id));
      return { deletedCount: 1 };
    }) as typeof mockDb.Delete;
    mockDb.Query = jest.fn(async ({ collection, parameters }) => {
      const items = Array.from(store.entries())
        .filter(([key]) => key.startsWith(`${collection}:`))
        .map(([, value]) => value);

      // Simple mock filter for subscription items query
      if (parameters && parameters[0] && parameters[0].key === 'subscription') {
        return items.filter(
          (i) => i.subscription === parameters[0].value
        ) as never;
      }
      return items as never;
    }) as typeof mockDb.Query;

    eventService = {
      Emit: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<EventService>;

    customerModule = {
      GetCustomer: jest.fn().mockResolvedValue({
        id: CUSTOMER_ID,
        platform_account: PLATFORM,
      }),
    } as unknown as jest.Mocked<CustomerModule>;

    priceModule = {
      GetPrice: jest.fn().mockResolvedValue({
        id: PRICE_ID,
        platform_account: PLATFORM,
        product: 'prod_z_1',
        unit_amount: 1099,
        unit_amount_decimal: '1099',
        currency: 'usdc',
        type: 'recurring',
        recurring: {
          interval: 'month',
          interval_count: 1,
        },
      }),
    } as unknown as jest.Mocked<PriceModule>;

    invoiceModule = {} as unknown as jest.Mocked<InvoiceModule>;

    module = new SubscriptionModule(
      mockDb,
      eventService,
      customerModule,
      priceModule,
      invoiceModule
    );

    // Setup initial subscription in store
    store.set(`Subscriptions:${SUBSCRIPTION_ID}`, {
      id: SUBSCRIPTION_ID,
      object: 'subscription',
      platform_account: PLATFORM,
      customer: CUSTOMER_ID,
      status: 'active',
      current_period_start: GetFixedTimestamp(),
      current_period_end: GetFixedTimestamp() + 30 * 24 * 60 * 60,
    });
  });

  describe('CreateItem', () => {
    it('should create an item and emit customer.subscription.updated', async () => {
      const item = await module.CreateItem(PLATFORM, {
        subscription: SUBSCRIPTION_ID,
        price: PRICE_ID,
        quantity: 2,
      });

      expect(item.object).toBe('subscription_item');
      expect(item.subscription).toBe(SUBSCRIPTION_ID);
      expect(item.price).toBe(PRICE_ID);
      expect(item.quantity).toBe(2);

      const savedItem = store.get(StoreKey('SubscriptionItems', item.id));
      expect(savedItem).toBeDefined();

      expect(eventService.Emit).toHaveBeenCalledWith(
        'customer.subscription.updated',
        PLATFORM,
        expect.objectContaining({ id: SUBSCRIPTION_ID })
      );
    });
  });

  describe('GetItem', () => {
    it('should retrieve an item by id', async () => {
      store.set(StoreKey('SubscriptionItems', 'si_123'), {
        id: 'si_123',
        object: 'subscription_item',
        platform_account: PLATFORM,
        subscription: SUBSCRIPTION_ID,
      });

      const item = await module.GetItem('si_123', PLATFORM);
      expect(item).toBeDefined();
      expect(item?.id).toBe('si_123');
    });

    it('should return null if item belongs to different platform', async () => {
      store.set(StoreKey('SubscriptionItems', 'si_123'), {
        id: 'si_123',
        object: 'subscription_item',
        platform_account: 'different_platform',
        subscription: SUBSCRIPTION_ID,
      });

      const item = await module.GetItem('si_123', PLATFORM);
      expect(item).toBeNull();
    });
  });

  describe('UpdateItem', () => {
    it('should update item attributes and emit customer.subscription.updated', async () => {
      store.set(StoreKey('SubscriptionItems', 'si_123'), {
        id: 'si_123',
        object: 'subscription_item',
        platform_account: PLATFORM,
        subscription: SUBSCRIPTION_ID,
        price: PRICE_ID,
        quantity: 1,
      });

      const updated = await module.UpdateItem(
        'si_123',
        { quantity: 5 },
        PLATFORM
      );

      expect(updated.quantity).toBe(5);
      const savedItem = store.get(StoreKey('SubscriptionItems', 'si_123'));
      expect(savedItem?.quantity).toBe(5);

      expect(eventService.Emit).toHaveBeenCalledWith(
        'customer.subscription.updated',
        PLATFORM,
        expect.objectContaining({ id: SUBSCRIPTION_ID })
      );
    });

    it('should throw error if item does not exist', async () => {
      await expect(
        module.UpdateItem('si_missing', { quantity: 5 }, PLATFORM)
      ).rejects.toThrow(AppError);
    });
  });

  describe('DeleteItem', () => {
    it('should delete the item and emit customer.subscription.updated', async () => {
      store.set(StoreKey('SubscriptionItems', 'si_123'), {
        id: 'si_123',
        object: 'subscription_item',
        platform_account: PLATFORM,
        subscription: SUBSCRIPTION_ID,
      });

      const result = await module.DeleteItem('si_123', {}, PLATFORM);

      expect(result.deleted).toBe(true);
      expect(store.has(StoreKey('SubscriptionItems', 'si_123'))).toBe(false);

      expect(eventService.Emit).toHaveBeenCalledWith(
        'customer.subscription.updated',
        PLATFORM,
        expect.objectContaining({ id: SUBSCRIPTION_ID })
      );
    });
  });

  describe('ListItems', () => {
    it('should pass options to ListHelper', async () => {
      const listSpy = jest
        .spyOn(ListHelper.prototype, 'List')
        .mockResolvedValue({
          object: 'list',
          data: [],
          has_more: false,
          url: '/v1/subscription_items',
        });

      await module.ListItems({
        account: PLATFORM,
        limit: 10,
        subscription: SUBSCRIPTION_ID,
      });

      expect(listSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          account: PLATFORM,
          limit: 10,
          filters: expect.objectContaining({
            subscription: SUBSCRIPTION_ID,
          }),
        })
      );
    });
  });
});
