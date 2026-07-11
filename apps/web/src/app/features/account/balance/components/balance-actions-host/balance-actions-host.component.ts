import { ChangeDetectionStrategy, Component, inject } from '@angular/core';

import { SlidePanelComponent } from '../../../../../shared';
import { AddFundsPanelComponent } from '../add-funds-panel/add-funds-panel.component';
import { BalanceDetailComponent } from '../balance-detail/balance-detail.component';
import { BalanceActionsService } from '../../services/balance-actions.service';

@Component({
  selector: 'app-balance-actions-host',
  imports: [
    SlidePanelComponent,
    AddFundsPanelComponent,
    BalanceDetailComponent,
  ],
  templateUrl: './balance-actions-host.component.html',
  styleUrl: './balance-actions-host.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class BalanceActionsHostComponent {
  readonly actions = inject(BalanceActionsService);
}
