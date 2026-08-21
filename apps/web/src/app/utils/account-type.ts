import { Account, AccountBusinessType } from '@zoneless/shared-types';

/**
 * True when the account represents a legal entity rather than a person.
 */
export function IsBusinessAccount(
  account:
    | Account
    | { business_type?: AccountBusinessType | null }
    | null
    | undefined
): boolean {
  const type = account?.business_type;
  return (
    type === 'company' || type === 'non_profit' || type === 'government_entity'
  );
}

const BUSINESS_TYPE_LABELS: Record<AccountBusinessType, string> = {
  individual: 'Individual',
  company: 'Company',
  non_profit: 'Non-profit',
  government_entity: 'Government entity',
};

/**
 * Human-readable label for Account.business_type.
 */
export function FormatBusinessType(
  businessType: AccountBusinessType | null | undefined
): string {
  if (!businessType) return BUSINESS_TYPE_LABELS.individual;
  return BUSINESS_TYPE_LABELS[businessType];
}
