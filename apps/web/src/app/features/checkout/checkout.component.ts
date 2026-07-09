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
import bs58 from 'bs58';

import { MetaService, SolanaWalletService } from '../../core';
import { CheckoutSessionService } from '../../data/services/checkout-session.service';
import { PageLoaderComponent } from '../../shared';
import {
  CheckoutSession,
  CheckoutSessionLineItem,
  Product,
} from '@zoneless/shared-types';

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
  private readonly solanaWalletService = inject(SolanaWalletService);

  checkoutSession: WritableSignal<CheckoutSession | null> = signal(null);
  loading: WritableSignal<boolean> = signal(true);
  paying: WritableSignal<boolean> = signal(false);
  paymentError: WritableSignal<string | null> = signal(null);
  paymentComplete: WritableSignal<boolean> = signal(false);

  email = '';

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
    return (
      this.checkoutSession()?.branding_settings?.display_name || 'Zoneless'
    );
  }

  MerchantIconUrl(): string | null {
    const branding = this.checkoutSession()?.branding_settings;
    return branding?.icon?.url ?? branding?.logo?.url ?? null;
  }

  MerchantWalletAddress(): string {
    return this.checkoutSession()?.merchant_wallet?.wallet_address ?? '';
  }

  ConnectedWalletAddress(): string {
    return this.solanaWalletService.GetAddress();
  }

  ConnectedWalletLabel(): string {
    const address = this.ConnectedWalletAddress();
    if (!address) return 'Phantom';
    return `${address.slice(0, 4)}…${address.slice(-4)}`;
  }

  async ConnectWallet(): Promise<void> {
    this.paymentError.set(null);
    try {
      await this.solanaWalletService.Connect();
    } catch (error) {
      this.paymentError.set(this.ErrorMessage(error));
    }
  }

  async Pay(): Promise<void> {
    const session = this.checkoutSession();
    if (!session || this.paying() || this.paymentComplete()) return;

    this.paying.set(true);
    this.paymentError.set(null);

    try {
      if (!this.ConnectedWalletAddress()) {
        await this.solanaWalletService.Connect();
      }
      const payerWallet = this.ConnectedWalletAddress();
      if (!payerWallet) {
        throw new Error('Connect a wallet to pay');
      }

      const prepared = await this.checkoutSessionService.PreparePayment(
        session.id,
        payerWallet,
        this.email || undefined
      );

      const signatureBytes =
        await this.solanaWalletService.SignAndSendUnsignedTransaction(
          prepared.unsigned_transaction,
          session.livemode ? 'solana:mainnet' : 'solana:devnet'
        );
      const signature = bs58.encode(signatureBytes);

      const completedSession = await this.checkoutSessionService.ConfirmPayment(
        session.id,
        signature
      );

      this.checkoutSession.set(completedSession);
      this.paymentComplete.set(true);
      this.RedirectToSuccessUrl(completedSession);
    } catch (error) {
      this.paymentError.set(this.ErrorMessage(error));
    } finally {
      this.paying.set(false);
    }
  }

  private RedirectToSuccessUrl(session: CheckoutSession): void {
    if (!session.success_url) return;
    const url = session.success_url.replace(
      '{CHECKOUT_SESSION_ID}',
      session.id
    );
    window.location.assign(url);
  }

  private ErrorMessage(error: unknown): string {
    if (error instanceof Error && error.message) return error.message;
    return 'Something went wrong processing your payment. Please try again.';
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
    if (this.paying()) return 'Processing…';
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
