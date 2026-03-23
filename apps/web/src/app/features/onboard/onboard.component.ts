import {
  Component,
  OnInit,
  ChangeDetectionStrategy,
  inject,
  signal,
  WritableSignal,
  ViewChild,
} from '@angular/core';
import { Router } from '@angular/router';

import { MetaService } from '../../core';
import {
  AccountService,
  AccountLinkService,
  PersonService,
  ExternalWalletService,
  ConfigService,
} from '../../data';
import {
  PageLoaderComponent,
  LoaderComponent,
  PersonFormComponent,
  ExternalWalletFormComponent,
  SettingsCardComponent,
  SlidePanelComponent,
  PlatformLogoComponent,
} from '../../shared';

enum OnboardStep {
  PERSON = 1,
  WALLET = 2,
  FINISH = 3,
  SUCCESS = 4,
}

@Component({
  selector: 'app-onboard',
  templateUrl: './onboard.component.html',
  styleUrls: ['./onboard.component.scss'],
  standalone: true,
  imports: [
    PageLoaderComponent,
    LoaderComponent,
    PersonFormComponent,
    ExternalWalletFormComponent,
    SettingsCardComponent,
    SlidePanelComponent,
    PlatformLogoComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class OnboardComponent implements OnInit {
  private readonly meta = inject(MetaService);
  private readonly router = inject(Router);
  private readonly accountService = inject(AccountService);
  private readonly accountLinkService = inject(AccountLinkService);
  readonly personService = inject(PersonService);
  readonly externalWalletService = inject(ExternalWalletService);
  readonly configService = inject(ConfigService);

  @ViewChild(PersonFormComponent) personForm!: PersonFormComponent;
  @ViewChild(ExternalWalletFormComponent)
  walletForm!: ExternalWalletFormComponent;
  @ViewChild('editPersonForm') editPersonForm!: PersonFormComponent;
  @ViewChild('editWalletForm') editWalletForm!: ExternalWalletFormComponent;

  seo = {
    title: 'Onboard | Zoneless',
    description: 'Onboard your account for Zoneless',
    image: '',
    url: '/onboard',
  };

  readonly STEPS = OnboardStep;

  step: WritableSignal<number> = signal(OnboardStep.PERSON);

  token: WritableSignal<string> = signal('');
  loading: WritableSignal<boolean> = signal(true);
  nextLoading: WritableSignal<boolean> = signal(false);
  apiError: WritableSignal<string> = signal('');

  showPersonErrors: WritableSignal<boolean> = signal(false);
  showWalletErrors: WritableSignal<boolean> = signal(false);

  personFormValid: WritableSignal<boolean> = signal(false);
  walletFormValid: WritableSignal<boolean> = signal(false);

  // Edit panel state
  editPersonPanelOpen: WritableSignal<boolean> = signal(false);
  editPersonLoading: WritableSignal<boolean> = signal(false);
  editPersonShowErrors: WritableSignal<boolean> = signal(false);

  editWalletPanelOpen: WritableSignal<boolean> = signal(false);
  editWalletLoading: WritableSignal<boolean> = signal(false);
  editWalletShowErrors: WritableSignal<boolean> = signal(false);

  async ngOnInit(): Promise<void> {
    this.meta.SetMeta(this.seo);
    try {
      // Extract token from URL first
      this.CheckUrlParams();
      const token = this.token();

      // Load platform config for branding (pass token for correct platform context)
      await this.configService.LoadConfig(token || undefined);

      // Exchange token for session if present
      if (token) {
        await this.accountLinkService.ExchangeToken(token);
      }

      const account = await this.accountService.GetAccount();
      if (account?.individual) {
        this.personService.SetPerson(account.individual);
      }
      if (account) {
        await this.externalWalletService.GetExternalWallets(account.id);
      }
      this.DetermineInitialStep();
      this.loading.set(false);
    } catch (error) {
      console.error(error);
      // Redirect to session expired page on any auth error
      if (this.accountLinkService.linkError()) {
        this.router.navigateByUrl('/session-expired?reason=link_expired');
        return;
      }
      this.loading.set(false);
    }
  }

  CheckUrlParams(): void {
    const queryString = window.location.search;
    const urlParams = new URLSearchParams(queryString);
    const token = urlParams.get('token');
    if (token) {
      this.token.set(token);
    }
  }

  DetermineInitialStep(): void {
    const account = this.accountService.account();

    if (account?.tos_acceptance) {
      this.step.set(OnboardStep.SUCCESS);
      return;
    }

    if (!account?.details_submitted) {
      this.step.set(OnboardStep.PERSON);
      return;
    }

    if (!account?.payouts_enabled) {
      this.step.set(OnboardStep.WALLET);
      return;
    }

    this.step.set(OnboardStep.FINISH);
  }

  OnPersonFormChange(): void {
    // Form data tracked through personService after save
  }

  OnPersonValidationChange(isValid: boolean): void {
    this.personFormValid.set(isValid);
  }

  OnWalletValidationChange(isValid: boolean): void {
    this.walletFormValid.set(isValid);
  }

  async Next(): Promise<void> {
    const currentStep = this.step();

    if (!this.IsStepValid(currentStep)) {
      this.ShowStepErrors(currentStep);
      return;
    }

    this.apiError.set('');

    try {
      await this.SaveStep(currentStep);
      this.GoToNextStep();
    } catch (error: unknown) {
      this.nextLoading.set(false);
      const message =
        error instanceof Error ? error.message : 'An error occurred';
      this.apiError.set(message);
    }
  }

  IsStepValid(step: number): boolean {
    switch (step) {
      case OnboardStep.PERSON:
        return this.personFormValid();
      case OnboardStep.WALLET:
        return this.walletFormValid();
      case OnboardStep.FINISH:
        return true;
      default:
        return false;
    }
  }

  ShowStepErrors(step: number): void {
    if (step === OnboardStep.PERSON) this.showPersonErrors.set(true);
    if (step === OnboardStep.WALLET) this.showWalletErrors.set(true);
  }

  async SaveStep(step: number): Promise<void> {
    switch (step) {
      case OnboardStep.PERSON:
        await this.SavePersonDetails();
        break;
      case OnboardStep.WALLET:
        await this.SaveWalletDetails();
        break;
      case OnboardStep.FINISH:
        await this.AgreeTerms();
        break;
    }
  }

  GoToNextStep(): void {
    this.step.update((value) => value + 1);
  }

  Back(): void {
    const previousStep = this.step() - 1;
    if (previousStep === 0) {
      this.router.navigateByUrl('/');
    } else {
      this.step.update((value) => value - 1);
    }
  }

  async SavePersonDetails(): Promise<void> {
    this.nextLoading.set(true);
    try {
      const account = this.accountService.account();
      const person = this.personService.person();

      if (!account || !person || !this.personForm) {
        throw new Error('Account or person not found');
      }

      const updateData = this.personForm.GetUpdateData();
      await this.personService.UpdatePerson(account.id, person.id, updateData);
    } finally {
      this.nextLoading.set(false);
    }
  }

  async SaveWalletDetails(): Promise<void> {
    this.nextLoading.set(true);
    try {
      const account = this.accountService.account();

      if (!account || !this.walletForm) {
        throw new Error('Account not found');
      }

      const data = this.walletForm.GetFormData();
      await this.externalWalletService.SaveExternalWallet(account.id, {
        wallet_address: data.walletAddress,
        network: data.network,
        country: account.country,
        currency: data.currency,
      });

      // Refresh account to get updated payouts_enabled status
      const updatedAccount = await this.accountService.GetAccount();
      if (updatedAccount?.individual) {
        this.personService.SetPerson(updatedAccount.individual);
      }
    } finally {
      this.nextLoading.set(false);
    }
  }

  async AgreeTerms(): Promise<void> {
    this.nextLoading.set(true);
    try {
      const account = this.accountService.account();
      if (!account) {
        throw new Error('Account not found');
      }

      await this.accountService.AgreeTerms(account.id);
    } finally {
      this.nextLoading.set(false);
    }
  }

  Finish(): void {
    const linkContext = this.accountLinkService.linkContext();
    if (linkContext?.return_url) {
      window.location.href = linkContext.return_url;
    } else {
      window.location.href = '/';
    }
  }

  GetLinkContext() {
    return this.accountLinkService.linkContext();
  }

  IsNextButtonEnabled(step: number): boolean {
    return this.IsStepValid(step);
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

    const account = this.accountService.account();
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

  async OnEditWalletSubmit(): Promise<void> {
    if (!this.editWalletForm) return;

    this.editWalletShowErrors.set(true);

    if (!this.editWalletForm.ValidateAll()) {
      return;
    }

    const account = this.accountService.account();
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
}
