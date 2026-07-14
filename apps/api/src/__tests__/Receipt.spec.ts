import express from 'express';
import { AddressInfo } from 'net';
import { Server } from 'http';
import receiptsRouter from '../routes/receipts.routes';
import { db } from '../modules/Database';
import { Charge } from '@zoneless/shared-types';

const TEST_DASHBOARD_URL = 'http://localhost:4200';

describe('Receipt routes', () => {
  let server: Server;
  let baseUrl: string;

  beforeEach(async () => {
    const app = express();
    app.use('/v1/receipts', receiptsRouter);

    server = await new Promise<Server>((resolve) => {
      const listeningServer = app.listen(0, () => resolve(listeningServer));
    });

    const address = server.address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${address.port}`;
  });

  afterEach(async () => {
    jest.restoreAllMocks();
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  });

  it('should return HTML for a valid Charge receipt', async () => {
    jest.spyOn(db, 'Get').mockResolvedValue(ChargeFixture());

    const response = await fetch(`${baseUrl}/v1/receipts/ch_z_receipt`);
    const html = await response.text();

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('text/html');
    expect(html).toContain('Payment receipt');
    expect(html).toContain('12.34 USDC');
    expect(html).toContain('ch_z_receipt');
    expect(html).toContain('rcpt_ch_z_receipt');
    expect(html).toContain('Hosted checkout payment');
    expect(html).toContain('sig_123');
    expect(html).toContain('https://explorer.solana.com/tx/sig_123');
  });

  it('should render pending, failed, and refunded receipt states', async () => {
    const cases: Array<{
      charge: Charge;
      expectedLabel: string;
      expectedMessage: string;
    }> = [
      {
        charge: ChargeFixture({
          captured: false,
          status: 'pending',
          amount_captured: 0,
        }),
        expectedLabel: 'Pending',
        expectedMessage: 'This payment is still processing.',
      },
      {
        charge: ChargeFixture({
          captured: false,
          paid: false,
          status: 'failed',
          amount_captured: 0,
        }),
        expectedLabel: 'Failed',
        expectedMessage: 'This payment could not be completed.',
      },
      {
        charge: ChargeFixture({
          refunded: true,
          amount_refunded: 1234,
        }),
        expectedLabel: 'Refunded',
        expectedMessage: 'This payment has been refunded.',
      },
      {
        charge: ChargeFixture({
          amount_refunded: 500,
        }),
        expectedLabel: 'Partially refunded',
        expectedMessage: 'Part of this payment has been refunded.',
      },
    ];

    for (const testCase of cases) {
      jest.spyOn(db, 'Get').mockResolvedValueOnce(testCase.charge);

      const response = await fetch(`${baseUrl}/v1/receipts/ch_z_receipt`);
      const html = await response.text();

      expect(response.status).toBe(200);
      expect(html).toContain(testCase.expectedLabel);
      expect(html).toContain(testCase.expectedMessage);
    }
  });

  it('should return a clean 404 page when the Charge is missing', async () => {
    jest.spyOn(db, 'Get').mockResolvedValue(null);

    const response = await fetch(`${baseUrl}/v1/receipts/ch_z_missing`);
    const html = await response.text();

    expect(response.status).toBe(404);
    expect(response.headers.get('content-type')).toContain('text/html');
    expect(html).toContain('Receipt not found');
    expect(html).toContain('could not find a receipt');
  });
});

function ChargeFixture(overrides: Partial<Charge> = {}): Charge {
  const charge: Charge = {
    id: 'ch_z_receipt',
    object: 'charge',
    amount: 1234,
    amount_captured: 1234,
    amount_refunded: 0,
    application: null,
    application_fee: null,
    application_fee_amount: null,
    balance_transaction: null,
    billing_details: {
      address: null,
      email: null,
      name: null,
      phone: null,
      tax_id: null,
    },
    calculated_statement_descriptor: null,
    captured: true,
    created: 1700000000,
    currency: 'usdc',
    customer: null,
    description: 'Hosted checkout payment',
    disputed: false,
    failure_balance_transaction: null,
    failure_code: null,
    failure_message: null,
    fraud_details: {},
    livemode: false,
    metadata: {},
    on_behalf_of: null,
    outcome: null,
    paid: true,
    payment_intent: 'pi_z_receipt',
    payment_method: 'PayerWallet111',
    payment_method_details: {
      type: 'crypto',
      crypto: {
        buyer_address: 'PayerWallet111',
        fingerprint: null,
        network: 'solana',
        token_currency: 'usdc',
        transaction_hash: 'sig_123',
      },
    },
    presentment_details: null,
    radar_options: null,
    receipt_email: null,
    receipt_number: 'rcpt_ch_z_receipt',
    receipt_url: `${TEST_DASHBOARD_URL}/v1/receipts/ch_z_receipt`,
    refunded: false,
    refunds: null,
    review: null,
    shipping: null,
    source_transfer: null,
    statement_descriptor: null,
    statement_descriptor_suffix: null,
    status: 'succeeded',
    transfer: null,
    transfer_data: null,
    transfer_group: null,
    platform_account: 'acct_z_platform',
  };
  return { ...charge, ...overrides };
}
