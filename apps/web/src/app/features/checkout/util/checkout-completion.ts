import { CheckoutSession, CustomerAddress } from '@zoneless/shared-types';
import { GetCountryName } from '../../../utils';
import { CustomFieldLabel } from './checkout-collection';
import { DEFAULT_CHECKOUT_CONFIRMATION_MESSAGE } from './checkout-format';

export type CheckoutConfirmationSection = {
  key: string;
  label: string;
  lines: string[];
  /** Only shown when the confirmation card is expanded. */
  detailOnly: boolean;
};

export { DEFAULT_CHECKOUT_CONFIRMATION_MESSAGE };

/** Message shown on the hosted confirmation page after payment. */
export function GetCheckoutConfirmationMessage(
  session: CheckoutSession
): string {
  const custom =
    session.after_completion?.hosted_confirmation?.custom_message?.trim();
  return custom || DEFAULT_CHECKOUT_CONFIRMATION_MESSAGE;
}

/**
 * Resolve the post-payment redirect URL from after_completion or success_url,
 * interpolating `{CHECKOUT_SESSION_ID}` when present.
 */
export function GetCheckoutRedirectUrl(
  session: CheckoutSession
): string | null {
  const raw =
    (session.after_completion?.type === 'redirect'
      ? session.after_completion.redirect?.url
      : null) || session.success_url;
  if (!raw?.trim()) return null;
  return raw.replace(/\{CHECKOUT_SESSION_ID\}/g, session.id);
}

/**
 * Build confirmation receipt sections. Summary shows contact + payment;
 * addresses, tax IDs, and custom fields appear under "View all".
 */
export function BuildCheckoutConfirmationSections(
  session: CheckoutSession,
  formatAmount: (cents: number | null | undefined) => string
): CheckoutConfirmationSection[] {
  const details = session.customer_details;
  const shipping = session.collected_information?.shipping_details;

  const contactLines = [
    details?.email?.trim() || session.customer_email?.trim() || '',
    details?.phone?.trim() || '',
  ].filter(Boolean);

  const shippingLines = [
    shipping?.name?.trim() || '',
    ...FormatAddressLines(shipping?.address ?? null),
  ].filter(Boolean);

  const billingLines = [
    details?.business_name?.trim() || details?.individual_name?.trim() || '',
    ...FormatAddressLines(details?.address ?? null),
  ].filter(Boolean);

  const taxId = details?.tax_ids?.[0]?.value?.trim();
  const customFieldSections: CheckoutConfirmationSection[] = [];
  for (const field of session.custom_fields ?? []) {
    const value =
      field.text?.value?.trim() ||
      field.numeric?.value?.trim() ||
      field.dropdown?.value?.trim() ||
      '';
    if (!value) continue;
    customFieldSections.push({
      key: `custom_${field.key}`,
      label: CustomFieldLabel(field),
      lines: [value],
      detailOnly: true,
    });
  }

  const sections: CheckoutConfirmationSection[] = [
    {
      key: 'contact',
      label: 'Contact information',
      lines: contactLines,
      detailOnly: false,
    },
    {
      key: 'shipping',
      label: 'Shipping address',
      lines: shippingLines,
      detailOnly: true,
    },
    {
      key: 'payment',
      label: 'Payment method',
      lines: [`USDC — ${formatAmount(session.amount_total)}`],
      detailOnly: false,
    },
    {
      key: 'billing',
      label: 'Billing address',
      lines: billingLines,
      detailOnly: true,
    },
  ];

  if (taxId) {
    sections.push({
      key: 'tax_id',
      label: 'Tax ID',
      lines: [taxId],
      detailOnly: true,
    });
  }

  return [...sections, ...customFieldSections].filter(
    (section) => section.lines.length > 0
  );
}

export function HasCheckoutConfirmationDetails(
  sections: CheckoutConfirmationSection[]
): boolean {
  return sections.some((section) => section.detailOnly);
}

function FormatAddressLines(
  address: CustomerAddress | null | undefined
): string[] {
  if (!address) return [];
  const cityLine = [address.city, address.state, address.postal_code]
    .map((part) => part?.trim())
    .filter(Boolean)
    .join(', ');
  const country = address.country
    ? GetCountryName(address.country) || address.country
    : '';
  return [
    address.line1?.trim() || '',
    address.line2?.trim() || '',
    cityLine,
    country,
  ].filter(Boolean);
}
