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
  selector: 'app-modal',
  standalone: true,
  imports: [LoaderComponent],
  templateUrl: './modal.component.html',
  styleUrls: ['./modal.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ModalComponent implements OnChanges {
  /** Whether the dialog is open */
  @Input() isOpen = false;
  /** Dialog title */
  @Input() title = '';
  /** Label for the confirm button */
  @Input() submitLabel = 'Save';
  /** Label for the cancel button */
  @Input() closeLabel = 'Cancel';
  /** Style the confirm button as destructive (red) */
  @Input() destructive = false;
  /** Show a loader on the confirm button and block dismissal */
  @Input() loading = false;

  @Output() submitted = new EventEmitter<void>();
  @Output() closed = new EventEmitter<void>();

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
    this.closed.emit();
  }

  OnSurfaceClick(event: Event): void {
    event.stopPropagation();
  }

  OnClose(): void {
    if (this.loading) return;
    this.closed.emit();
  }

  OnSubmit(): void {
    if (this.loading) return;
    this.submitted.emit();
  }
}
