import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  ViewChild,
  WritableSignal,
  computed,
  inject,
  signal,
} from '@angular/core';

import { ActivatedRoute, Router } from '@angular/router';

import { AuthService, MetaService } from '../../../core';
import {
  AccountService,
  ApiKeyService,
  BalanceService,
  PersonService,
  ExternalWalletService,
  IdentityService,
  TransactionService,
  WebhookEndpointService,
  TopupService,
  ConfigService,
  TelemetryService,
} from '../../../data';
import {
  BusinessProfileFormComponent,
  ExternalWalletFormComponent,
  IdentitySettingsFormComponent,
  PersonFormComponent,
  SettingsCardComponent,
  SlidePanelComponent,
} from '../../../shared';
import {
  GetIdentityDocumentImpactCopy,
  GetIdentityDocumentImpactSentence,
  GetIdentityDocumentMissingLabel,
  GetIdentityDocumentPanelTitle,
  GetIdentityDocumentRequirementState,
  GetIdentityDocumentTaskDescription,
  GetIdentityDocumentTaskTitle,
  NeedsIdentityDocumentRemediation,
} from '../connected-accounts/util/identity-requirements';

@Component({
  selector: 'app-settings',
  imports: [
    SlidePanelComponent,
    PersonFormComponent,
    ExternalWalletFormComponent,
    BusinessProfileFormComponent,
    IdentitySettingsFormComponent,
    SettingsCardComponent,
  ],
  templateUrl: './settings.component.html',
  styleUrl: './settings.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SettingsComponent implements OnInit {
  @ViewChild('editPersonForm') editPersonForm!: PersonFormComponent;
  @ViewChild('editWalletForm') editWalletForm!: ExternalWalletFormComponent;
  @ViewChild('editBusinessForm')
  editBusinessForm!: BusinessProfileFormComponent;
  @ViewChild('editIdentityForm')
  editIdentityForm!: IdentitySettingsFormComponent;

  readonly personService = inject(PersonService);
  readonly externalWalletService = inject(ExternalWalletService);
  readonly authService = inject(AuthService);
  readonly accountService = inject(AccountService);
  readonly balanceService = inject(BalanceService);
  readonly transactionService = inject(TransactionService);
  readonly webhookEndpointService = inject(WebhookEndpointService);
  readonly apiKeyService = inject(ApiKeyService);
  readonly topupService = inject(TopupService);
  readonly configService = inject(ConfigService);
  readonly telemetryService = inject(TelemetryService);
  private readonly identityService = inject(IdentityService);
  readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly metaService = inject(MetaService);

  // Edit person panel state
  editPersonPanelOpen: WritableSignal<boolean> = signal(false);
  editPersonLoading: WritableSignal<boolean> = signal(false);
  editPersonShowErrors: WritableSignal<boolean> = signal(false);

  // Edit wallet panel state
  editWalletPanelOpen: WritableSignal<boolean> = signal(false);
  editWalletLoading: WritableSignal<boolean> = signal(false);
  editWalletShowErrors: WritableSignal<boolean> = signal(false);
  walletFormValid: WritableSignal<boolean> = signal(false);

  // Edit business details panel state
  editBusinessPanelOpen: WritableSignal<boolean> = signal(false);
  editBusinessLoading: WritableSignal<boolean> = signal(false);
  editBusinessShowErrors: WritableSignal<boolean> = signal(false);

  // Edit identity / Didit panel state
  editIdentityPanelOpen: WritableSignal<boolean> = signal(false);
  editIdentityLoading: WritableSignal<boolean> = signal(false);
  editIdentityShowErrors: WritableSignal<boolean> = signal(false);

  telemetrySaving: WritableSignal<boolean> = signal(false);

  identityTaskDetailOpen: WritableSignal<boolean> = signal(false);
  identityVerificationStarting: WritableSignal<boolean> = signal(false);
  identityVerificationError: WritableSignal<string> = signal('');

  readonly showIdentityTask = computed(
    () =>
      !this.authService.isPlatform() &&
      NeedsIdentityDocumentRemediation(this.accountService.account())
  );

  readonly identityRepresentativeName = computed(() => {
    const personName = this.personService.GetFullName(
      this.personService.person()
    );
    if (personName) return personName;
    const account = this.accountService.account();
    return account
      ? this.accountService.GetConnectedAccountDisplayName(account)
      : 'your account';
  });

  readonly identityTaskTitle = computed(() =>
    GetIdentityDocumentTaskTitle(this.identityRepresentativeName())
  );

  readonly identityPanelTitle = computed(() =>
    GetIdentityDocumentPanelTitle(this.identityRepresentativeName())
  );

  readonly identityTaskDescription = computed(() =>
    GetIdentityDocumentTaskDescription(this.identityRepresentativeName())
  );

  readonly identityImpactCopy = computed(() => {
    const account = this.accountService.account();
    if (!account) return '';
    return GetIdentityDocumentImpactCopy(account);
  });

  readonly identityImpactSentence = computed(() => {
    const account = this.accountService.account();
    if (!account) return '';
    return GetIdentityDocumentImpactSentence(account);
  });

  readonly identityDocumentMissingLabel = computed(() => {
    const account = this.accountService.account();
    if (!account) return 'Missing';
    return GetIdentityDocumentMissingLabel(
      GetIdentityDocumentRequirementState(account)
    );
  });

  ngOnInit(): void {
    this.metaService.SetMetaTitle('Settings');
    if (this.authService.isPlatform()) {
      this.telemetryService.GetStatus();
    }
    if (
      this.showIdentityTask() &&
      this.route.snapshot.queryParamMap.get('task') === 'identity'
    ) {
      this.identityTaskDetailOpen.set(true);
      void this.router.navigate([], {
        relativeTo: this.route,
        queryParams: { task: null },
        queryParamsHandling: 'merge',
        replaceUrl: true,
      });
    }
  }

  OpenIdentityTaskDetail(): void {
    this.identityVerificationError.set('');
    this.identityTaskDetailOpen.set(true);
  }

  CloseIdentityTaskDetail(): void {
    this.identityTaskDetailOpen.set(false);
    this.identityVerificationError.set('');
  }

  async StartIdentityVerification(): Promise<void> {
    if (this.identityVerificationStarting()) return;

    const account = this.accountService.account();
    if (!account) return;

    this.identityVerificationStarting.set(true);
    this.identityVerificationError.set('');

    try {
      const session = await this.identityService.CreateVerificationSession({
        type: 'document',
        related_account: account.id,
      });
      if (!session.url) {
        this.identityVerificationError.set(
          'Verification session was created but no link was returned.'
        );
        return;
      }
      window.open(session.url, '_blank', 'noopener,noreferrer');
    } catch (err) {
      this.identityVerificationError.set(
        err instanceof Error
          ? err.message
          : 'Failed to start identity verification. Please try again.'
      );
    } finally {
      this.identityVerificationStarting.set(false);
    }
  }

  async OnTelemetryToggle(checked: boolean): Promise<void> {
    this.telemetrySaving.set(true);
    try {
      await this.telemetryService.SetEnabled(checked);
    } catch (error) {
      console.error('Failed to update telemetry preference:', error);
      await this.telemetryService.GetStatus();
    } finally {
      this.telemetrySaving.set(false);
    }
  }

  // Edit Business Panel
  OnEditBusinessClick(): void {
    this.editBusinessShowErrors.set(false);
    this.editBusinessPanelOpen.set(true);
  }

  OnEditBusinessPanelClosed(): void {
    this.editBusinessPanelOpen.set(false);
    this.editBusinessShowErrors.set(false);
  }

  async OnEditBusinessSubmit(): Promise<void> {
    if (!this.editBusinessForm) return;

    this.editBusinessShowErrors.set(true);

    if (!this.editBusinessForm.ValidateAll()) {
      return;
    }

    const account = this.GetAccount();
    if (!account) return;

    this.editBusinessLoading.set(true);

    try {
      const updateData = this.editBusinessForm.GetUpdateData();
      await this.accountService.UpdateAccount(account.id, updateData);
      this.configService.ClearConfig();
      await this.configService.LoadConfig();
      this.editBusinessPanelOpen.set(false);
      this.editBusinessShowErrors.set(false);
    } catch (error) {
      console.error('Failed to update business details:', error);
    } finally {
      this.editBusinessLoading.set(false);
    }
  }

  // Edit Identity Panel
  OnEditIdentityClick(): void {
    this.editIdentityShowErrors.set(false);
    this.editIdentityPanelOpen.set(true);
  }

  OnEditIdentityPanelClosed(): void {
    this.editIdentityPanelOpen.set(false);
    this.editIdentityShowErrors.set(false);
  }

  async OnEditIdentitySubmit(): Promise<void> {
    if (!this.editIdentityForm) return;

    this.editIdentityShowErrors.set(true);

    if (!this.editIdentityForm.ValidateAll()) {
      return;
    }

    const account = this.GetAccount();
    if (!account) return;

    this.editIdentityLoading.set(true);

    try {
      const updateData = this.editIdentityForm.GetUpdateData();
      await this.accountService.UpdateAccount(account.id, updateData);
      this.editIdentityPanelOpen.set(false);
      this.editIdentityShowErrors.set(false);
    } catch (error) {
      console.error('Failed to update identity settings:', error);
    } finally {
      this.editIdentityLoading.set(false);
    }
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

  GetAccount() {
    return this.accountService.account();
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
    this.telemetryService.Reset();
    this.router.navigateByUrl('/');
  }
}
