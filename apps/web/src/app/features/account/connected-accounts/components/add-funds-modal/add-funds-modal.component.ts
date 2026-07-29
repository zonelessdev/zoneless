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
  selector: 'app-add-funds-modal',
  imports: [ModalComponent, FormsModule],
  templateUrl: './add-funds-modal.component.html',
  styleUrl: './add-funds-modal.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AddFundsModalComponent {
  readonly actions = inject(ConnectedAccountActionsService);

  readonly availableLabel = computed(() => {
    const cents = this.actions.GetAvailableAmount(
      this.actions.platformBalance()
    );
    return (cents / 100).toFixed(2);
  });

  readonly confirmLabel = computed(() => {
    const amount = this.actions.ParseAmountCents(this.actions.addFundsAmount());
    const dollars = (amount / 100).toFixed(2);
    const name = this.actions.GetDisplayName();
    return `Send US$${dollars} from your platform balance to ${name}'s balance.`;
  });

  OnAmountInput(event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    this.actions.addFundsAmount.set(value);
  }

  OnTransferGroupInput(event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    this.actions.addFundsTransferGroup.set(value);
  }

  OnConfirmChange(event: Event): void {
    const checked = (event.target as HTMLInputElement).checked;
    this.actions.addFundsConfirmed.set(checked);
  }
}
