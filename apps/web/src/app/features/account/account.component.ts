import {
  Component,
  OnInit,
  ChangeDetectionStrategy,
  inject,
  signal,
  WritableSignal,
  ViewChild,
  computed,
} from '@angular/core';
import { Router, ActivatedRoute } from '@angular/router';
import { DecimalPipe } from '@angular/common';

/** Valid account view identifiers for URL routing */
export type AccountView =
  | 'home'
  | 'balance'
  | 'connected-accounts'
  | 'developers'
  | 'settings';

/** List of valid view slugs for validation */
const VALID_VIEWS: AccountView[] = [
  'home',
  'balance',
  'connected-accounts',
  'developers',
  'settings',
];

/** Default view when no view parameter is provided or the view is invalid */
const DEFAULT_VIEW: AccountView = 'home';

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
  TopupService,
} from '../../data';
import {
  PageLoaderComponent,
  SideMenuComponent,
  SideMenuItem,
  PaginatedListComponent,
  PaginatedListColumn,
  SettingsCardComponent,
  SettingsCardAction,
  SlidePanelComponent,
  PersonFormComponent,
  ExternalWalletFormComponent,
  WebhookEndpointFormComponent,
  ApiKeyFormComponent,
  LoaderComponent,
} from '../../shared';
import {
  AddFundsPanelComponent,
  BalanceDetailComponent,
  ConnectedAccountDetailComponent,
  PayoutDetailComponent,
  TopupDetailComponent,
  TransferDetailComponent,
} from './components';
import {
  Account,
  ApiKey,
  BalanceTransaction,
  TopUp,
  WebhookEndpoint,
} from '@zoneless/shared-types';

@Component({
  selector: 'app-account',
  imports: [
    PageLoaderComponent,
    SideMenuComponent,
    PaginatedListComponent,
    DecimalPipe,
    SettingsCardComponent,
    SlidePanelComponent,
    PersonFormComponent,
    ExternalWalletFormComponent,
    WebhookEndpointFormComponent,
    ApiKeyFormComponent,
    AddFundsPanelComponent,
    BalanceDetailComponent,
    ConnectedAccountDetailComponent,
    PayoutDetailComponent,
    TopupDetailComponent,
    TransferDetailComponent,
    LoaderComponent,
  ],
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
  private readonly balanceService = inject(BalanceService);
  readonly configService = inject(ConfigService);
  private readonly topupService = inject(TopupService);
  readonly personService = inject(PersonService);
  readonly externalWalletService = inject(ExternalWalletService);
  readonly transactionService = inject(TransactionService);
  readonly webhookEndpointService = inject(WebhookEndpointService);
  readonly apiKeyService = inject(ApiKeyService);

  @ViewChild('editPersonForm') editPersonForm!: PersonFormComponent;
  @ViewChild('editWalletForm') editWalletForm!: ExternalWalletFormComponent;
  @ViewChild('webhookEndpointForm')
  webhookEndpointForm!: WebhookEndpointFormComponent;
  @ViewChild('apiKeyForm') apiKeyForm!: ApiKeyFormComponent;

  seo = {
    title: 'Account | Zoneless',
    description: 'Your account dashboard for Zoneless',
    image: '',
    url: '/',
  };

  loading: WritableSignal<boolean> = signal(true);
  view: WritableSignal<AccountView> = signal(DEFAULT_VIEW);

  // Balance view tab state
  balanceTab: WritableSignal<'all' | 'payouts'> = signal('all');

  // Edit person panel state
  editPersonPanelOpen: WritableSignal<boolean> = signal(false);
  editPersonLoading: WritableSignal<boolean> = signal(false);
  editPersonShowErrors: WritableSignal<boolean> = signal(false);

  // Edit wallet panel state
  editWalletPanelOpen: WritableSignal<boolean> = signal(false);
  editWalletLoading: WritableSignal<boolean> = signal(false);
  editWalletShowErrors: WritableSignal<boolean> = signal(false);
  walletFormValid: WritableSignal<boolean> = signal(false);

  // Transaction detail panel state
  transactionDetailPanelOpen: WritableSignal<boolean> = signal(false);

  // Webhook endpoint panel state
  webhookPanelOpen: WritableSignal<boolean> = signal(false);
  webhookPanelMode: WritableSignal<'create' | 'edit'> = signal('create');
  webhookPanelLoading: WritableSignal<boolean> = signal(false);
  webhookPanelShowErrors: WritableSignal<boolean> = signal(false);
  selectedWebhookEndpoint: WritableSignal<WebhookEndpoint | null> =
    signal(null);
  newlyCreatedSecret: WritableSignal<string | null> = signal(null);

  // API key panel state
  apiKeyPanelOpen: WritableSignal<boolean> = signal(false);
  apiKeyPanelMode: WritableSignal<'create' | 'edit'> = signal('create');
  apiKeyPanelLoading: WritableSignal<boolean> = signal(false);
  apiKeyPanelShowErrors: WritableSignal<boolean> = signal(false);
  selectedApiKey: WritableSignal<ApiKey | null> = signal(null);
  newlyCreatedToken: WritableSignal<string | null> = signal(null);

  // Balance detail panel state (platform only)
  balanceDetailPanelOpen: WritableSignal<boolean> = signal(false);

  // Add Funds panel state (platform only)
  addFundsPanelOpen: WritableSignal<boolean> = signal(false);

  // Connected Account detail panel state (platform only)
  connectedAccountPanelOpen: WritableSignal<boolean> = signal(false);

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

  // Recent transaction columns for the Home view (simplified)
  recentTransactionColumns: PaginatedListColumn[] = [
    {
      header: 'Date',
      field: 'created',
      type: 'date',
    },
    {
      header: 'Status',
      field: 'status',
      type: 'status',
    },
    {
      header: 'Type',
      field: 'type',
      type: 'text',
      capitalize: true,
      dimmed: true,
    },
    {
      header: 'Net',
      field: 'net',
      type: 'currency-with-code',
      currencyField: 'currency',
      bolded: true,
    },
  ];

  // Balance transaction columns for the Balance view
  balanceTransactionColumns: PaginatedListColumn[] = [
    {
      header: 'Date',
      field: 'created',
      type: 'date',
    },
    {
      header: 'Status',
      field: 'status',
      type: 'status',
    },
    {
      header: 'Type',
      field: 'type',
      type: 'text',
      capitalize: true,
      dimmed: true,
    },
    {
      header: 'Amount',
      field: 'amount',
      type: 'currency',
    },
    {
      header: 'Fee',
      field: 'fee',
      type: 'currency',
    },
    {
      header: 'Net',
      field: 'net',
      type: 'currency-with-code',
      currencyField: 'currency',
      bolded: true,
    },
  ];

  // Payout-only query params
  payoutQueryParams = { type: 'payout' };

  // Card action definitions
  readonly apiKeyActions: SettingsCardAction[] = [
    { id: 'roll', icon: 'refresh.svg', label: 'Roll key (generate new token)' },
    {
      id: 'delete',
      icon: 'delete.svg',
      label: 'Delete API key',
      variant: 'danger',
    },
  ];

  readonly webhookActions: SettingsCardAction[] = [
    {
      id: 'delete',
      icon: 'delete.svg',
      label: 'Delete webhook',
      variant: 'danger',
    },
  ];

  // Connected accounts columns (platform only)
  connectedAccountColumns: PaginatedListColumn[] = [
    {
      header: 'Account',
      field: 'id',
      type: 'text',
      formatter: (item: unknown) => {
        const account = item as Account;
        const individual = account.individual;
        if (individual?.first_name || individual?.last_name) {
          return [individual.first_name, individual.last_name]
            .filter(Boolean)
            .join(' ');
        }
        return account.email ?? account.id;
      },
    },
    {
      header: 'Account country',
      field: 'country',
      type: 'text',
    },
    {
      header: 'Account status',
      field: 'payouts_enabled',
      type: 'status',
      formatter: (item: unknown) => {
        const account = item as Account;
        return account.payouts_enabled ? 'enabled' : 'restricted';
      },
    },
    {
      header: 'Connected on',
      field: 'created',
      type: 'date',
    },
  ];

  async ngOnInit(): Promise<void> {
    this.meta.SetMeta(this.seo);
    this.InitializeViewFromRoute();

    try {
      await this.LoadAccountData();
      this.loading.set(false);
    } catch (error) {
      console.error('Failed to load account data:', error);
      this.loading.set(false);
    }
  }

  /**
   * Initialize view from route parameter.
   * If the view is invalid, redirects to /account/home.
   */
  private InitializeViewFromRoute(): void {
    const viewParam = this.route.snapshot.paramMap.get('view');

    if (viewParam && this.IsValidView(viewParam)) {
      this.view.set(viewParam);
    } else if (viewParam) {
      // Invalid view param - redirect to default
      this.router.navigate(['/account', DEFAULT_VIEW], { replaceUrl: true });
    }
  }

  /**
   * Type guard to check if a string is a valid AccountView.
   */
  private IsValidView(view: string): view is AccountView {
    return VALID_VIEWS.includes(view as AccountView);
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

    // Load external wallets
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

  /**
   * Set the current view from side menu selection.
   * Validates the view and falls back to default if invalid.
   */
  SetView(viewId: string): void {
    if (this.IsValidView(viewId)) {
      this.view.set(viewId);
    } else {
      this.view.set(DEFAULT_VIEW);
    }
  }

  OnViewChanged(): void {
    this.ScrollToTop();
    this.UpdateUrlForView();
  }

  /**
   * Update the URL to reflect the current view.
   * Uses replaceUrl to avoid polluting browser history on tab switches.
   */
  private UpdateUrlForView(): void {
    this.router.navigate(['/account', this.view()], { replaceUrl: true });
  }

  ScrollToTop(): void {
    if (typeof document !== 'undefined') {
      const viewsWrapper = document.querySelector('.views-wrapper');
      if (viewsWrapper) {
        viewsWrapper.scrollTop = 0;
      }
    }
  }

  GetAccount() {
    return this.accountService.account();
  }

  GetBalance() {
    return this.balanceService.balance();
  }

  GetTotalBalance(): number {
    const available = this.balanceService.GetAvailableBalance('usdc') / 100;
    const pending = this.balanceService.GetPendingBalance('usdc') / 100;
    return available + pending;
  }

  GetAvailableBalance(): number {
    return this.balanceService.GetAvailableBalance('usdc') / 100;
  }

  SetBalanceTab(tab: 'all' | 'payouts'): void {
    this.balanceTab.set(tab);
  }

  LogOut(): void {
    this.authService.Logout();
    this.accountService.Reset();
    this.balanceService.Reset();
    this.personService.Reset();
    this.externalWalletService.Reset();
    this.transactionService.Reset();
    this.webhookEndpointService.Reset();
    this.apiKeyService.Reset();
    this.topupService.Reset();
    this.router.navigateByUrl('/');
  }

  async OnTransactionClick(item: unknown): Promise<void> {
    const transaction = item as BalanceTransaction;

    // Only handle transfer, payout, and topup types
    if (
      transaction.type !== 'transfer' &&
      transaction.type !== 'payout' &&
      transaction.type !== 'topup'
    ) {
      return;
    }

    // Skip if source is null (shouldn't happen for these types, but handle gracefully)
    if (!transaction.source) {
      console.warn('Transaction has no source ID:', transaction);
      return;
    }

    const account = this.GetAccount();
    if (!account) return;

    // Open the panel and load transaction details
    this.transactionDetailPanelOpen.set(true);

    try {
      await this.transactionService.LoadTransactionDetail(
        account.id,
        transaction.source,
        transaction.type
      );
    } catch (error) {
      console.error('Failed to load transaction details:', error);
    }
  }

  OnTransactionDetailPanelClosed(): void {
    this.transactionDetailPanelOpen.set(false);
    this.transactionService.ClearSelection();
  }

  GetTransactionDetailTitle(): string {
    const detail = this.transactionService.selectedTransaction();
    if (!detail) return 'Transaction';
    if (detail.type === 'payout') return 'Payout details';
    if (detail.type === 'topup') return 'Top-up details';
    return 'Payment details';
  }

  // Edit Person Panel
  OnEditPersonClick(): void {
    this.editPersonShowErrors.set(false);
    this.editPersonPanelOpen.set(true);
  }

  OnEditPersonPanelClosed(): void {
    this.editPersonPanelOpen.set(false);
    this.editPersonShowErrors.set(false);
  }

  async OnEditPersonSubmit(): Promise<void> {
    if (!this.editPersonForm) return;

    this.editPersonShowErrors.set(true);

    if (!this.editPersonForm.ValidateAll()) {
      return;
    }

    const account = this.GetAccount();
    const person = this.personService.person();
    if (!account || !person) return;

    this.editPersonLoading.set(true);

    try {
      const updateData = this.editPersonForm.GetUpdateData();
      await this.personService.UpdatePerson(account.id, person.id, updateData);
      this.editPersonPanelOpen.set(false);
      this.editPersonShowErrors.set(false);
    } catch (error) {
      console.error('Failed to update person:', error);
    } finally {
      this.editPersonLoading.set(false);
    }
  }

  // Edit Wallet Panel
  OnEditWalletClick(): void {
    this.editWalletShowErrors.set(false);
    this.editWalletPanelOpen.set(true);
  }

  OnEditWalletPanelClosed(): void {
    this.editWalletPanelOpen.set(false);
    this.editWalletShowErrors.set(false);
  }

  OnWalletValidationChange(isValid: boolean): void {
    this.walletFormValid.set(isValid);
  }

  async OnEditWalletSubmit(): Promise<void> {
    if (!this.editWalletForm) return;

    this.editWalletShowErrors.set(true);

    if (!this.editWalletForm.ValidateAll()) {
      return;
    }

    const account = this.GetAccount();
    if (!account) return;

    this.editWalletLoading.set(true);

    try {
      const data = this.editWalletForm.GetFormData();
      await this.externalWalletService.SaveExternalWallet(account.id, {
        wallet_address: data.walletAddress,
        network: data.network,
        country: account.country,
        currency: data.currency,
      });

      this.editWalletPanelOpen.set(false);
      this.editWalletShowErrors.set(false);
    } catch (error) {
      console.error('Failed to update wallet:', error);
    } finally {
      this.editWalletLoading.set(false);
    }
  }

  // Webhook Endpoint Methods
  IsPlatform(): boolean {
    return this.authService.isPlatform();
  }

  OnCreateWebhookClick(): void {
    this.webhookPanelMode.set('create');
    this.selectedWebhookEndpoint.set(null);
    this.webhookPanelShowErrors.set(false);
    this.newlyCreatedSecret.set(null);
    this.webhookPanelOpen.set(true);
  }

  OnEditWebhookClick(endpoint: WebhookEndpoint): void {
    this.webhookPanelMode.set('edit');
    this.selectedWebhookEndpoint.set(endpoint);
    this.webhookPanelShowErrors.set(false);
    this.newlyCreatedSecret.set(null);
    this.webhookPanelOpen.set(true);
  }

  OnWebhookPanelClosed(): void {
    this.webhookPanelOpen.set(false);
    this.webhookPanelShowErrors.set(false);
    this.newlyCreatedSecret.set(null);
  }

  async OnWebhookSubmit(): Promise<void> {
    if (!this.webhookEndpointForm) return;

    this.webhookPanelShowErrors.set(true);

    if (!this.webhookEndpointForm.ValidateAll()) {
      return;
    }

    this.webhookPanelLoading.set(true);

    try {
      const formData = this.webhookEndpointForm.GetFormData();

      if (this.webhookPanelMode() === 'create') {
        const endpoint =
          await this.webhookEndpointService.CreateWebhookEndpoint({
            url: formData.url,
            enabled_events: formData.enabled_events,
            description: formData.description || undefined,
          });

        // Show the secret to the user (only shown once)
        if (endpoint.secret) {
          this.newlyCreatedSecret.set(endpoint.secret);
        }

        this.webhookPanelShowErrors.set(false);
      } else {
        const endpoint = this.selectedWebhookEndpoint();
        if (!endpoint) return;

        await this.webhookEndpointService.UpdateWebhookEndpoint(endpoint.id, {
          url: formData.url,
          enabled_events: formData.enabled_events,
          description: formData.description || null,
          disabled: formData.disabled,
        });

        this.webhookPanelOpen.set(false);
        this.webhookPanelShowErrors.set(false);
      }
    } catch (error) {
      console.error('Failed to save webhook endpoint:', error);
    } finally {
      this.webhookPanelLoading.set(false);
    }
  }

  async OnDeleteWebhookClick(endpoint: WebhookEndpoint): Promise<void> {
    if (
      !confirm(
        `Are you sure you want to delete this webhook endpoint?\n\n${endpoint.url}`
      )
    ) {
      return;
    }

    try {
      await this.webhookEndpointService.DeleteWebhookEndpoint(endpoint.id);
    } catch (error) {
      console.error('Failed to delete webhook endpoint:', error);
    }
  }

  GetWebhookPanelTitle(): string {
    if (this.newlyCreatedSecret()) {
      return 'Webhook created';
    }
    return this.webhookPanelMode() === 'create'
      ? 'Create webhook endpoint'
      : 'Edit webhook endpoint';
  }

  OnWebhookFormDone(): void {
    this.webhookPanelOpen.set(false);
    this.newlyCreatedSecret.set(null);
  }

  // API Key Methods
  OnCreateApiKeyClick(): void {
    this.apiKeyPanelMode.set('create');
    this.selectedApiKey.set(null);
    this.apiKeyPanelShowErrors.set(false);
    this.newlyCreatedToken.set(null);
    this.apiKeyPanelOpen.set(true);
  }

  OnEditApiKeyClick(apiKey: ApiKey): void {
    this.apiKeyPanelMode.set('edit');
    this.selectedApiKey.set(apiKey);
    this.apiKeyPanelShowErrors.set(false);
    this.newlyCreatedToken.set(null);
    this.apiKeyPanelOpen.set(true);
  }

  OnApiKeyPanelClosed(): void {
    this.apiKeyPanelOpen.set(false);
    this.apiKeyPanelShowErrors.set(false);
    this.newlyCreatedToken.set(null);
  }

  async OnApiKeySubmit(): Promise<void> {
    if (!this.apiKeyForm) return;

    this.apiKeyPanelShowErrors.set(true);

    if (!this.apiKeyForm.ValidateAll()) {
      return;
    }

    this.apiKeyPanelLoading.set(true);

    try {
      const formData = this.apiKeyForm.GetFormData();

      if (this.apiKeyPanelMode() === 'create') {
        const result = await this.apiKeyService.CreateApiKey({
          name: formData.name,
        });

        // Show the token to the user (only shown once)
        if (result.plaintext_token) {
          this.newlyCreatedToken.set(result.plaintext_token);
        }

        this.apiKeyPanelShowErrors.set(false);
      } else {
        const apiKey = this.selectedApiKey();
        if (!apiKey) return;

        await this.apiKeyService.UpdateApiKey(apiKey.id, {
          name: formData.name,
          status: formData.status,
        });

        this.apiKeyPanelOpen.set(false);
        this.apiKeyPanelShowErrors.set(false);
      }
    } catch (error) {
      console.error('Failed to save API key:', error);
    } finally {
      this.apiKeyPanelLoading.set(false);
    }
  }

  async OnDeleteApiKeyClick(apiKey: ApiKey): Promise<void> {
    if (
      !confirm(
        `Are you sure you want to delete this API key?\n\n${apiKey.name}\n\nThis action cannot be undone.`
      )
    ) {
      return;
    }

    try {
      await this.apiKeyService.DeleteApiKey(apiKey.id);
    } catch (error) {
      console.error('Failed to delete API key:', error);
      alert(
        'Cannot delete the last active API key. Create a new key first or deactivate this one instead.'
      );
    }
  }

  async OnRollApiKeyClick(apiKey: ApiKey): Promise<void> {
    if (
      !confirm(
        `Are you sure you want to roll this API key?\n\n${apiKey.name}\n\nThis will generate a new token and invalidate the current one immediately.`
      )
    ) {
      return;
    }

    try {
      const result = await this.apiKeyService.RollApiKey(apiKey.id);

      // Show the new token
      this.selectedApiKey.set(null);
      this.apiKeyPanelMode.set('create');
      this.newlyCreatedToken.set(result.plaintext_token);
      this.apiKeyPanelOpen.set(true);
    } catch (error) {
      console.error('Failed to roll API key:', error);
    }
  }

  GetApiKeyPanelTitle(): string {
    if (this.newlyCreatedToken()) {
      return 'API key created';
    }
    return this.apiKeyPanelMode() === 'create'
      ? 'Create API key'
      : 'Edit API key';
  }

  OnApiKeyFormDone(): void {
    this.apiKeyPanelOpen.set(false);
    this.newlyCreatedToken.set(null);
  }

  // Card Action Handlers
  OnApiKeyAction(actionId: string, apiKey: ApiKey): void {
    switch (actionId) {
      case 'roll':
        this.OnRollApiKeyClick(apiKey);
        break;
      case 'delete':
        this.OnDeleteApiKeyClick(apiKey);
        break;
    }
  }

  OnWebhookAction(actionId: string, endpoint: WebhookEndpoint): void {
    switch (actionId) {
      case 'delete':
        this.OnDeleteWebhookClick(endpoint);
        break;
    }
  }

  // Balance Detail Panel Methods (Platform Only)
  OnBalanceDetailClick(): void {
    this.balanceDetailPanelOpen.set(true);
  }

  OnBalanceDetailPanelClosed(): void {
    this.balanceDetailPanelOpen.set(false);
  }

  async OnBalanceSynced(): Promise<void> {
    await this.balanceService.GetBalance();
  }

  // Add Funds Panel Methods (Platform Only)
  OnAddFundsClick(): void {
    this.addFundsPanelOpen.set(true);
  }

  OnAddFundsPanelClosed(): void {
    this.addFundsPanelOpen.set(false);
    this.topupService.Reset();
  }

  async OnDepositCompleted(_deposit: TopUp): Promise<void> {
    // Refresh balance after a short delay to ensure backend has processed
    setTimeout(async () => {
      await this.balanceService.GetBalance();
    }, 1000);
  }

  // Connected Accounts Methods (Platform Only)
  async OnConnectedAccountClick(item: unknown): Promise<void> {
    const account = item as Account;
    this.connectedAccountPanelOpen.set(true);

    try {
      await this.accountService.LoadConnectedAccount(account.id);
    } catch (error) {
      console.error('Failed to load connected account details:', error);
    }
  }

  OnConnectedAccountPanelClosed(): void {
    this.connectedAccountPanelOpen.set(false);
    this.accountService.ClearSelectedConnectedAccount();
  }

  async OnTransferAccountClick(accountId: string): Promise<void> {
    this.transactionDetailPanelOpen.set(false);
    this.transactionService.ClearSelection();
    await this.OnConnectedAccountClick({ id: accountId } as Account);
  }

  GetConnectedAccountPanelTitle(): string {
    const account = this.accountService.selectedConnectedAccount();
    if (!account) return 'Account details';
    return this.accountService.GetConnectedAccountDisplayName(account);
  }
}
