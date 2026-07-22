import {
  ChangeDetectionStrategy,
  Component,
  EventEmitter,
  Input,
  OnChanges,
  Output,
  SimpleChanges,
  signal,
  WritableSignal,
} from '@angular/core';
import type { Subscription } from '@zoneless/shared-types';
import { ModalComponent } from '../../../../../shared';
import {
  FormatMediumDate,
  GetSubscriptionCurrentPeriod,
} from '../../util/subscription-display';

export type SubscriptionCancelMode = 'immediately' | 'period_end';

@Component({
  selector: 'app-subscription-cancel-modal',
  imports: [ModalComponent],
  templateUrl: './subscription-cancel-modal.component.html',
  styleUrl: './subscription-cancel-modal.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SubscriptionCancelModalComponent implements OnChanges {
  @Input() isOpen = false;
  @Input() loading = false;
  @Input() subscription: Subscription | null = null;

  @Output() confirmed = new EventEmitter<SubscriptionCancelMode>();
  @Output() cancelled = new EventEmitter<void>();

  readonly selectedMode: WritableSignal<SubscriptionCancelMode> =
    signal('immediately');

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['isOpen'] && this.isOpen) {
      this.selectedMode.set('immediately');
    }
  }

  GetImmediateDateLabel(): string {
    return FormatMediumDate(Math.floor(Date.now() / 1000));
  }

  GetPeriodEndDateLabel(): string {
    const periodEnd = this.subscription
      ? GetSubscriptionCurrentPeriod(this.subscription).end
      : null;
    if (!periodEnd) return '—';
    return FormatMediumDate(periodEnd);
  }

  SelectMode(mode: SubscriptionCancelMode): void {
    this.selectedMode.set(mode);
  }

  OnConfirm(): void {
    this.confirmed.emit(this.selectedMode());
  }
}
