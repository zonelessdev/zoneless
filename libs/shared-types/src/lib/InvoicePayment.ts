import { Charge } from './Charge';
import type { Invoice } from './Invoice';
import { PaymentIntent } from './PaymentIntent';

/**
 * Stripe-compatible Invoice Payment object for Zoneless.
 * Represents a payment applied toward an invoice. Settled in USDC on Solana.
 *
 * @see https://docs.stripe.com/api/invoice-payment/object
 */
export interface InvoicePayment {
  /** Unique identifier for the object. */
  id: string;
  /** String representing the object's type. Objects of the same type share the same value. */
  object: 'invoice_payment';
  /**
   * Amount that was actually paid for this invoice, in the smallest currency unit. This field is
   * null until the payment is paid. This amount can be less than amount_requested if the
   * PaymentIntent's amount_received is not sufficient to pay all of the invoices that it is
   * attached to.
   */
  amount_paid: number | null;
  /** Amount intended to be paid toward this invoice, in the smallest currency unit. */
  amount_requested: number;
  /** Time at which the object was created. Measured in seconds since the Unix epoch. */
  created: number;
  /** Three-letter ISO currency code, in lowercase. Must be a supported currency. */
  currency: 'usdc';
  /** The invoice that was paid. Expandable. */
  invoice: string | Invoice;
  /**
   * Zoneless automatically creates a default InvoicePayment when the invoice is finalized, and
   * keeps it synchronized with the invoice's amount_remaining. The PaymentIntent associated with
   * the default payment can't be edited or canceled directly.
   */
  is_default: boolean;
  /** If the object exists in live mode, the value is true. If the object exists in test mode, the value is false. */
  livemode: boolean;
  /** The details on the payment. */
  payment: InvoicePaymentDetails;
  /** The status of the payment, one of open, paid, or canceled. */
  status: InvoicePaymentStatus;
  /** The timestamps when the payment's status was updated. */
  status_transitions: InvoicePaymentStatusTransitions;

  /**
   * The platform account that owns this resource.
   * @zoneless_extension
   */
  platform_account: string;
}

/** The status of an invoice payment. */
export type InvoicePaymentStatus = 'open' | 'paid' | 'canceled';

/** Payments list embedded on an invoice. */
export interface InvoicePaymentsList {
  /** String representing the object's type. Objects of the same type share the same value. Always has the value list. */
  object: 'list';
  /** Details about each object. */
  data: InvoicePayment[];
  /** True if this list has another page of items after this one that can be fetched. */
  has_more: boolean;
  /** Total number of payments on the invoice. */
  total_count: number;
  /** The URL where this list can be accessed. */
  url: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Payment details
// ─────────────────────────────────────────────────────────────────────────────

/** The details on the payment attached to an invoice payment. */
export interface InvoicePaymentDetails {
  /**
   * ID of the successful charge for this payment when type is charge. Charge is only surfaced if
   * the charge object is not associated with a payment intent. If the charge object does have a
   * payment intent, the Invoice Payment surfaces the payment intent instead. Expandable.
   */
  charge: string | Charge | null;
  /**
   * ID of the PaymentIntent associated with this payment when type is payment_intent. Expandable.
   */
  payment_intent: string | PaymentIntent | null;
  /** ID of the PaymentRecord associated with this payment when type is payment_record. Expandable. */
  payment_record: string | null;
  /** Type of payment object associated with this invoice payment. */
  type: 'charge' | 'payment_intent' | 'payment_record';
}

// ─────────────────────────────────────────────────────────────────────────────
// Status transitions
// ─────────────────────────────────────────────────────────────────────────────

/** The timestamps when the payment's status was updated. */
export interface InvoicePaymentStatusTransitions {
  /** The time that the payment was canceled. */
  canceled_at: number | null;
  /** The time that the payment succeeded. */
  paid_at: number | null;
}
