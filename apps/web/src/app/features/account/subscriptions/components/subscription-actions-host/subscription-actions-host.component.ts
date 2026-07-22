import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { MetadataEditModalComponent } from '../../../components';
import { SubscriptionActionsService } from '../../services/subscription-actions.service';
import { SubscriptionCancelModalComponent } from '../subscription-cancel-modal/subscription-cancel-modal.component';

@Component({
  selector: 'app-subscription-actions-host',
  imports: [MetadataEditModalComponent, SubscriptionCancelModalComponent],
  templateUrl: './subscription-actions-host.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SubscriptionActionsHostComponent {
  readonly actions = inject(SubscriptionActionsService);
}
