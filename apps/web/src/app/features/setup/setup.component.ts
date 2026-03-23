import {
  Component,
  OnInit,
  ChangeDetectionStrategy,
  inject,
  signal,
  WritableSignal,
} from '@angular/core';
import { Router } from '@angular/router';
import { FormsModule } from '@angular/forms';

import { MetaService, StorageService } from '../../core';
import { SetupService } from '../../data';
import { PageLoaderComponent, LoaderComponent } from '../../shared';
import { SetupResponse } from '@zoneless/shared-types';

enum SetupStep {
  WELCOME = 1,
  PLATFORM = 2,
  WALLET = 3,
  COMPLETE = 4,
}

@Component({
  selector: 'app-setup',
  templateUrl: './setup.component.html',
  styleUrls: ['./setup.component.scss'],
  standalone: true,
  imports: [FormsModule, PageLoaderComponent, LoaderComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SetupComponent implements OnInit {
  private readonly meta = inject(MetaService);
  private readonly router = inject(Router);
  private readonly storage = inject(StorageService);
  readonly setupService = inject(SetupService);

  seo = {
    title: 'Setup | Zoneless',
    description: 'Set up your Zoneless platform',
    image: '',
    url: '/setup',
  };

  readonly STEPS = SetupStep;

  step: WritableSignal<SetupStep> = signal(SetupStep.WELCOME);
  loading: WritableSignal<boolean> = signal(true);
  submitting: WritableSignal<boolean> = signal(false);
  error: WritableSignal<string> = signal('');

  // Form data
  platformName: WritableSignal<string> = signal('');
  platformLogoUrl: WritableSignal<string> = signal('');
  termsUrl: WritableSignal<string> = signal('');
  privacyUrl: WritableSignal<string> = signal('');

  // Wallet options
  walletOption: WritableSignal<'generate' | 'import'> = signal('generate');

  // Generated wallet keys (generated in browser, never sent to server)
  generatedPublicKey: WritableSignal<string> = signal('');
  generatedSecretKey: WritableSignal<string> = signal('');
  walletGenerated: WritableSignal<boolean> = signal(false);
  generatingWallet: WritableSignal<boolean> = signal(false);

  // Import wallet (only public key - user keeps their secret key)
  importPublicKey: WritableSignal<string> = signal('');

  // Setup result
  setupResult: WritableSignal<SetupResponse | null> = signal(null);
  copiedField: WritableSignal<string> = signal('');

  async ngOnInit(): Promise<void> {
    this.meta.SetMeta(this.seo);

    try {
      const needsSetup = await this.setupService.CheckSetupStatus();
      const status = this.setupService.status();

      // Connected accounts should not access setup - redirect to dashboard
      if (status?.is_connected_account) {
        this.router.navigateByUrl('/');
        return;
      }

      if (!needsSetup) {
        // Already a platform, redirect to main app
        this.router.navigateByUrl('/');
        return;
      }

      this.loading.set(false);
    } catch (err) {
      console.error('Setup check failed:', err);
      this.loading.set(false);
    }
  }

  Next(): void {
    const currentStep = this.step();

    if (!this.ValidateStep(currentStep)) {
      return;
    }

    if (currentStep === SetupStep.WALLET) {
      this.SubmitSetup();
    } else {
      this.step.update((s) => s + 1);
    }
  }

  Back(): void {
    this.step.update((s) => Math.max(1, s - 1));
  }

  ValidateStep(step: SetupStep): boolean {
    this.error.set('');

    switch (step) {
      case SetupStep.WELCOME:
        return true;

      case SetupStep.PLATFORM:
        if (!this.platformName().trim()) {
          this.error.set('Platform name is required');
          return false;
        }
        return true;

      case SetupStep.WALLET:
        if (this.walletOption() === 'generate') {
          // Must have generated a wallet
          if (!this.walletGenerated()) {
            this.error.set('Please generate a wallet first');
            return false;
          }
        } else {
          // Import mode - only need public key
          if (!this.importPublicKey().trim()) {
            this.error.set('Wallet address is required');
            return false;
          }
        }
        return true;

      default:
        return true;
    }
  }

  /**
   * Generate a new Solana wallet in the browser.
   * The secret key never leaves the browser.
   */
  async GenerateWallet(): Promise<void> {
    this.generatingWallet.set(true);
    this.error.set('');

    try {
      const keypair = await this.setupService.GenerateSolanaKeypair();
      this.generatedPublicKey.set(keypair.publicKey);
      this.generatedSecretKey.set(keypair.secretKey);
      this.walletGenerated.set(true);
    } catch (err) {
      console.error('Failed to generate wallet:', err);
      this.error.set('Failed to generate wallet. Please try again.');
    } finally {
      this.generatingWallet.set(false);
    }
  }

  /**
   * Reset the generated wallet state when switching options.
   */
  OnWalletOptionChange(option: 'generate' | 'import'): void {
    this.walletOption.set(option);
    // Reset state when switching
    if (option === 'import') {
      this.generatedPublicKey.set('');
      this.generatedSecretKey.set('');
      this.walletGenerated.set(false);
    } else {
      this.importPublicKey.set('');
    }
    this.error.set('');
  }

  async SubmitSetup(): Promise<void> {
    this.submitting.set(true);
    this.error.set('');

    try {
      // Determine which public key to use
      const publicKey =
        this.walletOption() === 'generate'
          ? this.generatedPublicKey()
          : this.importPublicKey().trim();

      const response = await this.setupService.CompleteSetup({
        platform_name: this.platformName().trim(),
        platform_logo_url: this.platformLogoUrl().trim() || undefined,
        terms_url: this.termsUrl().trim() || undefined,
        privacy_url: this.privacyUrl().trim() || undefined,
        solana_public_key: publicKey,
      });

      this.setupResult.set(response);
      this.step.set(SetupStep.COMPLETE);
    } catch (err) {
      this.error.set(
        err instanceof Error ? err.message : 'Failed to complete setup'
      );
    } finally {
      this.submitting.set(false);
    }
  }

  async CopyToClipboard(text: string, field: string): Promise<void> {
    try {
      await navigator.clipboard.writeText(text);
      this.copiedField.set(field);
      setTimeout(() => this.copiedField.set(''), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  }

  GoToDashboard(): void {
    const result = this.setupResult();
    if (result?.login_token) {
      // Store the login token for authenticated dashboard access
      this.storage.StoreItemString('auth_token', result.login_token);
      // Mark as platform user (setup is only done by platform)
      this.storage.StoreItemString('is_platform', 'true');
    }
    // Navigate to dashboard
    this.router.navigateByUrl('/');
  }

  GetStepNumber(): number {
    const step = this.step();
    if (step === SetupStep.WELCOME) return 0;
    if (step === SetupStep.COMPLETE) return 3;
    return step - 1;
  }

  GetTotalSteps(): number {
    return 3;
  }
}
