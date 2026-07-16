/**
 * Jest stand-in for `modules/chains/Solana`.
 * Keeps unit tests from loading @solana/kit / @solana/subscriptions.
 */

export interface IncomingDeposit {
  signature: string;
  amount: number;
  amountCents: number;
  senderAddress: string;
  timestamp: number;
  slot: number;
}

export function PlanIdFromPriceId(_priceId: string): bigint {
  return BigInt(1);
}

export function SolanaExplorerUrl(
  type: 'tx' | 'address',
  value: string
): string {
  return `https://explorer.solana.com/${type}/${value}?cluster=devnet`;
}

export class Solana {
  CreateSubscriptionPlan = jest.fn().mockResolvedValue('PlanPda_test');
  CheckWalletExists = jest.fn().mockResolvedValue(true);
  GetUSDCBalance = jest.fn().mockResolvedValue(100);
  GetSOLBalance = jest.fn().mockResolvedValue(1);
  GetUSDCMintAddress = jest.fn().mockReturnValue('UsdcMint_test');
  GetIncomingUSDCDeposits = jest.fn().mockResolvedValue([]);
  BuildCheckoutPaymentTransaction = jest.fn().mockResolvedValue({
    transaction: 'base64tx',
    usdc_mint: 'UsdcMint_test',
  });
  VerifyCheckoutPayment = jest.fn().mockResolvedValue({
    verified: true,
    amount_cents: 1000,
    payer_address: 'Payer111',
  });
  BuildBatchPayoutTransaction = jest.fn().mockResolvedValue({
    unsigned_transaction: 'base64tx',
    estimated_fee_lamports: 5000,
    blockhash: 'blockhash123',
    last_valid_block_height: 100000,
    recipients_count: 1,
  });
  BroadcastSignedTransaction = jest.fn().mockResolvedValue({
    status: 'paid',
    signature: 'sig123',
    viewer_url: 'https://solscan.io/tx/sig123',
  });
}
