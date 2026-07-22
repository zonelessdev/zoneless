import { InvoiceModule } from '../modules/Invoice';
import { Database } from '../modules/Database';
import { EventService } from '../modules/EventService';
import { CustomerModule } from '../modules/Customer';
import { InvoiceItemModule } from '../modules/InvoiceItem';
import { Invoice, InvoiceItem } from '@zoneless/shared-types';
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
    tax_ids: { object: 'list', data: [], has_more: false, url: '/v1/tax_ids' },
    balance: 0,
    ...overrides,
  };
}

function DraftInvoice(overrides: Partial<Invoice> = {}): Invoice {
  return {
    id: 'in_z_test001',
    object: 'invoice',
    account_country: null,
    account_name: null,
    account_tax_ids: null,
    amount_due: 1099,
    amount_overpaid: 0,
    amount_paid: 0,
    amount_paid_off_stripe: 0,
    amount_remaining: 1099,
    amount_shipping: 0,
    application: null,
    attempt_count: 0,
    attempted: false,
    auto_advance: false,
    automatic_tax: {
      disabled_reason: null,
      enabled: false,
      liability: null,
      provider: null,
      status: null,
    },
    automatically_finalizes_at: null,
    billing_reason: 'manual',
    collection_method: 'charge_automatically',
    confirmation_secret: null,
    created: GetFixedTimestamp(),
    currency: 'usdc',
    custom_fields: null,
    customer: CUSTOMER_ID,
    customer_account: null,
    customer_address: null,
    customer_email: 'jennyrosen@example.com',
    customer_name: 'Jenny Rosen',
    customer_phone: null,
    customer_shipping: null,
    customer_tax_exempt: 'none',
    customer_tax_ids: [],
    default_payment_method: null,
    default_source: null,
    default_tax_rates: [],
    description: null,
    discounts: [],
    due_date: null,
    effective_at: null,
    ending_balance: null,
    footer: null,
    from_invoice: null,
    hosted_invoice_url: null,
    invoice_pdf: null,
    issuer: { type: 'self', account: null },
    last_finalization_error: null,
    latest_revision: null,
    lines: {
      object: 'list',
      data: [],
      has_more: false,
      total_count: 0,
      url: '/v1/invoices/in_z_test001/lines',
    },
    livemode: false,
    metadata: {},
    next_payment_attempt: null,
    number: null,
    on_behalf_of: null,
    parent: null,
    payment_settings: {
      default_mandate: null,
      payment_method_options: null,
      payment_method_types: null,
    },
    payments: {
      object: 'list',
      data: [],
      has_more: false,
      total_count: 0,
      url: '/v1/invoices/in_z_test001/payments',
    },
    period_end: GetFixedTimestamp(),
    period_start: GetFixedTimestamp(),
    post_payment_credit_notes_amount: 0,
    pre_payment_credit_notes_amount: 0,
    receipt_number: null,
    rendering: null,
    shipping_cost: null,
    shipping_details: null,
    starting_balance: 0,
    statement_descriptor: null,
    status: 'draft',
    status_transitions: {
      finalized_at: null,
      marked_uncollectible_at: null,
      paid_at: null,
      voided_at: null,
    },
    subtotal: 1099,
    subtotal_excluding_tax: 1099,
    test_clock: null,
    threshold_reason: null,
    total: 1099,
    total_discount_amounts: [],
    total_excluding_tax: 1099,
    total_pretax_credit_amounts: [],
    total_taxes: [],
    transfer_data: null,
    webhooks_delivered_at: GetFixedTimestamp(),
    platform_account: PLATFORM,
    ...overrides,
  } as Invoice;
}

describe('InvoiceModule', () => {
  let module: InvoiceModule;
  let mockDb: jest.Mocked<Database>;
  let eventService: jest.Mocked<EventService>;
  let customerModule: jest.Mocked<CustomerModule>;
  let invoiceItemModule: jest.Mocked<InvoiceItemModule>;

  beforeEach(() => {
    jest.clearAllMocks();
    ResetIdCounter();
    mockDb = CreateMockDatabase();
    eventService = {
      Emit: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<EventService>;
    customerModule = {
      GetCustomer: jest.fn().mockResolvedValue(MockCustomer()),
      ClaimNextInvoiceNumber: jest.fn().mockResolvedValue('TESTPREF-0001'),
    } as unknown as jest.Mocked<CustomerModule>;
    invoiceItemModule = {
      ListAllPendingInvoiceItems: jest.fn().mockResolvedValue([]),
      AttachInvoiceItems: jest.fn().mockResolvedValue([]),
    } as unknown as jest.Mocked<InvoiceItemModule>;
    module = new InvoiceModule(
      mockDb,
      eventService,
      customerModule,
      invoiceItemModule
    );
  });

  describe('CreateInvoice', () => {
    it('should persist a draft invoice and emit invoice.created', async () => {
      const invoice = await module.CreateInvoice(PLATFORM, {
        customer: CUSTOMER_ID,
      });

      expect(invoice.object).toBe('invoice');
      expect(invoice.status).toBe('draft');
      expect(invoice.customer).toBe(CUSTOMER_ID);
      expect(invoice.customer_email).toBe('jennyrosen@example.com');
      expect(invoice.customer_name).toBe('Jenny Rosen');
      expect(invoice.currency).toBe('usdc');
      expect(invoice.billing_reason).toBe('manual');
      expect(invoice.collection_method).toBe('charge_automatically');
      expect(invoice.lines.data).toEqual([]);
      expect(invoice.platform_account).toBe(PLATFORM);
      expect(mockDb.Set).toHaveBeenCalledWith('Invoices', invoice.id, invoice);
      expect(eventService.Emit).toHaveBeenCalledWith(
        'invoice.created',
        PLATFORM,
        invoice
      );
      expect(
        invoiceItemModule.ListAllPendingInvoiceItems
      ).not.toHaveBeenCalled();
    });

    it('should leave pending items alone when behavior is exclude (default)', async () => {
      await module.CreateInvoice(PLATFORM, {
        customer: CUSTOMER_ID,
        pending_invoice_items_behavior: 'exclude',
      });

      expect(
        invoiceItemModule.ListAllPendingInvoiceItems
      ).not.toHaveBeenCalled();
      expect(invoiceItemModule.AttachInvoiceItems).not.toHaveBeenCalled();
    });

    it('should include pending invoice items and recalculate totals', async () => {
      const pendingItem = {
        id: 'ii_z_1',
        object: 'invoiceitem',
        amount: 1099,
        currency: 'usdc',
        created: GetFixedTimestamp(),
        date: GetFixedTimestamp(),
        description: 'My First Invoice Item',
        discountable: true,
        discounts: [],
        invoice: null,
        livemode: false,
        metadata: {},
        period: {
          start: GetFixedTimestamp(),
          end: GetFixedTimestamp(),
        },
        pricing: {
          price_details: null,
          type: 'price_details',
          unit_amount_decimal: '1099',
        },
        proration: false,
        parent: null,
        quantity: 1,
        quantity_decimal: '1',
        platform_account: PLATFORM,
      } as InvoiceItem;

      invoiceItemModule.ListAllPendingInvoiceItems = jest
        .fn()
        .mockResolvedValue([pendingItem]);
      invoiceItemModule.AttachInvoiceItems = jest
        .fn()
        .mockResolvedValue([{ ...pendingItem, invoice: 'attached' }]);

      const invoice = await module.CreateInvoice(PLATFORM, {
        customer: CUSTOMER_ID,
        pending_invoice_items_behavior: 'include',
      });

      expect(invoiceItemModule.ListAllPendingInvoiceItems).toHaveBeenCalledWith(
        PLATFORM,
        CUSTOMER_ID
      );
      expect(invoiceItemModule.AttachInvoiceItems).toHaveBeenCalledWith(
        ['ii_z_1'],
        invoice.id
      );
      expect(invoice.lines.data).toHaveLength(1);
      expect(invoice.lines.data[0].amount).toBe(1099);
      expect(invoice.lines.data[0].parent?.type).toBe('invoice_item_details');
      expect(invoice.subtotal).toBe(1099);
      expect(invoice.total).toBe(1099);
      expect(invoice.amount_due).toBe(1099);
      expect(invoice.amount_remaining).toBe(1099);
    });

    it('should reject customers that do not belong to the platform', async () => {
      customerModule.GetCustomer = jest.fn().mockResolvedValue({
        id: CUSTOMER_ID,
        platform_account: 'acct_z_other',
      });

      await expect(
        module.CreateInvoice(PLATFORM, { customer: CUSTOMER_ID })
      ).rejects.toThrow('Customer not found');
    });

    it('should reject unsupported currencies', async () => {
      await expect(
        module.CreateInvoice(PLATFORM, {
          customer: CUSTOMER_ID,
          currency: 'usd',
        })
      ).rejects.toThrow("Currency 'usd' is not supported");
    });
  });

  describe('UpdateInvoice', () => {
    it('should update metadata and emit invoice.updated with previous attributes', async () => {
      const existing = DraftInvoice({ metadata: {} });
      mockDb.Get = jest
        .fn()
        .mockResolvedValueOnce(existing)
        .mockResolvedValueOnce({
          ...existing,
          metadata: { order_id: '6735' },
        });

      const result = await module.UpdateInvoice(existing.id, {
        metadata: { order_id: '6735' },
      });

      expect(mockDb.Update).toHaveBeenCalledWith(
        'Invoices',
        existing.id,
        expect.objectContaining({ metadata: { order_id: '6735' } })
      );
      expect(eventService.Emit).toHaveBeenCalledWith(
        'invoice.updated',
        PLATFORM,
        result,
        expect.objectContaining({
          previousAttributes: expect.any(Object),
        })
      );
    });

    it('should reject draft-only fields on a finalized invoice', async () => {
      mockDb.Get = jest
        .fn()
        .mockResolvedValue(DraftInvoice({ status: 'open' }));

      await expect(
        module.UpdateInvoice('in_z_test001', {
          collection_method: 'send_invoice',
        })
      ).rejects.toThrow(
        'Cannot update collection_method on a non-draft invoice'
      );
    });
  });

  describe('DeleteInvoice', () => {
    it('should delete a draft and emit invoice.deleted', async () => {
      const existing = DraftInvoice();
      mockDb.Get = jest.fn().mockResolvedValue(existing);

      const result = await module.DeleteInvoice(existing.id);

      expect(mockDb.Delete).toHaveBeenCalledWith('Invoices', existing.id);
      expect(eventService.Emit).toHaveBeenCalledWith(
        'invoice.deleted',
        PLATFORM,
        existing
      );
      expect(result).toEqual({
        id: existing.id,
        object: 'invoice',
        deleted: true,
      });
    });

    it('should reject deleting a non-draft invoice', async () => {
      mockDb.Get = jest
        .fn()
        .mockResolvedValue(DraftInvoice({ status: 'open' }));

      await expect(module.DeleteInvoice('in_z_test001')).rejects.toThrow(
        "Cannot delete invoice with status 'open'"
      );
    });
  });

  describe('FinalizeInvoice', () => {
    it('should move draft to open and emit invoice.finalized', async () => {
      const existing = DraftInvoice({ number: null, amount_due: 0 });
      mockDb.Get = jest
        .fn()
        .mockResolvedValueOnce(existing)
        .mockResolvedValueOnce({
          ...existing,
          status: 'open',
          number: 'TESTPREF-0001',
          status_transitions: {
            ...existing.status_transitions,
            finalized_at: GetFixedTimestamp(),
          },
        });

      const result = await module.FinalizeInvoice(existing.id);

      expect(customerModule.ClaimNextInvoiceNumber).toHaveBeenCalledWith(
        CUSTOMER_ID
      );
      expect(mockDb.Update).toHaveBeenCalledWith(
        'Invoices',
        existing.id,
        expect.objectContaining({
          status: 'open',
          ending_balance: 0,
          number: 'TESTPREF-0001',
        })
      );
      expect(eventService.Emit).toHaveBeenCalledWith(
        'invoice.finalized',
        PLATFORM,
        result
      );
      expect(result.status).toBe('open');
    });

    it('should keep an existing invoice number without claiming a new sequence', async () => {
      const existing = DraftInvoice({
        number: 'CUSTOM-0042',
        amount_due: 0,
      });
      mockDb.Get = jest
        .fn()
        .mockResolvedValueOnce(existing)
        .mockResolvedValueOnce({
          ...existing,
          status: 'open',
        });

      await module.FinalizeInvoice(existing.id);

      expect(customerModule.ClaimNextInvoiceNumber).not.toHaveBeenCalled();
      expect(mockDb.Update).toHaveBeenCalledWith(
        'Invoices',
        existing.id,
        expect.objectContaining({
          number: 'CUSTOM-0042',
        })
      );
    });

    it('should create a PaymentIntent and confirmation_secret when amount_due > 0', async () => {
      const existing = DraftInvoice({
        number: null,
        amount_due: 1099,
        collection_method: 'charge_automatically',
      });
      const paymentIntentModule = {
        CreatePaymentIntent: jest.fn().mockResolvedValue({
          id: 'pi_z_1',
          client_secret: 'pi_z_1_secret_abc',
          amount: 1099,
        }),
      };

      module = new InvoiceModule(
        mockDb,
        eventService,
        customerModule,
        invoiceItemModule,
        paymentIntentModule as never
      );

      mockDb.Get = jest
        .fn()
        .mockResolvedValueOnce(existing)
        .mockResolvedValueOnce({
          ...existing,
          status: 'open',
          confirmation_secret: {
            type: 'payment_intent',
            client_secret: 'pi_z_1_secret_abc',
          },
        });

      await module.FinalizeInvoice(existing.id);

      expect(paymentIntentModule.CreatePaymentIntent).toHaveBeenCalledWith(
        PLATFORM,
        expect.objectContaining({
          amount: 1099,
          currency: 'usdc',
          customer: CUSTOMER_ID,
        })
      );
      expect(mockDb.Update).toHaveBeenCalledWith(
        'Invoices',
        existing.id,
        expect.objectContaining({
          status: 'open',
          confirmation_secret: {
            type: 'payment_intent',
            client_secret: 'pi_z_1_secret_abc',
          },
          payments: expect.objectContaining({
            total_count: 1,
          }),
        })
      );
    });

    it('should reject finalizing a non-draft invoice', async () => {
      mockDb.Get = jest
        .fn()
        .mockResolvedValue(DraftInvoice({ status: 'open', amount_due: 0 }));

      await expect(module.FinalizeInvoice('in_z_test001')).rejects.toThrow(
        "Cannot finalize invoice with status 'open'"
      );
    });
  });

  describe('MarkInvoiceUncollectible', () => {
    it('should mark an open invoice uncollectible and emit the event', async () => {
      const existing = DraftInvoice({ status: 'open' });
      mockDb.Get = jest
        .fn()
        .mockResolvedValueOnce(existing)
        .mockResolvedValueOnce({
          ...existing,
          status: 'uncollectible',
        });

      const result = await module.MarkInvoiceUncollectible(existing.id);

      expect(mockDb.Update).toHaveBeenCalledWith(
        'Invoices',
        existing.id,
        expect.objectContaining({ status: 'uncollectible' })
      );
      expect(eventService.Emit).toHaveBeenCalledWith(
        'invoice.marked_uncollectible',
        PLATFORM,
        result
      );
    });
  });

  describe('PayInvoice', () => {
    it('should require a PaymentIntent when not paid out of band', async () => {
      mockDb.Get = jest
        .fn()
        .mockResolvedValue(DraftInvoice({ status: 'open', amount_due: 1099 }));

      await expect(module.PayInvoice('in_z_test001', {})).rejects.toThrow(
        'Invoice has no PaymentIntent'
      );
    });

    it('should mark paid out of band and emit paid + payment_succeeded', async () => {
      const existing = DraftInvoice({
        status: 'open',
        amount_due: 1099,
        amount_remaining: 1099,
      });
      mockDb.Get = jest
        .fn()
        .mockResolvedValueOnce(existing)
        .mockResolvedValueOnce({
          ...existing,
          status: 'paid',
          amount_paid: 1099,
          amount_remaining: 0,
          attempted: true,
        });

      const result = await module.PayInvoice(existing.id, {
        paid_out_of_band: true,
      });

      expect(mockDb.Update).toHaveBeenCalledWith(
        'Invoices',
        existing.id,
        expect.objectContaining({
          status: 'paid',
          amount_paid: 1099,
          amount_remaining: 0,
          attempted: true,
        })
      );
      expect(eventService.Emit).toHaveBeenCalledWith(
        'invoice.paid',
        PLATFORM,
        result
      );
      expect(eventService.Emit).toHaveBeenCalledWith(
        'invoice.payment_succeeded',
        PLATFORM,
        result
      );
    });

    it('should settle with settlement_signature and create charge', async () => {
      const existing = DraftInvoice({
        status: 'open',
        amount_due: 1099,
        amount_remaining: 1099,
        payments: {
          object: 'list',
          data: [
            {
              id: 'inpay_z_1',
              object: 'invoice_payment',
              amount_paid: null,
              amount_requested: 1099,
              created: GetFixedTimestamp(),
              currency: 'usdc',
              invoice: 'in_z_test001',
              is_default: true,
              livemode: false,
              payment: {
                charge: null,
                payment_intent: 'pi_z_1',
                payment_record: null,
                type: 'payment_intent',
              },
              status: 'open',
              status_transitions: { canceled_at: null, paid_at: null },
              platform_account: PLATFORM,
            },
          ],
          has_more: false,
          total_count: 1,
          url: '/v1/invoices/in_z_test001/payments',
        },
      });

      const paymentIntentModule = {
        MarkSucceeded: jest.fn().mockResolvedValue({ id: 'pi_z_1' }),
        MarkPaymentFailed: jest.fn(),
      };
      const chargeModule = {
        CreateFromPaymentAttempt: jest.fn().mockResolvedValue({
          id: 'ch_z_1',
        }),
        AttachBalanceTransaction: jest.fn().mockResolvedValue({
          id: 'ch_z_1',
          balance_transaction: 'txn_z_1',
        }),
      };

      module = new InvoiceModule(
        mockDb,
        eventService,
        customerModule,
        invoiceItemModule,
        paymentIntentModule as never,
        chargeModule as never
      );

      const paidInvoice = {
        ...existing,
        status: 'paid' as const,
        amount_paid: 1099,
        amount_remaining: 0,
        attempted: true,
        next_payment_attempt: null,
      };

      mockDb.Get = jest
        .fn()
        .mockResolvedValueOnce(existing)
        .mockImplementation(async (collection: string, id: string) => {
          if (collection === 'Invoices' && id === existing.id) {
            return paidInvoice;
          }
          return null;
        }) as typeof mockDb.Get;

      const result = await module.PayInvoice(existing.id, {
        settlement_signature: 'sig_settled',
      });

      expect(chargeModule.CreateFromPaymentAttempt).toHaveBeenCalled();
      expect(chargeModule.AttachBalanceTransaction).toHaveBeenCalledWith(
        'ch_z_1',
        expect.any(String)
      );
      expect(paymentIntentModule.MarkSucceeded).toHaveBeenCalledWith(
        'pi_z_1',
        expect.objectContaining({
          amountReceived: 1099,
          latestCharge: 'ch_z_1',
        })
      );
      expect(result.status).toBe('paid');
    });

    it('should not mark paid when on-chain period was already collected', async () => {
      const existing = DraftInvoice({
        status: 'open',
        amount_due: 1099,
        amount_remaining: 1099,
        parent: {
          type: 'subscription_details',
          subscription_details: {
            subscription: 'sub_z_1',
            metadata: null,
            subscription_proration_date: null,
          },
          quote_details: null,
        },
        payments: {
          object: 'list',
          data: [
            {
              id: 'inpay_z_1',
              object: 'invoice_payment',
              amount_paid: null,
              amount_requested: 1099,
              created: GetFixedTimestamp(),
              currency: 'usdc',
              invoice: 'in_z_test001',
              is_default: true,
              livemode: false,
              payment: {
                charge: null,
                payment_intent: 'pi_z_1',
                payment_record: null,
                type: 'payment_intent',
              },
              status: 'open',
              status_transitions: { canceled_at: null, paid_at: null },
              platform_account: PLATFORM,
            },
          ],
          has_more: false,
          total_count: 1,
          url: '/v1/invoices/in_z_test001/payments',
        },
      });

      let invoiceState: Invoice = existing;

      const paymentIntentModule = {
        MarkSucceeded: jest.fn(),
        MarkPaymentFailed: jest.fn().mockResolvedValue({ id: 'pi_z_1' }),
      };
      const chargeModule = {
        CreateFromPaymentAttempt: jest.fn(),
        AttachBalanceTransaction: jest.fn(),
      };
      const solana = {
        CollectSubscriptionPayment: jest.fn().mockResolvedValue({
          signature: 'already_collected',
          alreadyCollected: true,
        }),
      };

      module = new InvoiceModule(
        mockDb,
        eventService,
        customerModule,
        invoiceItemModule,
        paymentIntentModule as never,
        chargeModule as never,
        undefined,
        solana as never
      );

      mockDb.Get = jest.fn().mockImplementation(async (collection: string) => {
        if (collection === 'Invoices') return invoiceState;
        if (collection === 'Subscriptions') {
          return {
            id: 'sub_z_1',
            platform_account: PLATFORM,
            subscription_delegation_pda: 'SubPda_1',
            default_payment_method: 'Wallet111',
            metadata: {},
          };
        }
        if (collection === 'Prices') {
          return {
            id: 'price_z_1',
            platform_account: PLATFORM,
            subscription_plan_pda: 'PlanPda_1',
          };
        }
        return null;
      }) as typeof mockDb.Get;

      mockDb.Find = jest.fn().mockResolvedValue([
        {
          id: 'si_z_1',
          subscription: 'sub_z_1',
          price: 'price_z_1',
        },
      ]) as typeof mockDb.Find;

      mockDb.Update = jest
        .fn()
        .mockImplementation(
          async (
            _collection: string,
            _id: string,
            updates: Partial<Invoice>
          ) => {
            invoiceState = { ...invoiceState, ...updates };
            return invoiceState;
          }
        ) as typeof mockDb.Update;

      const result = await module.PayInvoice(existing.id, {});

      expect(solana.CollectSubscriptionPayment).toHaveBeenCalled();
      expect(chargeModule.CreateFromPaymentAttempt).not.toHaveBeenCalled();
      expect(paymentIntentModule.MarkSucceeded).not.toHaveBeenCalled();
      expect(result.status).not.toBe('paid');
      expect(result.attempted).toBe(true);
      expect(eventService.Emit).toHaveBeenCalledWith(
        'invoice.payment_failed',
        PLATFORM,
        expect.anything()
      );
    });
  });

  describe('VoidInvoice', () => {
    it('should void an open invoice and emit invoice.voided', async () => {
      const existing = DraftInvoice({ status: 'open' });
      mockDb.Get = jest
        .fn()
        .mockResolvedValueOnce(existing)
        .mockResolvedValueOnce({
          ...existing,
          status: 'void',
        });

      const result = await module.VoidInvoice(existing.id);

      expect(mockDb.Update).toHaveBeenCalledWith(
        'Invoices',
        existing.id,
        expect.objectContaining({ status: 'void' })
      );
      expect(eventService.Emit).toHaveBeenCalledWith(
        'invoice.voided',
        PLATFORM,
        result
      );
    });

    it('should reject voiding a draft invoice', async () => {
      mockDb.Get = jest
        .fn()
        .mockResolvedValue(DraftInvoice({ status: 'draft' }));

      await expect(module.VoidInvoice('in_z_test001')).rejects.toThrow(
        "Cannot void invoice with status 'draft'"
      );
    });
  });

  describe('ListInvoices', () => {
    it('should pass account and filters to ListHelper', async () => {
      const listSpy = jest
        .spyOn(ListHelper.prototype, 'List')
        .mockResolvedValue({
          object: 'list',
          data: [],
          has_more: false,
          url: '/v1/invoices',
        });

      await module.ListInvoices({
        account: PLATFORM,
        limit: 25,
        customer: CUSTOMER_ID,
        status: 'draft',
        collection_method: 'charge_automatically',
      });

      expect(listSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          account: PLATFORM,
          limit: 25,
          filters: expect.objectContaining({
            customer: CUSTOMER_ID,
            status: 'draft',
            collection_method: 'charge_automatically',
          }),
        })
      );
    });
  });
});
