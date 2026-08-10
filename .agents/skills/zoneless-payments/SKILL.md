---
name: zoneless-payments
description: Adds Zoneless USDC subscriptions or one-time checkout to an existing site or app as an additional way to pay, preserving existing billing providers. Use when integrating recurring stablecoin billing, subscription checkout, payment links, or USDC payments.
---

# Add Zoneless USDC payments

Add Zoneless as another way to pay for what the application already sells. Do
not migrate existing subscribers, and do not replace or remove an existing
Stripe, Paddle, Lemon Squeezy, or custom billing path unless the human
explicitly asks for that additional work.

## Safety requirements

- Never request, read, print, export, transmit, or commit an API key, wallet
  private key, seed phrase, or secret-manager value.
- Work in the test profile. Do not create live-mode application data, charge a
  real wallet, or switch production traffic.
- Keep all secret-key handling server-side. Never add it to browser code,
  public environment files, logs, fixtures, or test snapshots.
- Preserve existing billing providers, credentials, routes, jobs, webhooks,
  plan records, and historical subscription IDs.
- Never cancel, refund, or modify an existing subscription belonging to another
  provider.
- Stop before a destructive schema change or an ambiguous billing change. Ask
  the human rather than guessing.

## Assume no crypto knowledge

Use plain language whenever the human must act. Briefly explain that USDC is a
digital dollar and Solana is the network carrying it, that a wallet address is
safe to share, and that a wallet secret key authorizes spending and must remain
private. Explain that test mode uses free, worthless test funds on a network
separate from live mode, and that a faucet is a website that supplies those
test funds. Do not use terms such as gas, mint, token account, cluster, or
airdrop without explaining them.

The merchant does not need to hold, fund, or manage any crypto to receive
subscription payments. Money moves from the customer's wallet to the platform
wallet that setup already created. Say so explicitly; humans routinely assume
the opposite.

## Read documentation just in time

Start with `https://zoneless.com/docs/subscriptions.md` for the recurring
billing API and `https://zoneless.com/docs/checkout-api-quickstart.md` for the
checkout request and response shapes. Use `https://zoneless.com/llms.txt` as an
index and read a resource page only when implementing that resource or when
blocked. Do not fetch the entire docs set upfront.

The API shape and flow should be similar to Stripe.

For most integrations the additional pages needed are products, prices,
checkout sessions, subscriptions, invoices, customers, and webhooks.

## Confirm the local setup

Run:

```bash
npx @zoneless/cli@latest doctor --json
```

If no profile exists, run setup with a platform name inferred from the project:

```bash
npx @zoneless/cli@latest agent setup \
  --platform-name "<product name>" \
  --skill payments \
  --json
```

Show the returned `verification_url` and `user_code`, then wait. Do not approve
the request for the human. Setup stores test and live credentials in the
operating-system credential store without printing them and binds this
repository to those profiles in `.zoneless/project.json`. Continue with the
bound test profile after approval.

If setup reports that profiles already exist for a different platform, rerun
the same command with `--new-platform`. Reuse profiles that already belong to
this product; do not create duplicates. If setup reports
`credentials_invalid`, run `npx @zoneless/cli@latest auth reconnect --json`,
show the new authorization prompt, then retry setup.

For local test execution, inject the bound test credentials into the project's
local env file without displaying or reading them:

```bash
npx @zoneless/cli@latest env sync --json
```

Do not pass `--include-wallet`. Collecting subscription payments needs no
wallet key in the application; Zoneless signs each collection. If the command
reports multiple environment files, infer the server's actual env file from its
scripts and framework, then rerun once with `--target <relative-path>`.

## Use test mode, then hand off live promotion

Implement and verify against `https://api-test.zoneless.com`. Keep the mode
environment-driven rather than hardcoded. At handoff, explain that going live
means configuring the separately provisioned live API key,
`https://api.zoneless.com`, and the live webhook secret in the deployment
secret manager.

## Classify before editing

Inspect how the application currently sells access, then choose the matching
path:

1. **Existing subscription billing:** plans are already sold through Stripe
   Billing, Paddle, or similar, and the app already records who has access and
   until when. Mirror those plans and add Zoneless as another way to pay for
   them. This is the common case.
2. **No recurring billing yet:** the app sells nothing recurring. Create its
   first plan with Zoneless and build the smallest entitlement record the app
   needs. Do not introduce a billing framework, job queue, or admin console the
   app does not already have.
3. **One-time purchases only:** the human wants a single payment rather than a
   subscription. Use the one-time branch near the end of this document.

Also identify the backend runtime, the user or account model, where access is
currently recorded, the test framework, deployment conventions, and secret
handling. If the billing flow is unclear, stop and ask before editing. Do not
redesign unrelated parts of the application.

## Add a payment method, not a plan

Zoneless cannot co-bill a subscription that another provider owns, so mirroring
a plan always creates a parallel Zoneless price. Keep that an implementation
detail. Preserve these invariants:

1. **One plan, two ways to pay.** Present USDC as another payment option on the
   plan the application already sells. Do not add a duplicate "Pro (USDC)"
   entry to the pricing page, the plan enum, or the admin console.
2. **One entitlement record.** Write access from Zoneless into the same field
   the existing provider already writes. Do not create a parallel notion of
   who has access; that is how customers end up locked out or served twice.
3. **One active provider per subscriber.** Add a `billingProvider` value such
   as `stripe` or `zoneless` to the subscriber record, alongside a separate
   `zonelessSubscriptionId`. Pin it when a subscription starts.
4. **No double billing.** A user with an active subscription on another
   provider must cancel it or reach period end before starting a Zoneless one.
   Enforce this on the server, not only in the UI.
5. **Keep existing IDs.** Preserve the existing provider's customer and
   subscription IDs so the user can switch back.

Reuse the application's existing persistence style. For a small app with no
subscription model, add only the fields needed to answer "who has access, until
when, and who is billing them".

## Mirror each plan with the CLI

Use the Zoneless CLI for catalog setup. Do not create products or prices
through the dashboard or improvise raw API requests when the CLI is available.

Preview first. Amounts use minor units, so `2000` means `20.00 USDC`:

```bash
npx @zoneless/cli@latest store init \
  --name "<plan name>" \
  --amount <positive integer> \
  --interval month \
  --dry-run \
  --json
```

If the preview matches the existing plan's price and cadence, create the
resources with a non-secret, operation-specific idempotency key, and retain
that key for retries:

```bash
npx @zoneless/cli@latest store init \
  --name "<plan name>" \
  --amount <positive integer> \
  --interval month \
  --idempotency-key "<operation key>" \
  --json
```

`--interval` accepts `hour`, `day`, `week`, `month`, or `year`. Add
`--interval-count` to bill every N intervals and `--trial-days` for a free
trial. Run the command once per plan being mirrored.

Store the returned `price_id` **next to the existing plan record** as a
mapping. Do not create a new plan row. Report the returned `product_id`,
`price_id`, and `payment_link_id` without exposing secrets.

## Open checkout from the application

For a signed-in user, create a Checkout Session server-side so the subscription
can be tied to that user. A bare payment link URL carries no user context.

Create the session with `mode: 'subscription'`, one line item referencing the
mirrored `price_id`, a `success_url`, and both `client_reference_id` set to the
application's user ID and `customer` set to a stored Zoneless customer when one
exists. Redirect the user to the returned session URL.

Use the `checkout_url` from `store init` directly only when there is no user to
attach, such as an anonymous landing page.

Never put the API key in browser code. Create sessions from the server.

## Grant access from webhooks, not redirects

The success redirect proves only that the browser came back. It does not prove
payment. Treat verified webhook events as the only source of truth.

Reuse the application's existing webhook infrastructure. Preserve the raw body,
verify `Zoneless-Signature` using `ZONELESS_WEBHOOK_SECRET`, and make duplicate
events safe. Keep every existing provider webhook unchanged.

Handle these events:

- `checkout.session.completed` — resolve the user from `client_reference_id`,
  pin `billingProvider` to `zoneless`, store the subscription ID, and grant
  access.
- `invoice.payment_succeeded` — extend access for the new period. This is the
  event that keeps a subscriber active month after month.
- `invoice.payment_failed` — apply the application's existing dunning or grace
  behavior. Do not invent a new one.
- `customer.subscription.updated` — follow status changes such as `past_due`
  and `paused`.
- `customer.subscription.deleted` — revoke access at the end of the paid
  period.

If a small app has no webhook infrastructure, retrieve subscription status from
Zoneless instead of building a new event system, and note live webhook setup in
the human handoff.

## Cancellation and plan changes

Route management actions by `billingProvider`. A Zoneless subscriber cannot be
managed through another provider's billing portal, and Zoneless has no hosted
billing portal, so cancellation belongs in the application's existing UI.

Cancel at period end by updating the subscription with `cancel_at_period_end`,
or immediately with a delete request. Treat a plan change as cancel plus
resubscribe at the new price; do not attempt mid-cycle proration.

## One-time payments

When the human wants a single payment rather than a subscription, run
`store init` without `--interval` to create a product, price, and payment link,
then add the returned `checkout_url` to the site as the purchase link. Verify
the URL loads and that the visible name and amount match the request. Grant any
access from `checkout.session.completed` rather than the redirect.

## What Zoneless does not support yet

Do not build these, and tell the human plainly if the integration needs one:

- proration and mid-cycle plan changes;
- coupons and promotion codes;
- refunds through the API;
- a hosted billing portal;
- metered or usage-based billing;
- invoice emails for `send_invoice` collection.

Use fixed-price plans with automatic collection and cancellation at period end.

## Verify

Use mocks or test credentials. Add tests for:

- the existing billing and checkout paths remaining unchanged;
- a user never holding an active subscription on two providers at once;
- entitlement granted from a verified webhook and not from the success
  redirect;
- `invoice.payment_succeeded` extending the same access record the existing
  provider writes;
- duplicate webhook deliveries being safe;
- cancellation routing to the provider that owns the subscription;
- no secret values reaching browser code, logs, fixtures, or snapshots.

Run the project's formatter, focused tests, linter, type checker, and build.
Fix regressions introduced by the integration.

## Human handoff

Report:

- changed files and the existing abstractions reused;
- the plans mirrored, with their Zoneless price IDs;
- database migration and deployment commands;
- required environment-variable names, never values;
- tests run and any unverified behavior;
- that to test a subscription end to end, the human needs a Solana wallet
  holding test USDC, available free from `https://faucet.circle.com/` by
  selecting **USDC** and **Solana Devnet**, and that they must never send real
  funds to a test network;
- that the customer approves the plan once at checkout and every later cycle is
  collected automatically, so no further signing is required;
- where the human must configure the live API key, live API URL, and live
  webhook secret;
- that the human must explicitly approve any live rollout.

Do not claim the integration is production-ready until the human completes
secret provisioning, live webhook setup, and one supervised end-to-end
subscription in live mode.
