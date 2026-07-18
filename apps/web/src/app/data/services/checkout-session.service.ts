import { Injectable, inject, signal, WritableSignal } from '@angular/core';
import { ApiService } from '../../core';
import { CheckoutSession } from '@zoneless/shared-types';
import {
  CreateCheckoutSessionInput,
  UpdateCheckoutSessionInput,
} from '@zoneless/shared-schemas';

/** Unsigned payment transaction returned by the public prepare endpoint. */
export interface CheckoutPaymentTransaction {
  object: 'checkout.payment_transaction';
  checkout_session: string;
  amount_total: number;
  currency: string | null;
  merchant_wallet_address: string;
  unsigned_transaction: string;
  estimated_fee_lamports: number;
  blockhash: string;
  last_valid_block_height: number;
  already_subscribed?: boolean;
  subscription_delegation_pda?: string;
}

@Injectable({
  providedIn: 'root',
})
export class CheckoutSessionService {
  private readonly api = inject(ApiService);

  loading: WritableSignal<boolean> = signal(false);

  async CreateCheckoutSession(
    data: CreateCheckoutSessionInput
  ): Promise<CheckoutSession> {
    this.loading.set(true);
    try {
      const checkoutSession = await this.api.Call<CheckoutSession>(
        'POST',
        `checkout/sessions`,
        data
      );
      return checkoutSession;
    } finally {
      this.loading.set(false);
    }
  }

  async UpdateCheckoutSession(
    checkoutSessionId: string,
    data: UpdateCheckoutSessionInput
  ): Promise<CheckoutSession> {
    this.loading.set(true);
    try {
      const checkoutSession = await this.api.Call<CheckoutSession>(
        'POST',
        `checkout/sessions/${checkoutSessionId}`,
        data
      );
      return checkoutSession;
    } finally {
      this.loading.set(false);
    }
  }

  async DeleteCheckoutSession(checkoutSessionId: string): Promise<void> {
    this.loading.set(true);
    try {
      await this.api.Call<void>(
        'DELETE',
        `checkout/sessions/${checkoutSessionId}`
      );
    } finally {
      this.loading.set(false);
    }
  }

  async GetCheckoutSession(
    checkoutSessionId: string
  ): Promise<CheckoutSession> {
    this.loading.set(true);
    try {
      const checkoutSession = await this.api.Call<CheckoutSession>(
        'GET',
        `checkout/sessions/${checkoutSessionId}`
      );
      return checkoutSession;
    } finally {
      this.loading.set(false);
    }
  }

  /**
   * Open a payment link via the public payment pages endpoint.
   * `urlSlug` is the opaque slug from `/b/{url_slug}`.
   */
  async OpenPaymentLink(urlSlug: string): Promise<CheckoutSession> {
    this.loading.set(true);
    try {
      return await this.api.Call<CheckoutSession>(
        'POST',
        `payment_pages/from_payment_link/${urlSlug}`
      );
    } finally {
      this.loading.set(false);
    }
  }

  /**
   * Fetch a checkout session via the public payment pages endpoint.
   * `urlSlug` is the opaque slug from `/c/{url_slug}`.
   */
  async GetPublicCheckoutSession(urlSlug: string): Promise<CheckoutSession> {
    this.loading.set(true);
    try {
      const checkoutSession = await this.api.Call<CheckoutSession>(
        'GET',
        `payment_pages/${urlSlug}`
      );
      return checkoutSession;
    } finally {
      this.loading.set(false);
    }
  }

  /**
   * Build an unsigned USDC payment transaction for a checkout session via
   * the public payment pages endpoint. The customer signs it in their wallet.
   */
  async PreparePayment(
    urlSlug: string,
    payerWallet: string,
    email?: string
  ): Promise<CheckoutPaymentTransaction> {
    return this.api.Call<CheckoutPaymentTransaction>(
      'POST',
      `payment_pages/${urlSlug}/prepare`,
      { payer_wallet: payerWallet, ...(email ? { email } : {}) }
    );
  }

  /**
   * Confirm a checkout transaction. One-time payments pass `signature`
   * after the wallet broadcasts. Subscriptions pass `signed_transaction`
   * for the API to broadcast (fee-payer sponsored).
   */
  async ConfirmPayment(
    urlSlug: string,
    payload: {
      signature?: string;
      signed_transaction?: string;
      already_subscribed?: boolean;
      subscription_delegation_pda?: string;
    }
  ): Promise<CheckoutSession> {
    return this.api.Call<CheckoutSession>(
      'POST',
      `payment_pages/${urlSlug}/confirm`,
      payload
    );
  }
}
