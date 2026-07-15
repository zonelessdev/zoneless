import {
  ChangeDetectionStrategy,
  Component,
  Input,
  computed,
  inject,
} from '@angular/core';
import { ConfigService } from '../../../../../data';
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

  @Input({ required: true }) state!: PaymentLinkFormPreviewState;

  platformName = computed(() => this.configService.GetPlatformName());
  platformLogo = computed(() => this.configService.GetPlatformLogoUrl());
  platformInitials = computed(() => this.configService.GetPlatformInitials());

  ProductName(): string {
    if (this.state.linkType === 'custom') {
      return this.state.customTitle.trim() || 'Product name';
    }
    const first = this.state.lineItems[0];
    if (!first) return 'Product name';
    if (this.state.lineItems.length === 1) return first.name;
    return `${first.name} +${this.state.lineItems.length - 1} more`;
  }

  TotalAmount(): number {
    if (this.state.linkType === 'custom') {
      return this.state.customPreset;
    }
    return this.state.lineItems.reduce(
      (sum, item) => sum + item.unitAmount * item.quantity,
      0
    );
  }

  FormatAmount(unitAmount: number): string {
    return `US$${(unitAmount / 100).toFixed(2)}`;
  }

  SubmitLabel(): string {
    switch (this.state.submitType) {
      case 'donate':
        return 'Donate';
      case 'book':
        return 'Book';
      case 'subscribe':
        return 'Subscribe';
      case 'auto':
      case 'pay':
      default:
        return 'Pay';
    }
  }

  ConfirmationMessage(): string {
    if (this.state.useCustomConfirmationMessage) {
      return (
        this.state.customConfirmationMessage.trim() || 'Thanks for your order'
      );
    }
    return 'Thanks for your order';
  }

  LineItems(): SelectedLineItem[] {
    if (this.state.linkType === 'custom') {
      return [
        {
          key: 'custom',
          name: this.ProductName(),
          unitAmount: this.state.customPreset,
          quantity: 1,
          priceId: 'custom',
        },
      ];
    }
    return this.state.lineItems;
  }
}
