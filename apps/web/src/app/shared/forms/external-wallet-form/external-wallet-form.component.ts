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
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ExternalWallet } from '@zoneless/shared-types';

import {
  ValidateSolanaAddress,
  GetSolanaAddressError,
  SOLANA_NETWORK,
  SOLANA_CURRENCY,
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
  imports: [FormsModule],
  templateUrl: './external-wallet-form.component.html',
  styleUrls: ['./external-wallet-form.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ExternalWalletFormComponent implements OnInit, OnChanges {
  @Input() mode: ExternalWalletFormMode = 'onboard';
  @Input() wallet: ExternalWallet | null = null;
  @Input() showErrors = false;
  @Input() isOpen = false;

  @Output() formChange = new EventEmitter<ExternalWalletFormData>();
  @Output() validationChange = new EventEmitter<boolean>();

  walletAddress: WritableSignal<string> = signal('');
  walletAddressError: WritableSignal<string> = signal('');
  validationStatus: WritableSignal<'none' | 'valid' | 'invalid'> =
    signal('none');
  showWalletGuide: WritableSignal<boolean> = signal(false);

  readonly network = SOLANA_NETWORK;
  readonly currency = SOLANA_CURRENCY;

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
    } else {
      this.walletAddress.set('');
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

  ValidateWalletAddress(): void {
    const address = this.walletAddress();

    if (!address) {
      this.walletAddressError.set('Please enter a wallet address');
      this.validationStatus.set('none');
      return;
    }

    const error = GetSolanaAddressError(address);
    this.walletAddressError.set(error);

    if (error) {
      this.validationStatus.set('invalid');
    } else if (ValidateSolanaAddress(address)) {
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
      network: this.network,
      currency: this.currency,
    };
  }

  ToggleWalletGuide(): void {
    this.showWalletGuide.set(!this.showWalletGuide());
  }

  private EmitFormChange(): void {
    this.formChange.emit(this.GetFormData());
    this.validationChange.emit(this.IsValid());
  }
}
