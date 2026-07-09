import {
  ChangeDetectionStrategy,
  Component,
  inject,
  OnInit,
  signal,
  WritableSignal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';

import { MetaService } from '../../core';
import { CheckoutSessionService } from '../../data/services/checkout-session.service';
import { PageLoaderComponent } from '../../shared';
import {
  CheckoutSession,
  CheckoutSessionLineItem,
  Product,
} from '@zoneless/shared-types';

/** Placeholder destination wallet until payment methods are wired up. */
const PLACEHOLDER_WALLET_ADDRESS =
  'zNL5sVYqe3Pv9xWmA7kQJcT2hGdRb8XuFnE4yLoZi6DC';

@Component({
  selector: 'app-checkout',
  imports: [FormsModule, PageLoaderComponent],
  templateUrl: './checkout.component.html',
  styleUrl: './checkout.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CheckoutComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly checkoutSessionService = inject(CheckoutSessionService);
  private readonly metaService = inject(MetaService);

  checkoutSession: WritableSignal<CheckoutSession | null> = signal(null);
  loading: WritableSignal<boolean> = signal(true);

  email = '';
  phone = '';
  saveInfo = true;

  readonly walletAddress = PLACEHOLDER_WALLET_ADDRESS;

  async ngOnInit(): Promise<void> {
    const id = this.route.snapshot.paramMap.get('checkoutSessionId');
    if (!id) return;
    await this.LoadCheckoutSession(id);
    this.metaService.SetMetaTitle(`${this.MerchantName()} - Checkout`);
  }

  private async LoadCheckoutSession(id: string): Promise<void> {
    this.loading.set(true);
    try {
      const checkoutSession =
        await this.checkoutSessionService.GetPublicCheckoutSession(id);
      this.checkoutSession.set(checkoutSession);
      this.email =
        checkoutSession.customer_email ??
        checkoutSession.customer_details?.email ??
        '';
    } finally {
      this.loading.set(false);
    }
  }

  LineItems(): CheckoutSessionLineItem[] {
    return this.checkoutSession()?.line_items?.data ?? [];
  }

  MerchantName(): string {
    return this.checkoutSession()?.branding_settings?.display_name || 'Zoneless';
  }

  MerchantIconUrl(): string | null {
    const branding = this.checkoutSession()?.branding_settings;
    return branding?.icon?.url ?? branding?.logo?.url ?? null;
  }

  LineItemImage(item: CheckoutSessionLineItem): string {
    const product = item.price?.product;
    if (product && typeof product === 'object') {
      const image = (product as Product).images?.[0];
      if (image) return image;
    }
    return '/assets/images/logos/usdc.svg';
  }

  FormatAmount(cents: number | null | undefined): string {
    return `US$${((cents ?? 0) / 100).toFixed(2)}`;
  }

  DiscountAmount(): number {
    return this.checkoutSession()?.total_details?.amount_discount ?? 0;
  }

  DiscountLabel(): string {
    const discounts =
      this.checkoutSession()?.total_details?.breakdown?.discounts ?? [];
    const discount = discounts[0]?.discount;
    return discount?.promotion_code ?? discount?.source?.coupon ?? 'Discount';
  }

  DiscountPercent(): number | null {
    const subtotal = this.checkoutSession()?.amount_subtotal ?? 0;
    const discount = this.DiscountAmount();
    if (subtotal <= 0 || discount <= 0) return null;
    return Math.round((discount / subtotal) * 100);
  }

  SubmitLabel(): string {
    switch (this.checkoutSession()?.submit_type) {
      case 'book':
        return 'Book';
      case 'donate':
        return 'Donate';
      case 'subscribe':
        return 'Subscribe';
      default:
        return 'Pay';
    }
  }
}
