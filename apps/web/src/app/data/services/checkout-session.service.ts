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
  fee_sponsored?: boolean;
  already_subscribed?: boolean;
  subscription_delegation_pda?: string;
  subscription_step?: 'init_authority' | 'subscribe';
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
    customerDetails?: {
      email?: string;
      name?: string;
      business_name?: string;
      phone?: string;
      address?: {
        line1?: string;
        line2?: string;
        city?: string;
        state?: string;
        postal_code?: string;
        country?: string;
      };
      shipping_address?: {
        name?: string;
        line1?: string;
        line2?: string;
        city?: string;
        state?: string;
        postal_code?: string;
        country?: string;
      };
      tax_id?: string;
      custom_fields?: { key: string; value: string }[];
      terms_of_service_accepted?: boolean;
    }
  ): Promise<CheckoutPaymentTransaction> {
    return this.api.Call<CheckoutPaymentTransaction>(
      'POST',
      `payment_pages/${urlSlug}/prepare`,
      {
        payer_wallet: payerWallet,
        ...customerDetails,
      }
    );
  }

  /**
   * Confirm a checkout transaction. Fee-sponsored flows pass
   * `signed_transaction` for the API to cosign and broadcast; buyer-pays
   * flows pass `signature` after the wallet has already sent the tx.
   */
  async ConfirmPayment(
    urlSlug: string,
    payload: {
      signature?: string;
      signed_transaction?: string;
      already_subscribed?: boolean;
      subscription_delegation_pda?: string;
      subscription_step?: 'init_authority' | 'subscribe';
    }
  ): Promise<CheckoutSession> {
    return this.api.Call<CheckoutSession>(
      'POST',
      `payment_pages/${urlSlug}/confirm`,
      payload
    );
  }
}
