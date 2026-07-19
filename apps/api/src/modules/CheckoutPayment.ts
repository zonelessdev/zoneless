/**
 * @fileOverview Methods for the public hosted checkout payment flow:
 * bootstrapping the payment page, preparing the unsigned USDC payment
 * or subscribe transaction, and confirming/completing on-chain.
 *
 * @module CheckoutPayment
 */

import { ClientSession } from 'mongoose';
import { Database } from './Database';
import { AccountModule } from './Account';
import { CheckoutSessionModule } from './CheckoutSession';
import { ExternalWalletModule } from './ExternalWallet';
import { BalanceModule } from './Balance';
import { BalanceTransactionModule } from './BalanceTransaction';
import { ProductModule } from './Product';
import type { CustomerModule } from './Customer';
import type { SubscriptionModule } from './Subscription';
import type { PaymentIntentModule } from './PaymentIntent';
import type { ChargeModule } from './Charge';
import type { PaymentLinkModule } from './PaymentLink';
import { Solana, SolanaExplorerUrl } from './chains/Solana';
import { IsCheckoutFeeSponsored } from './AppConfig';
import { AppError } from '../utils/AppError';
import { ERRORS } from '../utils/Errors';
import { Logger } from '../utils/Logger';
import { Now } from '../utils/Timestamp';
import {
  Account,
  BalanceTransaction,
  Charge,
  CheckoutSession,
  ExternalWallet,
  Price,
  Product,
} from '@zoneless/shared-types';

/** Unsigned payment / subscribe transaction bundle returned by PreparePayment. */
export interface PreparedCheckoutPayment {
  object: 'checkout.payment_transaction';
  checkout_session: string;
  amount_total: number;
  currency: string | null;
  merchant_wallet_address: string;
  unsigned_transaction: string;
  estimated_fee_lamports: number;
  blockhash: string;
  last_valid_block_height: number;
  /**
   * True when TRANSACTION_FEE_PAYER_KEY is set and the API will cosign/broadcast.
   */
  fee_sponsored?: boolean;
  /**
   * True when the wallet is already subscribed on-chain (e.g. a prior attempt
   * landed but checkout confirm failed). Frontend should confirm without signing.
   */
  already_subscribed?: boolean;
  subscription_delegation_pda?: string;
  /**
   * Subscription checkout is two on-chain steps for first-time wallets:
   * `init_authority` (create SubscriptionAuthority) then `subscribe`.
   * Omitted for one-time payments.
   */
  subscription_step?: 'init_authority' | 'subscribe';
}

export class CheckoutPaymentModule {
  private readonly db: Database;
  private readonly accountModule: AccountModule;
  private readonly checkoutSessionModule: CheckoutSessionModule;
  private readonly externalWalletModule: ExternalWalletModule;
  private readonly productModule: ProductModule;
  private readonly balanceModule: BalanceModule;
  private readonly balanceTransactionModule: BalanceTransactionModule;
  private readonly paymentIntentModule: PaymentIntentModule | null;
  private readonly chargeModule: ChargeModule | null;
  private readonly paymentLinkModule: PaymentLinkModule | null;
  private readonly customerModule: CustomerModule | null;
  private readonly subscriptionModule: SubscriptionModule | null;
  private readonly solana: Solana;

  constructor(
    db: Database,
    checkoutSessionModule: CheckoutSessionModule,
    externalWalletModule: ExternalWalletModule,
    productModule: ProductModule,
    paymentIntentModule?: PaymentIntentModule,
    chargeModule?: ChargeModule,
    paymentLinkModule?: PaymentLinkModule,
    solana?: Solana,
    customerModule?: CustomerModule,
    subscriptionModule?: SubscriptionModule
  ) {
    this.db = db;
    this.accountModule = new AccountModule(db);
    this.checkoutSessionModule = checkoutSessionModule;
    this.externalWalletModule = externalWalletModule;
    this.productModule = productModule;
    this.balanceModule = new BalanceModule(db);
    this.balanceTransactionModule = new BalanceTransactionModule(db);
    this.paymentIntentModule = paymentIntentModule || null;
    this.chargeModule = chargeModule || null;
    this.paymentLinkModule = paymentLinkModule || null;
    this.customerModule = customerModule || null;
    this.subscriptionModule = subscriptionModule || null;
    this.solana = solana || new Solana();
  }

  /**
   * Bootstrap the hosted checkout page: the sanitized session enriched with
   * the merchant's receiving wallet, display details, and expanded products.
   */
  async GetPaymentPageSession(urlSlug: string): Promise<CheckoutSession> {
    const session = await this.GetSessionOrThrow(urlSlug);
    const [merchantWallet, account, expandedSession] = await Promise.all([
      this.ResolveMerchantWallet(session.platform_account),
      this.accountModule.GetAccount(session.platform_account),
      this.ExpandLineItemProducts(session),
    ]);

    return {
      ...this.SanitizeCheckoutSession(expandedSession),
      merchant_wallet: {
        wallet_address: merchantWallet.wallet_address,
        network: merchantWallet.network,
        currency: merchantWallet.currency,
        usdc_mint: this.solana.GetUSDCMintAddress(),
      },
      merchant: this.ResolveMerchant(session, account),
    };
  }

  private async ExpandLineItemProducts(
    session: CheckoutSession
  ): Promise<CheckoutSession> {
    const lineItems = session.line_items?.data ?? [];
    const productIds = [
      ...new Set(
        lineItems
          .map((item) => item.price?.product)
          .filter((product): product is string => typeof product === 'string')
      ),
    ];

    if (productIds.length === 0) return session;

    const products = await this.productModule.BatchGet(
      productIds,
      session.platform_account
    );

    return {
      ...session,
      line_items: session.line_items
        ? {
            ...session.line_items,
            data: lineItems.map((item) => {
              const price = item.price as Price | null;
              if (!price || typeof price.product !== 'string') return item;

              const product = products.get(price.product);
              if (!product) return item;

              return {
                ...item,
                price: {
                  ...price,
                  product: product as Product,
                },
              };
            }),
          }
        : null,
    };
  }

  private ResolveMerchant(
    session: CheckoutSession,
    account: Account | null
  ): NonNullable<CheckoutSession['merchant']> {
    const brandingName = session.branding_settings?.display_name?.trim();
    const displayName =
      brandingName ||
      account?.business_profile?.name?.trim() ||
      account?.settings?.dashboard?.display_name?.trim() ||
      'Merchant';

    const brandingIcon =
      session.branding_settings?.icon?.url ??
      session.branding_settings?.logo?.url ??
      null;

    return {
      display_name: displayName,
      terms_url: account?.settings?.terms_url ?? null,
      privacy_url: account?.settings?.privacy_url ?? null,
      icon_url:
        brandingIcon ||
        account?.settings?.branding?.icon ||
        account?.settings?.branding?.logo ||
        null,
    };
  }

  /**
   * Build an unsigned transaction for the checkout session. One-time sessions
   * get a USDC transfer; subscription sessions get either an
   * `initSubscriptionAuthority` tx (first-time wallet) or a `subscribe` tx.
   */
  async PreparePayment(
    urlSlug: string,
    payerWallet: string | undefined,
    email?: string
  ): Promise<PreparedCheckoutPayment> {
    if (!payerWallet || typeof payerWallet !== 'string') {
      throw new AppError(
        'payer_wallet is required',
        ERRORS.VALIDATION_ERROR.status,
        ERRORS.VALIDATION_ERROR.type
      );
    }

    const session = await this.GetSessionOrThrow(urlSlug);
    this.AssertSessionPayable(session);

    const merchantWallet = await this.ResolveMerchantWallet(
      session.platform_account
    );

    if (email && typeof email === 'string') {
      await this.checkoutSessionModule.SetCustomerEmail(session.id, email);
    }

    Logger.info('Preparing checkout transaction', {
      checkoutSessionId: session.id,
      mode: session.mode,
      amountTotal: session.amount_total,
    });

    const feeSponsored = IsCheckoutFeeSponsored();
    const prepared =
      session.mode === 'subscription'
        ? await this.PrepareSubscribeTransaction(
            session,
            payerWallet,
            feeSponsored
          )
        : await this.solana.BuildCheckoutPaymentTransaction(
            payerWallet,
            merchantWallet.wallet_address,
            session.amount_total!,
            session.id,
            { feeSponsored }
          );

    await this.MarkPaymentIntentRequiresConfirmation(session, payerWallet);

    return {
      object: 'checkout.payment_transaction',
      checkout_session: session.id,
      amount_total: session.amount_total!,
      currency: session.currency,
      merchant_wallet_address: merchantWallet.wallet_address,
      ...prepared,
      fee_sponsored: feeSponsored,
    };
  }

  private async PrepareSubscribeTransaction(
    session: CheckoutSession,
    payerWallet: string,
    feeSponsored: boolean
  ): Promise<
    Omit<
      PreparedCheckoutPayment,
      | 'object'
      | 'checkout_session'
      | 'amount_total'
      | 'currency'
      | 'merchant_wallet_address'
      | 'fee_sponsored'
    >
  > {
    const price = this.RequireRecurringCheckoutPrice(session);
    if (!price.subscription_plan_pda) {
      throw new AppError(
        'This subscription price has no on-chain plan. Recreate the price and try again.',
        ERRORS.INVALID_REQUEST.status,
        ERRORS.INVALID_REQUEST.type
      );
    }

    const existingPda = await this.solana.FindExistingSubscriptionDelegation(
      price.subscription_plan_pda,
      payerWallet
    );
    if (existingPda) {
      // Prior attempt likely landed on-chain while confirm failed (stale blockhash).
      return {
        unsigned_transaction: '',
        estimated_fee_lamports: 0,
        blockhash: '',
        last_valid_block_height: 0,
        already_subscribed: true,
        subscription_delegation_pda: existingPda,
      };
    }

    const initTx = await this.solana.BuildInitSubscriptionAuthorityTransaction(
      payerWallet,
      { feeSponsored }
    );
    if (initTx) {
      return {
        ...initTx,
        subscription_step: 'init_authority',
      };
    }

    return {
      ...(await this.solana.BuildSubscribeTransaction(
        payerWallet,
        price.id,
        price.subscription_plan_pda,
        { feeSponsored }
      )),
      subscription_step: 'subscribe',
    };
  }

  /**
   * Verify a broadcast transaction on-chain and complete the checkout
   * session. For payment mode this verifies a USDC transfer; for
   * subscription mode it verifies the subscribe PDA, creates the off-chain
   * Subscription, and collects the first period (unless trialing).
   *
   * Fee-sponsored confirms may pass `signed_transaction` instead of
   * `signature`: the API cosigns with TRANSACTION_FEE_PAYER_KEY and broadcasts.
   *
   * For subscription first-time wallets, pass `subscription_step: 'init_authority'`
   * after the init tx; the session stays open so the client can prepare subscribe.
   */
  async ConfirmPayment(
    urlSlug: string,
    signature: string | undefined,
    options?: {
      signed_transaction?: string;
      already_subscribed?: boolean;
      subscription_delegation_pda?: string;
      subscription_step?: 'init_authority' | 'subscribe';
    }
  ): Promise<CheckoutSession> {
    const session = await this.GetSessionOrThrow(urlSlug);

    // Idempotency: already completed (duplicate / overlapping confirms).
    if (session.status === 'complete') {
      if (
        session.mode === 'payment' &&
        session.amount_total &&
        signature &&
        session.payment_details?.transaction_signature === signature
      ) {
        await this.RecordPaymentOnLedger(
          session,
          session.amount_total,
          session.payment_details.payer_wallet,
          signature
        );
      }
      return this.SanitizeCheckoutSession(session);
    }

    this.AssertSessionPayable(session);

    if (session.mode === 'subscription' && options?.already_subscribed) {
      return this.ConfirmSubscriptionFromExistingOnChain(
        session,
        options.subscription_delegation_pda
      );
    }

    let resolvedSignature = signature;
    if (
      options?.signed_transaction &&
      typeof options.signed_transaction === 'string'
    ) {
      try {
        const broadcast =
          await this.solana.CosignAndBroadcastCheckoutTransaction(
            options.signed_transaction
          );
        resolvedSignature = broadcast.signature;
      } catch (error) {
        throw new AppError(
          error instanceof Error
            ? error.message
            : 'Failed to broadcast checkout transaction',
          ERRORS.INVALID_REQUEST.status,
          ERRORS.INVALID_REQUEST.type
        );
      }
    }

    if (!resolvedSignature || typeof resolvedSignature !== 'string') {
      throw new AppError(
        'signature is required',
        ERRORS.VALIDATION_ERROR.status,
        ERRORS.VALIDATION_ERROR.type
      );
    }

    if (
      session.mode === 'subscription' &&
      options?.subscription_step === 'init_authority'
    ) {
      return this.ConfirmSubscriptionAuthorityInit(session, resolvedSignature);
    }

    const existingSession =
      await this.checkoutSessionModule.GetCheckoutSessionByTransactionSignature(
        resolvedSignature
      );
    if (existingSession) {
      throw new AppError(
        'This transaction has already been used for another Checkout Session',
        ERRORS.INVALID_REQUEST.status,
        ERRORS.INVALID_REQUEST.type
      );
    }

    if (session.mode === 'subscription') {
      return this.ConfirmSubscription(session, resolvedSignature);
    }

    return this.ConfirmOneTimePayment(session, resolvedSignature);
  }

  /**
   * Land the SubscriptionAuthority init tx without completing checkout.
   * Client must prepare+confirm subscribe next.
   */
  private async ConfirmSubscriptionAuthorityInit(
    session: CheckoutSession,
    signature: string
  ): Promise<CheckoutSession> {
    const subscriberWallet = await this.ResolvePreparedSubscriberWallet(
      session
    );

    Logger.info('Confirming subscription authority init', {
      checkoutSessionId: session.id,
      signature,
      subscriberWallet,
    });

    try {
      await this.solana.WaitForSubscriptionAuthority(subscriberWallet);
    } catch (error) {
      throw new AppError(
        error instanceof Error
          ? error.message
          : 'Subscription authority init did not confirm on-chain',
        ERRORS.INVALID_REQUEST.status,
        ERRORS.INVALID_REQUEST.type
      );
    }

    return this.SanitizeCheckoutSession(session);
  }

  private async ConfirmOneTimePayment(
    session: CheckoutSession,
    signature: string
  ): Promise<CheckoutSession> {
    const merchantWallet = await this.ResolveMerchantWallet(
      session.platform_account
    );

    Logger.info('Verifying checkout payment transaction', {
      checkoutSessionId: session.id,
      signature,
    });

    await this.MarkPaymentIntentProcessing(session);

    const verification = await this.solana.VerifyCheckoutPayment(signature, {
      merchantWalletAddress: merchantWallet.wallet_address,
      amountInCents: session.amount_total!,
      checkoutSessionId: session.id,
    });

    if (!verification.verified) {
      const failureMessage =
        verification.failure_reason || 'Payment verification failed';
      const failedCharge = await this.CreateCheckoutCharge(session, {
        amount: session.amount_total!,
        signature,
        payerAddress: verification.payer_address,
        outcome: 'failed',
        failureMessage,
      });
      await this.MarkPaymentIntentFailed(
        session,
        failureMessage,
        failedCharge?.id ?? null
      );
      throw new AppError(
        failureMessage,
        ERRORS.INVALID_REQUEST.status,
        ERRORS.INVALID_REQUEST.type
      );
    }

    // Stripe order: charge.succeeded → payment_intent.succeeded →
    // checkout.session.completed.
    const charge = await this.CreateCheckoutCharge(session, {
      amount: verification.amount_cents,
      signature,
      payerAddress: verification.payer_address,
      outcome: 'succeeded',
    });

    await this.MarkPaymentIntentSucceeded(session, {
      amountReceived: verification.amount_cents,
      latestCharge: charge?.id ?? null,
    });

    const completedSession =
      await this.checkoutSessionModule.CompleteCheckoutSession(session.id, {
        transaction_signature: signature,
        payer_wallet: verification.payer_address,
      });

    if (completedSession.payment_link && this.paymentLinkModule) {
      await this.paymentLinkModule.RecordCompletedSession(
        completedSession.payment_link
      );
    }

    const balanceTransaction = await this.RecordPaymentOnLedger(
      completedSession,
      verification.amount_cents,
      verification.payer_address,
      signature
    );

    if (charge && this.chargeModule) {
      await this.chargeModule.AttachBalanceTransaction(
        charge.id,
        balanceTransaction.id
      );
    }

    Logger.info('Checkout session completed via payment', {
      checkoutSessionId: completedSession.id,
      signature,
      chargeId: charge?.id,
    });

    return this.SanitizeCheckoutSession(completedSession);
  }

  private async ConfirmSubscription(
    session: CheckoutSession,
    signature: string
  ): Promise<CheckoutSession> {
    const price = this.RequireRecurringCheckoutPrice(session);
    if (!price.subscription_plan_pda) {
      throw new AppError(
        'This subscription price has no on-chain plan',
        ERRORS.INVALID_REQUEST.status,
        ERRORS.INVALID_REQUEST.type
      );
    }

    const subscriberWallet = await this.ResolvePreparedSubscriberWallet(
      session
    );

    Logger.info('Verifying checkout subscribe transaction', {
      checkoutSessionId: session.id,
      signature,
    });

    const verification = await this.solana.VerifySubscribeTransaction(
      signature,
      {
        planPda: price.subscription_plan_pda,
        subscriberWallet,
      }
    );

    if (!verification.verified || !verification.subscription_delegation_pda) {
      throw new AppError(
        verification.failure_reason || 'Subscription verification failed',
        ERRORS.INVALID_REQUEST.status,
        ERRORS.INVALID_REQUEST.type
      );
    }

    return this.FinalizeSubscriptionCheckout(session, {
      subscriberWallet,
      subscriptionDelegationPda: verification.subscription_delegation_pda,
      signature,
    });
  }

  /**
   * Complete checkout when the on-chain subscribe already exists (e.g. a prior
   * broadcast succeeded but confirm failed on a stale blockhash).
   */
  private async ConfirmSubscriptionFromExistingOnChain(
    session: CheckoutSession,
    subscriptionDelegationPda?: string
  ): Promise<CheckoutSession> {
    const price = this.RequireRecurringCheckoutPrice(session);
    if (!price.subscription_plan_pda) {
      throw new AppError(
        'This subscription price has no on-chain plan',
        ERRORS.INVALID_REQUEST.status,
        ERRORS.INVALID_REQUEST.type
      );
    }

    const subscriberWallet = await this.ResolvePreparedSubscriberWallet(
      session
    );
    const delegationPda =
      subscriptionDelegationPda ||
      (await this.solana.FindExistingSubscriptionDelegation(
        price.subscription_plan_pda,
        subscriberWallet
      ));

    if (!delegationPda) {
      throw new AppError(
        'No on-chain subscription found for this wallet and plan',
        ERRORS.INVALID_REQUEST.status,
        ERRORS.INVALID_REQUEST.type
      );
    }

    Logger.info('Completing checkout from existing on-chain subscription', {
      checkoutSessionId: session.id,
      subscriptionDelegationPda: delegationPda,
    });

    return this.FinalizeSubscriptionCheckout(session, {
      subscriberWallet,
      subscriptionDelegationPda: delegationPda,
      signature: `onchain:${delegationPda}`,
    });
  }

  private async FinalizeSubscriptionCheckout(
    session: CheckoutSession,
    details: {
      subscriberWallet: string;
      subscriptionDelegationPda: string;
      signature: string;
    }
  ): Promise<CheckoutSession> {
    if (!this.subscriptionModule || !this.customerModule) {
      throw new AppError(
        'Subscription checkout is not configured',
        ERRORS.INTERNAL_ERROR.status,
        ERRORS.INTERNAL_ERROR.type
      );
    }

    const price = this.RequireRecurringCheckoutPrice(session);
    if (!price.subscription_plan_pda) {
      throw new AppError(
        'This subscription price has no on-chain plan',
        ERRORS.INVALID_REQUEST.status,
        ERRORS.INVALID_REQUEST.type
      );
    }

    const merchantWallet = await this.ResolveMerchantWallet(
      session.platform_account
    );
    const { subscriberWallet, subscriptionDelegationPda, signature } = details;

    const trialPeriodDays = price.recurring?.trial_period_days ?? null;
    const hasTrial = !!trialPeriodDays && trialPeriodDays > 0;
    let collectionSignature = signature;

    if (!hasTrial) {
      try {
        const collection = await this.solana.CollectSubscriptionPayment({
          subscriberWallet,
          planPda: price.subscription_plan_pda,
          subscriptionPda: subscriptionDelegationPda,
          destinationWallet: merchantWallet.wallet_address,
          amountCents: price.unit_amount ?? session.amount_total!,
        });
        collectionSignature = collection.signature;
      } catch (error) {
        // Subscribe already landed — surface the collect error instead of
        // pretending checkout collected USDC (collectionSignature === signature).
        const message = error instanceof Error ? error.message : String(error);
        Logger.error('First-period subscription collect failed', {
          checkoutSessionId: session.id,
          error: message,
        });
        throw new AppError(
          `Subscription authorized on-chain, but the first payment could not be collected: ${message}`,
          ERRORS.INVALID_REQUEST.status,
          ERRORS.INVALID_REQUEST.type
        );
      }
    }

    const customerId = await this.EnsureCheckoutCustomer(
      session,
      subscriberWallet
    );

    const subscription = await this.subscriptionModule.CreateSubscription(
      session.platform_account,
      {
        customer: customerId,
        items: [
          {
            price: price.id,
            quantity: session.line_items?.data?.[0]?.quantity ?? 1,
          },
        ],
        ...(hasTrial ? { trial_period_days: trialPeriodDays! } : {}),
        default_payment_method: subscriberWallet,
        metadata: {
          checkout_session: session.id,
          wallet_address: subscriberWallet,
        },
      },
      {
        settlementSignature: !hasTrial ? collectionSignature : undefined,
      }
    );

    await this.subscriptionModule.SetSubscriptionDelegationPda(
      subscription.id,
      subscriptionDelegationPda
    );

    const completedSession =
      await this.checkoutSessionModule.CompleteCheckoutSession(
        session.id,
        {
          transaction_signature: signature,
          payer_wallet: subscriberWallet,
        },
        { subscription: subscription.id }
      );

    if (completedSession.payment_link && this.paymentLinkModule) {
      await this.paymentLinkModule.RecordCompletedSession(
        completedSession.payment_link
      );
    }

    Logger.info('Checkout session completed via subscription', {
      checkoutSessionId: completedSession.id,
      subscriptionId: subscription.id,
      signature,
      collectionSignature,
    });

    return this.SanitizeCheckoutSession(completedSession);
  }

  private async ResolvePreparedSubscriberWallet(
    session: CheckoutSession
  ): Promise<string> {
    if (session.payment_details?.payer_wallet) {
      return session.payment_details.payer_wallet;
    }

    if (session.payment_intent && this.paymentIntentModule) {
      const paymentIntent = await this.paymentIntentModule.GetPaymentIntent(
        session.payment_intent
      );
      if (paymentIntent?.payment_method) {
        return paymentIntent.payment_method;
      }
    }

    throw new AppError(
      'Missing subscriber wallet for this Checkout Session. Call prepare again.',
      ERRORS.INVALID_REQUEST.status,
      ERRORS.INVALID_REQUEST.type
    );
  }

  private async EnsureCheckoutCustomer(
    session: CheckoutSession,
    subscriberWallet: string
  ): Promise<string> {
    if (session.customer) return session.customer;
    if (!this.customerModule) {
      throw new AppError(
        'Customer module is not configured',
        ERRORS.INTERNAL_ERROR.status,
        ERRORS.INTERNAL_ERROR.type
      );
    }

    const email =
      session.customer_email ?? session.customer_details?.email ?? undefined;

    const customer = await this.customerModule.CreateCustomer(
      session.platform_account,
      {
        email,
        description: `Checkout subscriber ${subscriberWallet}`,
        metadata: {
          wallet_address: subscriberWallet,
          checkout_session: session.id,
        },
      }
    );

    await this.db.Update<CheckoutSession>('CheckoutSessions', session.id, {
      customer: customer.id,
    });

    return customer.id;
  }

  private RequireRecurringCheckoutPrice(session: CheckoutSession): Price {
    const lineItems = session.line_items?.data ?? [];
    if (lineItems.length !== 1) {
      throw new AppError(
        'Subscription checkout currently supports exactly one line item',
        ERRORS.INVALID_REQUEST.status,
        ERRORS.INVALID_REQUEST.type
      );
    }

    const price = lineItems[0]?.price;
    if (!price || typeof price === 'string') {
      throw new AppError(
        'Subscription checkout requires an expanded recurring price',
        ERRORS.INVALID_REQUEST.status,
        ERRORS.INVALID_REQUEST.type
      );
    }

    if (price.type !== 'recurring' || !price.recurring) {
      throw new AppError(
        'Subscription checkout requires a recurring price',
        ERRORS.INVALID_REQUEST.status,
        ERRORS.INVALID_REQUEST.type
      );
    }

    return price;
  }

  /**
   * Record a completed checkout payment on the merchant's internal ledger:
   * creates a 'payment' balance transaction sourced from the session and
   * credits the merchant's available balance, atomically.
   *
   * Mirrors the pattern used by TopUpModule.CreateFromDeposit: the funds are
   * already confirmed on-chain, so the balance transaction is immediately
   * available.
   *
   * Idempotent: if a payment balance transaction already exists for this
   * session, it is returned without crediting the balance again.
   */
  private async RecordPaymentOnLedger(
    session: CheckoutSession,
    amountCents: number,
    payerWallet: string | null,
    signature: string
  ): Promise<BalanceTransaction> {
    const existing = await this.db.Find2Custom<BalanceTransaction>(
      'BalanceTransactions',
      'source',
      '==',
      session.id,
      'type',
      '==',
      'payment'
    );
    if (existing.length > 0) return existing[0];

    const merchantAccountId = session.platform_account;
    const timestamp = Now();

    const balanceTransaction =
      this.balanceTransactionModule.BalanceTransactionObject({
        amount: amountCents,
        currency: session.currency ?? 'usdc',
        account: merchantAccountId,
        platformAccountId: merchantAccountId,
        type: 'payment',
        source: session.id,
        description: `Payment for Checkout Session ${session.id}`,
        metadata: {
          blockchain_tx: signature,
          network: 'solana',
          sender_address: payerWallet ?? '',
          explorer_url: SolanaExplorerUrl('tx', signature),
        },
        status: 'available',
        available_on: timestamp,
      });

    // The merchant may not have a ledger balance yet (e.g. fresh setup)
    const balanceData =
      (await this.balanceModule.GetBalance(merchantAccountId)) ??
      (await this.balanceModule.CreateBalance(merchantAccountId));

    await this.db.RunTransaction(async (mongoSession: ClientSession) => {
      await this.db.Set(
        'BalanceTransactions',
        balanceTransaction.id,
        balanceTransaction,
        mongoSession
      );

      const updatedBalance = this.balanceModule.UpdateBalance(
        balanceData,
        amountCents,
        balanceTransaction.currency,
        'available'
      );
      await this.db.Update(
        'Balances',
        updatedBalance.id,
        { available: updatedBalance.available },
        mongoSession
      );
    });

    Logger.info('Recorded checkout payment on ledger', {
      checkoutSessionId: session.id,
      balanceTransactionId: balanceTransaction.id,
      amountCents,
    });

    return balanceTransaction;
  }

  /**
   * Strips platform-internal fields before serving a session to an
   * unauthenticated customer.
   */
  private SanitizeCheckoutSession(session: CheckoutSession): CheckoutSession {
    return {
      ...session,
      metadata: null,
      line_items: session.line_items
        ? {
            ...session.line_items,
            data: session.line_items.data.map((item) => ({
              ...item,
              metadata: {},
            })),
          }
        : null,
    };
  }

  private async GetSessionOrThrow(urlSlug: string): Promise<CheckoutSession> {
    const session =
      await this.checkoutSessionModule.GetCheckoutSessionByUrlSlug(urlSlug);

    if (!session) {
      throw new AppError(
        ERRORS.CHECKOUT_SESSION_NOT_FOUND.message,
        ERRORS.CHECKOUT_SESSION_NOT_FOUND.status,
        ERRORS.CHECKOUT_SESSION_NOT_FOUND.type
      );
    }

    return session;
  }

  /**
   * Resolve the merchant's receiving wallet for a checkout session: the
   * platform account's default external wallet.
   */
  private async ResolveMerchantWallet(
    platformAccountId: string
  ): Promise<ExternalWallet> {
    const merchantWallet = await this.externalWalletModule.GetDefaultWallet(
      platformAccountId
    );

    if (!merchantWallet) {
      throw new AppError(
        'The merchant has no wallet configured to receive payments',
        ERRORS.VALIDATION_ERROR.status,
        'no_wallet_configured'
      );
    }

    return merchantWallet;
  }

  /**
   * Ensure a checkout session can accept a payment: it must be open, unpaid,
   * and not past its expiry time.
   */
  private AssertSessionPayable(session: CheckoutSession): void {
    if (session.status !== 'open' || session.payment_status !== 'unpaid') {
      throw new AppError(
        'This Checkout Session is no longer accepting payments',
        ERRORS.INVALID_REQUEST.status,
        ERRORS.INVALID_REQUEST.type
      );
    }

    if (session.expires_at && session.expires_at < Now()) {
      throw new AppError(
        'This Checkout Session has expired',
        ERRORS.INVALID_REQUEST.status,
        ERRORS.INVALID_REQUEST.type
      );
    }

    if (
      session.mode !== 'subscription' &&
      (!session.amount_total || session.amount_total <= 0)
    ) {
      throw new AppError(
        'This Checkout Session has no amount due',
        ERRORS.INVALID_REQUEST.status,
        ERRORS.INVALID_REQUEST.type
      );
    }
  }

  private async MarkPaymentIntentRequiresConfirmation(
    session: CheckoutSession,
    payerWallet: string
  ): Promise<void> {
    // Persist payer wallet on the open session so subscription confirm can
    // resolve the subscriber without relying on a PaymentIntent.
    await this.db.Update<CheckoutSession>('CheckoutSessions', session.id, {
      payment_details: {
        transaction_signature:
          session.payment_details?.transaction_signature ?? null,
        payer_wallet: payerWallet,
      },
    });

    if (!session.payment_intent || !this.paymentIntentModule) return;

    // Until crypto PaymentMethods exist, store the payer wallet address as
    // the payment_method stand-in so the PI reflects that details were
    // collected (Stripe: attach PM → requires_confirmation).
    await this.paymentIntentModule.MarkRequiresConfirmation(
      session.payment_intent,
      { paymentMethod: payerWallet }
    );
  }

  private async MarkPaymentIntentProcessing(
    session: CheckoutSession
  ): Promise<void> {
    if (!session.payment_intent || !this.paymentIntentModule) return;
    await this.paymentIntentModule.MarkProcessing(session.payment_intent);
  }

  private async MarkPaymentIntentSucceeded(
    session: CheckoutSession,
    details: { amountReceived: number; latestCharge: string | null }
  ): Promise<void> {
    if (!session.payment_intent || !this.paymentIntentModule) return;

    await this.paymentIntentModule.MarkSucceeded(session.payment_intent, {
      amountReceived: details.amountReceived,
      latestCharge: details.latestCharge,
    });
  }

  private async MarkPaymentIntentFailed(
    session: CheckoutSession,
    message: string,
    chargeId: string | null = null
  ): Promise<void> {
    if (!session.payment_intent || !this.paymentIntentModule) return;

    await this.paymentIntentModule.MarkPaymentFailed(session.payment_intent, {
      advice_code: null,
      charge: chargeId,
      code: 'payment_intent_payment_attempt_failed',
      decline_code: null,
      doc_url: null,
      message,
      network_advice_code: null,
      network_decline_code: null,
      param: null,
      payment_method: null,
      payment_method_type: 'crypto',
      source: null,
      type: 'invalid_request_error',
    });
  }

  /**
   * Create the Charge that Stripe would create when a PaymentIntent is
   * confirmed. No-ops when ChargeModule or a linked PaymentIntent is absent.
   */
  private async CreateCheckoutCharge(
    session: CheckoutSession,
    details: {
      amount: number;
      signature: string;
      payerAddress: string | null;
      outcome: 'succeeded' | 'failed';
      failureMessage?: string;
    }
  ): Promise<Charge | null> {
    if (!session.payment_intent || !this.chargeModule) return null;

    const paymentIntent = this.paymentIntentModule
      ? await this.paymentIntentModule.GetPaymentIntent(session.payment_intent)
      : null;

    return this.chargeModule.CreateFromPaymentAttempt(
      session.platform_account,
      {
        amount: details.amount,
        currency: session.currency ?? 'usdc',
        payment_intent: session.payment_intent,
        payment_method:
          paymentIntent?.payment_method ?? details.payerAddress ?? null,
        customer: session.customer,
        description: paymentIntent?.description ?? session.id,
        metadata: paymentIntent?.metadata ?? {},
        receipt_email:
          paymentIntent?.receipt_email ?? session.customer_email ?? null,
        application_fee_amount: paymentIntent?.application_fee_amount ?? null,
        transfer_data: paymentIntent?.transfer_data
          ? {
              amount: paymentIntent.transfer_data.amount,
              destination: paymentIntent.transfer_data.destination,
            }
          : null,
        transfer_group: paymentIntent?.transfer_group ?? null,
        crypto: {
          buyer_address: details.payerAddress,
          transaction_hash: details.signature,
        },
        outcome: details.outcome,
        failure_code:
          details.outcome === 'failed'
            ? 'payment_intent_payment_attempt_failed'
            : null,
        failure_message: details.failureMessage ?? null,
      }
    );
  }
}
