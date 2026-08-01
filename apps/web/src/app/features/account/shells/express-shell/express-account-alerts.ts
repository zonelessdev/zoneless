import type { Account } from '@zoneless/shared-types';
import { IsRejectedAccountReason } from '@zoneless/shared-schemas';
import { GetIdentityDocumentRequirementState } from '../../connected-accounts/util/identity-requirements';

export type ExpressAccountAlertAction = 'identity_task' | 'none';

export interface ExpressAccountAlert {
  variant: 'warning' | 'danger' | 'info';
  label: string;
  message: string;
  actionLabel: string | null;
  action: ExpressAccountAlertAction;
}

/**
 * Highest-priority alert for the express dashboard top banner.
 * Soft platform review signals are intentionally omitted — sellers only see
 * actionable or capability-impacting states.
 */
export function GetExpressAccountAlert(
  account: Account | null
): ExpressAccountAlert | null {
  if (!account) return null;

  if (IsRejectedAccountReason(account.requirements?.disabled_reason)) {
    return {
      variant: 'danger',
      label: 'Account rejected',
      message:
        'This account has been rejected. Payouts and payments are disabled.',
      actionLabel: null,
      action: 'none',
    };
  }

  const idvState = GetIdentityDocumentRequirementState(account);

  if (idvState === 'pending') {
    return {
      variant: 'info',
      label: 'In review',
      message:
        'We are reviewing your identity document. This usually completes within a short time.',
      actionLabel: 'View task',
      action: 'identity_task',
    };
  }

  if (idvState === 'currently_due') {
    return {
      variant: 'warning',
      label: 'Action required',
      message: account.payouts_enabled
        ? 'We need some information for your account. Provide it to keep payouts enabled.'
        : 'We need some information for your account. Provide it to resume payouts.',
      actionLabel: 'View task',
      action: 'identity_task',
    };
  }

  if (!account.payouts_enabled) {
    return {
      variant: 'warning',
      label: 'Payouts paused',
      message:
        'Payouts are currently disabled on your account. Contact your platform if you need help.',
      actionLabel: null,
      action: 'none',
    };
  }

  return null;
}
