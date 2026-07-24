import { CheckoutSession, PaymentLink } from '@zoneless/shared-types';

/** Collection flags shared by hosted checkout and the payment-link preview. */
export interface CheckoutCollectionOptions {
  collectCustomerNames: boolean;
  collectBusinessNames: boolean;
  collectBillingAddresses: boolean;
  collectShippingAddresses: boolean;
  collectPhone: boolean;
  allowPromotionCodes: boolean;
  requireTerms: boolean;
  collectTaxIds: boolean;
}

type CollectionSource = Pick<
  CheckoutSession | PaymentLink,
  | 'name_collection'
  | 'billing_address_collection'
  | 'shipping_address_collection'
  | 'phone_number_collection'
  | 'allow_promotion_codes'
  | 'consent_collection'
  | 'tax_id_collection'
>;

/**
 * Derive which customer fields the hosted checkout (or preview) should show
 * from a Payment Link or Checkout Session collection config.
 */
export function GetCheckoutCollectionOptions(
  source: CollectionSource
): CheckoutCollectionOptions {
  return {
    collectCustomerNames: !!source.name_collection?.individual?.enabled,
    collectBusinessNames: !!source.name_collection?.business?.enabled,
    collectBillingAddresses: source.billing_address_collection === 'required',
    collectShippingAddresses: !!source.shipping_address_collection,
    collectPhone: !!source.phone_number_collection?.enabled,
    allowPromotionCodes: !!source.allow_promotion_codes,
    requireTerms: source.consent_collection?.terms_of_service === 'required',
    collectTaxIds: !!source.tax_id_collection?.enabled,
  };
}

/** Label text for a checkout / payment-link custom field. */
export function CustomFieldLabel(field: {
  key: string;
  label: { custom: string | null };
}): string {
  return field.label.custom?.trim() || field.key;
}
