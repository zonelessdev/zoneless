import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { LoaderComponent, ModalComponent } from '../../../../../shared';
import { ConnectedAccountActionsService } from '../../services/connected-account-actions.service';

@Component({
  selector: 'app-request-information-modal',
  imports: [ModalComponent, LoaderComponent],
  templateUrl: './request-information-modal.component.html',
  styleUrl: './request-information-modal.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RequestInformationModalComponent {
  readonly actions = inject(ConnectedAccountActionsService);

  OnCopy(): void {
    void this.actions.CopyVerificationLink();
  }
}
