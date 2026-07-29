import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { LoaderComponent, ModalComponent } from '../../../../../shared';
import { ConnectedAccountActionsService } from '../../services/connected-account-actions.service';

@Component({
  selector: 'app-login-link-modal',
  imports: [ModalComponent, LoaderComponent],
  templateUrl: './login-link-modal.component.html',
  styleUrl: './login-link-modal.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LoginLinkModalComponent {
  readonly actions = inject(ConnectedAccountActionsService);

  GetTitle(): string {
    return `View dashboard as ${this.actions.GetDisplayName()}`;
  }

  GetSubmitLabel(): string {
    return this.actions.loginLinkCopied() ? 'Copied' : 'Copy link';
  }

  OnSubmit(): void {
    void this.actions.CopyLoginLink();
  }
}
