import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import type { Account } from '@zoneless/shared-types';
import { SlidePanelComponent, LoaderComponent } from '../../../../../shared';
import { ConnectedAccountDetailComponent } from '../../../components';
import { MetadataEditModalComponent } from '../../../components';
import { ConnectedAccountActionsService } from '../../services/connected-account-actions.service';
import { AddFundsModalComponent } from '../add-funds-modal/add-funds-modal.component';
import { PullFundsModalComponent } from '../pull-funds-modal/pull-funds-modal.component';
import { PayoutModalComponent } from '../payout-modal/payout-modal.component';
import { LoginLinkModalComponent } from '../login-link-modal/login-link-modal.component';

@Component({
  selector: 'app-connected-account-actions-host',
  imports: [
    SlidePanelComponent,
    LoaderComponent,
    ConnectedAccountDetailComponent,
    MetadataEditModalComponent,
    AddFundsModalComponent,
    PullFundsModalComponent,
    PayoutModalComponent,
    LoginLinkModalComponent,
  ],
  templateUrl: './connected-account-actions-host.component.html',
  styleUrl: './connected-account-actions-host.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ConnectedAccountActionsHostComponent {
  readonly actions = inject(ConnectedAccountActionsService);

  GetProfileTitle(): string {
    return this.actions.GetDisplayName();
  }

  OnViewDashboard(account: Account): void {
    this.actions.CloseProfile();
    void this.actions.OpenLoginLink(account);
  }
}
