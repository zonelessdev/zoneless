---
name: zoneless-marketplace
description: Adds Zoneless Cloud as an optional USDC marketplace payout method while preserving existing checkout and payout providers. Use when integrating seller onboarding, connected accounts, transfers, payouts, or migrating payout infrastructure to Zoneless.
---

# Add Zoneless marketplace payouts

Add Zoneless as a separate payout provider. Do not replace checkout or remove an
existing Stripe, PayPal, Payoneer, wire-transfer, or custom payout path unless
the human explicitly asks for that additional work.

## Safety requirements

- Never request, read, print, export, transmit, or commit an API key, wallet
  private key, seed phrase, or secret-manager value.
- Never run `wallet backup` for the human. At handoff, tell the human to run it
  themselves in an interactive terminal and place the result directly in their
  deployment secret manager.
- Work in the test profile. Do not create live-mode application data, fund a
  wallet, submit a transaction, broadcast a payout, or switch production
  traffic.
- Keep all secret-key handling server-side. Never add it to browser code,
  public environment files, logs, fixtures, or test snapshots.
- Preserve existing checkout, payout providers, credentials, routes, jobs,
  webhooks, seller preferences, and historical provider IDs.
- Stop before a destructive schema change or an ambiguous money movement.
  Ask the human rather than guessing.

## Assume no crypto knowledge

Use plain language whenever the human must act. Briefly explain that USDC is a
digital dollar, Solana is the network carrying it, SOL pays the small network
fee, a wallet address is safe to share, and a wallet secret key authorizes
spending and must remain private. Explain that devnet/test mode uses free,
worthless test funds on a network separate from mainnet/live mode, and that a
faucet is a website that supplies those test funds. Do not use terms such as
gas, mint, token account, cluster, or airdrop without explaining them.

Give concrete instructions: name the network and asset, say where to copy the
public wallet address, link the relevant guide or faucet, and distinguish test
funds from real funds. Never assume prior wallet or blockchain experience.

## Read documentation just in time

Start with `https://zoneless.com/docs/api-quickstart.md`. Use
`https://zoneless.com/llms.txt` as an index and read a resource page only when
implementing that resource or when blocked. Do not fetch the entire docs set
upfront.

For most integrations, the additional pages needed are connected accounts,
account links, transfers, payouts, and webhooks. Read build and broadcast only
when using the explicit payout-ID workflow described below.

## Confirm the local setup

Run:

```bash
npx @zoneless/cli@latest doctor --json
```

If no profile exists, run the setup command with a platform name inferred from
the project:

```bash
npx @zoneless/cli@latest agent setup \
  --platform-name "<marketplace name>" \
  --skill marketplace \
  --json
```

If setup reports that profiles already exist for a different platform, rerun
the same command with `--new-platform`. Reuse profiles that already belong to
this marketplace; do not create duplicates.

Show the returned `verification_url` and `user_code`, then wait. Do not approve
the request for the human. Setup stores test and live credentials in the
operating-system credential store without printing them and binds this
repository to those profiles in `.zoneless/project.json`. Continue with the
bound test profile after approval.

Setup validates stored keys before reusing them. If it reports
`credentials_invalid`, run:

```bash
npx @zoneless/cli@latest auth reconnect --json
```

Show the new authorization prompt to the human, then retry setup after
reconnection.

For local test execution, inject the bound test credentials into the project's
local env file without displaying or reading them:

```bash
npx @zoneless/cli@latest env sync --include-wallet --json
```

If the command reports multiple environment files, infer the server's actual
env file from its scripts and framework, then rerun once with
`--target <relative-path>`. Do not print the file or return its values. The
command preserves unrelated variables, ignores the target in Git, and writes
owner-only permissions. For deployment, add only environment variable names
and secret-manager references; the human supplies live values during handoff.

## Use test mode, then hand off live promotion

Setup provisions both test and live profiles and makes test the current CLI
profile. Implement and verify against `https://api-test.zoneless.com`; do not
ask the human to choose live mode during the migration.

Keep mode environment-driven rather than hardcoded. At handoff, explain that
going live means configuring the separately provisioned live API key and
`https://api.zoneless.com` in the deployment secret manager, configuring the
live webhook secret, funding the live platform wallet, and completing one
human-supervised payout before enabling live traffic.

## Classify before editing

Inspect checkout separately from payouts, then choose the matching path:

1. **Existing payout ledger:** seller earnings already accrue in a balance and
   an existing job or withdrawal flow pays them. Stripe separate charges and
   transfers usually belong here when the platform charges first and transfers
   to the seller later. Add Zoneless as another branch in that flow.
2. **Immediate seller payment at checkout:** Stripe destination charges, direct
   charges, PayPal split payments, or similar pay the seller as part of the
   sale. Preserve that behavior for existing providers. For a seller who opts
   into Zoneless, collect the charge on the platform instead, record only that
   seller's net earnings, and pay those earnings once through Zoneless. Pin the
   provider on each sale so it cannot be paid twice.
3. **Small or file-backed app:** no real database, job queue, withdrawal model,
   or webhook infrastructure. Add the smallest coherent implementation using
   the existing storage and process model. Do not introduce authentication,
   cross-process locks, queues, schedulers, reconciliation systems, or new
   architectural layers unless the app already needs them.

Also identify the backend runtime, seller model, existing provider IDs and
preferences, test framework, deployment conventions, and secret handling. If
the money flow is unclear, stop and ask before editing. Do not redesign
unrelated parts of the application.

## Choose the integration client

### JavaScript or TypeScript backend

Install `@zoneless/node` with the project's package manager. Create one
server-side Zoneless client in the existing payments/integrations layer using:

- `ZONELESS_API_KEY`
- `ZONELESS_API_URL`, using `https://api-test.zoneless.com` during integration
- `SOLANA_SECRET_KEY` only in the server-side payout processor
- `ZONELESS_WEBHOOK_SECRET` only when the app implements a webhook route

Use the SDK for accounts, account links, transfers, payouts, and webhook
verification.

Use the payout helper that matches the existing worker:

- `payouts.processAll(SOLANA_SECRET_KEY)` when the worker intentionally
  processes every pending platform payout;
- `payouts.processBatch(SOLANA_SECRET_KEY)` for one platform-wide batch of up
  to 10 pending payouts;
- `payouts.build({ payouts: [payoutId] })`, `payouts.sign(...)`, then
  `payouts.broadcast(...)` when the marketplace must process an explicitly
  claimed payout ID.

The SDK already builds and signs Solana transactions. Do not install
`@solana/web3.js`, `@solana/spl-token`, `bs58`, or add mint, cluster, RPC, token
account, or platform-account configuration to a Node application. Those are
Zoneless implementation details. The marketplace app needs only the relevant
environment variables listed above.

### Other backend runtimes

Use the project's existing HTTP client and create one small Zoneless adapter.
Do not add Node as an application runtime dependency.

The adapter must:

- require an explicit `ZONELESS_API_URL` and normalize it to exactly one `/v1`
  suffix;
- use `https://api-test.zoneless.com` with the test profile during integration;
- authenticate with `X-Api-Key`;
- send `Idempotency-Key` for every mutating request;
- send `Zoneless-Account: acct_z_...` for connected-account requests;
- preserve structured API errors and request IDs;
- set timeouts and use the project's retry conventions;
- never retry a mutating request with a new idempotency key.

For payouts, call `/v1/payouts/build`, sign the returned transaction with a
maintained Solana signer for that backend language, then call
`/v1/payouts/broadcast`. Confirm the build response contains the payout IDs and
total expected by the claimed marketplace operation. Do not invent mint,
cluster, token-account, or RPC configuration; Zoneless builds the transaction.
If the runtime cannot sign it, stop and ask before adding a sidecar or changing
runtimes.

## Match the existing payout trigger

Do not invent a universal payout schedule. Preserve the marketplace's existing
trigger and choose the matching Zoneless processor:

- **Scheduled platform payout:** create transfers as earnings become eligible,
  create pending payouts in the existing daily/weekly worker, then use
  `processAll()` when that worker owns every pending Zoneless payout.
- **Bounded worker batch:** use `processBatch()` when the existing worker
  deliberately processes one platform-wide batch of up to 10.
- **Seller claim or admin-selected payout:** reserve the claimed earnings,
  create one transfer and payout, then process that payout ID with
  `build`/`sign`/`broadcast`.
- **Manual payout:** create the transfer and pending payout in the existing
  admin flow, but leave transaction processing to the existing manual worker.

Do not add both a claim route and a scheduler unless the application already
supports both. Keep the existing eligibility thresholds, timing, and
withdrawal rules.

## Implement the additive payout path

Follow the project's architecture, but preserve these invariants:

1. **Provider state**

   - Add `zoneless` as a distinct payout-method value.
   - Store a separate connected account ID such as `zonelessAccountId`.
   - Keep account ID, onboarding completion, current `payouts_enabled`, and the
     seller's active preference separate.
   - Pin the provider on each sale or payout attempt. A preference change
     affects future sales or unclaimed earnings only.
   - Reuse the existing payout model. For a small app with none, add only the
     fields needed to prevent duplicate payment: provider, amount, status,
     transfer ID, payout ID, idempotency key, and timestamps. Use the app's
     existing persistence style and a short `pending` → `processing` →
     `paid`/`failed` flow.

2. **Seller opt-in and onboarding**

   - Add Zoneless to the existing payout-method selection UI.
   - Create and persist one Express connected account, then create an Account
     Link for onboarding. Use a Login Link for an existing seller's dashboard.
   - Treat `payouts_enabled`, retrieved from Zoneless or received in a verified
     `account.updated` webhook, as the capability truth. A return redirect alone
     does not prove onboarding completed.
   - Validate preference changes on the server and preserve all existing
     provider accounts so the seller can switch back.

3. **Earnings and transfers**

   - Reuse the marketplace ledger and worker if they exist.
   - For immediate-payment checkout, keep destination charges unchanged for
     Stripe sellers. For a Zoneless seller, omit the destination transfer,
     collect on the platform, and record the seller's net earnings only after
     payment succeeds.
   - Reserve each earning or sale once and pin it to one provider before calling
     Zoneless. Never pay the same sale through both the checkout provider and
     Zoneless.
   - Create a transfer to the connected account, then create its payout. Use a
     stable idempotency key for each operation and reuse it on retry.

4. **Payout creation and processing**

   - Create the payout on behalf of the connected account using the
     `Zoneless-Account` context; `destination` is an optional external wallet
     ID, not the connected account ID.
   - Process it with the Node SDK helper or explicit-ID flow chosen above.
     Remember that `processAll()` and `processBatch()` select pending payouts
     platform-wide; use explicit `build`/`sign`/`broadcast` when the worker must
     process one claimed payout.
   - If a broadcast response is lost or times out, treat the payout as
     `unknown`, retrieve its current Zoneless status, and do not create another
     transfer or payout. If Zoneless reports it paid, reconcile locally. If it
     remains pending, rebroadcast the same retained signed transaction when
     possible; otherwise stop for reconciliation rather than rebuilding
     blindly.
   - Do not mark local earnings paid until Zoneless reports the payout paid.

5. **Status updates**

   - Reuse existing webhook infrastructure. Preserve the raw body, verify
     `Zoneless-Signature`, and make duplicate events safe.
   - If a small test app has no webhook infrastructure, retrieve account and
     payout status from Zoneless instead of building a new event system. Note
     live webhook setup in the human handoff.
   - Keep every existing provider webhook unchanged.

6. **Keep scope proportional**

   - Add documented environment-variable names and example placeholders only.
   - Reuse existing modules, routes, storage, jobs, tests, and UI styles. Avoid
     parallel abstractions and broad refactors.
   - Do not add authentication, rewrite persistence, paginate unrelated Stripe
     history, remediate unrelated dependency findings, or change legacy seller
     access as part of this integration.
   - Do not delete or rename original files. Do not leave runtime artifacts,
     copied secrets, or generated lock files in the project.

## Verify

Use mocks or test credentials; never send a payout. Add tests for:

- the existing checkout and payout path remaining unchanged;
- seller opt-in, account reuse, and provider switching;
- one sale or earning never being paid through two providers;
- the Zoneless transfer/payout path using the connected-account context and
  stable idempotency keys;
- no secret values reaching browser code, logs, fixtures, or snapshots.

For destination-charge marketplaces, explicitly test that Stripe sellers still
use the destination charge and Zoneless sellers do not.

Run the project's formatter, focused tests, linter, type checker, and build.
Fix regressions introduced by the integration.

## Human handoff

Report:

- changed files and the existing abstractions reused;
- database migration and deployment commands;
- required environment-variable names, never values;
- tests run and any unverified behavior;
- the test-mode onboarding path;
- that before an end-to-end test payout, the human must fund the test
  platform's public wallet address (the `wallet_public_key` returned by setup or
  the address shown under **Balance**) with devnet SOL from
  `https://faucet.solana.com/` and test USDC from
  `https://faucet.circle.com/`, selecting **USDC** and **Solana Devnet** at the
  Circle faucet; link
  `https://zoneless.com/docs/local-development.md` for the complete steps and
  warn never to send real SOL or USDC to devnet;
- where the human must configure the API key and webhook secret;
- the exact live-mode promotion sequence, including the bound live profile
  name, `https://api.zoneless.com`, deployment secret changes, live webhook
  setup, wallet funding, and one supervised payout;
- that the human must run
  `npx @zoneless/cli@latest wallet backup --output <secure-path>` themselves,
  place the backup's `secretKeyBase58` value directly in the production secret
  manager as `SOLANA_SECRET_KEY`, and delete the temporary export securely;
- that the human must follow
  `https://zoneless.com/docs/fund-platform-wallet.md` to fund the platform
  wallet with enough USDC for seller payouts and a small amount of SOL for
  Solana network fees;
- that the human must explicitly approve any live rollout.

Do not claim the integration is production-ready until the human completes
secret provisioning, wallet funding, live webhook setup, and a supervised
end-to-end payout.
