import { Component, Input, ChangeDetectionStrategy } from '@angular/core';

type ChipType =
  | 'green'
  | 'yellow'
  | 'red'
  | 'blue'
  | 'orange'
  | 'grey'
  | 'purple';

const STATUS_CHIP_MAP: Record<string, ChipType> = {
  // Green - Success states
  approved: 'green',
  active: 'green',
  paid: 'green',
  succeeded: 'green',
  success: 'green',
  completed: 'green',
  available: 'green',
  scheduled: 'green',
  enabled: 'green',
  normal: 'green',
  trialing: 'green',

  // Yellow - Pending states
  pending: 'yellow',
  processing: 'yellow',
  requires_capture: 'yellow',
  requires_confirmation: 'yellow',
  requires_payment_method: 'yellow',
  elevated: 'yellow',
  past_due: 'yellow',
  unpaid: 'yellow',
  open: 'yellow',

  // Red - Failure/Restricted states
  declined: 'red',
  failed: 'red',
  overdue: 'red',
  error: 'red',
  restricted: 'red',
  rejected: 'red',
  highest: 'red',
  uncollectible: 'red',

  // Blue - Info states
  draft: 'blue',
  working: 'blue',
  in_transit: 'blue',
  in_review: 'blue',
  default: 'blue',
  paused: 'blue',

  // Orange - Warning states
  disputed: 'orange',
  requires_action: 'orange',

  // Grey - Neutral states
  refunded: 'grey',
  cancelled: 'grey',
  canceled: 'grey',
  incomplete: 'grey',
  incomplete_expired: 'grey',
  inactive: 'grey',
  timeout: 'grey',
  not_assessed: 'grey',
  unknown: 'grey',
  void: 'grey',
};

@Component({
  selector: 'app-status-chip',
  templateUrl: './status-chip.component.html',
  styleUrls: ['./status-chip.component.scss'],
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class StatusChipComponent {
  @Input() status = '';

  GetChipClass(): string {
    const chipType = STATUS_CHIP_MAP[this.status.toLowerCase()] || 'grey';
    return `${chipType}-chip`;
  }

  GetDisplayText(): string {
    const key = this.status.toLowerCase();
    const labels: Record<string, string> = {
      in_review: 'In review',
    };
    if (labels[key]) return labels[key];

    return this.status
      .replace(/_/g, ' ')
      .replace(/\b\w/g, (char) => char.toUpperCase());
  }
}
