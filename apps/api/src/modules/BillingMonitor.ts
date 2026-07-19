/**
 * @fileOverview Billing Monitor - Polls for due subscription invoices
 *
 * Runs at regular intervals to create cycle invoices and collect Solana
 * subscription payments. DISABLED by default for multi-instance deployments
 * (e.g. Cloud Run). Prefer POST /v1/billing/run via Cloud Scheduler.
 *
 * To enable the in-process monitor (single-instance Docker / local):
 *   BILLING_MONITOR_ENABLED=true
 *
 * @module BillingMonitor
 */

import { Database } from './Database';
import {
  BillingRunResult,
  CreateSubscriptionBilling,
  SubscriptionBillingModule,
} from './SubscriptionBilling';
import { Logger } from '../utils/Logger';

const BILLING_POLL_INTERVAL_MS = parseInt(
  process.env.BILLING_POLL_INTERVAL_MS || '60000',
  10
);
const BILLING_MONITOR_ENABLED = process.env.BILLING_MONITOR_ENABLED === 'true';

export class BillingMonitor {
  private readonly billingModule: SubscriptionBillingModule;
  private intervalId: NodeJS.Timeout | null = null;
  private isRunning = false;
  private isPolling = false;

  constructor(db: Database, billingModule?: SubscriptionBillingModule) {
    this.billingModule = billingModule ?? CreateSubscriptionBilling(db);
  }

  static IsEnabled(): boolean {
    return BILLING_MONITOR_ENABLED;
  }

  static GetPollInterval(): number {
    return BILLING_POLL_INTERVAL_MS;
  }

  Start(): void {
    if (this.isRunning) {
      Logger.warn('BillingMonitor is already running');
      return;
    }

    if (!BillingMonitor.IsEnabled()) {
      Logger.info('BillingMonitor is disabled via configuration');
      return;
    }

    this.isRunning = true;
    Logger.info('BillingMonitor started', {
      pollInterval: BILLING_POLL_INTERVAL_MS,
    });

    this.Poll().catch((error) => {
      Logger.error('BillingMonitor initial poll failed', error);
    });

    this.intervalId = setInterval(() => {
      this.Poll().catch((error) => {
        Logger.error('BillingMonitor poll failed', error);
      });
    }, BILLING_POLL_INTERVAL_MS);
  }

  Stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    this.isRunning = false;
    Logger.info('BillingMonitor stopped');
  }

  IsRunning(): boolean {
    return this.isRunning;
  }

  async ManualPoll(): Promise<BillingRunResult> {
    return this.Poll();
  }

  private async Poll(): Promise<BillingRunResult> {
    if (this.isPolling) {
      Logger.debug('BillingMonitor poll already in progress, skipping');
      return {
        processed: 0,
        succeeded: 0,
        failed: 0,
        skipped: 0,
        errors: [],
      };
    }

    this.isPolling = true;
    try {
      return await this.billingModule.Run();
    } finally {
      this.isPolling = false;
    }
  }
}

let monitorInstance: BillingMonitor | null = null;

export function GetBillingMonitor(db: Database): BillingMonitor {
  if (!monitorInstance) {
    monitorInstance = new BillingMonitor(db);
  }
  return monitorInstance;
}
