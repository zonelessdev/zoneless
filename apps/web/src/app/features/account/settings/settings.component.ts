import {
  ChangeDetectionStrategy,
  Component,
  inject,
  signal,
  ViewChild,
  WritableSignal,
  OnInit,
} from '@angular/core';

import { Router } from '@angular/router';

import { AuthService, MetaService } from '../../../core';
import {
  AccountService,
  ApiKeyService,
  BalanceService,
  PersonService,
  ExternalWalletService,
  TransactionService,
  WebhookEndpointService,
  TopupService,
  ConfigService,
  TelemetryService,
} from '../../../data';
import {
  BusinessProfileFormComponent,
  ExternalWalletFormComponent,
  PersonFormComponent,
  SettingsCardComponent,
  SlidePanelComponent,
} from '../../../shared';

@Component({
  selector: 'app-settings',
  imports: [
    SlidePanelComponent,
    PersonFormComponent,
    ExternalWalletFormComponent,
    BusinessProfileFormComponent,
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
  readonly router = inject(Router);
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

  telemetrySaving: WritableSignal<boolean> = signal(false);

  ngOnInit(): void {
    this.metaService.SetMetaTitle('Settings');
    if (this.authService.isPlatform()) {
      this.telemetryService.GetStatus();
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
