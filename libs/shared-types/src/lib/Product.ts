import { Price } from './Price';

/**
 * Stripe-compatible Balance Product object for Zoneless.
 * Represents a product that can be sold.
 *
 * @see https://docs.stripe.com/api/products/object
 */
export interface Product {
  /** Unique identifier for the object. */
  id: string;
  /** String representing the object's type. Objects of the same type share the same value. */
  object: string;
  /** Whether the product is currently available for purchase. */
  active: boolean;
  /** Time at which the object was created. Measured in seconds since the Unix epoch.*/
  created: number;
  /** The ID of the Price object that is the default price for this product.*/
  default_price: string | Price | null;
  /** The product’s description, meant to be displayable to the customer. Use this field to optionally store a long form explanation of the product being sold for your own rendering purposes.*/
  description: string | null;
  /** A list of up to 8 URLs of images for this product, meant to be displayable to the customer.*/
  images: string[];
  /** A list of up to 15 marketing features for this product. These are displayed in pricing tables.*/
  marketing_features: MarketingFeature[];
  /** If the object exists in live mode, the value is true. If the object exists in test mode, the value is false.*/
  livemode: boolean;
  /** Set of key-value pairs that you can attach to an object. This can be useful for storing additional information about the object in a structured format.*/
  metadata: Record<string, string>;
  /** The product’s name, meant to be displayable to the customer.*/
  name: string;
  /** The dimensions of this product for shipping purposes.*/
  package_dimensions: PackageDimensions | null;
  /** Whether this product is shipped (i.e., physical goods).*/
  shippable: boolean | null;
  /** Extra information about a product which will appear on your customer’s statement. In the case that multiple products are billed at once, the first statement descriptor will be used. Only used for subscription payments.*/
  statement_descriptor: string | null;
  /** A tax code ID.*/
  tax_code: string | null;
  /** A label that represents units of this product. When set, this will be included in customers’ receipts, invoices, Checkout, and the customer portal.*/
  unit_label: string | null;
  /** Time at which the object was last updated. Measured in seconds since the Unix epoch.*/
  updated: number;
  /** A URL of a publicly-accessible webpage for this product.*/
  url: string | null;
  /**
   * The platform account that owns this resource.
   * @zoneless_extension
   */
  platform_account: string;
}

export interface PackageDimensions {
  /** */
  /** Height, in inches.*/
  height: number;
  /** Length, in inches.*/
  length: number;
  /** Weight, in ounces.*/
  weight: number;
  /** Width, in inches.*/
  width: number;
}

export interface MarketingFeature {
  /** The marketing feature name. Up to 80 characters long.*/
  name: string | null;
}

/**
 * Deleted product response object.
 */
export interface ProductDeleted {
  /** Unique identifier for the object */
  id: string;
  /** String representing the object's type */
  object: 'product';
  /** Always true for a deleted object */
  deleted: true;
}
