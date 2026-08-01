import type { Account } from '@zoneless/shared-types';
import { IDENTITY_REQUIREMENT_FIELDS } from '@zoneless/shared-schemas';

export const VERIFICATION_DOCUMENT_FIELD =
  IDENTITY_REQUIREMENT_FIELDS.verificationDocument;

export type IdentityDocumentRequirementState =
  | 'none'
  | 'eventually_due'
  | 'currently_due'
  | 'pending'
  | 'verified';

/**
 * Whether the Express seller must act now (banner / Settings Tasks).
 * Quiet for eventually_due foreshadow — matches Stripe Express default.
 */
export function NeedsIdentityDocumentRemediation(
  account: Account | null
): boolean {
  if (!account) return false;
  return IsIdentityDocumentRemediationState(
    GetIdentityDocumentRequirementState(account)
  );
}

/**
 * Whether the platform should show identity Actions required (including
 * below-threshold eventually_due foreshadow).
 */
export function NeedsIdentityDocumentAction(account: Account | null): boolean {
  if (!account) return false;
  const state = GetIdentityDocumentRequirementState(account);
  return IsIdentityDocumentRemediationState(state) || state === 'eventually_due';
}

function IsIdentityDocumentRemediationState(
  state: IdentityDocumentRequirementState
): boolean {
  return state === 'currently_due' || state === 'pending';
}

export function GetIdentityDocumentRequirementState(
  account: Account
): IdentityDocumentRequirementState {
  if (account.individual?.verification?.status === 'verified') {
    return 'verified';
  }

  const currentlyDue = account.requirements?.currently_due ?? [];
  const eventuallyDue = account.requirements?.eventually_due ?? [];
  const pending = account.requirements?.pending_verification ?? [];

  if (currentlyDue.includes(VERIFICATION_DOCUMENT_FIELD)) {
    if (
      pending.includes(VERIFICATION_DOCUMENT_FIELD) ||
      account.individual?.verification?.status === 'pending'
    ) {
      return 'pending';
    }
    return 'currently_due';
  }

  if (eventuallyDue.includes(VERIFICATION_DOCUMENT_FIELD)) {
    return 'eventually_due';
  }

  return 'none';
}

/**
 * Format a payout volume threshold in cents as a USD display string.
 */
function FormatPayoutVolumeThreshold(
  thresholdCents: number | null | undefined
): string | null {
  if (thresholdCents == null || thresholdCents < 0) return null;
  return `$${(thresholdCents / 100).toLocaleString('en-US', {
    maximumFractionDigits: 2,
  })}`;
}

/**
 * Status chip text for the "Information needed" verification document row.
 */
export function GetIdentityDocumentMissingLabel(
  state: IdentityDocumentRequirementState
): string {
  return state === 'pending' ? 'In progress' : 'Missing';
}

/**
 * Panel / Actions required title (platform detail + Express identity panel).
 */
export function GetIdentityDocumentPanelTitle(displayName: string): string {
  return `Provide an identity document for ${displayName}`;
}

/**
 * Secondary line for an identity document action row.
 */
export function GetIdentityDocumentActionSubtitle(
  account: Account,
  thresholdCents?: number | null
): string {
  const state = GetIdentityDocumentRequirementState(account);
  const thresholdLabel = FormatPayoutVolumeThreshold(thresholdCents);

  if (state === 'pending') {
    return 'Verification in progress • Impacts payouts';
  }
  if (state === 'currently_due') {
    return 'Impacts payouts';
  }
  if (state === 'eventually_due' && thresholdLabel) {
    return `Due if volume reaches ${thresholdLabel} • Impacts payouts`;
  }
  if (state === 'eventually_due') {
    return 'Due when payout volume threshold is reached • Impacts payouts';
  }
  return 'Impacts payouts';
}

/**
 * Impact text shown after a "Payouts:" label (does not include the label).
 */
export function GetIdentityDocumentImpactCopy(
  account: Account,
  thresholdCents?: number | null
): string {
  const state = GetIdentityDocumentRequirementState(account);
  const thresholdLabel = FormatPayoutVolumeThreshold(thresholdCents);

  if (state === 'currently_due' || state === 'pending') {
    return account.payouts_enabled
      ? 'Will be paused until resolved'
      : 'Paused until resolved';
  }
  if (state === 'eventually_due' && thresholdLabel) {
    return `Will be paused if volume reaches ${thresholdLabel}`;
  }
  return 'Will be paused if unresolved';
}

/**
 * Full impact sentence for task cards (includes "Payouts").
 */
export function GetIdentityDocumentImpactSentence(
  account: Account,
  thresholdCents?: number | null
): string {
  const copy = GetIdentityDocumentImpactCopy(account, thresholdCents);
  return `Payouts ${copy.charAt(0).toLowerCase()}${copy.slice(1)}`;
}

/**
 * Banner / task description for the connected (express) account experience.
 */
export function GetIdentityDocumentTaskDescription(
  displayName: string
): string {
  return `${displayName} must verify their identity with a valid document to avoid disruptions to capabilities.`;
}

/**
 * Task title for the express settings Tasks card.
 */
export function GetIdentityDocumentTaskTitle(displayName: string): string {
  return GetIdentityDocumentPanelTitle(
    `an account representative (${displayName})`
  );
}
