import { CheckoutSession } from '@zoneless/shared-types';
import {
  CreatePlatform,
  GetAvailable,
  GetLedgerTotal,
  Platform,
} from '../support/Api';
import { IsValidSignature, WebhookListener } from '../support/WebhookListener';

const UNIT_AMOUNT = 2500;
const QUANTITY = 2;
const TOTAL = UNIT_AMOUNT * QUANTITY;

describe('One-time checkout payment', () => {
  const listener = new WebhookListener();
  let platform: Platform;
  let webhookSecret: string;
  let session: CheckoutSession;

  beforeAll(async () => {
    platform = await CreatePlatform('Checkout E2E');
    const { api } = platform;

    const { data: endpoint } = await api.post('/webhook_endpoints', {
      url: await listener.Start(),
      enabled_events: ['checkout.session.completed'],
    });
    webhookSecret = endpoint.secret;

    const { data: customer } = await api.post('/customers', {
      email: 'ada.fenwick@example.com',
      name: 'Ada Fenwick',
    });
    const { data: product } = await api.post('/products', {
      name: 'Field Notebook',
    });
    const { data: price } = await api.post('/prices', {
      product: product.id,
      unit_amount: UNIT_AMOUNT,
      currency: 'usdc',
    });
    const { data: created } = await api.post('/checkout/sessions', {
      mode: 'payment',
      customer: customer.id,
      line_items: [{ price: price.id, quantity: QUANTITY }],
      success_url: 'https://example.com/thanks',
    });
    expect(created).toMatchObject({
      status: 'open',
      payment_status: 'unpaid',
      amount_total: TOTAL,
    });
    expect(await GetAvailable(api)).toBe(0);

    ({ data: session } = await api.post(
      `/test_helpers/checkout/sessions/${created.id}/complete`
    ));
  });

  afterAll(() => listener.Stop());

  it('marks the session complete and paid', async () => {
    const { data } = await platform.api.get(`/checkout/sessions/${session.id}`);

    expect(data).toMatchObject({
      status: 'complete',
      payment_status: 'paid',
      amount_total: TOTAL,
    });
  });

  it('records a succeeded payment intent and charge', async () => {
    const { api } = platform;
    const { data: paymentIntent } = await api.get(
      `/payment_intents/${session.payment_intent}`
    );
    const { data: charge } = await api.get(
      `/charges/${paymentIntent.latest_charge}`
    );

    expect(paymentIntent).toMatchObject({
      status: 'succeeded',
      amount: TOTAL,
      amount_received: TOTAL,
    });
    expect(charge).toMatchObject({
      status: 'succeeded',
      paid: true,
      amount: TOTAL,
      payment_intent: paymentIntent.id,
    });
  });

  it('credits the platform balance with the session total', async () => {
    const { api } = platform;

    expect(await GetAvailable(api)).toBe(TOTAL);
    expect(await GetLedgerTotal(api)).toBe(TOTAL);
  });

  it('refuses to take payment for the same session twice', async () => {
    const { api } = platform;

    await expect(
      api.post(`/test_helpers/checkout/sessions/${session.id}/complete`)
    ).rejects.toMatchObject({ response: { status: 400 } });
    expect(await GetAvailable(api)).toBe(TOTAL);
  });

  it('delivers a signed checkout.session.completed webhook', async () => {
    const webhook = await listener.WaitFor('checkout.session.completed');

    expect(webhook.event.data.object).toMatchObject({
      id: session.id,
      payment_status: 'paid',
    });
    expect(IsValidSignature(webhook, webhookSecret)).toBe(true);
  });
});
