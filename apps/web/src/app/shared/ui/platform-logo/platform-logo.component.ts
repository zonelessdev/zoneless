import {
  Component,
  Input,
  ChangeDetectionStrategy,
  inject,
} from '@angular/core';
import { ConfigService } from '../../../data';

@Component({
  selector: 'app-platform-logo',
  templateUrl: './platform-logo.component.html',
  styleUrls: ['./platform-logo.component.scss'],
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PlatformLogoComponent {
  readonly configService = inject(ConfigService);

  /** Size variant: 'small' (24px), 'medium' (32px), or 'large' (40px) */
  @Input() size: 'small' | 'medium' | 'large' = 'medium';

  /** Whether to show the platform name next to the logo */
  @Input() showName = false;

  /** Theme variant for text color: 'light' (dark text) or 'dark' (light text) */
  @Input() theme: 'light' | 'dark' = 'light';

  GetLogoUrl(): string {
    return this.configService.GetPlatformLogoUrl();
  }

  GetPlatformName(): string {
    return this.configService.GetPlatformName();
  }

  GetInitials(): string {
    return this.configService.GetPlatformInitials();
  }

  HasLogo(): boolean {
    return this.configService.HasLogo();
  }
}
