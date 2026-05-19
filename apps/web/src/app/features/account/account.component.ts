import {
  Component,
  OnInit,
  ChangeDetectionStrategy,
  inject,
  signal,
  WritableSignal,
  computed,
} from '@angular/core';
import { Router, ActivatedRoute, RouterOutlet } from '@angular/router';

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
import {
  PageLoaderComponent,
  SideMenuComponent,
  SideMenuItem,
} from '../../shared';

@Component({
  selector: 'app-account',
  imports: [PageLoaderComponent, SideMenuComponent, RouterOutlet],
  templateUrl: './account.component.html',
  styleUrl: './account.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AccountComponent implements OnInit {
  private readonly meta = inject(MetaService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly authService = inject(AuthService);
  readonly accountService = inject(AccountService);
  readonly balanceService = inject(BalanceService);
  readonly configService = inject(ConfigService);
  readonly personService = inject(PersonService);
  readonly externalWalletService = inject(ExternalWalletService);
  readonly transactionService = inject(TransactionService);
  readonly webhookEndpointService = inject(WebhookEndpointService);
  readonly apiKeyService = inject(ApiKeyService);

  seo = {
    title: 'Account | Zoneless',
    description: 'Your account dashboard for Zoneless',
    image: '',
    url: '/',
  };

  loading: WritableSignal<boolean> = signal(true);

  // Transaction detail panel state
  transactionDetailPanelOpen: WritableSignal<boolean> = signal(false);

  // Computed signal for side menu based on platform status
  sideMenu = computed<SideMenuItem[][]>(() => {
    const baseMenu: SideMenuItem[][] = [
      [
        {
          title: 'Home',
          icon: 'home_outline.svg',
          id: 'home',
        },
        {
          title: 'Balance',
          icon: 'account_balance.svg',
          id: 'balance',
        },
      ],
    ];

    // Add platform-only tabs
    if (this.authService.isPlatform()) {
      baseMenu[0].push({
        title: 'Connected',
        icon: 'groups_outline.svg',
        id: 'connected-accounts',
      });
      baseMenu[0].push({
        title: 'Products',
        icon: 'package_outline.svg',
        id: 'products',
      });
      baseMenu[0].push({
        title: 'Developers',
        icon: 'code.svg',
        id: 'developers',
      });
    }

    // Add Settings at the bottom
    baseMenu[0].push({
      title: 'Settings',
      icon: 'person_outline.svg',
      id: 'settings',
      bottom: true,
    });

    return baseMenu;
  });

  async ngOnInit(): Promise<void> {
    this.meta.SetMeta(this.seo);
    try {
      await this.LoadAccountData();
      this.loading.set(false);
    } catch (error) {
      console.error('Failed to load account data:', error);
      this.loading.set(false);
    }
  }

  private async LoadAccountData(): Promise<void> {
    // Load platform config for branding (parallel with account)
    const [account] = await Promise.all([
      this.accountService.GetAccount(),
      this.configService.LoadConfig(),
    ]);

    if (!account) {
      this.router.navigateByUrl('/onboard');
      return;
    }

    if (!account.tos_acceptance) {
      this.router.navigateByUrl('/onboard');
      return;
    }

    if (account.individual) {
      this.personService.SetPerson(account.individual);
    }

    await this.externalWalletService.GetExternalWallets(account.id);

    await this.balanceService.GetBalance();

    // Load webhook endpoints and API keys if platform
    if (this.authService.isPlatform()) {
      await Promise.all([
        this.webhookEndpointService.ListWebhookEndpoints(),
        this.apiKeyService.ListApiKeys(),
      ]);
    }
  }
}
