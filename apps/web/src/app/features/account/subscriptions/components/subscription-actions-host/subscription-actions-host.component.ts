import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { MetadataEditModalComponent } from '../../../components';
import { SubscriptionActionsService } from '../../services/subscription-actions.service';

@Component({
  selector: 'app-subscription-actions-host',
  imports: [MetadataEditModalComponent],
  templateUrl: './subscription-actions-host.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SubscriptionActionsHostComponent {
  readonly actions = inject(SubscriptionActionsService);
}
