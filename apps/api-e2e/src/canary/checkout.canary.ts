import { CheckoutSession } from '@zoneless/shared-types';
import { CreateClient } from '../support/Api';
import { LoadWallet, SignCheckoutPayment } from '../support/Wallet';

const AMOUNT = 1;
// An on-chain payment can take a while to confirm.
const PAYMENT_TIMEOUT_MS = 120_000;
const READ_TIMEOUT_MS = 30_000;

function RequireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set`);
  return value;
}

/**
 * Makes one real payment through a deployed API: a one-cent Checkout Session
 * paid on-chain from a dedicated wallet. Assertions compare single fields so
 * a failure does not print whole API objects into the run log.
 */
describe('Live checkout payment', () => {
  const apiUrl = RequireEnv('CANARY_API_URL');
  const platform = CreateClient(apiUrl, {
    'x-api-key': RequireEnv('CANARY_API_KEY'),
  });
  const customer = CreateClient(apiUrl);
  const wallet = LoadWallet(RequireEnv('CANARY_WALLET_SECRET_KEY'));
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
    const { data: created } = await platform.post('/checkout/sessions', {
      mode: 'payment',
      line_items: [{ price: price.id, quantity: 1 }],
      success_url: 'https://example.com/canary',
    });
    const paymentPage = `/payment_pages/${new URL(created.url).pathname
      .split('/')
      .pop()}`;

    const { data: prepared } = await customer.post(`${paymentPage}/prepare`, {
      payer_wallet: wallet.publicKey.toBase58(),
      email: 'canary@example.com',
    });
    expect(prepared.amount_total).toBe(AMOUNT);

    ({ data: session } = await customer.post(`${paymentPage}/confirm`, {
      signed_transaction: SignCheckoutPayment(
        prepared.unsigned_transaction,
        wallet,
        AMOUNT
      ),
    }));
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
