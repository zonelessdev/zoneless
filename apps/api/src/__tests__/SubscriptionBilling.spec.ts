import { SubscriptionBillingModule } from '../modules/SubscriptionBilling';
import { SubscriptionModule } from '../modules/Subscription';
import { InvoiceModule } from '../modules/Invoice';
import { Database } from '../modules/Database';
import { CreateMockDatabase, GetFixedTimestamp, ResetIdCounter } from './Setup';

jest.mock('../modules/Database');
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
const SUB_ID = 'sub_z_1';
const INVOICE_ID = 'in_z_1';

describe('SubscriptionBillingModule', () => {
  let mockDb: jest.Mocked<Database>;
  let subscriptionModule: jest.Mocked<SubscriptionModule>;
  let invoiceModule: jest.Mocked<InvoiceModule>;
  let module: SubscriptionBillingModule;

  beforeEach(() => {
    jest.clearAllMocks();
    ResetIdCounter();
    mockDb = CreateMockDatabase();

    subscriptionModule = {
      ClaimForBilling: jest.fn(),
      ReleaseBillingLock: jest.fn(),
      CreateCycleInvoice: jest.fn(),
      AdvanceSubscriptionPeriod: jest.fn(),
      MarkSubscriptionPastDue: jest.fn(),
      MarkSubscriptionUnpaid: jest.fn(),
      FinalizeCancelAtPeriodEnd: jest.fn(),
    } as unknown as jest.Mocked<SubscriptionModule>;

    invoiceModule = {
      PayInvoice: jest.fn(),
      MarkInvoiceUncollectible: jest.fn(),
    } as unknown as jest.Mocked<InvoiceModule>;

    module = new SubscriptionBillingModule(
      mockDb,
      subscriptionModule,
      invoiceModule
    );
  });

  it('should create a cycle invoice for a due subscription and advance on pay', async () => {
    const now = GetFixedTimestamp();
    mockDb.Query = jest
      .fn()
      .mockResolvedValueOnce([]) // retry invoices
      .mockResolvedValueOnce([
        {
          id: 'si_z_1',
          subscription: SUB_ID,
          current_period_end: now - 10,
          platform_account: PLATFORM,
        },
      ])
      .mockResolvedValueOnce([]); // open cycle invoices

    const claimed = {
      id: SUB_ID,
      platform_account: PLATFORM,
      status: 'active',
      collection_method: 'charge_automatically',
      subscription_delegation_pda: 'SubPda111',
      pause_collection: null,
      items: {
        object: 'list',
        data: [
          {
            id: 'si_z_1',
            current_period_start: now - 1000,
            current_period_end: now - 10,
          },
        ],
      },
    };

    subscriptionModule.ClaimForBilling.mockResolvedValue(claimed as never);
    subscriptionModule.CreateCycleInvoice.mockResolvedValue({
      id: INVOICE_ID,
      status: 'paid',
      attempt_count: 1,
    } as never);
    subscriptionModule.AdvanceSubscriptionPeriod.mockResolvedValue(
      claimed as never
    );

    const result = await module.Run({ batchSize: 10 });

    expect(subscriptionModule.CreateCycleInvoice).toHaveBeenCalledWith(
      PLATFORM,
      SUB_ID,
      { finalize: true, collect: true }
    );
    expect(subscriptionModule.AdvanceSubscriptionPeriod).toHaveBeenCalledWith(
      SUB_ID,
      INVOICE_ID
    );
    expect(result.succeeded).toBe(1);
    expect(result.failed).toBe(0);
  });

  it('should retry an open invoice when next_payment_attempt is due', async () => {
    const now = GetFixedTimestamp();
    mockDb.Query = jest
      .fn()
      .mockResolvedValueOnce([
        {
          id: INVOICE_ID,
          status: 'open',
          attempt_count: 1,
          next_payment_attempt: now - 1,
          parent: {
            subscription_details: { subscription: SUB_ID },
          },
          metadata: {},
        },
      ])
      .mockResolvedValueOnce([]); // no further due items

    const claimed = {
      id: SUB_ID,
      platform_account: PLATFORM,
      status: 'past_due',
      collection_method: 'charge_automatically',
      subscription_delegation_pda: 'SubPda111',
      items: { object: 'list', data: [] },
    };

    subscriptionModule.ClaimForBilling.mockResolvedValue(claimed as never);
    invoiceModule.PayInvoice.mockResolvedValue({
      id: INVOICE_ID,
      status: 'paid',
      attempt_count: 2,
    } as never);
    subscriptionModule.AdvanceSubscriptionPeriod.mockResolvedValue(
      claimed as never
    );

    const result = await module.Run({ batchSize: 10 });

    expect(invoiceModule.PayInvoice).toHaveBeenCalledWith(INVOICE_ID);
    expect(subscriptionModule.AdvanceSubscriptionPeriod).toHaveBeenCalled();
    expect(result.succeeded).toBe(1);
  });

  it('should mark unpaid after max payment attempts', async () => {
    const now = GetFixedTimestamp();
    mockDb.Query = jest
      .fn()
      .mockResolvedValueOnce([
        {
          id: INVOICE_ID,
          status: 'open',
          attempt_count: 3,
          next_payment_attempt: now - 1,
          parent: {
            subscription_details: { subscription: SUB_ID },
          },
          metadata: { last_payment_error: 'insufficient funds' },
        },
      ])
      .mockResolvedValueOnce([]);

    const claimed = {
      id: SUB_ID,
      platform_account: PLATFORM,
      status: 'past_due',
      collection_method: 'charge_automatically',
      subscription_delegation_pda: 'SubPda111',
      items: { object: 'list', data: [] },
    };

    subscriptionModule.ClaimForBilling.mockResolvedValue(claimed as never);
    invoiceModule.PayInvoice.mockResolvedValue({
      id: INVOICE_ID,
      status: 'open',
      attempt_count: 4,
      metadata: { last_payment_error: 'insufficient funds' },
    } as never);
    invoiceModule.MarkInvoiceUncollectible.mockResolvedValue({
      id: INVOICE_ID,
      status: 'uncollectible',
    } as never);
    subscriptionModule.MarkSubscriptionUnpaid.mockResolvedValue(
      claimed as never
    );

    const result = await module.Run({ batchSize: 10 });

    expect(invoiceModule.MarkInvoiceUncollectible).toHaveBeenCalledWith(
      INVOICE_ID
    );
    expect(subscriptionModule.MarkSubscriptionUnpaid).toHaveBeenCalledWith(
      SUB_ID,
      INVOICE_ID
    );
    expect(result.failed).toBe(1);
  });

  it('should skip when claim lock is already held', async () => {
    const now = GetFixedTimestamp();
    mockDb.Query = jest
      .fn()
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        {
          id: 'si_z_1',
          subscription: SUB_ID,
          current_period_end: now - 10,
          platform_account: PLATFORM,
        },
      ]);

    subscriptionModule.ClaimForBilling.mockResolvedValue(null);

    const result = await module.Run({ batchSize: 10 });

    expect(subscriptionModule.CreateCycleInvoice).not.toHaveBeenCalled();
    expect(result.skipped).toBe(1);
    expect(result.processed).toBe(0);
  });

  it('should finalize cancel_at_period_end instead of renewing', async () => {
    const now = GetFixedTimestamp();
    mockDb.Query = jest
      .fn()
      .mockResolvedValueOnce([]) // retry invoices
      .mockResolvedValueOnce([
        {
          id: 'si_z_1',
          subscription: SUB_ID,
          current_period_end: now - 10,
          platform_account: PLATFORM,
        },
      ])
      .mockResolvedValueOnce([]); // open cycle invoices

    const claimed = {
      id: SUB_ID,
      platform_account: PLATFORM,
      status: 'active',
      collection_method: 'charge_automatically',
      subscription_delegation_pda: 'SubPda111',
      pause_collection: null,
      cancel_at_period_end: true,
      cancel_at: now - 10,
      items: {
        object: 'list',
        data: [
          {
            id: 'si_z_1',
            current_period_start: now - 1000,
            current_period_end: now - 10,
          },
        ],
      },
    };

    subscriptionModule.ClaimForBilling.mockResolvedValue(claimed as never);
    subscriptionModule.FinalizeCancelAtPeriodEnd.mockResolvedValue({
      ...claimed,
      status: 'canceled',
      ended_at: now,
      cancel_at_period_end: false,
    } as never);

    const result = await module.Run({ batchSize: 10 });

    expect(subscriptionModule.FinalizeCancelAtPeriodEnd).toHaveBeenCalledWith(
      SUB_ID
    );
    expect(subscriptionModule.CreateCycleInvoice).not.toHaveBeenCalled();
    expect(result.succeeded).toBe(1);
    expect(result.failed).toBe(0);
  });
});
