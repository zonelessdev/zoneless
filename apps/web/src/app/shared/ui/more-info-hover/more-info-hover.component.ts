import { ChangeDetectionStrategy, Component, Input } from '@angular/core';

@Component({
  selector: 'app-more-info-hover',
  imports: [],
  templateUrl: './more-info-hover.component.html',
  styleUrl: './more-info-hover.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MoreInfoHoverComponent {
  /** Body text shown inside the hover bubble. Ignored if a [bubble] slot is projected. */
  @Input() text = '';
  /** Optional link label shown after the body text. Defaults to "Learn more" when a url is given. */
  @Input() linkText = 'Learn more';
  /** Optional url for the link. */
  @Input() linkUrl = '';
  /** Accessible label applied to the default info icon trigger. */
  @Input() ariaLabel = 'More info';
  /** Where the bubble appears relative to the trigger. */
  @Input() position: 'top' | 'bottom' = 'top';
}
