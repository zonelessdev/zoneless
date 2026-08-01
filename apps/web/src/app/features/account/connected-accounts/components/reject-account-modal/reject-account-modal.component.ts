import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ModalComponent } from '../../../../../shared';
import { ConnectedAccountActionsService } from '../../services/connected-account-actions.service';

@Component({
  selector: 'app-reject-account-modal',
  imports: [FormsModule, ModalComponent],
  templateUrl: './reject-account-modal.component.html',
  styleUrl: './reject-account-modal.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RejectAccountModalComponent {
  readonly actions = inject(ConnectedAccountActionsService);

  OnReasonChange(event: Event): void {
    const value = (event.target as HTMLSelectElement).value;
    if (
      value === 'fraud' ||
      value === 'terms_of_service' ||
      value === 'other'
    ) {
      this.actions.rejectReason.set(value);
    }
  }

  OnPausePayoutsChange(event: Event): void {
    this.actions.rejectPausePayouts.set(
      (event.target as HTMLInputElement).checked
    );
  }
}
