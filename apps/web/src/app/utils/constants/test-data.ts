import { PersonFormData } from '../../shared/forms/person-form/person-form.component';
import { ExternalWalletFormData } from '../../shared/forms/external-wallet-form/external-wallet-form.component';
import { SOLANA_NETWORK, SOLANA_CURRENCY } from '../validation/solana';

export const TEST_PERSON_DATA: PersonFormData = {
  firstName: 'Tom',
  lastName: 'Jones',
  email: 'tom.jones@example.com',
  phone: '+1 5551234567',
  dobDay: 1,
  dobMonth: 1,
  dobYear: 1990,
  addressLine1: '123 Test Street',
  addressLine2: '',
  addressCity: 'San Francisco',
  addressState: 'CA',
  addressPostalCode: '94111',
  addressCountry: 'US',
};

export const TEST_WALLET_DATA: ExternalWalletFormData = {
  walletAddress: 'D8VMZCmmTUUfhejNhNQKAmqvZCKfUq1qU6RqQKxQwXyX',
  network: SOLANA_NETWORK,
  currency: SOLANA_CURRENCY,
};
