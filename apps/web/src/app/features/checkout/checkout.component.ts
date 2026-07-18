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
import { LoaderComponent, PageLoaderComponent } from '../../shared';
import {
  CheckoutSession,
  CheckoutSessionLineItem,
  Price,
  Product,
} from '@zoneless/shared-types';

type PaymentPhase = 'idle' | 'awaiting_wallet' | 'processing' | 'complete';

@Component({
  selector: 'app-checkout',
  imports: [FormsModule, PageLoaderComponent, LoaderComponent],
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
  paymentPhase: WritableSignal<PaymentPhase> = signal('idle');
  paymentError: WritableSignal<string | null> = signal(null);

  email = '';

  async ngOnInit(): Promise<void> {
    const urlSlug = this.route.snapshot.paramMap.get('checkoutSessionId');
    if (!urlSlug) return;
    await this.LoadCheckoutSession(urlSlug);
  }

  private async LoadCheckoutSession(urlSlug: string): Promise<void> {
    this.loading.set(true);
    try {
      const checkoutSession =
        await this.checkoutSessionService.GetPublicCheckoutSession(urlSlug);
      this.checkoutSession.set(checkoutSession);
      this.email =
        checkoutSession.customer_email ??
        checkoutSession.customer_details?.email ??
        '';
      this.metaService.SetMetaTitle(`${this.MerchantName()} - Checkout`);
    } finally {
      this.loading.set(false);
    }
  }

  LineItems(): CheckoutSessionLineItem[] {
    return this.checkoutSession()?.line_items?.data ?? [];
  }

  MerchantName(): string {
    return this.checkoutSession()?.merchant?.display_name || 'Merchant';
  }

  MerchantIconUrl(): string | null {
    return this.checkoutSession()?.merchant?.icon_url ?? null;
  }

  MerchantTermsUrl(): string | null {
    return this.checkoutSession()?.merchant?.terms_url ?? null;
  }

  MerchantPrivacyUrl(): string | null {
    return this.checkoutSession()?.merchant?.privacy_url ?? null;
  }

  MerchantWalletAddress(): string {
    return this.checkoutSession()?.merchant_wallet?.wallet_address ?? '';
  }

  IsSubscription(): boolean {
    return this.checkoutSession()?.mode === 'subscription';
  }

  RecurringIntervalLabel(): string | null {
    const price = this.PrimaryPrice();
    const interval = price?.recurring?.interval;
    if (!interval) return null;
    const count = price?.recurring?.interval_count ?? 1;
    if (count === 1) return interval;
    return `${count} ${interval}s`;
  }

  PrimaryPrice(): Price | null {
    const price = this.LineItems()[0]?.price;
    if (!price || typeof price === 'string') return null;
    return price;
  }

  LineItemCadence(item: CheckoutSessionLineItem): string | null {
    const price = item.price;
    if (!price || typeof price === 'string' || !price.recurring) return null;
    const count = price.recurring.interval_count ?? 1;
    const interval = price.recurring.interval;
    if (count === 1) return `every ${interval}`;
    return `every ${count} ${interval}s`;
  }

  IsBusy(): boolean {
    const phase = this.paymentPhase();
    return phase === 'awaiting_wallet' || phase === 'processing';
  }

  IsComplete(): boolean {
    return this.paymentPhase() === 'complete';
  }

  async Pay(): Promise<void> {
    const session = this.checkoutSession();
    if (!session || this.paymentPhase() !== 'idle') return;

    this.paymentPhase.set('awaiting_wallet');
    this.paymentError.set(null);

    try {
      if (!this.solanaWalletService.GetAddress()) {
        await this.solanaWalletService.Connect();
      }
      const payerWallet = this.solanaWalletService.GetAddress();
      if (!payerWallet) {
        throw new Error('Connect a wallet to pay');
      }

      const completedSession = this.IsSubscription()
        ? await this.PaySubscription(session, payerWallet)
        : await this.PayOneTime(session, payerWallet);

      this.checkoutSession.set(completedSession);
      this.paymentPhase.set('complete');
      this.RedirectToSuccessUrl(completedSession);
    } catch (error) {
      this.paymentError.set(this.ErrorMessage(error));
      this.paymentPhase.set('idle');
    }
  }

  private async PayOneTime(
    session: CheckoutSession,
    payerWallet: string
  ): Promise<CheckoutSession> {
    const prepared = await this.checkoutSessionService.PreparePayment(
      session.url_slug,
      payerWallet,
      this.email || undefined
    );
    const chain = session.livemode ? 'solana:mainnet' : 'solana:devnet';
    const signatureBytes =
      await this.solanaWalletService.SignAndSendUnsignedTransaction(
        prepared.unsigned_transaction,
        chain
      );
    this.paymentPhase.set('processing');
    return this.checkoutSessionService.ConfirmPayment(session.url_slug, {
      signature: bs58.encode(signatureBytes),
    });
  }

  private async PaySubscription(
    session: CheckoutSession,
    payerWallet: string
  ): Promise<CheckoutSession> {
    const chain = session.livemode ? 'solana:mainnet' : 'solana:devnet';

    // One automatic retry if the blockhash expired while Phantom was open.
    let lastError: unknown;
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        this.paymentPhase.set('awaiting_wallet');
        const prepared = await this.checkoutSessionService.PreparePayment(
          session.url_slug,
          payerWallet,
          this.email || undefined
        );

        if (prepared.already_subscribed) {
          this.paymentPhase.set('processing');
          return this.checkoutSessionService.ConfirmPayment(session.url_slug, {
            already_subscribed: true,
            subscription_delegation_pda: prepared.subscription_delegation_pda,
          });
        }

        const signedTxBytes =
          await this.solanaWalletService.SignUnsignedTransaction(
            prepared.unsigned_transaction,
            chain
          );
        this.paymentPhase.set('processing');
        return await this.checkoutSessionService.ConfirmPayment(
          session.url_slug,
          {
            signed_transaction:
              this.solanaWalletService.BytesToBase64(signedTxBytes),
          }
        );
      } catch (error) {
        lastError = error;
        if (
          attempt === 0 &&
          this.IsRetryableSubscribeBroadcastError(error)
        ) {
          continue;
        }
        throw error;
      }
    }
    throw lastError;
  }

  private IsRetryableSubscribeBroadcastError(error: unknown): boolean {
    const message =
      error instanceof Error
        ? error.message
        : typeof error === 'string'
        ? error
        : '';
    return /blockhash not found|expired|already been processed/i.test(message);
  }

  private RedirectToSuccessUrl(session: CheckoutSession): void {
    if (!session.success_url) return;
    const url = session.success_url.replace(
      '{CHECKOUT_SESSION_ID}',
      session.id
    );
    window.setTimeout(() => window.location.assign(url), 1200);
  }

  private ErrorMessage(error: unknown): string {
    if (error instanceof Error && error.message) return error.message;
    return this.IsSubscription()
      ? 'Something went wrong starting your subscription. Please try again.'
      : 'Something went wrong processing your payment. Please try again.';
  }

  LineItemImage(item: CheckoutSessionLineItem): string | null {
    const product = item.price?.product;
    if (product && typeof product === 'object') {
      return (product as Product).images?.[0] ?? null;
    }
    return null;
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
    if (this.IsSubscription()) return 'Subscribe';
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

  BusyLabel(): string {
    return this.paymentPhase() === 'awaiting_wallet'
      ? 'Confirm in wallet'
      : 'Processing';
  }

  SummaryHeading(): string {
    return this.IsSubscription()
      ? `Subscribe to ${this.MerchantName()}`
      : `Pay ${this.MerchantName()}`;
  }

  MethodDetailLabel(): string {
    return this.IsSubscription()
      ? 'Subscribing with USDC on Solana'
      : 'Paying with USDC on Solana to';
  }

  MethodHelpText(): string {
    const amount = this.FormatAmount(this.checkoutSession()?.amount_total);
    if (this.IsSubscription()) {
      const cadence = this.RecurringIntervalLabel();
      return cadence
        ? `Connect your wallet to authorize recurring ${amount} USDC every ${cadence}. Network fees are covered for you.`
        : `Connect your wallet to authorize this recurring USDC subscription. Network fees are covered for you.`;
    }
    return `Connect your wallet and approve the payment of ${amount} in USDC.`;
  }

  FinePrintVerb(): string {
    return this.IsSubscription() ? 'subscribing' : 'paying';
  }

  TotalDueLabel(): string {
    return this.IsSubscription() ? 'Total due today' : 'Total due';
  }
}
