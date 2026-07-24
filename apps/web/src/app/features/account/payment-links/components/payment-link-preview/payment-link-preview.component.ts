import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
} from '@angular/core';
import { ConfigService } from '../../../../../data';
import { DEFAULT_CHECKOUT_CONFIRMATION_MESSAGE } from '../../../../checkout/util/checkout-completion';
import {
  FormatUsdcAmount,
  GetCheckoutSubmitLabel,
} from '../../../../checkout/util/checkout-format';
import {
  PaymentLinkFormPreviewState,
  SelectedLineItem,
} from '../payment-link-form/payment-link-form.component';

@Component({
  selector: 'app-payment-link-preview',
  standalone: true,
  imports: [],
  templateUrl: './payment-link-preview.component.html',
  styleUrl: './payment-link-preview.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PaymentLinkPreviewComponent {
  private readonly configService = inject(ConfigService);

  readonly state = input.required<PaymentLinkFormPreviewState>();
  readonly FormatAmount = FormatUsdcAmount;

  platformName = computed(() => this.configService.GetPlatformName());
  platformLogo = computed(() => this.configService.GetPlatformLogoUrl());
  platformInitials = computed(() => this.configService.GetPlatformInitials());

  ProductName(): string {
    const state = this.state();
    if (state.linkType === 'custom') {
      return state.customTitle.trim() || 'Product name';
    }
    const first = state.lineItems[0];
    if (!first) return 'Product name';
    if (state.lineItems.length === 1) return first.name;
    return `${first.name} +${state.lineItems.length - 1} more`;
  }

  TotalAmount(): number {
    const state = this.state();
    if (state.linkType === 'custom') {
      return state.customPreset;
    }
    return state.lineItems.reduce(
      (sum, item) => sum + item.unitAmount * item.quantity,
      0
    );
  }

  SubmitLabel(): string {
    return GetCheckoutSubmitLabel(this.state().submitType);
  }

  ConfirmationMessage(): string {
    const state = this.state();
    if (state.useCustomConfirmationMessage) {
      return (
        state.customConfirmationMessage.trim() ||
        DEFAULT_CHECKOUT_CONFIRMATION_MESSAGE
      );
    }
    return DEFAULT_CHECKOUT_CONFIRMATION_MESSAGE;
  }

  LineItems(): SelectedLineItem[] {
    const state = this.state();
    if (state.linkType === 'custom') {
      return [
        {
          key: 'custom',
          name: this.ProductName(),
          unitAmount: state.customPreset,
          quantity: 1,
          priceId: 'custom',
        },
      ];
    }
    return state.lineItems;
  }
}
