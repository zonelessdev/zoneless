/**
 * @fileOverview Subscription billing runner
 *
 * Finds due subscriptions, claims them atomically, creates cycle invoices (or
 * retries open invoices), collects via Invoice → PaymentIntent → Solana, then
 * advances periods or marks past_due / unpaid.
 *
 * Safe for multi-instance deployments (Cloud Run) via billing_lock_until claims.
 *
 * @module SubscriptionBilling
 */

import { Database } from './Database';
import { EventService } from './EventService';
import { SubscriptionModule } from './Subscription';
import { InvoiceModule, INVOICE_MAX_PAYMENT_ATTEMPTS } from './Invoice';
import { CustomerModule } from './Customer';
import { PriceModule } from './Price';
import { ProductModule } from './Product';
import { InvoiceItemModule } from './InvoiceItem';
import { PaymentIntentModule } from './PaymentIntent';
import { ChargeModule } from './Charge';
import {
  Invoice as InvoiceType,
  QueryOperators,
  Subscription as SubscriptionType,
  SubscriptionItem as SubscriptionItemType,
} from '@zoneless/shared-types';
import { Now } from '../utils/Timestamp';
import { Logger } from '../utils/Logger';
import { ExpandableId } from './Util';

const DEFAULT_BATCH_SIZE = 25;
const BILLING_LOCK_SECONDS = 5 * 60;

type QueryParam = {
  key: string;
  operator: (typeof QueryOperators)[keyof typeof QueryOperators];
  value: unknown;
};

export interface BillingRunResult {
  processed: number;
  succeeded: number;
  failed: number;
  skipped: number;
  errors: Array<{ subscription: string; error: string }>;
}

/**
 * Wire Invoice + Subscription once for billing (routes / monitor / tests).
 */
export function CreateSubscriptionBilling(
  db: Database
): SubscriptionBillingModule {
  const eventService = new EventService(db);
  const customerModule = new CustomerModule(db, eventService);
  const productModule = new ProductModule(db, eventService);
  const priceModule = new PriceModule(db, eventService, productModule);
  const paymentIntentModule = new PaymentIntentModule(
    db,
    eventService,
    customerModule
  );
  const chargeModule = new ChargeModule(db, eventService, customerModule);
  const invoiceItemModule = new InvoiceItemModule(
    db,
    eventService,
    customerModule,
    priceModule
  );
  const invoiceModule = new InvoiceModule(
    db,
    eventService,
    customerModule,
    invoiceItemModule,
    paymentIntentModule,
    chargeModule,
    priceModule
  );
  const subscriptionModule = new SubscriptionModule(
    db,
    eventService,
    customerModule,
    priceModule,
    invoiceModule
  );
  return new SubscriptionBillingModule(db, subscriptionModule, invoiceModule);
}

export class SubscriptionBillingModule {
  private readonly db: Database;
  private readonly subscriptionModule: SubscriptionModule;
  private readonly invoiceModule: InvoiceModule;

  constructor(
    db: Database,
    subscriptionModule: SubscriptionModule,
    invoiceModule: InvoiceModule
  ) {
    this.db = db;
    this.subscriptionModule = subscriptionModule;
    this.invoiceModule = invoiceModule;
  }

  /**
   * Run one billing pass: process due renewals and invoice retries.
   */
  async Run(
    options: {
      platformAccountId?: string;
      batchSize?: number;
    } = {}
  ): Promise<BillingRunResult> {
    const batchSize = options.batchSize ?? DEFAULT_BATCH_SIZE;
    const now = Now();
    const result: BillingRunResult = {
      processed: 0,
      succeeded: 0,
      failed: 0,
      skipped: 0,
      errors: [],
    };

    const retryInvoices = await this.FindRetryInvoices(
      now,
      options.platformAccountId,
      batchSize
    );
    for (const invoice of retryInvoices) {
      if (result.processed >= batchSize) break;
      const subscriptionId = ExpandableId(
        invoice.parent?.subscription_details?.subscription
      );
      if (!subscriptionId) {
        result.skipped += 1;
        continue;
      }
      await this.WithBillingClaim(subscriptionId, result, async (claimed) => {
        const paid = await this.invoiceModule.PayInvoice(invoice.id);
        await this.HandleInvoiceOutcome(claimed, paid, result);
      });
    }

    const remaining = batchSize - result.processed;
    if (remaining <= 0) {
      return this.Finish(result);
    }

    const dueSubscriptionIds = await this.FindDueSubscriptionIds(
      now,
      options.platformAccountId,
      remaining * 2
    );

    for (const subscriptionId of dueSubscriptionIds) {
      if (result.processed >= batchSize) break;
      await this.WithBillingClaim(subscriptionId, result, async (claimed) => {
        await this.CollectOrCreateCycleInvoice(claimed, result);
      });
    }

    return this.Finish(result);
  }

  private Finish(result: BillingRunResult): BillingRunResult {
    Logger.info('Subscription billing run completed', {
      processed: result.processed,
      succeeded: result.succeeded,
      failed: result.failed,
      skipped: result.skipped,
      errorCount: result.errors.length,
    });
    return result;
  }

  /**
   * Claim → eligibility checks → work. Shared by retries and new cycles.
   */
  private async WithBillingClaim(
    subscriptionId: string,
    result: BillingRunResult,
    work: (claimed: SubscriptionType) => Promise<void>
  ): Promise<void> {
    const claimed = await this.subscriptionModule.ClaimForBilling(
      subscriptionId,
      Now() + BILLING_LOCK_SECONDS
    );
    if (!claimed) {
      result.skipped += 1;
      return;
    }

    result.processed += 1;

    try {
      if (!this.CanAutoCollect(claimed)) {
        result.skipped += 1;
        await this.subscriptionModule.ReleaseBillingLock(subscriptionId);
        return;
      }
      await work(claimed);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      result.failed += 1;
      result.errors.push({ subscription: subscriptionId, error: message });
      try {
        await this.subscriptionModule.MarkSubscriptionPastDue(subscriptionId);
      } catch {
        await this.subscriptionModule.ReleaseBillingLock(subscriptionId);
      }
    }
  }

  private CanAutoCollect(subscription: SubscriptionType): boolean {
    if (
      !subscription.subscription_delegation_pda ||
      subscription.collection_method !== 'charge_automatically' ||
      subscription.pause_collection
    ) {
      return false;
    }
    if (
      subscription.status !== 'active' &&
      subscription.status !== 'past_due' &&
      subscription.status !== 'trialing'
    ) {
      return false;
    }
    if (
      subscription.status === 'trialing' &&
      subscription.trial_end &&
      subscription.trial_end > Now()
    ) {
      return false;
    }
    return true;
  }

  private async CollectOrCreateCycleInvoice(
    claimed: SubscriptionType,
    result: BillingRunResult
  ): Promise<void> {
    const openCycle = await this.FindOpenCycleInvoice(claimed);
    if (openCycle) {
      if (
        openCycle.next_payment_attempt &&
        openCycle.next_payment_attempt > Now()
      ) {
        result.skipped += 1;
        await this.subscriptionModule.ReleaseBillingLock(claimed.id);
        return;
      }
      const paid = await this.invoiceModule.PayInvoice(openCycle.id);
      await this.HandleInvoiceOutcome(claimed, paid, result);
      return;
    }

    const minPeriodEnd = Math.min(
      ...claimed.items.data.map((item) => item.current_period_end)
    );
    const dueForTrialEnd =
      claimed.status === 'trialing' &&
      !!claimed.trial_end &&
      claimed.trial_end <= Now();
    if (minPeriodEnd > Now() && !dueForTrialEnd) {
      result.skipped += 1;
      await this.subscriptionModule.ReleaseBillingLock(claimed.id);
      return;
    }

    const invoice = await this.subscriptionModule.CreateCycleInvoice(
      claimed.platform_account,
      claimed.id,
      { finalize: true, collect: true }
    );
    await this.HandleInvoiceOutcome(claimed, invoice, result);
  }

  private async FindRetryInvoices(
    now: number,
    platformAccountId: string | undefined,
    limit: number
  ): Promise<InvoiceType[]> {
    return this.db.Query<InvoiceType>({
      collection: 'Invoices',
      method: 'READ',
      parameters: this.WithPlatformFilter(
        [
          { key: 'status', operator: QueryOperators['=='], value: 'open' },
          {
            key: 'collection_method',
            operator: QueryOperators['=='],
            value: 'charge_automatically',
          },
          {
            key: 'next_payment_attempt',
            operator: QueryOperators['<='],
            value: now,
          },
          {
            key: 'billing_reason',
            operator: QueryOperators['in'],
            value: [
              'subscription_cycle',
              'subscription_create',
              'subscription_update',
            ],
          },
        ],
        platformAccountId
      ),
      orderBy: [{ key: 'next_payment_attempt', direction: 'asc' }],
      limit,
    });
  }

  private async FindDueSubscriptionIds(
    now: number,
    platformAccountId: string | undefined,
    limit: number
  ): Promise<string[]> {
    const items =
      (await this.db.Query<SubscriptionItemType>({
        collection: 'SubscriptionItems',
        method: 'READ',
        parameters: this.WithPlatformFilter(
          [
            {
              key: 'current_period_end',
              operator: QueryOperators['<='],
              value: now,
            },
          ],
          platformAccountId
        ),
        orderBy: [{ key: 'current_period_end', direction: 'asc' }],
        limit,
      })) ?? [];

    const seen = new Set<string>();
    const ids: string[] = [];
    for (const item of items) {
      if (seen.has(item.subscription)) continue;
      seen.add(item.subscription);
      ids.push(item.subscription);
    }
    return ids;
  }

  private WithPlatformFilter(
    parameters: QueryParam[],
    platformAccountId: string | undefined
  ): QueryParam[] {
    if (!platformAccountId) return parameters;
    return [
      ...parameters,
      {
        key: 'platform_account',
        operator: QueryOperators['=='],
        value: platformAccountId,
      },
    ];
  }

  private async HandleInvoiceOutcome(
    subscription: SubscriptionType,
    invoice: InvoiceType,
    result: BillingRunResult
  ): Promise<void> {
    if (invoice.status === 'paid') {
      await this.subscriptionModule.AdvanceSubscriptionPeriod(
        subscription.id,
        invoice.id
      );
      result.succeeded += 1;
      return;
    }

    if (
      invoice.status === 'open' &&
      invoice.attempt_count >= INVOICE_MAX_PAYMENT_ATTEMPTS
    ) {
      await this.invoiceModule.MarkInvoiceUncollectible(invoice.id);
      await this.subscriptionModule.MarkSubscriptionUnpaid(
        subscription.id,
        invoice.id
      );
      result.failed += 1;
      result.errors.push({
        subscription: subscription.id,
        error: 'Payment retries exhausted',
      });
      return;
    }

    await this.subscriptionModule.MarkSubscriptionPastDue(
      subscription.id,
      invoice.id
    );
    result.failed += 1;
    result.errors.push({
      subscription: subscription.id,
      error:
        invoice.metadata?.['last_payment_error'] ?? 'Invoice payment failed',
    });
  }

  private async FindOpenCycleInvoice(
    subscription: SubscriptionType
  ): Promise<InvoiceType | null> {
    const invoices = await this.db.Query<InvoiceType>({
      collection: 'Invoices',
      method: 'READ',
      parameters: [
        {
          key: 'parent.subscription_details.subscription',
          operator: QueryOperators['=='],
          value: subscription.id,
        },
        { key: 'status', operator: QueryOperators['=='], value: 'open' },
      ],
      orderBy: [{ key: 'created', direction: 'desc' }],
      limit: 5,
    });

    const periodStart = Math.min(
      ...subscription.items.data.map((item) => item.current_period_start)
    );
    const periodEnd = Math.min(
      ...subscription.items.data.map((item) => item.current_period_end)
    );

    return (
      invoices.find(
        (invoice) =>
          invoice.billing_reason === 'subscription_cycle' ||
          invoice.period_end === periodEnd ||
          invoice.period_start === periodStart
      ) ?? null
    );
  }
}
