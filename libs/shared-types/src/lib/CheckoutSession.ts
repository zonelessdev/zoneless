import { Price } from './Price';
import { CustomerAddress, CustomerDiscount, CustomerTaxRate } from './Customer';

/**
 * Stripe-compatible Checkout Session object for Zoneless.
 * Represents a checkout session for a customer to purchase a product, paid for in USDC.
 *
 * @see https://docs.stripe.com/api/checkout/sessions/object
 */
export interface CheckoutSession {
  /** Unique identifier for the object. */
  id: string;
  /** String representing the object's type. Objects of the same type share the same value. */
  object: 'checkout.session';
  /** Settings for price localization with Adaptive Pricing. */
  adaptive_pricing: {
    /** If enabled, Adaptive Pricing is available on eligible sessions. */
    enabled: boolean;
  } | null;
  /** When set, provides configuration for actions to take if this Checkout Session expires. */
  after_expiration: {
    /** When set, configuration used to recover the Checkout Session on expiry. */
    recovery: {
      /** Enables user redeemable promotion codes on the recovered Checkout Sessions. Defaults to false. */
      allow_promotion_codes: boolean;
      /** If true, a recovery url will be generated to recover this Checkout Session if it expires before a transaction is completed. */
      enabled: boolean;
      /** The timestamp at which the recovery URL will expire. */
      expires_at: number | null;
      /** URL that creates a new Checkout Session when clicked that is a copy of this expired Checkout Session. */
      url: string | null;
    } | null;
  } | null;
  /** Enables user redeemable promotion codes. */
  allow_promotion_codes: boolean | null;
  /** Total of all items before discounts or taxes are applied. */
  amount_subtotal: number | null;
  /** Total of all items after discounts and taxes are applied. */
  amount_total: number | null;
  /** Details on the state of automatic tax for the session, including the status of the latest tax calculation. */
  automatic_tax: {
    /** Indicates whether automatic tax is enabled for the session. */
    enabled: boolean;
    /** The account that's liable for tax. If set, the business address and tax registrations required to perform the tax calculation are loaded from this account. */
    liability: {
      /** The connected account being referenced when type is account. */
      account: string | null;
      /** Type of the account referenced. */
      type: 'account' | 'self';
    } | null;
    /** The tax provider powering automatic tax. */
    provider: string | null;
    /** The status of the most recent automated tax calculation for this session. */
    status: 'complete' | 'failed' | 'requires_location_inputs' | null;
  };
  /** Describes whether Checkout should collect the customer's billing address. Defaults to auto. */
  billing_address_collection: 'auto' | 'required' | null;
  /** Details on the state of branding settings for the session. */
  branding_settings: {
    /** A hex color value starting with # representing the background color for the Checkout Session. */
    background_color: string;
    /** The border style for the Checkout Session. */
    border_style: 'pill' | 'rectangular' | 'rounded';
    /** A hex color value starting with # representing the button color for the Checkout Session. */
    button_color: string;
    /** The display name shown on the Checkout Session. */
    display_name: string;
    /** The font family for the Checkout Session. */
    font_family: string;
    /** The icon for the Checkout Session. You cannot set both logo and icon. */
    icon: {
      /** The ID of a File upload representing the icon. Required if type is file and disallowed otherwise. */
      file: string | null;
      /** The type of image for the icon. */
      type: 'file' | 'url';
      /** The URL of the image. Present when type is url. */
      url: string | null;
    } | null;
    /** The logo for the Checkout Session. You cannot set both logo and icon. */
    logo: {
      /** The ID of a File upload representing the logo. Required if type is file and disallowed otherwise. */
      file: string | null;
      /** The type of image for the logo. */
      type: 'file' | 'url';
      /** The URL of the image. Present when type is url. */
      url: string | null;
    } | null;
  } | null;
  /** If set, Checkout displays a back button and customers will be directed to this URL if they decide to cancel payment. */
  cancel_url: string | null;
  /** A unique string to reference the Checkout Session. Can be a customer ID, a cart ID, or similar. */
  client_reference_id: string | null;
  /** The client secret of your Checkout Session. Applies to Checkout Sessions with ui_mode: embedded_page or ui_mode: elements. */
  client_secret: string | null;
  /** Information about the customer collected within the Checkout Session. */
  collected_information: {
    /** Customer's business name for this Checkout Session. */
    business_name: string | null;
    /** Customer's individual name for this Checkout Session. */
    individual_name: string | null;
    /** Shipping information for this Checkout Session. */
    shipping_details: {
      /** Customer address. */
      address: CustomerAddress;
      /** Customer name. */
      name: string;
    } | null;
  } | null;
  /** Results of consent_collection for this session. */
  consent: {
    /** If opt_in, the customer consents to receiving promotional communications from the merchant about this Checkout Session. */
    promotions: 'opt_in' | 'opt_out' | null;
    /** If accepted, the customer in this Checkout Session has agreed to the merchant's terms of service. */
    terms_of_service: 'accepted' | null;
  } | null;
  /** When set, provides configuration for the Checkout Session to gather active consent from customers. */
  consent_collection: {
    /** If set to hidden, it will hide legal text related to the reuse of a payment method. */
    payment_method_reuse_agreement: {
      /** Determines the position and visibility of the payment method reuse agreement in the UI. */
      position: 'auto' | 'hidden';
    } | null;
    /** If set to auto, enables the collection of customer consent for promotional communications. Only available to US merchants and US customers. */
    promotions: 'auto' | 'none' | null;
    /** If set to required, it requires customers to accept the terms of service before being able to pay. */
    terms_of_service: 'none' | 'required' | null;
  } | null;
  /** Time at which the object was created. Measured in seconds since the Unix epoch. */
  created: number;
  /** Three-letter ISO currency code, in lowercase. Must be a supported currency. */
  currency: string | null;
  /** Currency conversion details for Adaptive Pricing sessions created before 2025-03-31. */
  currency_conversion: {
    /** Total of all items in source currency before discounts or taxes are applied. */
    amount_subtotal: number;
    /** Total of all items in source currency after discounts and taxes are applied. */
    amount_total: number;
    /** Exchange rate used to convert source currency amounts to customer currency amounts. */
    fx_rate: string;
    /** Creation currency of the CheckoutSession before localization. */
    source_currency: string;
  } | null;
  /** Collect additional information from your customer using custom fields. Up to 3 fields are supported. */
  custom_fields: CheckoutSessionCustomField[];
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
  /**
   * The ID of the customer for this Session. For Checkout Sessions in subscription mode or
   * payment mode with customer_creation set to always, Checkout will create a new customer
   * object unless an existing customer was provided when the Session was created.
   */
  customer: string | null;
  /** The ID of the account for this Session. */
  customer_account: string | null;
  /** Configure whether a Checkout Session creates a Customer when the Checkout Session completes. */
  customer_creation: 'always' | 'if_required' | null;
  /** The customer details including the customer's tax exempt status and tax IDs. Not present on Sessions in setup mode. */
  customer_details: {
    /** The customer's address after a completed Checkout Session. */
    address: CustomerAddress | null;
    /** The customer's business name after a completed Checkout Session. The maximum length is 150 characters. */
    business_name: string | null;
    /** The email associated with the Customer after a completed Checkout Session. */
    email: string | null;
    /** The customer's individual name after a completed Checkout Session. The maximum length is 150 characters. */
    individual_name: string | null;
    /** The customer's name after a completed Checkout Session. */
    name: string | null;
    /** The customer's phone number after a completed Checkout Session. */
    phone: string | null;
    /** The customer's tax exempt status after a completed Checkout Session. */
    tax_exempt: 'exempt' | 'none' | 'reverse' | null;
    /**
     * The customer's tax IDs after a completed Checkout Session.
     * @remarks Stripe supports 100+ country-specific tax ID types; kept as a plain string here
     * for maintainability, matching the simplification already used for CustomerTaxId.type.
     */
    tax_ids:
      | {
          type: string;
          value: string;
        }[]
      | null;
  } | null;
  /**
   * If provided, this value will be used when the Customer object is created. Use this to
   * prefill customer data if you already have an email on file.
   */
  customer_email: string | null;
  /** List of coupons and promotion codes attached to the Checkout Session. */
  discounts:
    | {
        /** Coupon attached to the Checkout Session. */
        coupon: string | null;
        /** Promotion code attached to the Checkout Session. */
        promotion_code: string | null;
      }[]
    | null;
  /**
   * A list of the types of payment methods that should be excluded from this Checkout Session.
   * Should only be used when payment methods are managed through the Zoneless Dashboard.
   */
  excluded_payment_method_types: string[] | null;
  /** The timestamp at which the Checkout Session will expire. */
  expires_at: number;
  /** The integration identifier for this Checkout Session. Multiple Checkout Sessions can have the same integration identifier. */
  integration_identifier: string | null;
  /** ID of the invoice created by the Checkout Session, if it exists. */
  invoice: string | null;
  /** Details on the state of invoice creation for the Checkout Session. */
  invoice_creation: {
    /** Indicates whether invoice creation is enabled for the Checkout Session. */
    enabled: boolean;
    /** Parameters passed when creating invoices for payment-mode Checkout Sessions. */
    invoice_data: {
      /** The account tax IDs associated with the invoice. */
      account_tax_ids: string[] | null;
      /** Custom fields displayed on the invoice. */
      custom_fields: { name: string; value: string }[] | null;
      /** An arbitrary string attached to the object. Often useful for displaying to users. */
      description: string | null;
      /** Footer displayed on the invoice. */
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
    };
  } | null;
  /** The line items purchased by the customer. */
  line_items: CheckoutSessionLineItemList | null;
  /** If the object exists in live mode, the value is true. If the object exists in test mode, the value is false. */
  livemode: boolean;
  /**
   * The IETF language tag of the locale Checkout is displayed in.
   * @remarks Stripe supports ~40 locales; kept as a plain string here for maintainability.
   */
  locale: string | null;
  /** Settings for Managed Payments for this Checkout Session and resulting PaymentIntents, Invoices, and Subscriptions. */
  managed_payments: {
    /** Indicates whether Managed Payments is enabled for this session. */
    enabled: boolean;
  } | null;
  /** Set of key-value pairs that you can attach to an object. This can be useful for storing additional information about the object in a structured format. */
  metadata: Record<string, string> | null;
  /** The mode of the Checkout Session. */
  mode: 'payment' | 'setup' | 'subscription';
  /** Details on the state of name collection for the session. */
  name_collection: {
    /** The settings applied for collecting a business's name. */
    business: {
      /** Indicates whether business name collection is enabled for the session. */
      enabled: boolean;
      /** Whether the customer is required to complete the field before completing the Checkout Session. Defaults to false. */
      optional: boolean;
    } | null;
    /** The settings applied for collecting an individual's name. */
    individual: {
      /** Indicates whether individual name collection is enabled for the session. */
      enabled: boolean;
      /** Whether the customer is required to complete the field before completing the Checkout Session. Defaults to false. */
      optional: boolean;
    } | null;
  } | null;
  /**
   * The optional items presented to the customer at checkout.
   * @remarks Stripe does not publicly document the nested shape of this field.
   */
  optional_items: object[] | null;
  /** Where the user is coming from. This informs the optimizations that are applied to the session. */
  origin_context: 'mobile_app' | 'web' | null;
  /**
   * The ID of the PaymentIntent for Checkout Sessions in payment mode. You can't confirm or
   * cancel the PaymentIntent for a Checkout Session; to cancel, expire the Checkout Session instead.
   */
  payment_intent: string | null;
  /** The ID of the Payment Link that created this Session. */
  payment_link: string | null;
  /** Configure whether a Checkout Session should collect a payment method. Defaults to always. */
  payment_method_collection: 'always' | 'if_required' | null;
  /** Information about the payment method configuration used for this Checkout session if using dynamic payment methods. */
  payment_method_configuration_details: {
    /** ID of the payment method configuration used. */
    id: string;
    /** ID of the parent payment method configuration used. */
    parent: string | null;
  } | null;
  /**
   * Payment-method-specific configuration for the PaymentIntent or SetupIntent of this CheckoutSession.
   * @remarks Stripe defines 40+ per-payment-method-type option bags here (acss_debit, card,
   * klarna, wechat_pay, etc.) that are specific to fiat payment rails. Zoneless only accepts
   * USDC wallet payments, so this is kept as an untyped placeholder rather than reproducing
   * Stripe's full fiat payment method matrix.
   */
  payment_method_options: object;
  /** A list of the types of payment methods this Checkout Session is allowed to accept. */
  payment_method_types: string[];
  /** The payment status of the Checkout Session. Use this value to decide when to fulfill your customer's order. */
  payment_status: 'no_payment_required' | 'paid' | 'unpaid';
  /** Used to set up permissions for various actions (e.g., update) on the CheckoutSession object. */
  permissions: {
    /** Determines which entity is allowed to update the shipping details. Default is client_only. */
    update_shipping_details: 'client_only' | 'server_only' | null;
  } | null;
  /** Details on the state of phone number collection for the session. */
  phone_number_collection: {
    /** Indicates whether phone number collection is enabled for the session. */
    enabled: boolean;
  } | null;
  /** A hash containing information about the currency presentation to the customer. */
  presentment_details: {
    /** Amount intended to be collected by this payment, denominated in presentment_currency. */
    presentment_amount: number;
    /** Currency presented to the customer during payment. */
    presentment_currency: string;
  } | null;
  /** The ID of the original expired Checkout Session that triggered the recovery flow. */
  recovered_from: string | null;
  /** Applies to ui_mode: embedded_page. Defaults to always. */
  redirect_on_completion: 'always' | 'if_required' | 'never' | null;
  /**
   * Applies to Checkout Sessions with ui_mode: embedded_page or ui_mode: elements. The URL to
   * redirect your customer back to after they authenticate or cancel their payment.
   */
  return_url: string | null;
  /** Controls saved payment method settings for the session. Only available in payment and subscription mode. */
  saved_payment_method_options: {
    /** Uses the allow_redisplay value of each saved payment method to filter the set presented to a returning customer. */
    allow_redisplay_filters: ('always' | 'limited' | 'unspecified')[] | null;
    /** Enable customers to choose if they wish to remove their saved payment methods. Disabled by default. */
    payment_method_remove: 'disabled' | 'enabled' | null;
    /** Enable customers to choose if they wish to save their payment method for future use. Disabled by default. */
    payment_method_save: 'disabled' | 'enabled' | null;
  } | null;
  /**
   * The ID of the SetupIntent for Checkout Sessions in setup mode. You can't confirm or cancel
   * the SetupIntent for a Checkout Session; to cancel, expire the Checkout Session instead.
   */
  setup_intent: string | null;
  /** When set, provides configuration for Checkout to collect a shipping address from a customer. */
  shipping_address_collection: {
    /**
     * An array of two-letter ISO country codes representing which countries Checkout should
     * provide as options for shipping locations.
     * @remarks Stripe defines ~240 supported country codes here; kept as a plain string array
     * for maintainability.
     */
    allowed_countries: string[];
  } | null;
  /** The details of the customer cost of shipping, including the customer chosen ShippingRate. */
  shipping_cost: {
    /** Total shipping cost before any discounts or taxes are applied. */
    amount_subtotal: number;
    /** Total tax amount applied due to shipping costs. If no tax was applied, defaults to 0. */
    amount_tax: number;
    /** Total shipping cost after discounts and taxes are applied. */
    amount_total: number;
    /** The ID of the ShippingRate for this order. */
    shipping_rate: string | null;
    /** The taxes applied to the shipping rate. */
    taxes: CheckoutSessionTaxAmount[] | null;
  } | null;
  /** The shipping rate options applied to this Session. */
  shipping_options: {
    /** A non-negative integer in cents representing how much to charge. */
    shipping_amount: number;
    /** The shipping rate. */
    shipping_rate: string;
  }[];
  /** The status of the Checkout Session. */
  status: 'complete' | 'expired' | 'open' | null;
  /** Describes the type of transaction being performed by Checkout in order to customize relevant text on the page. */
  submit_type: 'auto' | 'book' | 'donate' | 'pay' | 'subscribe' | null;
  /** The ID of the Subscription for Checkout Sessions in subscription mode. */
  subscription: string | null;
  /** The URL the customer will be directed to after the payment or subscription creation is successful. */
  success_url: string | null;
  /** Details on the state of tax ID collection for the session. */
  tax_id_collection: {
    /** Indicates whether tax ID collection is enabled for the session. */
    enabled: boolean;
    /** Indicates whether a tax ID is required on the payment page. */
    required: 'if_supported' | 'never';
  } | null;
  /** Tax and discount details for the computed total amount. */
  total_details: {
    /** This is the sum of all the discounts. */
    amount_discount: number;
    /** This is the sum of all the shipping amounts. */
    amount_shipping: number | null;
    /** This is the sum of all the tax amounts. */
    amount_tax: number;
    /** Breakdown of individual tax and discount amounts that add up to the totals. */
    breakdown: {
      /** The aggregated discounts. */
      discounts: CheckoutSessionDiscountAmount[];
      /** The aggregated tax amounts by rate. */
      taxes: {
        /** Amount of tax applied for this rate. */
        amount: number;
        /** The tax rate applied. */
        rate: CustomerTaxRate;
      }[];
    } | null;
  } | null;
  /** The UI mode of the Session. Defaults to hosted_page. */
  ui_mode: 'elements' | 'embedded_page' | 'hosted_page' | null;
  /**
   * The URL to the Checkout Session. Applies to Checkout Sessions with ui_mode: hosted_page.
   * Redirect customers to this URL to take them to Checkout. This value is only present when
   * the session is active.
   */
  url: string | null;
  /**
   * Wallet-specific configuration for this Checkout Session.
   * @remarks Stripe's only wallet option here is Link, which has no Zoneless equivalent since
   * Zoneless connects Solana wallets directly rather than a Stripe-hosted wallet product.
   * Retained for API parity.
   */
  wallet_options: {
    /** This hash contains the configurations that will be applied to the wallet of this type. */
    link: {
      /** Describes whether Checkout should display Link. Defaults to auto. */
      display: 'auto' | 'never';
    } | null;
  } | null;

  /**
   * The platform account that owns this resource.
   * @zoneless_extension
   */
  platform_account: string;

  /**
   * On-chain payment details recorded when the session is completed.
   * @zoneless_extension
   */
  payment_details?: {
    /** The Solana transaction signature of the payment. */
    transaction_signature: string;
    /** The customer wallet that paid. */
    payer_wallet: string | null;
  } | null;

  /**
   * The merchant wallet that receives the payment. Only populated on the
   * public payment_pages response so the hosted checkout can build the
   * payment transaction.
   * @zoneless_extension
   */
  merchant_wallet?: {
    /** The merchant's receiving wallet address. */
    wallet_address: string;
    /** The network the wallet is on. */
    network: string;
    /** The currency the wallet receives. */
    currency: string;
    /** The USDC mint address for the active network. */
    usdc_mint: string;
  } | null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Custom Fields
// ─────────────────────────────────────────────────────────────────────────────

/** A custom field collected from the customer during Checkout. Up to 3 are supported per session. */
export interface CheckoutSessionCustomField {
  /** Configuration for type=dropdown fields. */
  dropdown: {
    /** The value that pre-fills on the payment page. */
    default_value: string | null;
    /** The options available for the customer to select. Up to 200 options allowed. */
    options: {
      /** The label for the option, displayed to the customer. Up to 100 characters. */
      label: string;
      /** The value for this option, not displayed to the customer. Must be unique, alphanumeric, and up to 100 characters. */
      value: string;
    }[];
    /** The option selected by the customer. This will be the value for the option. */
    value: string | null;
  } | null;
  /** String of your choice that your integration can use to reconcile this field. Must be unique, alphanumeric, and up to 200 characters. */
  key: string;
  /** The label for the field, displayed to the customer. */
  label: {
    /** Custom text for the label, displayed to the customer. Up to 50 characters. */
    custom: string | null;
    /** The type of the label. */
    type: 'custom';
  };
  /** Configuration for type=numeric fields. */
  numeric: {
    /** The value that pre-fills the field on the payment page. */
    default_value: string | null;
    /** The maximum character length constraint for the customer's input. */
    maximum_length: number | null;
    /** The minimum character length requirement for the customer's input. */
    minimum_length: number | null;
    /** The value entered by the customer, containing only digits. */
    value: string | null;
  } | null;
  /** Whether the customer is required to complete the field before completing the Checkout Session. Defaults to false. */
  optional: boolean;
  /** Configuration for type=text fields. */
  text: {
    /** The value that pre-fills the field on the payment page. */
    default_value: string | null;
    /** The maximum character length constraint for the customer's input. */
    maximum_length: number | null;
    /** The minimum character length requirement for the customer's input. */
    minimum_length: number | null;
    /** The value entered by the customer. */
    value: string | null;
  } | null;
  /** The type of the field. */
  type: 'dropdown' | 'numeric' | 'text';
}

// ─────────────────────────────────────────────────────────────────────────────
// Line Items
// ─────────────────────────────────────────────────────────────────────────────

/** The line items purchased by the customer. */
export interface CheckoutSessionLineItemList {
  /** String representing the object's type. Objects of the same type share the same value. Always has the value list. */
  object: 'list';
  /** Details about each object. */
  data: CheckoutSessionLineItem[];
  /** True if this list has another page of items after this one that can be fetched. */
  has_more: boolean;
  /** The URL where this list can be accessed. */
  url: string;
}

/** A single line item purchased within a Checkout Session. */
export interface CheckoutSessionLineItem {
  /** Unique identifier for the object. */
  id: string;
  /** String representing the object's type. Objects of the same type share the same value. */
  object: string;
  /** Total discount amount applied. If no discounts were applied, defaults to 0. */
  amount_discount: number;
  /** Total before any discounts or taxes are applied. */
  amount_subtotal: number;
  /** Total tax amount applied. If no tax was applied, defaults to 0. */
  amount_tax: number;
  /** Total after discounts and taxes. */
  amount_total: number;
  /** Three-letter ISO currency code, in lowercase. Must be a supported currency. */
  currency: string;
  /** An arbitrary string attached to the object. Defaults to product name. */
  description: string | null;
  /** The discounts applied to the line item. */
  discounts: CheckoutSessionDiscountAmount[] | null;
  /** Set of key-value pairs that you can attach to an object. */
  metadata: Record<string, string>;
  /** The price used to generate the line item. */
  price: Price | null;
  /** The quantity of products being purchased. */
  quantity: number | null;
  /** The taxes applied to the line item. */
  taxes: CheckoutSessionTaxAmount[] | null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Shared discount / tax amount wrappers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * A discount amount applied to a line item or reflected in a total details breakdown.
 * Shared shape reused across `line_items.data.discounts` and `total_details.breakdown.discounts`.
 */
export interface CheckoutSessionDiscountAmount {
  /** The amount discounted. */
  amount: number;
  /** The discount applied. */
  discount: CustomerDiscount;
}

/**
 * A tax amount applied to a line item or shipping cost.
 * Shared shape reused across `line_items.data.taxes` and `shipping_cost.taxes`.
 */
export interface CheckoutSessionTaxAmount {
  /** Amount of tax applied for this rate. */
  amount: number;
  /** The tax rate applied. */
  rate: CustomerTaxRate;
  /** The reasoning behind this tax, for example, if the product is tax exempt. */
  taxability_reason:
    | 'customer_exempt'
    | 'not_collecting'
    | 'not_subject_to_tax'
    | 'not_supported'
    | 'portion_product_exempt'
    | 'portion_reduced_rated'
    | 'portion_standard_rated'
    | 'product_exempt'
    | 'product_exempt_holiday'
    | 'proportionally_rated'
    | 'reduced_rated'
    | 'reverse_charge'
    | 'standard_rated'
    | 'taxable_basis_reduced'
    | 'zero_rated'
    | null;
  /** The amount on which tax is calculated, in the smallest currency unit. */
  taxable_amount: number | null;
}

/**
 * Deleted checkout session response object.
 */
export interface CheckoutSessionDeleted {
  /** Unique identifier for the object */
  id: string;
  /** String representing the object's type */
  object: 'checkout.session';
  /** Always true for a deleted object */
  deleted: true;
}
