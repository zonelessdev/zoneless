import type { Customer } from './Customer';

/**
 * A line item stored under PaymentIntent.amount_details.
 * @see https://docs.stripe.com/api/payment_intents/amount_details_line_items
 */
export interface PaymentIntentAmountDetailsLineItem {
  id: string;
  object: 'payment_intent_amount_details_line_item';
  discount_amount: number | null;
  payment_method_options: object | null;
  product_code: string | null;
  product_name: string;
  quantity: number;
  tax: {
    total_tax_amount: number;
  } | null;
  unit_cost: number;
  unit_of_measure: string | null;
}

/**
 * Industry-specific amount breakdown on a PaymentIntent.
 */
export interface PaymentIntentAmountDetails {
  tip?: object;
  discount_amount?: number;
  enforce_arithmetic_validation?: boolean;
  line_items?: PaymentIntentAmountDetailsLineItem[];
  shipping?: {
    amount?: number;
    from_postal_code?: string;
    to_postal_code?: string;
  };
  tax?: {
    total_tax_amount: number;
  };
  [key: string]: unknown;
}

/**
 * Stripe-compatible Payment Intent object for Zoneless.
 * Represents a payment intent.
 *
 * @see https://docs.stripe.com/api/payment_intents
 */
export interface PaymentIntent {
  id: string;
  amount: number;
  automatic_payment_methods: {
    allow_redirects: 'never' | 'always' | null;
    enabled: boolean;
  } | null;
  client_secret: string | null;
  currency: string;
  customer: string | Customer | null;
  customer_account: string | null;
  description: string | null;
  last_payment_error: {
    advice_code: string | null;
    charge: string | null;
    code: string | null;
    decline_code: string | null;
    doc_url: string | null;
    message: string | null;
    network_advice_code: string | null;
    network_decline_code: string | null;
    param: string | null;
    /** Placeholder until PaymentMethod is typed; prefer crypto PaymentMethod when available. */
    payment_method: object | null;
    payment_method_type: string | null;
    /** Legacy Sources API; safe to leave opaque. */
    source: object | null;
    type:
      | 'api_error'
      | 'card_error'
      | 'invalid_request_error'
      | 'idempotency_error';
  } | null;
  latest_charge: string | null;
  metadata: Record<string, string>;
  /**
   * Actions the customer must take to complete payment.
   * Typed for Zoneless wallet/USDC flows; other Stripe next_action variants remain opaque.
   */
  next_action: {
    type: string;
    redirect_to_url?: {
      return_url: string | null;
      url: string | null;
    } | null;
    use_stripe_sdk?: object | null;
    [key: string]: unknown;
  } | null;
  payment_method: string | null;
  receipt_email: string | null;
  setup_future_usage: 'off_session' | 'on_session' | null;
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
  statement_descriptor: string | null;
  statement_descriptor_suffix: string | null;
  status:
    | 'canceled'
    | 'processing'
    | 'requires_action'
    | 'requires_capture'
    | 'requires_confirmation'
    | 'requires_payment_method'
    | 'succeeded';
  object: 'payment_intent';
  amount_capturable: number;
  amount_details: PaymentIntentAmountDetails | null;
  amount_received: number;
  application: string | null;
  application_fee_amount: number | null;
  canceled_at: number | null;
  cancellation_reason:
    | 'abandoned'
    | 'automatic'
    | 'duplicate'
    | 'expired'
    | 'failed_invoice'
    | 'fraudulent'
    | 'requested_by_customer'
    | 'void_invoice'
    | null;
  capture_method: 'automatic' | 'automatic_async' | 'manual';
  confirmation_method: 'automatic' | 'manual';
  created: number;
  excluded_payment_method_types: string[] | null;
  hooks: {
    inputs: {
      tax: {
        calculation: string;
      } | null;
    } | null;
  } | null;
  livemode: boolean;
  managed_payments: {
    enabled: boolean;
  } | null;
  on_behalf_of: string | null;
  payment_details: {
    customer_reference: string | null;
    order_reference: string | null;
  } | null;
  payment_method_configuration_details: {
    id: string;
    parent: string | null;
  } | null;
  payment_method_options: {
    crypto?: {
      setup_future_usage?: 'none' | null;
    } | null;
    [key: string]: unknown;
  } | null;
  payment_method_types: string[];
  presentment_details: {
    presentment_amount: number;
    presentment_currency: string;
  } | null;
  processing: {
    card: {
      customer_notification: {
        approval_requested: boolean | null;
        completes_at: number | null;
      } | null;
    } | null;
    type: 'card';
  } | null;
  review: string | null;
  shared_payment_granted_token: string | null;
  transfer_data: {
    amount: number | null;
    description: string | null;
    destination: string;
    metadata: Record<string, string> | null;
    payment_data: {
      description: string | null;
      metadata: Record<string, string> | null;
    } | null;
  } | null;
  transfer_group: string | null;
  /**
   * The platform account that owns this resource.
   * @zoneless_extension
   */
  platform_account: string;
}
