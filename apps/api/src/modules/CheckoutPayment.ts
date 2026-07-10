/**
 * @fileOverview Methods for the public hosted checkout payment flow:
 * bootstrapping the payment page, preparing the unsigned USDC payment
 * transaction, and confirming/completing the payment on-chain.
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
import type { PaymentIntentModule } from './PaymentIntent';
import type { ChargeModule } from './Charge';
import { Solana, SolanaExplorerUrl } from './chains/Solana';
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
/** Unsigned payment transaction bundle returned by PreparePayment. */
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
  private readonly solana: Solana;

  constructor(
    db: Database,
    checkoutSessionModule: CheckoutSessionModule,
    externalWalletModule: ExternalWalletModule,
    productModule: ProductModule,
    paymentIntentModule?: PaymentIntentModule,
    chargeModule?: ChargeModule,
    solana?: Solana
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
    this.solana = solana || new Solana();
  }

  /**
   * Bootstrap the hosted checkout page: the sanitized session enriched with
   * the merchant's receiving wallet, display details, and expanded products.
   */
  async GetPaymentPageSession(id: string): Promise<CheckoutSession> {
    const session = await this.GetSessionOrThrow(id);
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
   * Build an unsigned USDC payment transaction transferring the session
   * total from the customer's wallet to the merchant's wallet. The customer
   * signs and broadcasts it via their wallet.
   *
   * Transitions the linked PaymentIntent to `requires_confirmation` once the
   * customer has provided a wallet (Stripe: payment details attached, ready
   * to confirm). Emits `payment_intent.updated`.
   *
   * @param id - The checkout session ID
   * @param payerWallet - The customer's wallet address
   * @param email - Optional customer email to record on the session
   * @returns The unsigned transaction bundle
   */
  async PreparePayment(
    id: string,
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

    const session = await this.GetSessionOrThrow(id);
    this.AssertSessionPayable(session);

    const merchantWallet = await this.ResolveMerchantWallet(
      session.platform_account
    );

    if (email && typeof email === 'string') {
      await this.checkoutSessionModule.SetCustomerEmail(session.id, email);
    }

    Logger.info('Preparing checkout payment transaction', {
      checkoutSessionId: session.id,
      amountTotal: session.amount_total,
    });

    const prepared = await this.solana.BuildCheckoutPaymentTransaction(
      payerWallet,
      merchantWallet.wallet_address,
      session.amount_total!,
      session.id
    );

    await this.MarkPaymentIntentRequiresConfirmation(session, payerWallet);

    return {
      object: 'checkout.payment_transaction',
      checkout_session: session.id,
      amount_total: session.amount_total!,
      currency: session.currency,
      merchant_wallet_address: merchantWallet.wallet_address,
      ...prepared,
    };
  }

  /**
   * Verify a broadcast payment transaction on-chain and complete the
   * checkout session. Emits Charge + PaymentIntent lifecycle events then
   * `checkout.session.completed`. Idempotent: if the session was already
   * completed with the same signature, it is returned as-is.
   *
   * @param id - The checkout session ID
   * @param signature - The Solana transaction signature of the payment
   * @returns The completed public checkout session
   */
  async ConfirmPayment(
    id: string,
    signature: string | undefined
  ): Promise<CheckoutSession> {
    if (!signature || typeof signature !== 'string') {
      throw new AppError(
        'signature is required',
        ERRORS.VALIDATION_ERROR.status,
        ERRORS.VALIDATION_ERROR.type
      );
    }

    const session = await this.GetSessionOrThrow(id);

    // Idempotency: the session was already completed with this signature.
    // Re-run the ledger recording (a no-op when already recorded) so a
    // retry can heal a confirm that failed between completion and ledgering.
    if (
      session.status === 'complete' &&
      session.payment_details?.transaction_signature === signature
    ) {
      await this.RecordPaymentOnLedger(
        session,
        session.amount_total!,
        session.payment_details.payer_wallet,
        signature
      );
      return this.SanitizeCheckoutSession(session);
    }

    this.AssertSessionPayable(session);

    // A transaction can only ever complete one checkout session
    const existingSession =
      await this.checkoutSessionModule.GetCheckoutSessionByTransactionSignature(
        signature
      );
    if (existingSession) {
      throw new AppError(
        'This transaction has already been used for another Checkout Session',
        ERRORS.INVALID_REQUEST.status,
        ERRORS.INVALID_REQUEST.type
      );
    }

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

  private async GetSessionOrThrow(id: string): Promise<CheckoutSession> {
    const session = await this.checkoutSessionModule.GetCheckoutSession(id);

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

    if (!session.amount_total || session.amount_total <= 0) {
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
