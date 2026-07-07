/**
 * @fileOverview Platform API usage metering
 *
 * Tracks authenticated API requests per platform per day in the
 * UsageCounters collection. One document per { platform_account, date },
 * incremented atomically. Used by the operator API to report usage
 * for managed-hosting billing and dashboards.
 *
 * @module Usage
 */

import { Database } from './Database';
import { UsageCounter, OperatorUsage } from '@zoneless/shared-types';
import { Logger } from '../utils/Logger';

export class UsageModule {
  private readonly db: Database;

  constructor(db: Database) {
    this.db = db;
  }

  /**
   * Record one API request for a platform (fire and forget).
   * Increments today's counter, creating it if needed.
   *
   * @param platformAccountId - The platform account the request belongs to
   */
  RecordRequest(platformAccountId: string): void {
    const date = this.Today();
    const documentId = `usage_${platformAccountId}_${date}`;

    this.db
      .Increment('UsageCounters', documentId, 'count', 1, {
        object: 'usage_counter',
        platform_account: platformAccountId,
        date,
      })
      .catch((err) => {
        Logger.warn('Failed to record usage', {
          platformAccountId,
          error: err,
        });
      });
  }

  /**
   * Get daily usage counters for a platform over a trailing window.
   *
   * @param platformAccountId - The platform account to report on
   * @param days - Number of days to include (default 30)
   * @returns Usage counters, most recent first, plus a window total
   */
  async GetUsage(platformAccountId: string, days = 30): Promise<OperatorUsage> {
    const since = new Date();
    since.setUTCDate(since.getUTCDate() - (days - 1));
    const sinceDate = since.toISOString().slice(0, 10);

    const counters = await this.db.Find2Custom<UsageCounter>(
      'UsageCounters',
      'platform_account',
      '==',
      platformAccountId,
      'date',
      '>=',
      sinceDate
    );

    const sorted = counters.sort((a, b) => b.date.localeCompare(a.date));
    const total = sorted.reduce((sum, counter) => sum + counter.count, 0);

    return {
      object: 'operator_usage',
      platform_account: platformAccountId,
      data: sorted,
      total,
    };
  }

  /**
   * Today's date in YYYY-MM-DD format (UTC).
   */
  private Today(): string {
    return new Date().toISOString().slice(0, 10);
  }
}
