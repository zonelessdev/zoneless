import {
  Component,
  Input,
  Output,
  EventEmitter,
  ChangeDetectionStrategy,
} from '@angular/core';

@Component({
  selector: 'app-test-mode-banner',
  standalone: true,
  templateUrl: './test-mode-banner.component.html',
  styleUrls: ['./test-mode-banner.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TestModeBannerComponent {
  @Input() message = "You're using a test account.";
  @Input() actionLabel = '';
  @Output() actionClicked = new EventEmitter<void>();

  OnAction(): void {
    this.actionClicked.emit();
  }
}
