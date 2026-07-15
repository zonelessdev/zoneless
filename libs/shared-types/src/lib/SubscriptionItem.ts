import { CustomerDiscount, CustomerTaxRate } from './Customer';
import { Price } from './Price';

/**
 * Stripe-compatible Subscription Item object for Zoneless.
 * Represents a price and quantity attached to a subscription.
 *
 * @see https://docs.stripe.com/api/subscription_items/object
 */
export interface SubscriptionItem {
  /** Unique identifier for the object. */
  id: string;
  /** String representing the object's type. Objects of the same type share the same value. */
  object: 'subscription_item';
  /** The time period the subscription item has been billed for. Expandable. */
  billed_until: number | null;
  /** Define thresholds at which an invoice will be sent, and the related subscription advanced to a new billing period. */
  billing_thresholds: SubscriptionItemBillingThresholds | null;
  /** Time at which the object was created. Measured in seconds since the Unix epoch. */
  created: number;
  /** The end time of this subscription item's current billing period. */
  current_period_end: number;
  /** The start time of this subscription item's current billing period. */
  current_period_start: number;
  /**
   * The discounts applied to the subscription item. Subscription item discounts are applied before
   * subscription discounts. Use `expand[]=discounts` to expand each discount.
   */
  discounts: (string | CustomerDiscount)[];
  /**
   * Set of key-value pairs that you can attach to an object. This can be useful for storing
   * additional information about the object in a structured format.
   */
  metadata: Record<string, string>;
  /** The price the customer is subscribed to. */
  price: string | Price;
  /** The quantity of the plan to which the customer should be subscribed. */
  quantity: number | null;
  /** The subscription this subscription_item belongs to. */
  subscription: string;
  /**
   * The tax rates which apply to this subscription_item. When set, the default_tax_rates on the
   * subscription do not apply to this subscription_item.
   */
  tax_rates: (string | CustomerTaxRate)[] | null;
  /**
   * The platform account that owns this resource.
   * @zoneless_extension
   */
  platform_account: string;
}

/**
 * Deleted subscription item response object.
 */
export interface SubscriptionItemDeleted {
  /** Unique identifier for the object. */
  id: string;
  /** String representing the object's type. */
  object: 'subscription_item';
  /** Always true for a deleted object. */
  deleted: true;
}

/** A list of subscription items. */
export interface SubscriptionItemList {
  /** String representing the object's type. Objects of the same type share the same value. Always has the value list. */
  object: 'list';
  /** Details about each object. */
  data: SubscriptionItem[];
  /** True if this list has another page of items after this one that can be fetched. */
  has_more: boolean;
  /** The URL where this list can be accessed. */
  url: string;
}

/** Define thresholds at which an invoice will be sent for a subscription item. */
export interface SubscriptionItemBillingThresholds {
  /** Usage threshold that triggers the subscription to create an invoice. */
  usage_gte: number | null;
}
