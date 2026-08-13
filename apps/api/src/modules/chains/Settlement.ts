/**
 * Settlement rail selection and the simulated (no-chain) implementation.
 *
 * Test mode defaults to simulated funds. Set SETTLEMENT_RAIL=onchain with
 * LIVEMODE=false to use Solana Devnet (internal escape hatch).
 *
 * @module Settlement
 */

import { GetAppConfig } from '../AppConfig';
import {
  CheckoutPaymentVerification,
  CheckoutSubscribeVerification,
  Solana,
} from './Solana';

export type SettlementRail = 'simulated' | 'onchain';

const SIM_SIG_PREFIX = 'sim_sig:';

/** Default payer used by simulated checkout and test helpers. */
export const SIMULATED_TEST_WALLET =
  'D8VMZCmmTUUfhejNhNQKAmqvZCKfUq1qU6RqQKxQwXyX';

export function IsSimulatedSettlement(): boolean {
  return GetAppConfig().settlement_rail === 'simulated';
}

export function SimulatedSignature(
  checkoutSessionId: string,
  payerWallet: string
): string {
  return `${SIM_SIG_PREFIX}${checkoutSessionId}:${payerWallet}`;
}

function DummyUnsignedTransaction() {
  return {
    unsigned_transaction: 'sim_tx',
    estimated_fee_lamports: 0,
    blockhash: 'sim_blockhash',
    last_valid_block_height: 1,
    min_context_slot: 0,
  };
}

function PayerFromSimulatedSignature(signature: string): string | null {
  if (!signature.startsWith(SIM_SIG_PREFIX)) return null;
  const rest = signature.slice(SIM_SIG_PREFIX.length);
  const separator = rest.indexOf(':');
  if (separator < 0) return rest || null;
  return rest.slice(separator + 1) || null;
}

/**
 * In-process stand-in for Solana. Same method names as `Solana` so call
 * sites can swap via GetSettlement() without per-flow branching.
 */
export class SimulatedSettlement {
  async CheckWalletExists(address: string): Promise<boolean> {
    return typeof address === 'string' && address.length >= 32;
  }

  async GetSOLBalance(_publicKeyString: string): Promise<number> {
    return 0;
  }

  async GetUSDCBalance(_publicKeyString: string): Promise<number> {
    return 0;
  }

  GetUSDCMintAddress(): string {
    return 'simulated';
  }

  GetPlanOwnerPublicKey(): string {
    return 'SimulatedPlanOwner111111111111111111111';
  }

  async GetIncomingDeposits() {
    return [];
  }

  async BuildCheckoutPaymentTransaction(
    _payerPublicKey: string,
    _merchantWalletAddress: string,
    _amountInCents: number,
    _checkoutSessionId: string,
    _options?: { feeSponsored?: boolean }
  ) {
    return DummyUnsignedTransaction();
  }

  async BuildInitSubscriptionAuthorityTransaction(
    _subscriberWallet: string,
    _options?: { feeSponsored?: boolean }
  ) {
    return null;
  }

  async BuildSubscribeTransaction(
    _subscriberWallet: string,
    _priceId: string,
    _planPda: string,
    _options?: { feeSponsored?: boolean }
  ) {
    return DummyUnsignedTransaction();
  }

  async WaitForSubscriptionAuthority(_subscriberWallet: string): Promise<void> {
    return;
  }

  async ValidateAndBroadcastCheckoutTransaction(
    signedByCustomerBase64: string
  ): Promise<{ signature: string }> {
    return { signature: signedByCustomerBase64 || 'sim_sig_broadcast' };
  }

  async FindExistingSubscriptionDelegation(
    _planPda: string,
    _subscriberWallet: string
  ): Promise<string | null> {
    return null;
  }

  async VerifySubscribeTransaction(
    _signature: string,
    expected: {
      planPda: string;
      subscriberWallet: string;
    }
  ): Promise<CheckoutSubscribeVerification> {
    return {
      verified: true,
      subscriber_address: expected.subscriberWallet,
      subscription_delegation_pda: `sim_sub_${expected.planPda}_${expected.subscriberWallet}`,
    };
  }

  async CollectSubscriptionPayment(params: {
    subscriberWallet: string;
    planPda: string;
    subscriptionPda: string;
    amountCents: number;
    destinationWallet?: string;
  }): Promise<{ signature: string; alreadyCollected: boolean }> {
    return {
      signature: `sim_collect:${params.subscriberWallet}`,
      alreadyCollected: false,
    };
  }

  async VerifyCheckoutPayment(
    signature: string,
    expected: {
      merchantWalletAddress: string;
      amountInCents: number;
      checkoutSessionId: string;
    }
  ): Promise<CheckoutPaymentVerification> {
    const payerAddress = PayerFromSimulatedSignature(signature);
    if (!payerAddress) {
      return {
        verified: false,
        amount_cents: 0,
        payer_address: null,
        failure_reason: 'Invalid simulated payment',
      };
    }
    return {
      verified: true,
      amount_cents: expected.amountInCents,
      payer_address: payerAddress,
    };
  }

  async CreateSubscriptionPlan(
    priceId: string,
    _periodHours: number,
    _amountCents: number,
    _destinationAddress: string,
    _pullerAddress: string
  ): Promise<string> {
    return `sim_plan_${priceId}`;
  }

  async BuildBatchPayoutTransaction(
    _senderPublicKey: string,
    recipients: { destinationAddress: string; amountInCents: number }[]
  ): Promise<{
    unsigned_transaction: string;
    estimated_fee_lamports: number;
    blockhash: string;
    last_valid_block_height: number;
    recipients_count: number;
  }> {
    return {
      ...DummyUnsignedTransaction(),
      recipients_count: recipients.length,
    };
  }

  async BroadcastSignedTransaction(_signedTransaction: string): Promise<{
    signature: string;
    status: 'paid' | 'failed';
    viewer_url: string;
    failure_message?: string;
  }> {
    return {
      signature: 'sim_sig_payout',
      status: 'paid',
      viewer_url: '',
    };
  }
}

export type Settlement = Solana | SimulatedSettlement;

export function GetSettlement(): Settlement {
  return IsSimulatedSettlement() ? new SimulatedSettlement() : new Solana();
}
