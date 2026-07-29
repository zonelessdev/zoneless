import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ModalComponent } from '../../../../../shared';
import { ConnectedAccountActionsService } from '../../services/connected-account-actions.service';

@Component({
  selector: 'app-pull-funds-modal',
  imports: [ModalComponent, FormsModule],
  templateUrl: './pull-funds-modal.component.html',
  styleUrl: './pull-funds-modal.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PullFundsModalComponent {
  readonly actions = inject(ConnectedAccountActionsService);

  readonly availableLabel = computed(() => {
    const cents = this.actions.GetAvailableAmount(
      this.actions.connectedBalance()
    );
    return (cents / 100).toFixed(2);
  });

  OnAmountInput(event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    this.actions.pullFundsAmount.set(value);
  }
}
