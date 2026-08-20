# Flashnet Orchestra rails

Optional pay-in and payout rails. Native `solana:USDC` checkout and payouts are unchanged.

Ledger stays USDC on Solana. Conversion happens only at the Flashnet edge.

## Demo without Flashnet credentials

`SETTLEMENT_RAIL=simulated` (the test default). Leave `ORCHESTRA_API_KEY` unset.

1. Create a **payment-mode** Checkout Session or Payment Link.
2. Open `/c/{slug}`. Methods: Solana wallet, Cash App, Other chain.
3. Choose Cash App or Other chain → Pay → **Simulate payment**.
4. Onboard a seller with Base/USDC (or another listed dest). Payout notes the conversion; simulated sync marks it paid.

Subscriptions stay Solana-wallet only.

## Live

Set both:

```
ORCHESTRA_API_URL=https://your-orchestra-host
ORCHESTRA_API_KEY=fn_...
```

Use a Flashnet **server** key only. Do not put a client key (`fnp_`) in Zoneless or checkout — client keys can set `recipientAddress`.

Pay-in destination is always the platform Solana USDC wallet. Checkout never talks to Flashnet.

Cash App onramps require at least $1.00 (Flashnet's floor).

## Stables (v1)

Pay-in sources: Cash App, plus `base/usdc`, `arbitrum/usdc`, `ethereum/usdc`, `optimism/usdc`, `polygon/usdc`, `tron/usdt`.

Payout dests: the same list. `solana/usdc` stays on the native batch path.

Xchain quotes are exact-in / variable. Checkout copy is “send X on Base to deliver ~$10”.

## Payouts

A non-Solana dest quotes `solana:USDC → dest`. Zoneless signs the existing Solana transfer to `quote.depositAddress`. The payout stays `in_transit` until Orchestra completes, then `POST /v1/payouts/:id/sync`.
