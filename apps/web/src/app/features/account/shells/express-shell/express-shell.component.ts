import {
  ChangeDetectionStrategy,
  Component,
  Input,
  computed,
  inject,
} from '@angular/core';
import { Router } from '@angular/router';
import { SideMenuComponent, SideMenuGroup } from '../../../../shared';
import { AccountService } from '../../../../data';
import { GetExpressAccountAlert } from './express-account-alerts';
import { AccountAlertBannerComponent } from '../../components/account-alert-banner/account-alert-banner.component';

@Component({
  selector: 'app-express-shell',
  imports: [SideMenuComponent, AccountAlertBannerComponent],
  templateUrl: './express-shell.component.html',
  styleUrl: './express-shell.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ExpressShellComponent {
  private readonly accountService = inject(AccountService);
  private readonly router = inject(Router);

  @Input({ required: true }) sideMenu: SideMenuGroup[] = [];
  @Input() showTestMode = false;

  readonly alert = computed(() =>
    GetExpressAccountAlert(this.accountService.account())
  );

  OnAlertAction(): void {
    const alert = this.alert();
    if (!alert || alert.action === 'none') return;

    if (alert.action === 'identity_task') {
      void this.router.navigate(['/account/settings'], {
        queryParams: { task: 'identity' },
      });
    }
  }
}
