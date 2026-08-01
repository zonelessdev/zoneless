import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';

export type AccountAlertBannerVariant = 'warning' | 'danger' | 'info';

@Component({
  selector: 'app-account-alert-banner',
  templateUrl: './account-alert-banner.component.html',
  styleUrl: './account-alert-banner.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AccountAlertBannerComponent {
  readonly label = input.required<string>();
  readonly message = input.required<string>();
  readonly variant = input<AccountAlertBannerVariant>('warning');
  readonly actionLabel = input<string | null>(null);
  readonly actionClicked = output<void>();

  OnActionClick(): void {
    this.actionClicked.emit();
  }
}
