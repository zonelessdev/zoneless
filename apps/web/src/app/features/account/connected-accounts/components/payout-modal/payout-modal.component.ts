import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
} from '@angular/core';
import { ModalComponent } from '../../../../../shared';
import { ConfigService } from '../../../../../data';
import { ConnectedAccountActionsService } from '../../services/connected-account-actions.service';

@Component({
  selector: 'app-payout-modal',
  imports: [ModalComponent],
  templateUrl: './payout-modal.component.html',
  styleUrl: './payout-modal.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PayoutModalComponent {
  readonly actions = inject(ConnectedAccountActionsService);
  private readonly configService = inject(ConfigService);

  readonly isSimulatedSettlement = computed(() =>
    this.configService.IsSimulatedSettlement()
  );

  readonly availableCents = computed(() =>
    this.actions.GetAvailableAmount(this.actions.connectedBalance())
  );

  readonly availableLabel = computed(() =>
    (this.availableCents() / 100).toFixed(2)
  );

  readonly hasBalance = computed(() => this.availableCents() > 0);

  readonly walletLabel = computed(() =>
    this.actions.FormatWalletLabel(this.actions.GetDefaultWallet())
  );

  readonly needsConversionNote = computed(() =>
    this.actions.NeedsPayoutConversionNote(this.actions.GetDefaultWallet())
  );

  readonly connectedSignerAddress = computed(() =>
    this.actions.solanaWalletService.GetAddress()
  );

  readonly connectedSignerLabel = computed(() => {
    const address = this.connectedSignerAddress();
    return address ? `${address.slice(0, 6)}…${address.slice(-6)}` : '';
  });

  readonly confirmLabel = computed(() => {
    const amount = this.actions.ParseAmountCents(this.actions.payoutAmount());
    const dollars = (amount / 100).toFixed(2);
    const name = this.actions.GetDisplayName();
    const wallet = this.walletLabel();
    return `Pay out US$${dollars} from ${name}'s balance to ${wallet}.`;
  });

  OnAmountInput(event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    this.actions.payoutAmount.set(value);
  }

  OnConfirmChange(event: Event): void {
    const checked = (event.target as HTMLInputElement).checked;
    this.actions.payoutConfirmed.set(checked);
  }

  OnSignerMethodChange(method: 'wallet' | 'private_key'): void {
    this.actions.SetPayoutSignerMethod(method);
  }

  OnPrivateKeyInput(event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    this.actions.SetPayoutPrivateKey(value);
  }
}
