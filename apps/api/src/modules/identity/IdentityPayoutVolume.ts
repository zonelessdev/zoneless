/**
 * @fileOverview Lifetime paid payout volume helpers for identity threshold rules.
 *
 * @module IdentityPayoutVolume
 */

import { Database } from '../Database';

/**
 * Sum amount (cents) of paid payouts for a connected account.
 */
export async function GetLifetimePaidPayoutVolumeCents(
  db: Database,
  accountId: string
): Promise<number> {
  const rows = await db.Aggregate<{ gross: number }>('Payouts', [
    {
      $match: {
        account: accountId,
        status: 'paid',
      },
    },
    {
      $group: {
        _id: null,
        gross: { $sum: '$amount' },
      },
    },
  ]);

  return rows[0]?.gross ?? 0;
}
