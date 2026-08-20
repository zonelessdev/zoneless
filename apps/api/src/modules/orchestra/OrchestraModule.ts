/**
 * @fileOverview Flashnet Orchestra adapter for Cash App / deposit pay-in
 * and cross-chain payouts. Additive to native solana:USDC settlement.
 *
 * @module Orchestra
 */

import {
  CheckoutSession,
  ExternalWallet,
  OrchestraIntent,
  OrchestraPayinStartResponse,
  OrchestraPayoutIntent,
  Payout,
} from '@zoneless/shared-types';
import { StartOrchestraPayinInput } from '@zoneless/shared-schemas';
import { Database } from '../Database';
import { CheckoutSessionModule } from '../CheckoutSession';
import { CheckoutPaymentModule } from '../CheckoutPayment';
import { ExternalWalletModule } from '../ExternalWallet';
import { IsOrchestraLive } from '../AppConfig';
import { AppError } from '../../utils/AppError';
import { ERRORS } from '../../utils/Errors';
import { Now } from '../../utils/Timestamp';
import { Logger } from '../../utils/Logger';
import { OrchestraClient, OrchestraPartnerOrder } from './OrchestraClient';
import {
  CentsToFiatUsd,
  CentsToUsdcSmallest,
  IsNativeSolanaUsdc,
  IsOrchestraPayinSource,
  IsOrchestraPayoutDest,
  NormalizeAsset,
  NormalizeChain,
  SimulatedDepositAddress,
  ToFlashnetAsset,
  UsdcSmallestToCents,
} from './OrchestraRails';

const TERMINAL_STATUSES = new Set(['completed', 'failed', 'refunded']);

export class OrchestraModule {
  private readonly db: Database;
  private readonly checkoutSessionModule: CheckoutSessionModule;
  private readonly externalWalletModule: ExternalWalletModule;
  private readonly checkoutPaymentModule: CheckoutPaymentModule | null;
  private readonly client: OrchestraClient;

  constructor(
    db: Database,
    checkoutSessionModule?: CheckoutSessionModule,
    externalWalletModule?: ExternalWalletModule,
    checkoutPaymentModule?: CheckoutPaymentModule,
    client?: OrchestraClient
  ) {
    this.db = db;
    this.checkoutSessionModule =
      checkoutSessionModule ?? new CheckoutSessionModule(db);
    this.externalWalletModule =
      externalWalletModule ?? new ExternalWalletModule(db);
    this.checkoutPaymentModule = checkoutPaymentModule ?? null;
    this.client = client ?? new OrchestraClient();
  }

  /**
   * Start a Cash App or deposit pay-in. Destination is always the platform
   * solana USDC wallet — never taken from the client.
   */
  async StartPayin(
    urlSlug: string,
    input: StartOrchestraPayinInput
  ): Promise<OrchestraPayinStartResponse> {
    const session = await this.RequirePayablePaymentSession(urlSlug);
    const platformWallet = await this.RequirePlatformWallet(
      session.platform_account
    );

    const method = input.method;
    const sourceChain =
      method === 'deposit'
        ? NormalizeChain(input.source_chain || '')
        : 'lightning';
    const sourceAsset =
      method === 'deposit'
        ? NormalizeAsset(input.source_asset || '')
        : 'usd';

    if (method === 'deposit' && !IsOrchestraPayinSource(sourceChain, sourceAsset)) {
      throw new AppError(
        'Unsupported Orchestra deposit source',
        ERRORS.INVALID_REQUEST.status,
        ERRORS.INVALID_REQUEST.type
      );
    }

    const existing = session.orchestra;
    if (
      existing &&
      existing.method === method &&
      (method === 'cashapp' ||
        (existing.source_chain === sourceChain &&
          existing.source_asset === sourceAsset)) &&
      existing.status &&
      !TERMINAL_STATUSES.has(existing.status)
    ) {
      return this.PayinResponse(session, existing);
    }

    const amountIn = CentsToUsdcSmallest(session.amount_total!);
    let intent: OrchestraIntent;

    if (!IsOrchestraLive()) {
      intent =
        method === 'cashapp'
          ? {
              method,
              source_chain: sourceChain,
              source_asset: sourceAsset,
              quote_id: null,
              operation_id: null,
              deposit_address: 'lnbc1sim',
              deposit_memo: null,
              cash_app_url: `https://cash.app/launch/lightning/sim-${session.id}`,
              amount_in: amountIn,
              estimated_out: amountIn,
              expires_at: null,
              status: 'awaiting_deposit',
            }
          : {
              method,
              source_chain: sourceChain,
              source_asset: sourceAsset,
              quote_id: null,
              operation_id: null,
              deposit_address: SimulatedDepositAddress(sourceChain),
              deposit_memo: null,
              cash_app_url: null,
              amount_in: amountIn,
              estimated_out: amountIn,
              expires_at: null,
              status: 'awaiting_deposit',
            };
    } else if (method === 'cashapp') {
      if (session.amount_total! < 100) {
        throw new AppError(
          'Cash App pay-in requires at least $1.00',
          ERRORS.INVALID_REQUEST.status,
          ERRORS.INVALID_REQUEST.type
        );
      }
      const order = await this.client.CreateOnramp({
        destinationChain: 'solana',
        destinationAsset: 'USDC',
        recipientAddress: platformWallet.wallet_address,
        amountFiatUsd: CentsToFiatUsd(session.amount_total!),
        idempotencyKey: `zoneless:payin:${session.id}:cashapp`,
      });
      intent = this.IntentFromOrder(method, sourceChain, sourceAsset, order);
    } else {
      const order = await this.client.CreateQuote({
        sourceChain,
        sourceAsset: ToFlashnetAsset(sourceAsset),
        destinationChain: 'solana',
        destinationAsset: 'USDC',
        recipientAddress: platformWallet.wallet_address,
        amount: amountIn,
        amountMode: 'exact_in',
        idempotencyKey: `zoneless:payin:${session.id}:${sourceChain}:${sourceAsset}`,
      });
      intent = this.IntentFromOrder(method, sourceChain, sourceAsset, order);
    }

    await this.db.Update<CheckoutSession>('CheckoutSessions', session.id, {
      orchestra: intent,
    });

    Logger.info('Started Orchestra pay-in', {
      checkoutSessionId: session.id,
      method,
      sourceChain,
      sourceAsset,
    });

    return this.PayinResponse(session, intent);
  }

  /**
   * Refresh a live pay-in if we have a quote/operation id; return current intent.
   */
  async GetPayin(urlSlug: string): Promise<OrchestraPayinStartResponse> {
    const session = await this.RequireSession(urlSlug);
    if (!session.orchestra) {
      throw new AppError(
        'This Checkout Session has no Orchestra pay-in',
        ERRORS.INVALID_REQUEST.status,
        ERRORS.INVALID_REQUEST.type
      );
    }

    const intent = await this.RefreshPayinIntent(session);
    return this.PayinResponse(session, intent);
  }

  /**
   * Complete checkout after Orchestra settles. Simulated treats the session
   * as paid; live requires partner status `completed` for the full amount.
   */
  async ConfirmPayin(urlSlug: string): Promise<CheckoutSession> {
    if (!this.checkoutPaymentModule) {
      throw new AppError(
        ERRORS.INTERNAL_ERROR.message,
        ERRORS.INTERNAL_ERROR.status,
        ERRORS.INTERNAL_ERROR.type
      );
    }

    const session = await this.RequireSession(urlSlug);
    if (session.status === 'complete') {
      return this.checkoutPaymentModule.CompleteVerifiedPayment(session, {
        amount_cents: session.amount_total ?? 0,
        signature:
          session.payment_details?.transaction_signature ??
          `orch_sim:${session.id}`,
        payer_address:
          session.payment_details?.payer_wallet ?? 'orchestra:simulated',
      });
    }

    this.AssertPayablePaymentSession(session);
    if (!session.orchestra) {
      throw new AppError(
        'This Checkout Session has no Orchestra pay-in',
        ERRORS.INVALID_REQUEST.status,
        ERRORS.INVALID_REQUEST.type
      );
    }

    let amountCents = session.amount_total!;
    let signature = `orch_sim:${session.id}`;
    let payerAddress = 'orchestra:simulated';

    if (IsOrchestraLive()) {
      const order = await this.RequireLiveOrderStatus(session.orchestra);
      if (order.status !== 'completed') {
        throw new AppError(
          'Payment has not settled for the full amount yet',
          ERRORS.INVALID_REQUEST.status,
          ERRORS.INVALID_REQUEST.type
        );
      }
      if (order.amountOut) {
        amountCents = UsdcSmallestToCents(order.amountOut);
      }
      if (amountCents < session.amount_total!) {
        throw new AppError(
          'Payment has not settled for the full amount yet',
          ERRORS.INVALID_REQUEST.status,
          ERRORS.INVALID_REQUEST.type
        );
      }
      signature = `orch:${order.id ?? session.orchestra.operation_id ?? session.id}`;
      payerAddress = order.sourceAddress
        ? `orchestra:${order.sourceAddress}`
        : `orchestra:${order.id ?? 'live'}`;
    }

    const intent: OrchestraIntent = {
      ...session.orchestra,
      status: 'completed',
    };
    await this.db.Update<CheckoutSession>('CheckoutSessions', session.id, {
      orchestra: intent,
    });

    return this.checkoutPaymentModule.CompleteVerifiedPayment(session, {
      amount_cents: amountCents,
      signature,
      payer_address: payerAddress,
    });
  }

  /**
   * Quote solana USDC → seller dest. Native solana/usdc returns null so
   * the caller keeps the existing payout path.
   */
  async PreparePayout(
    platformAccountId: string,
    payout: Payout
  ): Promise<OrchestraPayoutIntent | null> {
    const destWallet = await this.externalWalletModule.GetExternalWallet(
      payout.destination
    );
    if (!destWallet) {
      throw new AppError(
        `External wallet ${payout.destination} not found for payout ${payout.id}`,
        ERRORS.INVALID_REQUEST.status,
        ERRORS.INVALID_REQUEST.type
      );
    }

    if (IsNativeSolanaUsdc(destWallet.network, destWallet.currency)) {
      return null;
    }

    if (!IsOrchestraPayoutDest(destWallet.network, destWallet.currency)) {
      throw new AppError(
        'Unsupported Orchestra payout destination',
        ERRORS.INVALID_REQUEST.status,
        ERRORS.INVALID_REQUEST.type
      );
    }

    const destinationChain = NormalizeChain(destWallet.network);
    const destinationAsset = NormalizeAsset(destWallet.currency);
    const amountIn = CentsToUsdcSmallest(payout.amount);

    if (
      payout.orchestra?.deposit_address &&
      payout.orchestra.destination_chain === destinationChain &&
      payout.orchestra.destination_asset === destinationAsset &&
      payout.orchestra.status &&
      !TERMINAL_STATUSES.has(payout.orchestra.status)
    ) {
      return payout.orchestra;
    }

    let intent: OrchestraPayoutIntent;

    if (!IsOrchestraLive()) {
      const platformWallet = await this.RequirePlatformWallet(platformAccountId);
      intent = {
        quote_id: null,
        operation_id: null,
        deposit_address: platformWallet.wallet_address,
        amount_in: amountIn,
        estimated_out: amountIn,
        destination_chain: destinationChain,
        destination_asset: destinationAsset,
        status: 'awaiting_deposit',
      };
    } else {
      const order = await this.client.CreateQuote({
        sourceChain: 'solana',
        sourceAsset: 'USDC',
        destinationChain,
        destinationAsset: ToFlashnetAsset(destinationAsset),
        recipientAddress: destWallet.wallet_address,
        amount: amountIn,
        amountMode: 'exact_in',
        idempotencyKey: `zoneless:payout:${payout.id}`,
      });
      intent = {
        quote_id: order.quoteId,
        operation_id: order.id,
        deposit_address: order.depositAddress,
        amount_in: order.amountIn ?? amountIn,
        estimated_out: order.estimatedOut,
        destination_chain: destinationChain,
        destination_asset: destinationAsset,
        status: order.status ?? 'quoted',
      };
    }

    await this.db.Update<Payout>('Payouts', payout.id, {
      orchestra: intent,
      'metadata.network': destinationChain,
    } as Partial<Payout>);

    return intent;
  }

  async RefreshPayoutStatus(
    payout: Payout
  ): Promise<OrchestraPartnerOrder | null> {
    if (!payout.orchestra) return null;
    if (!IsOrchestraLive()) return null;
    return this.RequireLiveOrderStatus(payout.orchestra);
  }

  private async RefreshPayinIntent(
    session: CheckoutSession
  ): Promise<OrchestraIntent> {
    const current = session.orchestra!;
    if (
      !IsOrchestraLive() ||
      (!current.quote_id && !current.operation_id)
    ) {
      return current;
    }

    const order = await this.client.GetOrderStatus({
      orderId: current.operation_id ?? undefined,
      quoteId: current.quote_id ?? undefined,
    });
    const intent: OrchestraIntent = {
      ...current,
      status: this.MapPartnerStatus(order.status) ?? current.status,
      estimated_out: order.estimatedOut ?? order.amountOut ?? current.estimated_out,
      deposit_address: order.depositAddress ?? current.deposit_address,
      cash_app_url: order.cashAppUrl ?? current.cash_app_url,
    };
    await this.db.Update<CheckoutSession>('CheckoutSessions', session.id, {
      orchestra: intent,
    });
    return intent;
  }

  private async RequireLiveOrderStatus(intent: {
    quote_id?: string | null;
    operation_id?: string | null;
  }): Promise<OrchestraPartnerOrder> {
    if (!intent.operation_id && !intent.quote_id) {
      throw new AppError(
        'This Orchestra intent is missing a partner id',
        ERRORS.INVALID_REQUEST.status,
        ERRORS.INVALID_REQUEST.type
      );
    }
    return this.client.GetOrderStatus({
      orderId: intent.operation_id ?? undefined,
      quoteId: intent.quote_id ?? undefined,
    });
  }

  private IntentFromOrder(
    method: OrchestraIntent['method'],
    sourceChain: string,
    sourceAsset: string,
    order: OrchestraPartnerOrder
  ): OrchestraIntent {
    return {
      method,
      source_chain: sourceChain,
      source_asset: sourceAsset,
      quote_id: order.quoteId,
      operation_id: order.id,
      deposit_address: order.depositAddress,
      deposit_memo: order.depositMemo,
      cash_app_url: order.cashAppUrl,
      amount_in: order.amountIn,
      estimated_out: order.estimatedOut,
      expires_at: order.expiresAt,
      status: this.MapPartnerStatus(order.status) ?? 'awaiting_deposit',
    };
  }

  private MapPartnerStatus(status: string | null): string | null {
    if (!status) return null;
    if (status === 'refunded') return 'failed';
    if (status === 'quoted') return 'quoted';
    if (status === 'completed' || status === 'processing' || status === 'failed') {
      return status;
    }
    return 'processing';
  }

  private PayinResponse(
    session: CheckoutSession,
    intent: OrchestraIntent
  ): OrchestraPayinStartResponse {
    return {
      object: 'orchestra_payin',
      checkout_session: { ...session, orchestra: intent },
      intent,
    };
  }

  private async RequireSession(urlSlug: string): Promise<CheckoutSession> {
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

  private async RequirePayablePaymentSession(
    urlSlug: string
  ): Promise<CheckoutSession> {
    const session = await this.RequireSession(urlSlug);
    this.AssertPayablePaymentSession(session);
    return session;
  }

  private AssertPayablePaymentSession(session: CheckoutSession): void {
    if (session.mode !== 'payment') {
      throw new AppError(
        'Orchestra pay-in is only available for payment-mode Checkout Sessions',
        ERRORS.INVALID_REQUEST.status,
        ERRORS.INVALID_REQUEST.type
      );
    }

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

  private async RequirePlatformWallet(
    platformAccountId: string
  ): Promise<ExternalWallet> {
    const wallet = await this.externalWalletModule.GetDefaultWallet(
      platformAccountId
    );
    if (!wallet) {
      throw new AppError(
        'The merchant has no wallet configured to receive payments',
        ERRORS.VALIDATION_ERROR.status,
        'no_wallet_configured'
      );
    }
    return wallet;
  }
}
