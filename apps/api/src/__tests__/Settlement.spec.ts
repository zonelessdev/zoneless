import {
  SimulatedSettlement,
  SimulatedSignature,
} from '../modules/chains/Settlement';

describe('SimulatedSettlement', () => {
  const settlement = new SimulatedSettlement();

  it('accepts a plausible wallet address', async () => {
    await expect(
      settlement.CheckWalletExists(
        'D8VMZCmmTUUfhejNhNQKAmqvZCKfUq1qU6RqQKxQwXyX'
      )
    ).resolves.toBe(true);
    await expect(settlement.CheckWalletExists('short')).resolves.toBe(false);
  });

  it('verifies a simulated checkout signature', async () => {
    const signature = SimulatedSignature('cs_z_1', 'Payer111');
    const result = await settlement.VerifyCheckoutPayment(signature, {
      merchantWalletAddress: 'Merchant111',
      amountInCents: 1500,
      checkoutSessionId: 'cs_z_1',
    });
    expect(result).toEqual({
      verified: true,
      amount_cents: 1500,
      payer_address: 'Payer111',
    });
  });

  it('rejects a non-simulated checkout signature', async () => {
    const result = await settlement.VerifyCheckoutPayment('real_sig', {
      merchantWalletAddress: 'Merchant111',
      amountInCents: 1500,
      checkoutSessionId: 'cs_z_1',
    });
    expect(result.verified).toBe(false);
  });

  it('skips subscription authority init so checkout is one approval', async () => {
    await expect(
      settlement.BuildInitSubscriptionAuthorityTransaction('Payer111')
    ).resolves.toBeNull();
  });

  it('collects a subscription without hitting a chain', async () => {
    await expect(
      settlement.CollectSubscriptionPayment({
        subscriberWallet: 'Payer111',
        planPda: 'sim_plan_price_z_1',
        subscriptionPda: 'sim_sub_1',
        amountCents: 2000,
      })
    ).resolves.toEqual({
      signature: 'sim_collect:Payer111',
      alreadyCollected: false,
    });
  });

  it('builds and broadcasts a dummy payout without a chain', async () => {
    await expect(
      settlement.BuildBatchPayoutTransaction('Sender111', [
        { destinationAddress: 'Dest111', amountInCents: 500 },
      ])
    ).resolves.toMatchObject({
      unsigned_transaction: 'sim_tx',
      last_valid_block_height: 1,
      recipients_count: 1,
    });
    await expect(
      settlement.BroadcastSignedTransaction('sim_tx')
    ).resolves.toEqual({
      signature: 'sim_sig_payout',
      status: 'paid',
      viewer_url: '',
    });
  });
});
