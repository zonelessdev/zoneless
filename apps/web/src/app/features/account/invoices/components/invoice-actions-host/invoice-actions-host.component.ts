import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { MetadataEditModalComponent } from '../../../components';
import { InvoiceActionsService } from '../../services/invoice-actions.service';

@Component({
  selector: 'app-invoice-actions-host',
  imports: [MetadataEditModalComponent],
  templateUrl: './invoice-actions-host.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class InvoiceActionsHostComponent {
  readonly actions = inject(InvoiceActionsService);
}
