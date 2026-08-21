import {
  Component,
  Input,
  Output,
  EventEmitter,
  OnInit,
  OnChanges,
  SimpleChanges,
  signal,
  WritableSignal,
  ChangeDetectionStrategy,
  inject,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ExternalWallet } from '@zoneless/shared-types';

import { TestModeBannerComponent } from '../../ui';
import { ConfigService } from '../../../data';

import {
  GetWalletAddressError,
  SOLANA_CURRENCY,
  SOLANA_NETWORK,
  TEST_WALLET_DATA,
  ValidateWalletAddress,
  CurrencyOptionsForNetwork,
  WALLET_NETWORKS,
} from '../../../utils';

export type ExternalWalletFormMode = 'onboard' | 'edit';

export interface ExternalWalletFormData {
  walletAddress: string;
  network: string;
  currency: string;
}

@Component({
  selector: 'app-external-wallet-form',
  standalone: true,
  imports: [FormsModule, TestModeBannerComponent],
  templateUrl: './external-wallet-form.component.html',
  styleUrls: ['./external-wallet-form.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ExternalWalletFormComponent implements OnInit, OnChanges {
  readonly configService = inject(ConfigService);

  @Input() mode: ExternalWalletFormMode = 'onboard';
  @Input() wallet: ExternalWallet | null = null;
  @Input() showErrors = false;
  @Input() isOpen = false;

  @Output() formChange = new EventEmitter<ExternalWalletFormData>();
  @Output() validationChange = new EventEmitter<boolean>();

  walletAddress: WritableSignal<string> = signal('');
  network: WritableSignal<string> = signal(SOLANA_NETWORK);
  currency: WritableSignal<string> = signal(SOLANA_CURRENCY);
  walletAddressError: WritableSignal<string> = signal('');
  validationStatus: WritableSignal<'none' | 'valid' | 'invalid'> =
    signal('none');
  showWalletGuide: WritableSignal<boolean> = signal(false);

  ngOnInit(): void {
    this.InitializeForm();
  }

  ngOnChanges(changes: SimpleChanges): void {
    // Reinitialize form when panel opens
    if (changes['isOpen'] && this.isOpen) {
      this.InitializeForm();
    }
  }

  InitializeForm(): void {
    if (this.wallet) {
      this.walletAddress.set(this.wallet.wallet_address || '');
      this.network.set((this.wallet.network || SOLANA_NETWORK).toLowerCase());
      this.currency.set(
        (this.wallet.currency || SOLANA_CURRENCY).toLowerCase()
      );
    } else {
      this.walletAddress.set('');
      this.network.set(SOLANA_NETWORK);
      this.currency.set(SOLANA_CURRENCY);
    }

    if (this.walletAddress()) {
      this.ValidateWalletAddress();
    } else {
      this.validationStatus.set('none');
      this.walletAddressError.set('');
    }

    this.EmitFormChange();
  }

  OnWalletAddressChange(value: string): void {
    this.walletAddress.set(value.trim());
    this.ValidateWalletAddress();
    this.EmitFormChange();
  }

  OnNetworkChange(value: string): void {
    this.network.set(value.toLowerCase());
    const allowed = this.CurrencyOptions();
    if (!allowed.some((option) => option.value === this.currency())) {
      this.currency.set(allowed[0]?.value ?? 'usdc');
    }
    if (!this.IsSolanaNetwork()) {
      this.showWalletGuide.set(false);
    }
    this.ValidateWalletAddress();
    this.EmitFormChange();
  }

  CurrencyOptions(): { value: string; label: string }[] {
    const fromDestinations = this.PayoutDestinations()
      .filter((destination) => destination.chain === this.network())
      .map((destination) => ({
        value: destination.asset,
        label: destination.asset.toUpperCase(),
      }));
    if (fromDestinations.length > 0) return fromDestinations;
    return CurrencyOptionsForNetwork(this.network());
  }

  NetworkOptions(): { value: string; label: string }[] {
    const dests = this.PayoutDestinations();
    if (
      dests.length <= 1 &&
      this.configService.OrchestraSources().length === 0
    ) {
      return [...WALLET_NETWORKS];
    }
    const seen = new Set<string>();
    const options: { value: string; label: string }[] = [];
    for (const dest of dests) {
      if (seen.has(dest.chain)) continue;
      seen.add(dest.chain);
      options.push({
        value: dest.chain,
        label:
          WALLET_NETWORKS.find((option) => option.value === dest.chain)
            ?.label ?? dest.chain.charAt(0).toUpperCase() + dest.chain.slice(1),
      });
    }
    return options;
  }

  OnCurrencyChange(value: string): void {
    this.currency.set(value.toLowerCase());
    this.EmitFormChange();
  }

  ValidateWalletAddress(): void {
    const address = this.walletAddress();

    if (!address) {
      this.walletAddressError.set('Please enter a wallet address');
      this.validationStatus.set('none');
      return;
    }

    const error = GetWalletAddressError(address, this.network());
    this.walletAddressError.set(error);

    if (error) {
      this.validationStatus.set('invalid');
    } else if (ValidateWalletAddress(address, this.network())) {
      this.validationStatus.set('valid');
    } else {
      this.validationStatus.set('none');
    }
  }

  ValidateAll(): boolean {
    this.ValidateWalletAddress();
    return !this.walletAddressError() && !!this.walletAddress();
  }

  IsValid(): boolean {
    return !!this.walletAddress() && !this.walletAddressError();
  }

  GetFormData(): ExternalWalletFormData {
    return {
      walletAddress: this.walletAddress(),
      network: this.network().toLowerCase(),
      currency: this.currency().toLowerCase(),
    };
  }

  FillTestData(): void {
    this.network.set(SOLANA_NETWORK);
    this.currency.set(SOLANA_CURRENCY);
    this.walletAddress.set(TEST_WALLET_DATA.walletAddress);
    this.ValidateWalletAddress();
    this.EmitFormChange();
  }

  ToggleWalletGuide(): void {
    this.showWalletGuide.set(!this.showWalletGuide());
  }

  IsSolanaNetwork(): boolean {
    return this.network() === SOLANA_NETWORK;
  }

  NetworkLabel(): string {
    return (
      this.NetworkOptions().find((option) => option.value === this.network())
        ?.label ?? 'Solana'
    );
  }

  CurrencyLabel(): string {
    return this.currency().toUpperCase();
  }

  AddressFieldTitle(): string {
    return `${this.NetworkLabel()} wallet address`;
  }

  AddressHelpText(): string {
    return `Make sure this address supports ${this.CurrencyLabel()} on the ${this.NetworkLabel()} network.`;
  }

  AddressPlaceholder(): string {
    if (this.IsSolanaNetwork()) {
      return 'e.g., 7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU';
    }
    if (this.network() === 'tron') {
      return 'e.g., TXYZopYRdj2D9XRtbG411XZZ3kM5VkCeP';
    }
    return 'e.g., 0x742d35Cc6634C0532925a3b844Bc454e4438f44e';
  }

  private EmitFormChange(): void {
    this.formChange.emit(this.GetFormData());
    this.validationChange.emit(this.IsValid());
  }

  private PayoutDestinations(): {
    chain: string;
    asset: string;
    label: string;
  }[] {
    const destinations = [
      { chain: 'solana', asset: 'usdc', label: 'USDC on Solana' },
      ...this.configService.OrchestraSources(),
    ];
    const seen = new Set<string>();
    const unique: { chain: string; asset: string; label: string }[] = [];
    for (const destination of destinations) {
      const key = `${destination.chain}:${destination.asset}`;
      if (seen.has(key)) continue;
      seen.add(key);
      unique.push(destination);
    }
    return unique;
  }
}
