import { Product } from './Product';

/**
 * Stripe-compatible Price object for Zoneless.
 * Represents the price of a product.
 *
 * @see https://docs.stripe.com/api/prices/object
 */
export interface Price {
  /** Unique identifier for the object. */
  id: string;
  /** Whether the price can be used for new purchases. */
  active: boolean;
  /** Three-letter ISO currency code, in lowercase. Must be a supported currency. */
  currency: 'usdc';
  /** Set of key-value pairs that you can attach to an object. This can be useful for storing additional information about the object in a structured format. */
  metadata: Record<string, string>;
  /** A brief description of the price, hidden from customers. */
  nickname: string | null;
  /** The ID of the product this price is associated with. */
  product: string | Product | null;
  /** The recurring components of a price such as interval and usage_type. */
  recurring: {
    /** The frequency at which a subscription is billed. One of day, week, month or year. */
    interval: 'day' | 'week' | 'month' | 'year';
    /** The number of intervals (specified in the interval attribute) between subscription billings. For example, interval=month and interval_count=3 bills every 3 months. */
    interval_count: number;
    /** The number of trial days before the customer is charged for the first time. */
    trial_period_days: number | null;
    /** Configures how the quantity per period should be determined. Can be either metered or licensed. licensed automatically bills the quantity set when adding it to a subscription. metered aggregates the total usage based on usage records. Defaults to licensed. */
    usage_type: 'metered' | 'licensed';
    /** The meter tracking the usage of a metered price */
    meter: string | null;
  } | null;
  /** Only required if a default tax behavior was not provided in the Stripe Tax settings. Specifies whether the price is considered inclusive of taxes or exclusive of taxes. One of inclusive, exclusive, or unspecified. Once specified as either inclusive or exclusive, it cannot be changed. */
  tax_behavior: PriceTaxBehaviour;
  /** One of one_time or recurring depending on whether the price is for a one-time purchase or a recurring (subscription) purchase. */
  type: 'one_time' | 'recurring';
  /** he unit amount in the smallest currency unit to be charged, represented as a whole integer if possible. Only set if billing_scheme=per_unit. */
  unit_amount: number | null;
  /** String representing the object’s type. Objects of the same type share the same value. */
  object: 'price';
  /** Describes how to compute the price per period. Either per_unit or tiered. per_unit indicates that the fixed amount (specified in unit_amount or unit_amount_decimal) will be charged per unit in quantity (for prices with usage_type=licensed), or per unit of total usage (for prices with usage_type=metered). tiered indicates that the unit pricing will be computed using a tiering strategy as defined using the tiers and tiers_mode attributes. */
  billing_scheme: 'per_unit' | 'tiered';
  /** Time at which the object was created. Measured in seconds since the Unix epoch. */
  created: number;
  /** Prices defined in each available currency option. Each key must be a three-letter ISO currency code and a supported currency. */
  currency_options?: {
    [key: string]: {
      /** When set, provides configuration for the amount to be adjusted by the customer during Checkout Sessions and Payment Links. */
      custom_unit_amount: PriceCustomUnitAmount | null;
      /** Only required if a default tax behavior was not provided in the Stripe Tax settings. Specifies whether the price is considered inclusive of taxes or exclusive of taxes. One of inclusive, exclusive, or unspecified. Once specified as either inclusive or exclusive, it cannot be changed. */
      tax_behavior: PriceTaxBehaviour;
      /** Each element represents a pricing tier. This parameter requires billing_scheme to be set to tiered. See also the documentation for billing_scheme. */
      tiers: PriceTier[] | null;
      /** The unit amount in the smallest currency unit to be charged, represented as a whole integer if possible. Only set if billing_scheme=per_unit. */
      unit_amount: number | null;
      /** The unit amount in the smallest currency unit to be charged, represented as a decimal string with at most 12 decimal places. Only set if billing_scheme=per_unit. */
      unit_amount_decimal: string | null;
    };
  } | null;
  /** When set, provides configuration for the amount to be adjusted by the customer during Checkout Sessions and Payment Links. */
  custom_unit_amount: PriceCustomUnitAmount | null;
  /** If the object exists in live mode, the value is true. If the object exists in test mode, the value is false. */
  livemode: boolean;
  /** A lookup key used to retrieve prices dynamically from a static string. This may be up to 200 characters. */
  lookup_key: string | null;
  /** Each element represents a pricing tier. This parameter requires billing_scheme to be set to tiered. See also the documentation for billing_scheme. */
  tiers?: PriceTier[] | null;
  /** Defines if the tiering price should be graduated or volume based. In volume-based tiering, the maximum quantity within a period determines the per unit price. In graduated tiering, pricing can change as the quantity grows. */
  tiers_mode: 'graduated' | 'volume' | null;
  /** Apply a transformation to the reported usage or set quantity before computing the amount billed. Cannot be combined with tiers. */
  transform_quantity?: {
    /** Divide usage by this number. */
    divide_by: number;
    /** After division, either round the result up or down */
    round: 'up' | 'down';
  } | null;
  /** The unit amount in the smallest currency unit to be charged, represented as a decimal string with at most 12 decimal places. Only set if billing_scheme=per_unit. */
  unit_amount_decimal: string | null;
  /**
   * @zoneless_extension The platform account that owns this resource.
   */
  platform_account: string;
  /**
   * @zoneless_extension Solana subscriptions program plan PDA for this recurring price.
   * Set by the API when the on-chain plan is created; not customer-editable.
   * Null for one-time prices or before plan creation succeeds.
   */
  subscription_plan_pda: string | null;
}

export interface PriceTier {
  /** Price for the entire tier. */
  flat_amount: number | null;
  /** Same as flat_amount, but contains a decimal value with at most 12 decimal places. */
  flat_amount_decimal: string | null;
  /** Per unit price for units relevant to the tier. */
  unit_amount: number | null;
  /** Same as unit_amount, but contains a decimal value with at most 12 decimal places. */
  unit_amount_decimal: string | null;
  /** Up to and including to this quantity will be contained in the tier. */
  up_to: number;
}

export interface PriceCustomUnitAmount {
  /** Whether the custom unit amount is enabled. */
  enabled: boolean;
  /** The maximum unit amount the customer can specify for this item. */
  maximum: number;
  /** The minimum unit amount the customer can specify for this item. Must be at least the minimum charge amount. */
  minimum: number;
  /** The starting unit amount which can be updated by the customer. */
  preset: number;
}

/**  */
export type PriceTaxBehaviour =
  | 'exclusive'
  | 'inclusive'
  | 'unspecified'
  | null;
