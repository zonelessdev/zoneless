import {
  computed,
  inject,
  Injectable,
  signal,
  WritableSignal,
} from '@angular/core';
import { Subject } from 'rxjs';
import type {
  Account,
  AccountLink,
  Balance,
  ExternalWallet,
  LoginLink,
} from '@zoneless/shared-types';
import type { CreateAccountInput } from '@zoneless/shared-schemas';
import {
  AccountService,
  AccountLinkService,
  BalanceService,
  TransferService,
  ExternalWalletService,
} from '../../../../data';
import { GetCountryName } from '../../../../utils';

export type CreateConnectedAccountStep = 'summary' | 'edit-details' | 'success';

export type BusinessType =
  | 'individual'
  | 'company'
  | 'non_profit'
  | 'government_entity';

export type ConnectedAccountActionEvent =
  | {
      type: 'created';
      account: Account;
      accountLink: AccountLink;
    }
  | { type: 'updated'; account: Account }
  | { type: 'funds_added'; accountId: string }
  | { type: 'funds_pulled'; accountId: string };

export interface ConnectedAccountDraft {
  country: string;
  businessType: BusinessType;
  transfersRequested: boolean;
}

const DEFAULT_DRAFT: ConnectedAccountDraft = {
  country: 'US',
  businessType: 'individual',
  transfersRequested: true,
};

@Injectable()
export class ConnectedAccountActionsService {
  private readonly accountService = inject(AccountService);
  private readonly accountLinkService = inject(AccountLinkService);
  private readonly balanceService = inject(BalanceService);
  private readonly transferService = inject(TransferService);
  private readonly externalWalletService = inject(ExternalWalletService);

  // ── Create flow ──────────────────────────────────────────────────────────
  flowOpen: WritableSignal<boolean> = signal(false);
  step: WritableSignal<CreateConnectedAccountStep> = signal('summary');
  loading: WritableSignal<boolean> = signal(false);
  error: WritableSignal<string> = signal('');

  country: WritableSignal<string> = signal(DEFAULT_DRAFT.country);
  businessType: WritableSignal<BusinessType> = signal(
    DEFAULT_DRAFT.businessType
  );
  transfersRequested: WritableSignal<boolean> = signal(
    DEFAULT_DRAFT.transfersRequested
  );

  draftCountry: WritableSignal<string> = signal(DEFAULT_DRAFT.country);
  draftBusinessType: WritableSignal<BusinessType> = signal(
    DEFAULT_DRAFT.businessType
  );
  draftTransfersRequested: WritableSignal<boolean> = signal(
    DEFAULT_DRAFT.transfersRequested
  );

  createdAccount: WritableSignal<Account | null> = signal(null);
  createdAccountLink: WritableSignal<AccountLink | null> = signal(null);
  linkCopied: WritableSignal<boolean> = signal(false);

  // ── Detail page modals ───────────────────────────────────────────────────
  activeAccount: WritableSignal<Account | null> = signal(null);
  platformBalance: WritableSignal<Balance | null> = signal(null);
  connectedBalance: WritableSignal<Balance | null> = signal(null);
  externalWallets: WritableSignal<ExternalWallet[]> = signal([]);

  addFundsOpen: WritableSignal<boolean> = signal(false);
  addFundsAmount: WritableSignal<string> = signal('');
  addFundsTransferGroup: WritableSignal<string> = signal('');
  addFundsConfirmed: WritableSignal<boolean> = signal(false);
  addFundsLoading: WritableSignal<boolean> = signal(false);
  addFundsError: WritableSignal<string> = signal('');

  pullFundsOpen: WritableSignal<boolean> = signal(false);
  pullFundsAmount: WritableSignal<string> = signal('');
  pullFundsLoading: WritableSignal<boolean> = signal(false);
  pullFundsError: WritableSignal<string> = signal('');

  payoutOpen: WritableSignal<boolean> = signal(false);
  payoutAmount: WritableSignal<string> = signal('');
  payoutStatementDescriptor: WritableSignal<string> = signal('');
  payoutConfirmed: WritableSignal<boolean> = signal(false);
  payoutMethod: WritableSignal<'standard' | 'instant'> = signal('instant');

  profilePanelOpen: WritableSignal<boolean> = signal(false);

  loginLinkOpen: WritableSignal<boolean> = signal(false);
  loginLinkLoading: WritableSignal<boolean> = signal(false);
  loginLink: WritableSignal<LoginLink | null> = signal(null);
  loginLinkCopied: WritableSignal<boolean> = signal(false);
  loginLinkError: WritableSignal<string> = signal('');

  metadataDialogOpen: WritableSignal<boolean> = signal(false);
  metadataSaving: WritableSignal<boolean> = signal(false);
  metadataDraft: WritableSignal<Record<string, string>> = signal({});

  readonly canSubmitAddFunds = computed(() => {
    const amount = this.ParseAmountCents(this.addFundsAmount());
    const available = this.GetAvailableAmount(this.platformBalance());
    return (
      amount > 0 &&
      amount <= available &&
      this.addFundsConfirmed() &&
      !this.addFundsLoading()
    );
  });

  readonly canSubmitPullFunds = computed(() => {
    const amount = this.ParseAmountCents(this.pullFundsAmount());
    const available = this.GetAvailableAmount(this.connectedBalance());
    return amount > 0 && amount <= available && !this.pullFundsLoading();
  });

  readonly events$ = new Subject<ConnectedAccountActionEvent>();

  // ── Create flow methods ──────────────────────────────────────────────────

  OpenCreate(): void {
    this.ResetDraft();
    this.step.set('summary');
    this.error.set('');
    this.createdAccount.set(null);
    this.createdAccountLink.set(null);
    this.linkCopied.set(false);
    this.flowOpen.set(true);
  }

  CloseFlow(): void {
    this.flowOpen.set(false);
    this.step.set('summary');
    this.error.set('');
    this.loading.set(false);
    this.linkCopied.set(false);
  }

  OpenEditDetails(): void {
    this.draftCountry.set(this.country());
    this.draftBusinessType.set(this.businessType());
    this.draftTransfersRequested.set(this.transfersRequested());
    this.step.set('edit-details');
  }

  BackToSummary(): void {
    this.step.set('summary');
  }

  SaveDetails(): void {
    this.country.set(this.draftCountry());
    this.businessType.set(this.draftBusinessType());
    this.transfersRequested.set(this.draftTransfersRequested());
    this.step.set('summary');
  }

  async Create(): Promise<void> {
    this.loading.set(true);
    this.error.set('');
    try {
      const input = this.BuildCreateInput();
      const account = await this.accountService.CreateAccount(input);

      const origin = window.location.origin;
      const accountLink = await this.accountLinkService.CreateAccountLink({
        account: account.id,
        type: 'account_onboarding',
        return_url: `${origin}/account/connected-accounts`,
        refresh_url: `${origin}/account/connected-accounts`,
      });

      this.createdAccount.set(account);
      this.createdAccountLink.set(accountLink);
      this.step.set('success');
      this.events$.next({ type: 'created', account, accountLink });
    } catch (err) {
      console.error('Failed to create connected account:', err);
      this.error.set(
        err instanceof Error
          ? err.message
          : 'Failed to create connected account. Please try again.'
      );
    } finally {
      this.loading.set(false);
    }
  }

  async CopyOnboardingLink(): Promise<void> {
    const url = this.createdAccountLink()?.url;
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      this.linkCopied.set(true);
      setTimeout(() => this.linkCopied.set(false), 1500);
    } catch {
      // Clipboard may be unavailable in some contexts
    }
  }

  GetCountryDisplayName(code: string = this.country()): string {
    return GetCountryName(code) || code;
  }

  GetBusinessTypeLabel(type: BusinessType = this.businessType()): string {
    switch (type) {
      case 'individual':
        return 'Individual';
      case 'company':
        return 'Company';
      case 'non_profit':
        return 'Non-profit';
      case 'government_entity':
        return 'Government entity';
    }
  }

  GetCapabilitiesLabel(): string {
    return this.transfersRequested() ? 'Transfers' : 'None';
  }

  GetExpiresInLabel(): string {
    const link = this.createdAccountLink();
    if (!link) return '';
    const secondsLeft = link.expires_at - Math.floor(Date.now() / 1000);
    if (secondsLeft <= 0) return 'Expired';
    const hours = Math.floor(secondsLeft / 3600);
    if (hours >= 24) {
      const days = Math.round(hours / 24);
      return `Expires in ${days} day${days === 1 ? '' : 's'}.`;
    }
    if (hours >= 1) {
      return `Expires in ${hours} hour${hours === 1 ? '' : 's'}.`;
    }
    const minutes = Math.max(1, Math.round(secondsLeft / 60));
    return `Expires in ${minutes} minute${minutes === 1 ? '' : 's'}.`;
  }

  GetProgressPercent(): number {
    switch (this.step()) {
      case 'edit-details':
        return 50;
      case 'summary':
        return 90;
      case 'success':
        return 100;
    }
  }

  // ── Detail page helpers ──────────────────────────────────────────────────

  SetActiveAccount(account: Account | null): void {
    this.activeAccount.set(account);
  }

  async RefreshBalances(accountId: string): Promise<void> {
    const [platformBalance, connectedBalance] = await Promise.all([
      this.balanceService.GetBalance(),
      this.balanceService.GetBalance(accountId),
    ]);
    this.platformBalance.set(platformBalance);
    this.connectedBalance.set(connectedBalance);
  }

  async LoadExternalWallets(accountId: string): Promise<void> {
    try {
      const wallets = await this.externalWalletService.GetExternalWallets(
        accountId
      );
      this.externalWallets.set(wallets);
    } catch {
      this.externalWallets.set([]);
    }
  }

  GetAvailableAmount(balance: Balance | null): number {
    if (!balance) return 0;
    return balance.available.find((b) => b.currency === 'usdc')?.amount ?? 0;
  }

  GetPendingAmount(balance: Balance | null): number {
    if (!balance) return 0;
    return balance.pending.find((b) => b.currency === 'usdc')?.amount ?? 0;
  }

  GetDisplayName(account: Account | null = this.activeAccount()): string {
    if (!account) return 'Connected account';
    return this.accountService.GetConnectedAccountDisplayName(account);
  }

  GetDefaultWallet(): ExternalWallet | null {
    const wallets = this.externalWallets();
    if (!wallets.length) return null;
    return wallets.find((w) => w.default_for_currency) ?? wallets[0];
  }

  FormatWalletLabel(wallet: ExternalWallet | null): string {
    if (!wallet) return 'No external wallet';
    const network = wallet.network
      ? wallet.network.charAt(0).toUpperCase() + wallet.network.slice(1)
      : 'Solana';
    return `${network} wallet •••• ${wallet.last4}`;
  }

  // ── Add funds ────────────────────────────────────────────────────────────

  async OpenAddFunds(account: Account): Promise<void> {
    this.activeAccount.set(account);
    this.addFundsAmount.set('');
    this.addFundsTransferGroup.set('');
    this.addFundsConfirmed.set(false);
    this.addFundsError.set('');
    this.addFundsLoading.set(false);
    try {
      const platformBalance = await this.balanceService.GetBalance();
      this.platformBalance.set(platformBalance);
    } catch {
      this.platformBalance.set(null);
    }
    this.addFundsOpen.set(true);
  }

  CloseAddFunds(): void {
    this.addFundsOpen.set(false);
    this.addFundsError.set('');
    this.addFundsLoading.set(false);
  }

  ParseAmountCents(raw: string): number {
    const cleaned = raw.replace(/[^0-9.]/g, '');
    if (!cleaned) return 0;
    const value = Number.parseFloat(cleaned);
    if (Number.isNaN(value) || value <= 0) return 0;
    return Math.round(value * 100);
  }

  async ConfirmAddFunds(): Promise<void> {
    const account = this.activeAccount();
    if (!account || !this.canSubmitAddFunds()) return;

    const amount = this.ParseAmountCents(this.addFundsAmount());
    this.addFundsLoading.set(true);
    this.addFundsError.set('');
    try {
      const transferGroup = this.addFundsTransferGroup().trim();
      await this.transferService.CreateTransfer({
        amount,
        currency: 'usdc',
        destination: account.id,
        ...(transferGroup ? { transfer_group: transferGroup } : {}),
      });
      this.events$.next({ type: 'funds_added', accountId: account.id });
      this.CloseAddFunds();
    } catch (err) {
      this.addFundsError.set(
        err instanceof Error ? err.message : 'Failed to add funds.'
      );
    } finally {
      this.addFundsLoading.set(false);
    }
  }

  // ── Pull funds ───────────────────────────────────────────────────────────

  async OpenPullFunds(account: Account): Promise<void> {
    this.activeAccount.set(account);
    this.pullFundsAmount.set('');
    this.pullFundsError.set('');
    this.pullFundsLoading.set(false);
    try {
      const connectedBalance = await this.balanceService.GetBalance(account.id);
      this.connectedBalance.set(connectedBalance);
    } catch {
      this.connectedBalance.set(null);
    }
    this.pullFundsOpen.set(true);
  }

  ClosePullFunds(): void {
    this.pullFundsOpen.set(false);
    this.pullFundsError.set('');
    this.pullFundsLoading.set(false);
  }

  async ConfirmPullFunds(): Promise<void> {
    const account = this.activeAccount();
    const platform = this.accountService.account();
    if (!account || !platform || !this.canSubmitPullFunds()) return;

    const amount = this.ParseAmountCents(this.pullFundsAmount());
    this.pullFundsLoading.set(true);
    this.pullFundsError.set('');
    try {
      await this.transferService.CreateTransferForConnectedAccount(account.id, {
        amount,
        currency: 'usdc',
        destination: platform.id,
      });
      this.events$.next({ type: 'funds_pulled', accountId: account.id });
      this.ClosePullFunds();
    } catch (err) {
      this.pullFundsError.set(
        err instanceof Error ? err.message : 'Failed to pull funds.'
      );
    } finally {
      this.pullFundsLoading.set(false);
    }
  }

  // ── Payout (UI only) ─────────────────────────────────────────────────────

  async OpenPayout(account: Account): Promise<void> {
    this.activeAccount.set(account);
    this.payoutAmount.set('');
    this.payoutStatementDescriptor.set('');
    this.payoutConfirmed.set(false);
    this.payoutMethod.set('instant');
    try {
      const [connectedBalance] = await Promise.all([
        this.balanceService.GetBalance(account.id),
        this.LoadExternalWallets(account.id),
      ]);
      this.connectedBalance.set(connectedBalance);
    } catch {
      this.connectedBalance.set(null);
    }
    this.payoutOpen.set(true);
  }

  ClosePayout(): void {
    this.payoutOpen.set(false);
  }

  // ── Profile panel ────────────────────────────────────────────────────────

  OpenProfile(account: Account): void {
    this.activeAccount.set(account);
    this.profilePanelOpen.set(true);
  }

  CloseProfile(): void {
    this.profilePanelOpen.set(false);
  }

  // ── Login link ───────────────────────────────────────────────────────────

  async OpenLoginLink(account: Account): Promise<void> {
    this.activeAccount.set(account);
    this.loginLink.set(null);
    this.loginLinkCopied.set(false);
    this.loginLinkError.set('');
    this.loginLinkOpen.set(true);
    this.loginLinkLoading.set(true);
    try {
      const link = await this.accountService.CreateLoginLink(account.id);
      this.loginLink.set(link);
    } catch (err) {
      this.loginLinkError.set(
        err instanceof Error
          ? err.message
          : 'Failed to create login link. Please try again.'
      );
    } finally {
      this.loginLinkLoading.set(false);
    }
  }

  CloseLoginLink(): void {
    this.loginLinkOpen.set(false);
    this.loginLink.set(null);
    this.loginLinkCopied.set(false);
    this.loginLinkError.set('');
    this.loginLinkLoading.set(false);
  }

  async CopyLoginLink(): Promise<void> {
    const url = this.loginLink()?.url;
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      this.loginLinkCopied.set(true);
      setTimeout(() => this.loginLinkCopied.set(false), 2000);
    } catch {
      this.loginLinkError.set('Could not copy to clipboard.');
    }
  }

  // ── Metadata ─────────────────────────────────────────────────────────────

  OpenEditMetadata(account: Account): void {
    this.activeAccount.set(account);
    this.metadataDraft.set({ ...(account.metadata ?? {}) });
    this.metadataDialogOpen.set(true);
  }

  OnMetadataChange(metadata: Record<string, string>): void {
    this.metadataDraft.set(metadata);
  }

  async ConfirmEditMetadata(): Promise<void> {
    const account = this.activeAccount();
    if (!account) return;
    this.metadataSaving.set(true);
    try {
      const updated = await this.accountService.UpdateAccount(account.id, {
        metadata: this.metadataDraft(),
      });
      this.activeAccount.set(updated);
      this.events$.next({ type: 'updated', account: updated });
      this.metadataDialogOpen.set(false);
    } catch (err) {
      console.error('Failed to update metadata:', err);
    } finally {
      this.metadataSaving.set(false);
    }
  }

  private BuildCreateInput(): CreateAccountInput {
    const input: CreateAccountInput = {
      type: 'express',
      country: this.country(),
      business_type: this.businessType(),
    };

    if (this.transfersRequested()) {
      input.capabilities = {
        transfers: { requested: true },
      };
    }

    return input;
  }

  private ResetDraft(): void {
    this.country.set(DEFAULT_DRAFT.country);
    this.businessType.set(DEFAULT_DRAFT.businessType);
    this.transfersRequested.set(DEFAULT_DRAFT.transfersRequested);
    this.draftCountry.set(DEFAULT_DRAFT.country);
    this.draftBusinessType.set(DEFAULT_DRAFT.businessType);
    this.draftTransfersRequested.set(DEFAULT_DRAFT.transfersRequested);
  }
}
