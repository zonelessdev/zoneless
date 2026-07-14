import {
  CheckoutCustomField,
  CheckoutSessionLineItemList,
} from './CheckoutSession';

/**
 * Stripe-compatible Payment Link object for Zoneless.
 * A shareable URL that customers can use to pay, creating a Checkout Session when visited.
 *
 * @see https://docs.stripe.com/api/payment_links/object
 */
export interface PaymentLink {
  /** Unique identifier for the object. */
  id: string;
  /** String representing the object's type. Objects of the same type share the same value. */
  object: 'payment_link';
  /** Whether the payment link's url is active. If false, customers visiting the URL will be shown a page saying that the link has been deactivated. */
  active: boolean;
  /** Behavior after the purchase is complete. */
  after_completion: PaymentLinkAfterCompletion;
  /** Whether user redeemable promotion codes are enabled. */
  allow_promotion_codes: boolean;
  /** The ID of the Connect application that created the Payment Link. */
  application: string | null;
  /** The amount of the application fee (if any) that will be requested to be applied to the payment and transferred to the application owner's Stripe account. */
  application_fee_amount: number | null;
  /** This represents the percentage of the subscription invoice total that will be transferred to the application owner's Stripe account. */
  application_fee_percent: number | null;
  /** Configuration details for automatic tax collection. */
  automatic_tax: {
    /** If true, tax will be calculated automatically using the customer's location. */
    enabled: boolean;
    /** The account that's liable for tax. If set, the business address and tax registrations required to perform the tax calculation are loaded from this account. */
    liability: {
      /** The connected account being referenced when type is account. */
      account: string | null;
      /** Type of the account referenced. */
      type: 'account' | 'self';
    } | null;
  };
  /** Configuration for collecting the customer's billing address. Defaults to auto. */
  billing_address_collection: 'auto' | 'required';
  /** When set, provides configuration to gather active consent from customers. */
  consent_collection: {
    /** Settings related to the payment method reuse text shown in the Checkout UI. */
    payment_method_reuse_agreement: {
      /** Determines the position and visibility of the payment method reuse agreement in the UI. */
      position: 'auto' | 'hidden';
    } | null;
    /** If set to auto, enables the collection of customer consent for promotional communications. */
    promotions: 'auto' | 'none' | null;
    /** If set to required, it requires customers to accept the terms of service before being able to pay. */
    terms_of_service: 'none' | 'required' | null;
  } | null;
  /** Three-letter ISO currency code, in lowercase. Must be a supported currency. */
  currency: string;
  /**
   * Collect additional information from your customer using custom fields. Up to 3 fields are supported.
   * Reuses the Checkout Session custom field shape; collected `value` fields are null on Payment Links.
   */
  custom_fields: CheckoutCustomField[];
  /** Display additional text for your customers using custom text. */
  custom_text: {
    /** Custom text that should be displayed after the payment confirmation button. */
    after_submit: { message: string } | null;
    /** Custom text that should be displayed alongside shipping address collection. */
    shipping_address: { message: string } | null;
    /** Custom text that should be displayed alongside the payment confirmation button. */
    submit: { message: string } | null;
    /** Custom text that should be displayed in place of the default terms of service agreement text. */
    terms_of_service_acceptance: { message: string } | null;
  };
  /** Configuration for Customer creation during checkout. */
  customer_creation: 'always' | 'if_required';
  /** The custom message to be displayed to a customer when a payment link is no longer active. */
  inactive_message: string | null;
  /** Configuration for creating invoice for payment mode payment links. */
  invoice_creation: {
    /** Enable creating an invoice on successful payment. */
    enabled: boolean;
    /** Configuration for the invoice. Default invoice values will be used if unspecified. */
    invoice_data: {
      /** The account tax IDs associated with the invoice. */
      account_tax_ids: string[] | null;
      /** A list of up to 4 custom fields to be displayed on the invoice. */
      custom_fields: { name: string; value: string }[] | null;
      /** An arbitrary string attached to the object. Often useful for displaying to users. */
      description: string | null;
      /** Footer to be displayed on the invoice. */
      footer: string | null;
      /** The connected account that issues the invoice. */
      issuer: {
        /** The connected account being referenced when type is account. */
        account: string | null;
        /** Type of the account referenced. */
        type: 'account' | 'self';
      } | null;
      /** Set of key-value pairs that you can attach to an object. */
      metadata: Record<string, string> | null;
      /** Options for invoice PDF rendering. */
      rendering_options: {
        /** How line-item prices and amounts will be displayed with respect to tax on invoice PDFs. */
        amount_tax_display: string | null;
        /** ID of the invoice rendering template to be used for the generated invoice. */
        template: string | null;
      } | null;
    } | null;
  } | null;
  /** The line items representing what is being sold. */
  line_items: CheckoutSessionLineItemList | null;
  /** If the object exists in live mode, the value is true. If the object exists in test mode, the value is false. */
  livemode: boolean;
  /** Settings for Managed Payments for this Payment Link and resulting Checkout Sessions, Payment Intents, Invoices, and Subscriptions. */
  managed_payments: {
    /** Indicates whether Managed Payments is enabled for this transaction. */
    enabled: boolean;
  } | null;
  /** Set of key-value pairs that you can attach to an object. This can be useful for storing additional information about the object in a structured format. */
  metadata: Record<string, string>;
  /** Details on the state of name collection for the payment link. */
  name_collection: {
    /** The settings applied for collecting a business's name. */
    business: {
      /** Indicates whether business name collection is enabled for the payment link. */
      enabled: boolean;
      /** Whether the customer is required to complete the field before checking out. Defaults to false. */
      optional: boolean;
    } | null;
    /** The settings applied for collecting an individual's name. */
    individual: {
      /** Indicates whether individual name collection is enabled for the payment link. */
      enabled: boolean;
      /** Whether the customer is required to complete the field before checking out. Defaults to false. */
      optional: boolean;
    } | null;
  } | null;
  /** The account on behalf of which to charge. */
  on_behalf_of: string | null;
  /**
   * The optional items presented to the customer at checkout.
   * @remarks Stripe does not publicly document the nested shape of this field.
   */
  optional_items: object[] | null;
  /** Indicates the parameters to be passed to PaymentIntent creation during checkout. */
  payment_intent_data: PaymentLinkPaymentIntentData | null;
  /** Configuration for collecting a payment method during checkout. Defaults to always. */
  payment_method_collection: 'always' | 'if_required';
  /**
   * Payment-method-specific configuration.
   * @remarks Stripe defines many per-payment-method-type option bags here that are specific to
   * fiat payment rails. Zoneless only accepts USDC wallet payments; the documented `card`
   * restrictions shape is retained for API parity.
   */
  payment_method_options: {
    /** Configuration for card payment methods. */
    card: {
      /** Restrictions to apply to the card payment method. */
      restrictions: {
        /** The card brands to block. */
        brands_blocked: (
          | 'american_express'
          | 'discover_global_network'
          | 'mastercard'
          | 'visa'
        )[];
      } | null;
    } | null;
  } | null;
  /**
   * The list of payment method types that customers can use. When null, relevant payment
   * methods enabled in payment method settings are shown dynamically.
   */
  payment_method_types: string[] | null;
  /** Controls phone number collection settings during checkout. */
  phone_number_collection: {
    /** If true, a phone number will be collected during checkout. */
    enabled: boolean;
  };
  /** Settings that restrict the usage of a payment link. */
  restrictions: {
    /** Configuration for the completed_sessions restriction type. */
    completed_sessions: {
      /** The current number of checkout sessions that have been completed on the payment link which count towards the completed_sessions restriction to be met. */
      count: number;
      /** The maximum number of checkout sessions that can be completed for the completed_sessions restriction to be met. */
      limit: number;
    };
  } | null;
  /** Configuration for collecting the customer's shipping address. */
  shipping_address_collection: {
    /**
     * An array of two-letter ISO country codes representing which countries Checkout should
     * provide as options for shipping locations.
     * @remarks Stripe defines ~240 supported country codes here; kept as a plain string array
     * for maintainability.
     */
    allowed_countries: string[];
  } | null;
  /** The shipping rate options applied to the session. */
  shipping_options: {
    /** A non-negative integer in cents representing how much to charge. */
    shipping_amount: number;
    /** The ID of the Shipping Rate to use for this shipping option. */
    shipping_rate: string;
  }[];
  /** Indicates the type of transaction being performed which customizes relevant text on the page, such as the submit button. */
  submit_type: 'auto' | 'book' | 'donate' | 'pay' | 'subscribe';
  /** When creating a subscription, the specified configuration data will be used. There must be at least one line item with a recurring price to use subscription_data. */
  subscription_data: PaymentLinkSubscriptionData | null;
  /** Details on the state of tax ID collection for the payment link. */
  tax_id_collection: {
    /** Indicates whether tax ID collection is enabled for the session. */
    enabled: boolean;
  };
  /** The account (if any) the payments will be attributed to for tax reporting, and where funds from each payment will be transferred to. */
  transfer_data: {
    /** The amount in the smallest currency unit that will be transferred to the destination account. By default, the entire amount is transferred to the destination. */
    amount: number | null;
    /** The connected account receiving the transfer. */
    destination: string;
  } | null;
  /** The public URL that can be shared with customers. */
  url: string;

  /**
   * The platform account that owns this resource.
   * @zoneless_extension
   */
  platform_account: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// After Completion
// ─────────────────────────────────────────────────────────────────────────────

/** Behavior after the purchase is complete. */
export interface PaymentLinkAfterCompletion {
  /** Configuration when type=hosted_confirmation. */
  hosted_confirmation: {
    /** The custom message that is displayed to the customer after the purchase is complete. */
    custom_message: string | null;
  } | null;
  /** Configuration when type=redirect. */
  redirect: {
    /** The URL the customer will be redirected to after the purchase is complete. */
    url: string;
  } | null;
  /** The specified behavior after the purchase is complete. */
  type: 'hosted_confirmation' | 'redirect';
}

// ─────────────────────────────────────────────────────────────────────────────
// Payment Intent Data
// ─────────────────────────────────────────────────────────────────────────────

/** Parameters passed to PaymentIntent creation during checkout. */
export interface PaymentLinkPaymentIntentData {
  /** Indicates when the funds will be captured from the customer's account. */
  capture_method: 'automatic' | 'automatic_async' | 'manual' | null;
  /** An arbitrary string attached to the object. Often useful for displaying to users. */
  description: string | null;
  /** Set of key-value pairs that will set metadata on Payment Intents generated from this payment link. */
  metadata: Record<string, string>;
  /** Indicates that you intend to make future payments with the payment method collected during checkout. */
  setup_future_usage: 'off_session' | 'on_session' | null;
  /** For a non-card payment, information about the charge that appears on the customer's statement when this payment succeeds in creating a charge. */
  statement_descriptor: string | null;
  /** For a card payment, information about the charge that appears on the customer's statement when this payment succeeds in creating a charge. */
  statement_descriptor_suffix: string | null;
  /** A string that identifies the resulting payment as part of a group. */
  transfer_group: string | null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Subscription Data
// ─────────────────────────────────────────────────────────────────────────────

/** Configuration data used when creating a subscription from this payment link. */
export interface PaymentLinkSubscriptionData {
  /** The subscription's description, meant to be displayable to the customer. */
  description: string | null;
  /** All invoices will be billed using the specified settings. */
  invoice_settings: {
    /** The connected account that issues the invoice. */
    issuer: {
      /** The connected account being referenced when type is account. */
      account: string | null;
      /** Type of the account referenced. */
      type: 'account' | 'self';
    };
  };
  /** Set of key-value pairs that will set metadata on Subscriptions generated from this payment link. */
  metadata: Record<string, string>;
  /** Integer representing the number of trial period days before the customer is charged for the first time. */
  trial_period_days: number | null;
  /** Settings related to subscription trials. */
  trial_settings: {
    /** Defines how the subscription should behave when the user's free trial ends. */
    end_behavior: {
      /** Indicates how the subscription should change when the trial ends if the user did not provide a payment method. */
      missing_payment_method: 'cancel' | 'create_invoice' | 'pause';
    };
  } | null;
}
