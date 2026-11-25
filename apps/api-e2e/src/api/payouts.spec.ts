import { AxiosInstance } from 'axios';
import {
  AsAccount,
  CreatePlatform,
  GetAvailable,
  GetLedgerTotal,
  NewWalletAddress,
  Platform,
} from '../support/Api';

const FUNDING = 10000;
const TRANSFER = 3000;

/** Onboards a connected account far enough for payouts to be enabled. */
async function CreatePayableAccount(api: AxiosInstance): Promise<string> {
  const { data: account } = await api.post('/accounts', {
    type: 'express',
    email: 'tomas.reyes@example.com',
    country: 'US',
  });
  const { data: persons } = await api.get(`/accounts/${account.id}/persons`);
  await api.post(`/accounts/${account.id}/persons/${persons.data[0].id}`, {
    first_name: 'Tomas',
    last_name: 'Reyes',
    dob: { day: 9, month: 6, year: 1988 },
    address: {
      line1: '418 Alder Street',
      city: 'Portland',
      state: 'OR',
      postal_code: '97204',
      country: 'US',
    },
    phone: '+14155552671',
  });
  await api.post(`/accounts/${account.id}/external_accounts`, {
    wallet_address: NewWalletAddress(),
  });
  return account.id;
}

describe('Transfer and payout to a connected account', () => {
  let platform: Platform;
  let accountId: string;

  beforeAll(async () => {
    platform = await CreatePlatform('Payouts E2E');
    const { api } = platform;

    await api.post('/test_helpers/treasury/topups', { amount: FUNDING });
    accountId = await CreatePayableAccount(api);
  });

  it('enables payouts once the account is onboarded', async () => {
    const { data } = await platform.api.get(`/accounts/${accountId}`);

    expect(data.payouts_enabled).toBe(true);
  });

  it('moves funds from the platform to the connected account', async () => {
    const { api } = platform;

    await api.post('/transfers', {
      amount: TRANSFER,
      currency: 'usdc',
      destination: accountId,
    });

    expect(await GetAvailable(api)).toBe(FUNDING - TRANSFER);
    expect(await GetAvailable(api, accountId)).toBe(TRANSFER);
  });

  it('rejects a transfer larger than the platform balance', async () => {
    const { api } = platform;

    await expect(
      api.post('/transfers', {
        amount: FUNDING,
        currency: 'usdc',
        destination: accountId,
      })
    ).rejects.toMatchObject({
      response: { data: { error: { type: 'insufficient_funds' } } },
    });
    expect(await GetAvailable(api)).toBe(FUNDING - TRANSFER);
    expect(await GetAvailable(api, accountId)).toBe(TRANSFER);
  });

  it('pays the connected account out through build and broadcast', async () => {
    const { api } = platform;

    const { data: payout } = await api.post(
      '/payouts',
      { amount: TRANSFER, currency: 'usdc' },
      AsAccount(accountId)
    );
    expect(payout.status).toBe('pending');
    expect(await GetAvailable(api, accountId)).toBe(0);

    const { data: built } = await api.post('/payouts/build', {
      payouts: [payout.id],
    });
    expect(built).toMatchObject({
      total_amount: TRANSFER,
      recipients_count: 1,
    });

    const { data: broadcast } = await api.post('/payouts/broadcast', {
      signed_transaction: built.unsigned_transaction,
      payouts: [payout.id],
    });
    expect(broadcast.status).toBe('paid');

    const { data: paid } = await api.get(`/payouts/${payout.id}`);
    expect(paid).toMatchObject({ status: 'paid', amount: TRANSFER });
  });

  it('rejects a payout larger than the connected balance', async () => {
    await expect(
      platform.api.post(
        '/payouts',
        { amount: 1, currency: 'usdc' },
        AsAccount(accountId)
      )
    ).rejects.toMatchObject({
      response: { data: { error: { type: 'insufficient_funds' } } },
    });
  });

  it('keeps both ledgers equal to their balances', async () => {
    const { api } = platform;

    expect(await GetLedgerTotal(api)).toBe(FUNDING - TRANSFER);
    expect(await GetAvailable(api)).toBe(FUNDING - TRANSFER);
    expect(await GetLedgerTotal(api, accountId)).toBe(0);
    expect(await GetAvailable(api, accountId)).toBe(0);
  });
});
