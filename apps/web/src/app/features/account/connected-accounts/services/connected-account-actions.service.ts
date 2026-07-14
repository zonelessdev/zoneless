import { inject, Injectable, signal, WritableSignal } from '@angular/core';
import { Subject } from 'rxjs';
import type { Account, AccountLink } from '@zoneless/shared-types';
import type { CreateAccountInput } from '@zoneless/shared-schemas';
import { AccountService, AccountLinkService } from '../../../../data';
import { GetCountryName } from '../../../../utils';

export type CreateConnectedAccountStep = 'summary' | 'edit-details' | 'success';

export type BusinessType =
  | 'individual'
  | 'company'
  | 'non_profit'
  | 'government_entity';

export type ConnectedAccountActionEvent = {
  type: 'created';
  account: Account;
  accountLink: AccountLink;
};

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

  flowOpen: WritableSignal<boolean> = signal(false);
  step: WritableSignal<CreateConnectedAccountStep> = signal('summary');
  loading: WritableSignal<boolean> = signal(false);
  error: WritableSignal<string> = signal('');

  // Committed form state (shown on summary, sent on create)
  country: WritableSignal<string> = signal(DEFAULT_DRAFT.country);
  businessType: WritableSignal<BusinessType> = signal(
    DEFAULT_DRAFT.businessType
  );
  transfersRequested: WritableSignal<boolean> = signal(
    DEFAULT_DRAFT.transfersRequested
  );

  // Draft while editing details (applied on Save, discarded on Back)
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

  readonly events$ = new Subject<ConnectedAccountActionEvent>();

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
