import {
  ChangeDetectionStrategy,
  Component,
  Input,
  OnDestroy,
  signal,
} from '@angular/core';

@Component({
  selector: 'app-copy-text',
  imports: [],
  templateUrl: './copy-text.component.html',
  styleUrl: './copy-text.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CopyTextComponent implements OnDestroy {
  /** The value copied to the clipboard when clicked. */
  @Input({ required: true }) text = '';
  /** Optional override for the visible label. Falls back to [text]. */
  @Input() displayText = '';
  /** Tooltip shown on hover before copying. */
  @Input() tooltipText = 'Copy to clipboard';
  /** Confirmation shown briefly after copying. */
  @Input() copiedText = 'Copied';

  @Input() opacity = 1;

  readonly copied = signal(false);
  private resetTimer?: ReturnType<typeof setTimeout>;

  async Copy(): Promise<void> {
    if (!this.text) return;
    try {
      await navigator.clipboard.writeText(this.text);
    } catch {
      return;
    }
    this.copied.set(true);
    clearTimeout(this.resetTimer);
    this.resetTimer = setTimeout(() => this.copied.set(false), 1500);
  }

  ngOnDestroy(): void {
    clearTimeout(this.resetTimer);
  }
}
