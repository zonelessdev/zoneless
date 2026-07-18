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
  GetPlanOwnerPublicKey = jest.fn().mockReturnValue('PlanOwner111');
  GetIncomingUSDCDeposits = jest.fn().mockResolvedValue([]);
  BuildCheckoutPaymentTransaction = jest.fn().mockResolvedValue({
    unsigned_transaction: 'base64tx',
    estimated_fee_lamports: 5000,
    blockhash: 'blockhash123',
    last_valid_block_height: 100000,
  });
  BuildSubscribeTransaction = jest.fn().mockResolvedValue({
    unsigned_transaction: 'base64subscribe',
    estimated_fee_lamports: 5000,
    blockhash: 'blockhash123',
    last_valid_block_height: 100000,
  });
  BuildInitSubscriptionAuthorityTransaction = jest.fn().mockResolvedValue(null);
  WaitForSubscriptionAuthority = jest.fn().mockResolvedValue(undefined);
  VerifyCheckoutPayment = jest.fn().mockResolvedValue({
    verified: true,
    amount_cents: 1000,
    payer_address: 'Payer111',
  });
  VerifySubscribeTransaction = jest.fn().mockResolvedValue({
    verified: true,
    subscriber_address: 'Payer111',
    subscription_delegation_pda: 'SubPda_test',
  });
  CollectSubscriptionPayment = jest.fn().mockResolvedValue({
    signature: 'collect_sig',
  });
  FindExistingSubscriptionDelegation = jest.fn().mockResolvedValue(null);
  CosignAndBroadcastCheckoutTransaction = jest.fn().mockResolvedValue({
    signature: 'checkout_sig',
  });
  CosignAndBroadcastSubscribeTransaction = jest.fn().mockResolvedValue({
    signature: 'subscribe_sig',
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
