import {
  ChangeDetectionStrategy,
  Component,
  OnDestroy,
  OnInit,
  ViewChild,
  WritableSignal,
  computed,
  inject,
  signal,
} from '@angular/core';
import { DatePipe, DecimalPipe } from '@angular/common';
import { ActivatedRoute, RouterLink } from '@angular/router';
import type {
  Account,
  BalanceTransaction,
  ExternalWallet,
  Payout,
} from '@zoneless/shared-types';
import { IsRejectedAccountReason } from '@zoneless/shared-schemas';
import { Subscription } from 'rxjs';
import {
  AccountService,
  BalanceService,
  ExternalWalletService,
  PersonService,
} from '../../../../../data';
import { MetaService } from '../../../../../core';
import {
  CopyTextComponent,
  PaginatedListColumn,
  PaginatedListComponent,
  PopupMenuAction,
  PopupMenuComponent,
  StatusChipComponent,
} from '../../../../../shared';
import { EventsListComponent } from '../../../components';
import { MetadataToArray } from '../../../util/metadata';
import { ConnectedAccountActionsService } from '../../services/connected-account-actions.service';
import { ConnectedAccountActionsHostComponent } from '../../components/connected-account-actions-host/connected-account-actions-host.component';
import {
  FormatAccountCountry,
  FormatCapabilityList,
  FormatPayoutSchedule,
  FormatRelativeTime,
  FormatWalletDisplay,
  GetAccountStatus,
  HasActiveCapabilities,
} from '../../util/connected-account-display';
import {
  GetIdentityDocumentActionSubtitle,
  GetIdentityDocumentImpactCopy,
  GetIdentityDocumentMissingLabel,
  GetIdentityDocumentPanelTitle,
  GetIdentityDocumentRequirementState,
  GetIdentityDocumentTaskDescription,
  NeedsIdentityDocumentAction,
  ResolveAccountPayoutVolumeThresholdCents,
} from '../../util/identity-requirements';

type DetailTab = 'overview' | 'payments';
type MoneyMovementTab = 'transfers' | 'payouts';
type DetailPanel = 'main' | 'identity_document';

@Component({
  selector: 'app-connected-account-detail-view',
  imports: [
    DatePipe,
    DecimalPipe,
    RouterLink,
    CopyTextComponent,
    PopupMenuComponent,
    StatusChipComponent,
    PaginatedListComponent,
    EventsListComponent,
    ConnectedAccountActionsHostComponent,
  ],
  templateUrl: './connected-account-detail.component.html',
  styleUrl: './connected-account-detail.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ConnectedAccountDetailViewComponent implements OnInit, OnDestroy {
  private readonly route = inject(ActivatedRoute);
  private readonly accountService = inject(AccountService);
  private readonly balanceService = inject(BalanceService);
  private readonly externalWalletService = inject(ExternalWalletService);
  private readonly personService = inject(PersonService);
  private readonly metaService = inject(MetaService);
  readonly actions = inject(ConnectedAccountActionsService);
  readonly MetadataToArray = MetadataToArray;
  readonly FormatPayoutSchedule = FormatPayoutSchedule;
  readonly FormatCapabilityList = FormatCapabilityList;
  readonly FormatAccountCountry = FormatAccountCountry;
  readonly FormatRelativeTime = FormatRelativeTime;
  readonly FormatWalletDisplay = FormatWalletDisplay;
  readonly HasActiveCapabilities = HasActiveCapabilities;

  account: WritableSignal<Account | null> = signal(null);
  loading: WritableSignal<boolean> = signal(false);
  approvingIdentity: WritableSignal<boolean> = signal(false);
  refreshingIdentity: WritableSignal<boolean> = signal(false);
  activeTab: WritableSignal<DetailTab> = signal('overview');
  detailPanel: WritableSignal<DetailPanel> = signal('main');
  moneyMovementTab: WritableSignal<MoneyMovementTab> = signal('payouts');
  paymentsTab: WritableSignal<MoneyMovementTab> = signal('transfers');
  availableBalance: WritableSignal<number> = signal(0);
  pendingBalance: WritableSignal<number> = signal(0);
  externalWallets: WritableSignal<ExternalWallet[]> = signal([]);
  idCopied: WritableSignal<boolean> = signal(false);
  private idCopiedTimer?: ReturnType<typeof setTimeout>;

  readonly displayName = computed(() => {
    const account = this.account();
    if (!account) return 'Connected account';
    return this.accountService.GetConnectedAccountDisplayName(account);
  });

  readonly status = computed(() => {
    const account = this.account();
    return account ? GetAccountStatus(account) : 'restricted';
  });

  readonly email = computed(() => {
    const account = this.account();
    return account?.email ?? account?.individual?.email ?? null;
  });

  readonly showIdentityAction = computed(() =>
    NeedsIdentityDocumentAction(this.account())
  );

  readonly identityDocumentState = computed(() => {
    const account = this.account();
    return account ? GetIdentityDocumentRequirementState(account) : 'none';
  });

  readonly identityPanelTitle = computed(() =>
    GetIdentityDocumentPanelTitle(this.displayName())
  );

  readonly identityPanelDescription = computed(() =>
    GetIdentityDocumentTaskDescription(this.displayName())
  );

  readonly identityDocumentMissingLabel = computed(() =>
    GetIdentityDocumentMissingLabel(this.identityDocumentState())
  );

  readonly payoutVolumeThresholdCents = computed(() => {
    const account = this.account();
    if (!account) return null;
    return ResolveAccountPayoutVolumeThresholdCents(
      account,
      this.accountService.account()
    );
  });

  readonly identityActionSubtitle = computed(() => {
    const account = this.account();
    if (!account) return '';
    return GetIdentityDocumentActionSubtitle(
      account,
      this.payoutVolumeThresholdCents()
    );
  });

  readonly identityImpactCopy = computed(() => {
    const account = this.account();
    if (!account) return '';
    return GetIdentityDocumentImpactCopy(
      account,
      this.payoutVolumeThresholdCents()
    );
  });

  readonly totalBalance = computed(
    () => (this.availableBalance() + this.pendingBalance()) / 100
  );

  readonly availableDollars = computed(() => this.availableBalance() / 100);

  readonly pendingDollars = computed(() => this.pendingBalance() / 100);

  /** Connected-account balance transactions of type transfer (add/pull funds). */
  readonly transferQueryParams: Record<string, string> = { type: 'transfer' };

  transferColumns: PaginatedListColumn[] = [
    {
      header: 'Amount',
      field: 'amount',
      type: 'currency-with-code',
      currencyField: 'currency',
      bolded: true,
    },
    {
      header: 'Status',
      field: 'status',
      type: 'status',
    },
    {
      header: 'Description',
      field: 'description',
      type: 'text',
      dimmed: true,
      formatter: (item: unknown) => {
        const bt = item as BalanceTransaction;
        return bt.description || bt.source || '—';
      },
    },
    {
      header: 'Created',
      field: 'created',
      type: 'date',
      dimmed: true,
      dateFormat: 'd MMM, HH:mm',
    },
    {
      header: '',
      field: '',
      type: 'actions',
      actions: [
        {
          title: 'Copy transfer ID',
          action: (item: BalanceTransaction) => {
            void navigator.clipboard.writeText(item.source || item.id);
          },
        },
      ],
    },
  ];

  payoutColumns: PaginatedListColumn[] = [
    {
      header: 'Amount',
      field: 'amount',
      type: 'currency-with-code',
      currencyField: 'currency',
      bolded: true,
    },
    {
      header: 'Status',
      field: 'status',
      type: 'status',
    },
    {
      header: 'External wallet',
      field: 'destination',
      type: 'text',
      dimmed: true,
      formatter: (item: unknown) => {
        const payout = item as Payout;
        const wallet = this.externalWallets().find(
          (w) => w.id === payout.destination
        );
        return wallet ? FormatWalletDisplay(wallet) : payout.destination || '—';
      },
    },
    {
      header: 'Description',
      field: 'id',
      type: 'text',
      dimmed: true,
      formatter: (item: unknown) => (item as Payout).id,
    },
    {
      header: 'Method',
      field: 'method',
      type: 'text',
      capitalize: true,
      dimmed: true,
    },
    {
      header: 'Initiated',
      field: 'created',
      type: 'date',
      dimmed: true,
      dateFormat: 'd MMM, HH:mm',
    },
    {
      header: 'Est. Arrival',
      field: 'arrival_date',
      type: 'date',
      dimmed: true,
      dateFormat: 'd MMM',
    },
    {
      header: '',
      field: '',
      type: 'actions',
      actions: [
        {
          title: 'Copy payout ID',
          action: (item: Payout) => {
            void navigator.clipboard.writeText(item.id);
          },
        },
      ],
    },
  ];

  GetAccountActions(): PopupMenuAction[] {
    const name = this.displayName();
    return [
      {
        title: `View Dashboard as ${name}`,
        external: true,
        action: () => this.OnViewDashboard(),
      },
      {
        title: 'Refresh identity checks',
        section: 'Actions',
        action: () => void this.OnRefreshIdentityChecks(),
        hidden: (account: Account) =>
          (account.requirements?.currently_due?.length ?? 0) === 0 ||
          this.actions.IsAccountRejected(account),
        disabled: () => this.refreshingIdentity(),
      },
      {
        title: 'Pause payouts',
        section: 'Actions',
        destructive: true,
        action: (account: Account) => this.actions.OpenPausePayouts(account),
        hidden: (account: Account) =>
          !account.payouts_enabled || this.actions.IsAccountRejected(account),
      },
      {
        title: 'Resume payouts',
        section: 'Actions',
        action: (account: Account) => this.actions.OpenResumePayouts(account),
        hidden: (account: Account) =>
          !!account.payouts_enabled || this.actions.IsAccountRejected(account),
      },
      {
        title: 'Pause payments',
        section: 'Actions',
        destructive: true,
        action: (account: Account) => this.actions.OpenPausePayments(account),
        hidden: (account: Account) =>
          !account.charges_enabled || this.actions.IsAccountRejected(account),
      },
      {
        title: 'Resume payments',
        section: 'Actions',
        action: (account: Account) => this.actions.OpenResumePayments(account),
        hidden: (account: Account) =>
          !!account.charges_enabled || this.actions.IsAccountRejected(account),
      },
      {
        title: 'Reject account',
        section: 'Actions',
        destructive: true,
        action: (account: Account) => this.actions.OpenReject(account),
        hidden: (account: Account) => this.actions.IsAccountRejected(account),
      },
      {
        title: 'Unreject account',
        section: 'Actions',
        action: (account: Account) => this.actions.OpenUnreject(account),
        hidden: (account: Account) => !this.actions.IsAccountRejected(account),
      },
    ];
  }

  private sub?: Subscription;
  private actionsSub?: Subscription;

  @ViewChild('overviewTransfers')
  overviewTransfersList?: PaginatedListComponent<any>;
  @ViewChild('overviewPayouts')
  overviewPayoutsList?: PaginatedListComponent<any>;
  @ViewChild('paymentsTransfers')
  paymentsTransfersList?: PaginatedListComponent<any>;
  @ViewChild('paymentsPayouts')
  paymentsPayoutsList?: PaginatedListComponent<any>;

  async ngOnInit(): Promise<void> {
    this.sub = this.route.paramMap.subscribe((params) => {
      const id = params.get('accountId');
      if (!id) return;
      void this.OnAccountIdChange(id);
    });
    this.actionsSub = this.actions.events$.subscribe((event) => {
      const id = this.account()?.id;
      if (!id) return;
      if (
        (event.type === 'funds_added' ||
          event.type === 'funds_pulled' ||
          event.type === 'payout_processed') &&
        event.accountId === id
      ) {
        void this.RefreshBalance(id);
        this.ReloadMoneyMovementLists();
      } else if (event.type === 'updated' && event.account.id === id) {
        this.account.set(event.account);
        this.actions.SetActiveAccount(event.account);
      }
    });
  }

  ngOnDestroy(): void {
    this.sub?.unsubscribe();
    this.actionsSub?.unsubscribe();
    clearTimeout(this.idCopiedTimer);
  }

  private async OnAccountIdChange(id: string): Promise<void> {
    if (this.account()?.id === id) return;

    this.account.set(null);
    this.activeTab.set('overview');
    this.detailPanel.set('main');
    this.moneyMovementTab.set('payouts');
    this.paymentsTab.set('transfers');
    this.idCopied.set(false);
    clearTimeout(this.idCopiedTimer);

    await this.LoadAccount(id);
    this.metaService.SetMetaTitle(this.displayName());
  }

  private async LoadAccount(id: string): Promise<void> {
    this.loading.set(true);
    try {
      const account = await this.accountService.GetConnectedAccount(id);
      this.account.set(account);
      this.actions.SetActiveAccount(account);
      await Promise.all([
        this.RefreshBalance(id),
        this.LoadWallets(id, account),
      ]);
    } finally {
      this.loading.set(false);
    }
  }

  private async RefreshBalance(id: string): Promise<void> {
    try {
      const balance = await this.balanceService.GetBalance(id);
      this.availableBalance.set(
        balance.available.find((b) => b.currency === 'usdc')?.amount ?? 0
      );
      this.pendingBalance.set(
        balance.pending.find((b) => b.currency === 'usdc')?.amount ?? 0
      );
      this.actions.connectedBalance.set(balance);
    } catch {
      this.availableBalance.set(0);
      this.pendingBalance.set(0);
    }
  }

  private async LoadWallets(id: string, account: Account): Promise<void> {
    const embedded = account.external_accounts?.data ?? [];
    if (embedded.length) {
      this.externalWallets.set(embedded);
      this.actions.externalWallets.set(embedded);
      return;
    }
    try {
      const wallets = await this.externalWalletService.GetExternalWallets(id);
      this.externalWallets.set(wallets);
      this.actions.externalWallets.set(wallets);
    } catch {
      this.externalWallets.set([]);
    }
  }

  SetTab(tab: DetailTab): void {
    this.activeTab.set(tab);
  }

  SetMoneyMovementTab(tab: MoneyMovementTab): void {
    this.moneyMovementTab.set(tab);
  }

  SetPaymentsTab(tab: MoneyMovementTab): void {
    this.paymentsTab.set(tab);
  }

  ViewAllMoneyMovement(tab: MoneyMovementTab): void {
    this.paymentsTab.set(tab);
    this.activeTab.set('payments');
  }

  CopyId(): void {
    const account = this.account();
    if (!account) return;
    void navigator.clipboard.writeText(account.id);
    this.idCopied.set(true);
    clearTimeout(this.idCopiedTimer);
    this.idCopiedTimer = setTimeout(() => this.idCopied.set(false), 1500);
  }

  OnViewDashboard(): void {
    const account = this.account();
    if (account) void this.actions.OpenLoginLink(account);
  }

  OnAddFunds(): void {
    const account = this.account();
    if (account) void this.actions.OpenAddFunds(account);
  }

  OnPullFunds(): void {
    const account = this.account();
    if (account) void this.actions.OpenPullFunds(account);
  }

  OnPayout(): void {
    const account = this.account();
    if (account) void this.actions.OpenPayout(account);
  }

  OnViewProfile(): void {
    const account = this.account();
    if (account) this.actions.OpenProfile(account);
  }

  OnEditMetadata(): void {
    const account = this.account();
    if (account) this.actions.OpenEditMetadata(account);
  }

  GetDoingBusinessAs(): string {
    const account = this.account();
    if (!account) return '—';
    return (
      account.business_profile?.name?.trim() ||
      account.settings?.dashboard?.display_name?.trim() ||
      this.displayName()
    );
  }

  GetWebsite(): string | null {
    return this.account()?.business_profile?.url ?? null;
  }

  GetPhone(): string | null {
    return this.account()?.individual?.phone ?? null;
  }

  GetAddressLines(): string[] | null {
    return this.personService.FormatAddress(this.account()?.individual ?? null);
  }

  GetStatementDescriptor(): string | null {
    return this.account()?.settings?.payouts?.statement_descriptor ?? null;
  }

  GetTosAccepted(): number | null {
    return this.account()?.tos_acceptance?.date ?? null;
  }

  GetDefaultCurrency(): string {
    return (this.account()?.default_currency ?? 'usdc').toUpperCase();
  }

  GetCurrentlyDue(): string[] {
    return this.account()?.requirements?.currently_due ?? [];
  }

  GetPendingVerification(): string[] {
    return this.account()?.requirements?.pending_verification ?? [];
  }

  GetRequirementErrors(): Array<{ requirement: string; reason: string }> {
    return this.account()?.requirements?.errors ?? [];
  }

  GetDisabledReason(): string | null {
    return this.account()?.requirements?.disabled_reason ?? null;
  }

  NeedsIdentityReview(): boolean {
    return (
      this.GetPendingVerification().length > 0 ||
      this.GetDisabledReason() === 'under_review'
    );
  }

  GetIdentityStatusLabel(): string | null {
    const reason = this.GetDisabledReason();
    if (IsRejectedAccountReason(reason)) {
      return `Rejected (${reason!.replace('rejected.', '')})`;
    }
    if (reason === 'under_review' || this.GetPendingVerification().length > 0) {
      return 'Needs review';
    }
    if (this.GetCurrentlyDue().length > 0) {
      return 'Requirements due';
    }
    return null;
  }

  async OnApproveIdentity(): Promise<void> {
    const account = this.account();
    if (!account || this.approvingIdentity()) return;

    this.approvingIdentity.set(true);
    try {
      const updated = await this.accountService.ApproveIdentity(account.id);
      this.account.set(updated);
      this.actions.SetActiveAccount(updated);
      this.actions.events$.next({ type: 'updated', account: updated });
    } catch (error) {
      console.error('Failed to dismiss identity review:', error);
    } finally {
      this.approvingIdentity.set(false);
    }
  }

  async OnRefreshIdentityChecks(): Promise<void> {
    const account = this.account();
    if (!account || this.refreshingIdentity()) return;

    this.refreshingIdentity.set(true);
    try {
      const updated = await this.accountService.RefreshIdentityRequirements(
        account.id
      );
      this.account.set(updated);
      this.actions.SetActiveAccount(updated);
      this.actions.events$.next({ type: 'updated', account: updated });
    } catch (error) {
      console.error('Failed to refresh identity requirements:', error);
    } finally {
      this.refreshingIdentity.set(false);
    }
  }

  OpenIdentityDocumentDetail(): void {
    this.detailPanel.set('identity_document');
  }

  CloseIdentityDocumentDetail(): void {
    this.detailPanel.set('main');
  }

  OnRequestInformation(): void {
    const account = this.account();
    if (account) void this.actions.OpenVerificationLink(account);
  }

  GetPayoutsMetaLabel(): string {
    const account = this.account();
    if (!account) return 'Payouts inactive';
    return account.payouts_enabled ? 'Payouts active' : 'Payouts inactive';
  }

  private ReloadMoneyMovementLists(): void {
    void this.overviewTransfersList?.Reload();
    void this.overviewPayoutsList?.Reload();
    void this.paymentsTransfersList?.Reload();
    void this.paymentsPayoutsList?.Reload();
  }
}
