import {
  Component,
  Input,
  Output,
  EventEmitter,
  ChangeDetectionStrategy,
  OnChanges,
  SimpleChanges,
  signal,
  WritableSignal,
} from '@angular/core';

import { LoaderComponent } from '../loader/loader.component';

@Component({
  selector: 'app-confirm-dialog',
  standalone: true,
  imports: [LoaderComponent],
  templateUrl: './confirm-dialog.component.html',
  styleUrls: ['./confirm-dialog.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ConfirmDialogComponent implements OnChanges {
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

  isVisible: WritableSignal<boolean> = signal(false);
  isAnimating: WritableSignal<boolean> = signal(false);

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['isOpen']) {
      if (this.isOpen) {
        this.Open();
      } else {
        this.Close();
      }
    }
  }

  Open(): void {
    this.isVisible.set(true);
    setTimeout(() => {
      this.isAnimating.set(true);
    }, 10);
  }

  Close(): void {
    this.isAnimating.set(false);
    setTimeout(() => {
      this.isVisible.set(false);
    }, 200);
  }

  OnBackdropClick(): void {
    if (this.loading) return;
    this.cancelled.emit();
  }

  OnSurfaceClick(event: Event): void {
    event.stopPropagation();
  }

  OnCancel(): void {
    if (this.loading) return;
    this.cancelled.emit();
  }

  OnConfirm(): void {
    if (this.loading) return;
    this.confirmed.emit();
  }
}
