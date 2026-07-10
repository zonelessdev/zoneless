import {
  Component,
  OnInit,
  ChangeDetectionStrategy,
  inject,
  signal,
  WritableSignal,
  computed,
} from '@angular/core';
import { Router, RouterOutlet } from '@angular/router';

import { MetaService, AuthService } from '../../core';
import {
  AccountService,
  ApiKeyService,
  BalanceService,
  PersonService,
  ExternalWalletService,
  TransactionService,
  ConfigService,
  WebhookEndpointService,
} from '../../data';
import { PageLoaderComponent, SideMenuGroup } from '../../shared';
import { ExpressShellComponent } from './shells/express-shell/express-shell.component';
import { FullShellComponent } from './shells/full-shell/full-shell.component';
import { EXPRESS_NAV } from './nav/express-nav';
import { FULL_NAV } from './nav/full-nav';

@Component({
  selector: 'app-account',
  imports: [
    PageLoaderComponent,
    RouterOutlet,
    ExpressShellComponent,
    FullShellComponent,
  ],
  templateUrl: './account.component.html',
  styleUrl: './account.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AccountComponent implements OnInit {
  private readonly meta = inject(MetaService);
  private readonly router = inject(Router);
  private readonly authService = inject(AuthService);
  readonly accountService = inject(AccountService);
  readonly balanceService = inject(BalanceService);
  readonly configService = inject(ConfigService);
  readonly personService = inject(PersonService);
  readonly externalWalletService = inject(ExternalWalletService);
  readonly transactionService = inject(TransactionService);
  readonly webhookEndpointService = inject(WebhookEndpointService);
  readonly apiKeyService = inject(ApiKeyService);

  loading: WritableSignal<boolean> = signal(true);

  dashboardType = this.authService.dashboardType;

  sideMenu = computed<SideMenuGroup[]>(() =>
    this.dashboardType() === 'full' ? FULL_NAV : EXPRESS_NAV
  );

  ready = computed(
    () =>
      !!this.accountService.account() &&
      !!this.balanceService.balance() &&
      !!this.personService.person()
  );

  async ngOnInit(): Promise<void> {
    this.meta.SetMetaTitle('Home');
    try {
      await this.LoadAccountData();
      this.loading.set(false);
    } catch (error) {
      console.error('Failed to load account data:', error);
      this.loading.set(false);
    }
  }

  private async LoadAccountData(): Promise<void> {
    const [account] = await Promise.all([
      this.accountService.GetAccount(),
      this.configService.LoadConfig(),
    ]);

    if (!account) {
      this.router.navigateByUrl('/onboard');
      return;
    }

    this.authService.SyncFromAccount(account);

    if (!account.tos_acceptance) {
      this.router.navigateByUrl('/onboard');
      return;
    }

    if (account.individual) {
      this.personService.SetPerson(account.individual);
    }

    await this.externalWalletService.GetExternalWallets(account.id);
    await this.balanceService.GetBalance();

    if (this.authService.isPlatform()) {
      await Promise.all([
        this.webhookEndpointService.ListWebhookEndpoints(),
        this.apiKeyService.ListApiKeys(),
      ]);
    }
  }
}
