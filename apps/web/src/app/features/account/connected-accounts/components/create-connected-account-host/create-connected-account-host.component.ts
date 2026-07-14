import {
  ChangeDetectionStrategy,
  Component,
  EventEmitter,
  Output,
  inject,
} from '@angular/core';
import { LoaderComponent } from '../../../../../shared';
import { CreateConnectedAccountDetailsFormComponent } from '../create-connected-account-details-form/create-connected-account-details-form.component';
import { ConnectedAccountActionsService } from '../../services/connected-account-actions.service';

@Component({
  selector: 'app-create-connected-account-host',
  standalone: true,
  imports: [LoaderComponent, CreateConnectedAccountDetailsFormComponent],
  templateUrl: './create-connected-account-host.component.html',
  styleUrl: './create-connected-account-host.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CreateConnectedAccountHostComponent {
  readonly actions = inject(ConnectedAccountActionsService);

  /** Emitted when the user chooses "View account" after creation. */
  @Output() viewAccount = new EventEmitter<string>();

  OnBackdropClick(): void {
    if (this.actions.loading()) return;
    this.actions.CloseFlow();
  }

  OnSurfaceClick(event: Event): void {
    event.stopPropagation();
  }

  OnCloseClick(): void {
    if (this.actions.loading()) return;
    this.actions.CloseFlow();
  }

  async OnCreate(): Promise<void> {
    await this.actions.Create();
  }

  OnViewAccount(): void {
    const account = this.actions.createdAccount();
    this.actions.CloseFlow();
    if (account) {
      this.viewAccount.emit(account.id);
    }
  }
}
