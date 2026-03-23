import {
  Component,
  Input,
  Output,
  EventEmitter,
  ChangeDetectionStrategy,
  signal,
  WritableSignal,
  OnChanges,
  SimpleChanges,
} from '@angular/core';

import { LoaderComponent } from '../loader/loader.component';

@Component({
  selector: 'app-slide-panel',
  standalone: true,
  imports: [LoaderComponent],
  templateUrl: './slide-panel.component.html',
  styleUrls: ['./slide-panel.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SlidePanelComponent implements OnChanges {
  @Input() isOpen = false;
  @Input() title = '';
  @Input() loading = false;
  @Input() submitLabel = 'Submit';
  @Input() submitDisabled = false;
  /** When true, hides form footer and shows view-only mode */
  @Input() viewOnly = false;

  @Output() closed = new EventEmitter<void>();
  @Output() submitted = new EventEmitter<void>();

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
    // Small delay to trigger animation
    setTimeout(() => {
      this.isAnimating.set(true);
    }, 10);
  }

  Close(): void {
    this.isAnimating.set(false);
    // Wait for animation to complete before hiding
    setTimeout(() => {
      this.isVisible.set(false);
      this.closed.emit();
    }, 300);
  }

  OnBackdropClick(): void {
    if (!this.loading) {
      this.Close();
    }
  }

  OnPanelClick(event: Event): void {
    event.stopPropagation();
  }

  OnSubmit(): void {
    this.submitted.emit();
  }

  OnCancel(): void {
    if (!this.loading) {
      this.Close();
    }
  }
}
