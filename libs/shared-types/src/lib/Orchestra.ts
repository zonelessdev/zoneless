import type { CheckoutSession } from './CheckoutSession';

export type OrchestraMethod = 'cashapp' | 'deposit';

export interface OrchestraSource {
  chain: string; // internal id: base, arbitrum, ethereum, optimism, polygon, tron, solana
  asset: string; // usdc | usdt
  label: string; // "USDC on Base"
}

export interface OrchestraIntent {
  method: OrchestraMethod;
  source_chain: string;
  source_asset: string;
  quote_id: string | null;
  operation_id: string | null;
  deposit_address: string | null;
  deposit_memo: string | null;
  cash_app_url: string | null;
  amount_in: string | null; // source smallest units
  estimated_out: string | null; // dest smallest units
  expires_at: string | null;
  status: string | null; // quoted | awaiting_deposit | processing | completed | failed
}

export interface OrchestraPayinStartResponse {
  object: 'orchestra_payin';
  checkout_session: CheckoutSession;
  intent: OrchestraIntent;
}

export interface OrchestraPayoutIntent {
  quote_id: string | null;
  operation_id: string | null;
  deposit_address: string | null;
  amount_in: string | null;
  estimated_out: string | null;
  destination_chain: string;
  destination_asset: string;
  status: string | null;
}
