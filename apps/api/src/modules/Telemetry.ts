/**
 * @fileOverview Anonymous usage telemetry for self-hosted instances
 *
 * Opt-in heartbeats to zoneless.com. Never runs in operator mode.
 * See TELEMETRY.md for the field whitelist and kill switches.
 *
 * @module Telemetry
 */

import { randomUUID } from 'crypto';
import { readFileSync } from 'fs';
import { join } from 'path';
import {
  TelemetryConfig,
  TelemetryConnectedAccountsBucket,
  TelemetryPaymentCountBucket,
  TelemetryReport,
  TelemetryStatus,
  TelemetryVolumeBucket,
} from '@zoneless/shared-types';
import { Database } from './Database';
import { GetAppConfig, IsOperatorMode, IsSingleTenantMode } from './AppConfig';
import { AccountModule } from './Account';
import { Logger } from '../utils/Logger';
import { Now } from '../utils/Timestamp';

const CONFIG_COLLECTION = 'TelemetryConfigs';
const CONFIG_ID = 'telemetry' as const;

const SEND_TIMEOUT_MS = 10_000;
const SEVEN_DAYS_SECONDS = 7 * 24 * 60 * 60;

/** Amounts in BalanceTransactions are Stripe-style cents. */
const VOLUME_BUCKETS: { maxCents: number; bucket: TelemetryVolumeBucket }[] = [
  { maxCents: 0, bucket: '0' },
  { maxCents: 100_000, bucket: 'lt_1k' }, // < $1,000
  { maxCents: 1_000_000, bucket: 'lt_10k' },
  { maxCents: 10_000_000, bucket: 'lt_100k' },
  { maxCents: 100_000_000, bucket: 'lt_1m' },
];

/** True when telemetry UI/reporting is available (self-host only). */
export function IsTelemetryAvailable(): boolean {
  return !IsOperatorMode();
}

export function IsTelemetryForcedOff(): boolean {
  if (!IsTelemetryAvailable()) {
    return true;
  }
  return process.env.ZONELESS_TELEMETRY === '0';
}

const TELEMETRY_URL = 'https://zoneless.com/api/telemetry';

function GetZonelessVersion(): string {
  try {
    const pkgPath = join(process.cwd(), 'package.json');
    const pkg = JSON.parse(readFileSync(pkgPath, 'utf8')) as {
      version?: string;
    };
    return pkg.version || '0.0.0';
  } catch {
    return '0.0.0';
  }
}

function BucketPaymentCount(count: number): TelemetryPaymentCountBucket {
  if (count <= 0) return '0';
  if (count <= 10) return '1-10';
  if (count <= 100) return '11-100';
  if (count <= 1000) return '101-1000';
  return '1000+';
}

function BucketVolumeCents(cents: number): TelemetryVolumeBucket {
  if (cents <= 0) return '0';
  for (const { maxCents, bucket } of VOLUME_BUCKETS) {
    if (maxCents === 0) continue;
    if (cents < maxCents) return bucket;
  }
  return 'gte_1m';
}

function BucketConnectedAccounts(
  count: number
): TelemetryConnectedAccountsBucket {
  if (count <= 0) return '0';
  if (count === 1) return '1';
  if (count <= 10) return '2-10';
  if (count <= 100) return '11-100';
  return '100+';
}

export class TelemetryModule {
  private readonly db: Database;
  private readonly accountModule: AccountModule;
  private sending = false;

  constructor(db: Database) {
    this.db = db;
    this.accountModule = new AccountModule(db);
  }

  async GetConfig(): Promise<TelemetryConfig | null> {
    return this.db.Get<TelemetryConfig>(CONFIG_COLLECTION, CONFIG_ID);
  }

  async GetStatus(): Promise<TelemetryStatus> {
    const config = await this.GetConfig();
    const available = IsTelemetryAvailable();
    const forcedOff = IsTelemetryForcedOff();
    const consented = !!config?.enabled;
    return {
      object: 'telemetry_status',
      available,
      enabled: available && consented && !forcedOff,
      consented,
      forced_off: forcedOff,
      instance_id: config?.instance_id ?? null,
      last_sent_at: config?.last_sent_at ?? null,
    };
  }

  /**
   * Persist consent. Generates instance_id on first enable.
   * Clears instance_id when disabled (fresh identity if re-enabled).
   * No-ops on operator-managed instances.
   */
  async SetEnabled(enabled: boolean): Promise<TelemetryStatus> {
    if (!IsTelemetryAvailable()) {
      return this.GetStatus();
    }

    const now = Now();
    const existing = await this.GetConfig();

    if (enabled) {
      const instanceId = existing?.instance_id || randomUUID();
      const config: TelemetryConfig = {
        id: CONFIG_ID,
        object: 'telemetry_config',
        enabled: true,
        instance_id: instanceId,
        last_sent_at: existing?.last_sent_at ?? null,
        created: existing?.created ?? now,
        updated: now,
      };
      await this.db.Set<TelemetryConfig>(CONFIG_COLLECTION, CONFIG_ID, config);

      // Fire-and-forget immediate report after opt-in
      this.SendReport().catch((err) => {
        Logger.warn('Telemetry immediate send failed', {
          error: err instanceof Error ? err.message : String(err),
        });
      });
    } else {
      const config: TelemetryConfig = {
        id: CONFIG_ID,
        object: 'telemetry_config',
        enabled: false,
        instance_id: null,
        last_sent_at: null,
        created: existing?.created ?? now,
        updated: now,
      };
      await this.db.Set<TelemetryConfig>(CONFIG_COLLECTION, CONFIG_ID, config);
    }

    return this.GetStatus();
  }

  async IsEffectivelyEnabled(): Promise<boolean> {
    if (IsTelemetryForcedOff()) {
      return false;
    }
    const config = await this.GetConfig();
    return !!config?.enabled && !!config.instance_id;
  }

  async BuildReport(): Promise<TelemetryReport | null> {
    const config = await this.GetConfig();
    if (!config?.enabled || !config.instance_id) {
      return null;
    }

    const platforms = await this.accountModule.GetPlatformAccounts();
    const setupCompleted = platforms.length > 0;

    const { paymentCount, volumeCents, connectedCount } =
      await this.AggregateSevenDayMetrics();

    const nodeMajor = parseInt(process.versions.node.split('.')[0], 10) || 0;

    return {
      instance_id: config.instance_id,
      zoneless_version: GetZonelessVersion(),
      livemode: GetAppConfig().livemode,
      single_tenant: IsSingleTenantMode(),
      setup_completed: setupCompleted,
      os: process.platform,
      node_major: nodeMajor,
      payment_count_7d: BucketPaymentCount(paymentCount),
      usdc_volume_7d: BucketVolumeCents(volumeCents),
      connected_accounts: BucketConnectedAccounts(connectedCount),
    };
  }

  /**
   * Build and POST a report if effectively enabled.
   * Failures never throw to callers that fire-and-forget.
   */
  async SendReport(): Promise<boolean> {
    if (this.sending) {
      return false;
    }
    if (!(await this.IsEffectivelyEnabled())) {
      return false;
    }

    this.sending = true;
    try {
      const report = await this.BuildReport();
      if (!report) {
        return false;
      }

      const url = TELEMETRY_URL;
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), SEND_TIMEOUT_MS);

      try {
        const response = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(report),
          signal: controller.signal,
        });

        if (!response.ok) {
          Logger.warn('Telemetry ingest rejected report', {
            status: response.status,
          });
          return false;
        }

        await this.db.Update<TelemetryConfig>(CONFIG_COLLECTION, CONFIG_ID, {
          last_sent_at: Now(),
          updated: Now(),
        });
        return true;
      } finally {
        clearTimeout(timeout);
      }
    } catch (err) {
      Logger.warn('Telemetry send failed', {
        error: err instanceof Error ? err.message : String(err),
      });
      return false;
    } finally {
      this.sending = false;
    }
  }

  private async AggregateSevenDayMetrics(): Promise<{
    paymentCount: number;
    volumeCents: number;
    connectedCount: number;
  }> {
    const end = Now();
    const start = end - SEVEN_DAYS_SECONDS;

    const volumeRows = await this.db.Aggregate<{
      count: number;
      gross: number;
    }>('BalanceTransactions', [
      {
        $match: {
          type: { $in: ['payment', 'charge'] },
          created: { $gte: start, $lt: end },
        },
      },
      {
        $group: {
          _id: null,
          count: { $sum: 1 },
          gross: { $sum: '$amount' },
        },
      },
    ]);

    const paymentCount = volumeRows[0]?.count ?? 0;
    const volumeCents = volumeRows[0]?.gross ?? 0;

    const connectedRows = await this.db.Aggregate<{ count: number }>(
      'Accounts',
      [
        {
          $match: {
            $expr: { $ne: ['$platform_account', '$id'] },
          },
        },
        { $group: { _id: null, count: { $sum: 1 } } },
      ]
    );

    const connectedCount = connectedRows[0]?.count ?? 0;

    return { paymentCount, volumeCents, connectedCount };
  }
}

let telemetryInstance: TelemetryModule | null = null;

export function GetTelemetryModule(db: Database): TelemetryModule {
  if (!telemetryInstance) {
    telemetryInstance = new TelemetryModule(db);
  }
  return telemetryInstance;
}
