import { Component, Input, ChangeDetectionStrategy } from '@angular/core';
import { TitleCasePipe } from '@angular/common';

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

  // Yellow - Pending states
  pending: 'yellow',
  processing: 'yellow',
  requires_capture: 'yellow',
  requires_confirmation: 'yellow',
  requires_payment_method: 'yellow',
  elevated: 'yellow',

  // Red - Failure/Restricted states
  declined: 'red',
  failed: 'red',
  overdue: 'red',
  error: 'red',
  restricted: 'red',
  highest: 'red',

  // Blue - Info states
  draft: 'blue',
  working: 'blue',
  in_transit: 'blue',
  default: 'blue',

  // Orange - Warning states
  disputed: 'orange',
  requires_action: 'orange',

  // Grey - Neutral states
  refunded: 'grey',
  cancelled: 'grey',
  canceled: 'grey',
  incomplete: 'grey',
  inactive: 'grey',
  timeout: 'grey',
  not_assessed: 'grey',
  unknown: 'grey',
};

@Component({
  selector: 'app-status-chip',
  templateUrl: './status-chip.component.html',
  styleUrls: ['./status-chip.component.scss'],
  standalone: true,
  imports: [TitleCasePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class StatusChipComponent {
  @Input() status = '';

  GetChipClass(): string {
    const chipType = STATUS_CHIP_MAP[this.status.toLowerCase()] || 'grey';
    return `${chipType}-chip`;
  }

  GetDisplayText(): string {
    // Replace underscores with spaces for display
    return this.status.replace(/_/g, ' ');
  }
}
