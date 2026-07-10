/**
 * Billing information associated with the payment method at the time of the transaction.
 */
export interface ChargeBillingDetails {
  address: {
    city: string | null;
    country: string | null;
    line1: string | null;
    line2: string | null;
    postal_code: string | null;
    state: string | null;
  } | null;
  email: string | null;
  name: string | null;
  phone: string | null;
  tax_id: string | null;
}

/**
 * Details about whether the payment was accepted, and why.
 */
export interface ChargeOutcome {
  advice_code:
    | 'confirm_card_data'
    | 'do_not_try_again'
    | 'try_again_later'
    | null;
  network_advice_code: string | null;
  network_decline_code: string | null;
  network_status:
    | 'approved_by_network'
    | 'declined_by_network'
    | 'not_sent_to_network'
    | 'reversed_after_approval'
    | null;
  reason: string | null;
  risk_level:
    | 'normal'
    | 'elevated'
    | 'highest'
    | 'not_assessed'
    | 'unknown'
    | null;
  risk_score: number | null;
  rule: string | null;
  seller_message: string | null;
  type:
    | 'authorized'
    | 'manual_review'
    | 'issuer_declined'
    | 'blocked'
    | 'invalid';
}

/**
 * Crypto payment method snapshot on a Charge.
 * Primary payment method details shape for Zoneless (USDC on Solana).
 */
export interface ChargePaymentMethodDetailsCrypto {
  buyer_address: string | null;
  fingerprint: string | null;
  network: 'base' | 'ethereum' | 'polygon' | 'solana' | 'sui' | 'tempo' | null;
  token_currency:
    | 'phantom_cash'
    | 'usdc'
    | 'usdg'
    | 'usdp'
    | 'usdsui'
    | 'usdt'
    | null;
  transaction_hash: string | null;
}

/**
 * Details about the payment method at the time of the transaction.
 * Crypto is typed for Zoneless; traditional Stripe payment method hashes are opaque stubs
 * so Stripe API consumers can keep field access without lint errors.
 */
export interface ChargePaymentMethodDetails {
  type: string;
  crypto?: ChargePaymentMethodDetailsCrypto | null;
  /** Opaque stub for traditional card charges. */
  card?: object | null;
  card_present?: object | null;
  ach_credit_transfer?: object | null;
  ach_debit?: object | null;
  acss_debit?: object | null;
  affirm?: object | null;
  afterpay_clearpay?: object | null;
  alipay?: object | null;
  alma?: object | null;
  amazon_pay?: object | null;
  au_becs_debit?: object | null;
  bacs_debit?: object | null;
  bancontact?: object | null;
  billie?: object | null;
  bizum?: object | null;
  blik?: object | null;
  boleto?: object | null;
  cashapp?: object | null;
  customer_balance?: object | null;
  eps?: object | null;
  fpx?: object | null;
  giropay?: object | null;
  grabpay?: object | null;
  ideal?: object | null;
  interac_present?: object | null;
  kakao_pay?: object | null;
  klarna?: object | null;
  konbini?: object | null;
  kr_card?: object | null;
  link?: object | null;
  mb_way?: object | null;
  mobilepay?: object | null;
  multibanco?: object | null;
  naver_pay?: object | null;
  nz_bank_account?: object | null;
  oxxo?: object | null;
  p24?: object | null;
  pay_by_bank?: object | null;
  payco?: object | null;
  paynow?: object | null;
  paypal?: object | null;
  paypay?: object | null;
  payto?: object | null;
  pix?: object | null;
  promptpay?: object | null;
  revolut_pay?: object | null;
  samsung_pay?: object | null;
  satispay?: object | null;
  scalapay?: object | null;
  sepa_debit?: object | null;
  sofort?: object | null;
  stripe_account?: object | null;
  sunbit?: object | null;
  swish?: object | null;
  twint?: object | null;
  upi?: object | null;
  us_bank_account?: object | null;
  wechat?: object | null;
  wechat_pay?: object | null;
  zip?: object | null;
  [key: string]: unknown;
}

/**
 * A Refund applied to a Charge.
 * @see https://docs.stripe.com/api/refunds/object
 */
export interface ChargeRefund {
  id: string;
  object: 'refund';
  amount: number;
  balance_transaction: string | null;
  charge: string | null;
  created: number;
  currency: string;
  description: string | null;
  /**
   * Transaction-specific refund destination details.
   * Crypto reference is typed; other Stripe destination hashes remain opaque.
   */
  destination_details: {
    type: string;
    crypto?: {
      reference: string | null;
    } | null;
    [key: string]: unknown;
  } | null;
  failure_balance_transaction: string | null;
  failure_reason:
    | 'lost_or_stolen_card'
    | 'expired_or_canceled_card'
    | 'charge_for_pending_refund_disputed'
    | 'insufficient_funds'
    | 'declined'
    | 'merchant_request'
    | 'unknown'
    | null;
  instructions_email: string | null;
  metadata: Record<string, string> | null;
  next_action: {
    type: string;
    display_details?: {
      email_sent: {
        email_sent_at: number;
        email_sent_to: string;
      };
      expires_at: number;
    } | null;
    [key: string]: unknown;
  } | null;
  payment_intent: string | null;
  pending_reason: 'processing' | 'insufficient_funds' | 'charge_pending' | null;
  reason:
    | 'duplicate'
    | 'fraudulent'
    | 'requested_by_customer'
    | 'expired_uncaptured_charge'
    | null;
  receipt_number: string | null;
  source_transfer_reversal: string | null;
  status:
    | 'pending'
    | 'requires_action'
    | 'succeeded'
    | 'failed'
    | 'canceled'
    | null;
  transfer_reversal: string | null;
}

/**
 * List of refunds embedded on a Charge.
 */
export interface ChargeRefundsList {
  object: 'list';
  data: ChargeRefund[];
  has_more: boolean;
  url: string;
}

/**
 * Stripe-compatible Charge object for Zoneless.
 * Represents a charge against a payment method / wallet.
 *
 * @see https://docs.stripe.com/api/charges/object
 */
export interface Charge {
  id: string;
  object: 'charge';
  amount: number;
  amount_captured: number;
  amount_refunded: number;
  application: string | null;
  application_fee: string | null;
  application_fee_amount: number | null;
  balance_transaction: string | null;
  billing_details: ChargeBillingDetails;
  calculated_statement_descriptor: string | null;
  captured: boolean;
  created: number;
  currency: string;
  customer: string | null;
  description: string | null;
  disputed: boolean;
  failure_balance_transaction: string | null;
  failure_code: string | null;
  failure_message: string | null;
  fraud_details: {
    stripe_report?: 'fraudulent' | null;
    user_report?: 'safe' | 'fraudulent' | null;
  } | null;
  livemode: boolean;
  metadata: Record<string, string>;
  on_behalf_of: string | null;
  outcome: ChargeOutcome | null;
  paid: boolean;
  payment_intent: string | null;
  payment_method: string | null;
  payment_method_details: ChargePaymentMethodDetails | null;
  presentment_details: {
    presentment_amount: number;
    presentment_currency: string;
  } | null;
  radar_options: {
    session: string | null;
  } | null;
  receipt_email: string | null;
  receipt_number: string | null;
  receipt_url: string | null;
  refunded: boolean;
  refunds: ChargeRefundsList | null;
  review: string | null;
  shipping: {
    address: {
      city: string | null;
      country: string | null;
      line1: string | null;
      line2: string | null;
      postal_code: string | null;
      state: string | null;
    };
    carrier: string | null;
    name: string;
    phone: string | null;
    tracking_number: string | null;
  } | null;
  source_transfer: string | null;
  statement_descriptor: string | null;
  statement_descriptor_suffix: string | null;
  status: 'succeeded' | 'pending' | 'failed';
  transfer: string | null;
  transfer_data: {
    amount: number | null;
    destination: string;
  } | null;
  transfer_group: string | null;
  /**
   * The platform account that owns this resource.
   * @zoneless_extension
   */
  platform_account: string;
}
