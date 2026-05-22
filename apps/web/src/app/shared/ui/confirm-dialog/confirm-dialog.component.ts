import {
  Component,
  Input,
  Output,
  EventEmitter,
  ChangeDetectionStrategy,
} from '@angular/core';

import { ModalComponent } from '../modal/modal.component';

@Component({
  selector: 'app-confirm-dialog',
  standalone: true,
  imports: [ModalComponent],
  templateUrl: './confirm-dialog.component.html',
  styleUrls: ['./confirm-dialog.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ConfirmDialogComponent {
  /** Whether the dialog is open */
  @Input() isOpen = false;
  /** Dialog title */
  @Input() title = '';
  /** Dialog body description */
  @Input() description = '';
  /** Label for the confirm button */
  @Input() confirmLabel = 'Confirm';
  /** Label for the cancel button */
  @Input() cancelLabel = 'Cancel';
  /** Style the confirm button as destructive (red) */
  @Input() destructive = false;
  /** Show a loader on the confirm button and block dismissal */
  @Input() loading = false;

  @Output() confirmed = new EventEmitter<void>();
  @Output() cancelled = new EventEmitter<void>();
}
