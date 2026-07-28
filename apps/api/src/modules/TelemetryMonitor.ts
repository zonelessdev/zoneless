/**
 * @fileOverview Telemetry Monitor — daily anonymous usage heartbeats
 *
 * Starts only for self-host live mode. SendReport still no-ops when consent
 * is off or ZONELESS_TELEMETRY=0.
 *
 * @module TelemetryMonitor
 */

import { Database } from './Database';
import { GetAppConfig } from './AppConfig';
import { GetTelemetryModule, IsTelemetryForcedOff } from './Telemetry';
import { Logger } from '../utils/Logger';

const TELEMETRY_INTERVAL_MS = 1000 * 60 * 60 * 24;

export class TelemetryMonitor {
  private readonly db: Database;
  private intervalId: NodeJS.Timeout | null = null;
  private startupTimeoutId: NodeJS.Timeout | null = null;
  private isRunning = false;

  constructor(db: Database) {
    this.db = db;
  }

  /** Skip when force-disabled, operator mode, or test mode. */
  static ShouldStart(): boolean {
    return !IsTelemetryForcedOff() && GetAppConfig().livemode;
  }

  Start(): void {
    if (this.isRunning) {
      Logger.warn('TelemetryMonitor is already running');
      return;
    }

    if (!TelemetryMonitor.ShouldStart()) {
      Logger.info(
        'TelemetryMonitor skipped (disabled, operator, or test mode)'
      );
      return;
    }

    this.isRunning = true;
    Logger.info('TelemetryMonitor started', {
      intervalMs: TELEMETRY_INTERVAL_MS,
    });

    // Delay first tick slightly so startup isn't blocked on network
    this.startupTimeoutId = setTimeout(() => {
      this.startupTimeoutId = null;
      this.Tick().catch((error) => {
        Logger.warn('TelemetryMonitor initial tick failed', {
          error: error instanceof Error ? error.message : String(error),
        });
      });
    }, 30_000);

    this.intervalId = setInterval(() => {
      this.Tick().catch((error) => {
        Logger.warn('TelemetryMonitor tick failed', {
          error: error instanceof Error ? error.message : String(error),
        });
      });
    }, TELEMETRY_INTERVAL_MS);
  }

  Stop(): void {
    if (this.startupTimeoutId) {
      clearTimeout(this.startupTimeoutId);
      this.startupTimeoutId = null;
    }
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    this.isRunning = false;
    Logger.info('TelemetryMonitor stopped');
  }

  private async Tick(): Promise<void> {
    const telemetry = GetTelemetryModule(this.db);
    await telemetry.SendReport();
  }
}

let monitorInstance: TelemetryMonitor | null = null;

export function GetTelemetryMonitor(db: Database): TelemetryMonitor {
  if (!monitorInstance) {
    monitorInstance = new TelemetryMonitor(db);
  }
  return monitorInstance;
}
