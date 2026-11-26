import { isAxiosError } from 'axios';
import { CheckoutSession, Payout } from '@zoneless/shared-types';
import { AsAccount, CreateClient, GetAvailable } from '../support/Api';
import { RetryWhile } from '../support/Retry';
import { LoadWallet, SignCheckoutPayment, SignPayout } from '../support/Wallet';

const AMOUNT = 1;
// The network sometimes drops a transaction, and the API then gives up
// waiting for it. That says nothing about the deployed code, so the payment
// is tried again with a fresh session before the check fails.
const PAYMENT_ATTEMPTS = 3;
const PAYMENT_TIMEOUT_MS = 240_000;
const READ_TIMEOUT_MS = 30_000;

function RequireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set`);
  return value;
}

function IsConfirmationTimeout(error: unknown): boolean {
  return (
    isAxiosError(error) &&
    error.response?.data?.error?.message ===
      'Transaction confirmation timed out'
  );
}

/** A payout the network did not confirm. The API refunds it, so it can be requested again. */
class PayoutNotConfirmed extends Error {}

const apiUrl = RequireEnv('CANARY_API_URL');
const platform = CreateClient(apiUrl, {
  'x-api-key': RequireEnv('CANARY_API_KEY'),
});
const customer = CreateClient(apiUrl);
const wallet = LoadWallet(RequireEnv('CANARY_WALLET_SECRET_KEY'));

/**
 * Makes one real payment through a deployed API: a one-cent Checkout Session
 * paid on-chain from a dedicated wallet. Assertions compare single fields so
 * a failure does not print whole API objects into the run log.
 */
describe('Live checkout payment', () => {
  let session: CheckoutSession;

  beforeAll(async () => {
    const { data: product } = await platform.post('/products', {
      name: 'Canary payment',
    });
    const { data: price } = await platform.post('/prices', {
      product: product.id,
      unit_amount: AMOUNT,
      currency: 'usdc',
    });

    session = await RetryWhile(
      PAYMENT_ATTEMPTS,
      IsConfirmationTimeout,
      async () => {
        const { data: created } = await platform.post('/checkout/sessions', {
          mode: 'payment',
          line_items: [{ price: price.id, quantity: 1 }],
          success_url: 'https://example.com/canary',
        });
        const paymentPage = `/payment_pages/${new URL(created.url).pathname
          .split('/')
          .pop()}`;

        const { data: prepared } = await customer.post(
          `${paymentPage}/prepare`,
          {
            payer_wallet: wallet.publicKey.toBase58(),
            email: 'canary@example.com',
          }
        );
        expect(prepared.amount_total).toBe(AMOUNT);

        const { data: paid } = await customer.post(`${paymentPage}/confirm`, {
          signed_transaction: SignCheckoutPayment(
            prepared.unsigned_transaction,
            wallet,
            AMOUNT
          ),
        });
        return paid;
      }
    );
  }, PAYMENT_TIMEOUT_MS);

  it('completes the session as paid', () => {
    expect(session.status).toBe('complete');
    expect(session.payment_status).toBe('paid');
    expect(session.amount_total).toBe(AMOUNT);
  });

  it(
    'records a succeeded charge and a ledger entry for one cent',
    async () => {
      const { data: paymentIntent } = await platform.get(
        `/payment_intents/${session.payment_intent}`
      );
      const { data: charge } = await platform.get(
        `/charges/${paymentIntent.latest_charge}`
      );
      const { data: transaction } = await platform.get(
        `/balance_transactions/${charge.balance_transaction}`
      );

      expect(paymentIntent.status).toBe('succeeded');
      expect(charge.status).toBe('succeeded');
      expect(charge.amount).toBe(AMOUNT);
      expect(transaction.type).toBe('payment');
      expect(transaction.net).toBe(AMOUNT);
    },
    READ_TIMEOUT_MS
  );
});

const platformWalletKey = process.env.CANARY_PLATFORM_WALLET_SECRET_KEY;
const describePayout = platformWalletKey ? describe : describe.skip;

/**
 * Pays that cent back out: a transfer to a connected account, then a payout
 * to its wallet, signed by the platform wallet. The connected account must
 * pay out to the wallet that makes the checkout payment, so the same cent
 * goes round on every run.
 */
describePayout('Live payout', () => {
  let payout: Payout;

  /** The connected account whose payout wallet is the checkout wallet. */
  async function FindPayoutAccount(): Promise<string> {
    const { data: accounts } = await platform.get('/accounts', {
      params: { limit: 100 },
    });
    for (const account of accounts.data) {
      if (!account.payouts_enabled) continue;
      const { data: wallets } = await platform.get(
        `/accounts/${account.id}/external_accounts`
      );
      const paysCheckoutWallet = wallets.data.some(
        (external: { wallet_address: string }) =>
          external.wallet_address === wallet.publicKey.toBase58()
      );
      if (paysCheckoutWallet) return account.id;
    }
    throw new Error(
      'No connected account with payouts enabled pays out to the checkout wallet'
    );
  }

  beforeAll(async () => {
    const platformWallet = LoadWallet(platformWalletKey as string);
    const { data: self } = await platform.get('/accounts/me');
    const { data: ownWallets } = await platform.get(
      `/accounts/${self.id}/external_accounts`
    );
    const sendingWallet =
      ownWallets.data.find(
        (own: { default_for_currency: boolean | null }) =>
          own.default_for_currency
      ) ?? ownWallets.data[0];
    if (sendingWallet?.wallet_address !== platformWallet.publicKey.toBase58()) {
      throw new Error(
        'CANARY_PLATFORM_WALLET_SECRET_KEY is not the key of the platform wallet'
      );
    }

    const accountId = await FindPayoutAccount();
    // A cent left over from an earlier run that never paid out is used first.
    if ((await GetAvailable(platform, accountId)) < AMOUNT) {
      await platform.post('/transfers', {
        amount: AMOUNT,
        currency: 'usdc',
        destination: accountId,
      });
    }

    payout = await RetryWhile(
      PAYMENT_ATTEMPTS,
      (error) => error instanceof PayoutNotConfirmed,
      async () => {
        const { data: created } = await platform.post(
          '/payouts',
          { amount: AMOUNT, currency: 'usdc' },
          AsAccount(accountId)
        );
        // A payout that is refused before it is broadcast would stay pending
        // with its cent held, so it is cancelled.
        try {
          const { data: built } = await platform.post('/payouts/build', {
            payouts: [created.id],
          });
          expect(built.total_amount).toBe(AMOUNT);

          const { data: broadcast } = await platform.post(
            '/payouts/broadcast',
            {
              signed_transaction: SignPayout(
                built.unsigned_transaction,
                platformWallet,
                wallet.publicKey,
                AMOUNT
              ),
              payouts: [created.id],
              blockhash: built.blockhash,
              last_valid_block_height: built.last_valid_block_height,
            }
          );
          if (broadcast.status !== 'paid') throw new PayoutNotConfirmed();
        } catch (error) {
          if (!(error instanceof PayoutNotConfirmed)) {
            await platform
              .post(`/payouts/${created.id}/cancel`)
              .catch(() => undefined);
          }
          throw error;
        }
        return created;
      }
    );
  }, PAYMENT_TIMEOUT_MS);

  it(
    'marks the payout paid',
    async () => {
      const { data } = await platform.get(`/payouts/${payout.id}`);

      expect(data.status).toBe('paid');
      expect(data.amount).toBe(AMOUNT);
    },
    READ_TIMEOUT_MS
  );
});
