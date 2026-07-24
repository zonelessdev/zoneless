import type {
  CheckoutSessionLineItem,
  PaymentLink,
  Price,
  Product,
} from '@zoneless/shared-types';
import {
  CustomFieldLabel,
  GetCheckoutCollectionOptions,
} from '../../../checkout/util/checkout-collection';
import { FormatUsdcAmount } from '../../../checkout/util/checkout-format';
import {
  PaymentLinkFormPreviewState,
  PreviewDevice,
  SelectedLineItem,
} from '../components/payment-link-form/payment-link-form.component';

export { FormatUsdcAmount };

export function GetPaymentLinkName(paymentLink: PaymentLink): string {
  const firstItem = paymentLink.line_items?.data?.[0];
  if (firstItem?.description) {
    return firstItem.description;
  }
  return paymentLink.id;
}

export function GetPaymentLinkUnitAmount(paymentLink: PaymentLink): number {
  const firstItem = paymentLink.line_items?.data?.[0];
  if (!firstItem) return 0;
  const price = GetLineItemPrice(firstItem);
  return price?.unit_amount ?? firstItem.amount_total ?? 0;
}

export function FormatPaymentLinkPrice(paymentLink: PaymentLink): string {
  const firstItem = paymentLink.line_items?.data?.[0];
  if (!firstItem) return '—';

  const price = GetLineItemPrice(firstItem);
  const formatted = FormatUsdcAmount(GetPaymentLinkUnitAmount(paymentLink));

  if (price?.recurring) {
    return `${formatted} / ${price.recurring.interval}`;
  }

  return formatted;
}

export function GetLineItemPrice(item: CheckoutSessionLineItem): Price | null {
  return typeof item.price === 'object' && item.price !== null
    ? item.price
    : null;
}

export function GetLineItemProductImage(
  item: CheckoutSessionLineItem
): string | null {
  const price = GetLineItemPrice(item);
  if (!price) return null;
  const product = price.product;
  if (typeof product === 'object' && product !== null) {
    return (product as Product).images?.[0] ?? null;
  }
  return null;
}

export function BuildPaymentLinkPreviewState(
  paymentLink: PaymentLink,
  previewDevice: PreviewDevice = 'desktop'
): PaymentLinkFormPreviewState {
  const lineItems: SelectedLineItem[] = (
    paymentLink.line_items?.data ?? []
  ).map((item) => {
    const price = GetLineItemPrice(item);
    const quantity = item.quantity ?? 1;
    return {
      key: item.id,
      name: item.description ?? 'Product',
      unitAmount:
        price?.unit_amount ??
        (quantity > 0 ? Math.round(item.amount_total / quantity) : 0),
      quantity,
      priceId: typeof item.price === 'string' ? item.price : price?.id ?? '',
      recurringInterval: price?.recurring?.interval ?? null,
    };
  });

  const collection = GetCheckoutCollectionOptions(paymentLink);

  return {
    tab: 'payment',
    linkType: 'products',
    lineItems,
    customTitle: '',
    customPreset: 0,
    collectCustomerNames: collection.collectCustomerNames,
    collectBusinessNames: collection.collectBusinessNames,
    collectBillingAddresses: collection.collectBillingAddresses,
    collectShippingAddresses: collection.collectShippingAddresses,
    collectPhone: collection.collectPhone,
    collectTaxIds: collection.collectTaxIds,
    customFields: (paymentLink.custom_fields ?? []).map((field) => ({
      key: field.key,
      label: CustomFieldLabel(field),
    })),
    allowPromotionCodes: collection.allowPromotionCodes,
    requireTerms: collection.requireTerms,
    savePaymentDetails: !!paymentLink.payment_intent_data?.setup_future_usage,
    afterCompletionMode: paymentLink.after_completion.type,
    customConfirmationMessage:
      paymentLink.after_completion.hosted_confirmation?.custom_message ?? '',
    useCustomConfirmationMessage:
      !!paymentLink.after_completion.hosted_confirmation?.custom_message,
    submitType: paymentLink.submit_type,
    previewDevice,
  };
}

export function FormatYesNo(value: boolean): string {
  return value ? 'Yes' : 'No';
}

export function FormatSubmitTypeLabel(
  submitType: PaymentLink['submit_type']
): string {
  switch (submitType) {
    case 'book':
      return 'Book';
    case 'donate':
      return 'Donate';
    case 'subscribe':
      return 'Subscribe';
    case 'auto':
      return 'Auto';
    case 'pay':
    default:
      return 'Pay';
  }
}

export function FormatCollectAddresses(paymentLink: PaymentLink): string {
  const billing = paymentLink.billing_address_collection === 'required';
  const shipping = !!paymentLink.shipping_address_collection;
  if (billing && shipping) return 'Billing and shipping';
  if (shipping) return 'Shipping address';
  if (billing) return 'Billing address';
  return 'None required';
}

export function FormatConfirmationPage(paymentLink: PaymentLink): string {
  if (paymentLink.after_completion.type === 'redirect') {
    return paymentLink.after_completion.redirect?.url ?? 'Redirect';
  }
  if (paymentLink.after_completion.hosted_confirmation?.custom_message) {
    return 'Custom';
  }
  return 'Default';
}

export function FormatDeactivatedLinkPage(paymentLink: PaymentLink): string {
  return paymentLink.inactive_message ? 'Custom' : 'Default';
}

export function FormatLimitedUse(paymentLink: PaymentLink): string {
  const restriction = paymentLink.restrictions?.completed_sessions;
  if (!restriction) return 'No';
  return `Yes · ${restriction.count} of ${restriction.limit} used`;
}

/** True when the link can still accept new checkout sessions. */
export function IsPaymentLinkActive(paymentLink: PaymentLink): boolean {
  if (!paymentLink.active) return false;
  const restriction = paymentLink.restrictions?.completed_sessions;
  if (restriction && restriction.count >= restriction.limit) return false;
  return true;
}
