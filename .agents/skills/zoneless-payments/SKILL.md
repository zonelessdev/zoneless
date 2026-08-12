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
billing API, `https://zoneless.com/docs/checkout-api-quickstart.md` for checkout
request and response shapes, and `https://zoneless.com/docs/webhooks.md` when
wiring lifecycle events. Use `https://zoneless.com/llms.txt` as an index and
read a resource page only when implementing that resource or when blocked. Do
not fetch the entire docs set upfront.

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

`env sync` writes `ZONELESS_API_URL` as an origin without a trailing `/v1`.
Pass that value directly to `@zoneless/node`; the SDK adds `/v1`. For raw HTTP
requests, append `/v1` exactly once.

## Configure test webhook delivery

Determine the application's server-side webhook route and its public HTTPS URL.
For a deployed test app, use its existing HTTPS origin. For localhost, explain
that Zoneless cannot reach `localhost`; the human must run a tunnel such as
`ngrok http <port>` or Cloudflare Tunnel and provide its public HTTPS URL. Do not
silently install or leave a tunnel process running.

Before handoff, ask the human for the public HTTPS URL so you can complete
webhook sync. If they cannot provide one, distinguish **application code
complete** from **webhook delivery pending** and include the exact command they
must run later; do not imply that webhook-backed entitlements are ready.

Once the URL is known, create or update the bound test endpoint and sync its
signing secret without displaying it:

```bash
npx @zoneless/cli@latest webhook sync \
  --url "https://<public-host>/<server-webhook-route>" \
  --preset subscriptions \
  --json
```

Add `--target <relative-path>` when the server uses a non-default env file. The
command subscribes to `checkout.session.completed`, `invoice.paid`,
`invoice.payment_failed`, `customer.subscription.updated`, and
`customer.subscription.deleted`; stores the one-time endpoint secret in the
operating-system credential store; and writes `ZONELESS_WEBHOOK_SECRET` to the
local env file without printing it. Restart the application after the command
so it loads the new value.

If CLI setup is unavailable, give the human these manual test-mode steps without
asking them to reveal the secret:

1. Open `https://dashboard-test.zoneless.com/account/developers`.
2. Choose **Developers** in the side menu.
3. In **Webhook Endpoints**, choose **Add endpoint**.
4. Enter the public HTTPS endpoint URL.
5. Select the five subscription events listed above.
6. Choose **Create**, copy the one-time webhook secret directly into the
   server's local environment as `ZONELESS_WEBHOOK_SECRET`, and restart the
   server.

Reserve `https://dashboard.zoneless.com/account/developers` for the explicit
live handoff. Never configure a live endpoint while implementing in test mode.

## Use test mode, then hand off live promotion

Implement and verify against `https://api-test.zoneless.com`. Keep the mode
environment-driven rather than hardcoded. At handoff, explain that going live
means configuring the separately provisioned live API key,
`https://api.zoneless.com`, and the live webhook secret in the deployment
secret manager.

## Choose the integration client

For JavaScript or TypeScript backends, install `@zoneless/node` and initialize
it server-side with `ZONELESS_API_KEY` and `ZONELESS_API_URL`. Use the SDK's
types for Checkout Sessions, Subscriptions, Invoices, and Events instead of
recreating partial local interfaces.

For other runtimes, build a small server-only HTTP adapter. Keep the API origin,
authentication, error mapping, and `/v1` joining in that adapter rather than
scattering raw requests through application handlers.

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
handling. Explicitly identify the **billing subject**: the record or resource
that owns one entitlement and can be independently started, renewed, canceled,
or switched between providers. It may be a user, account, workspace, seat,
license, domain, or another application resource. Do not assume it is the user
record merely because checkout is authenticated.

Determine how provider subscription IDs map to billing subjects and where
cancellation is managed. If that mapping or ownership boundary is unclear, stop
and ask before editing. Do not redesign unrelated parts of the application.

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
3. **One active provider per billing subject.** Add a `billingProvider` value
   such as `stripe` or `zoneless` to the record that owns the entitlement,
   alongside a separate `zonelessSubscriptionId`. Pin it when a subscription
   starts. Different independently billed subjects may use different providers.
4. **No double billing for the same subject.** A billing subject with an active
   subscription on another provider must cancel it or reach period end before
   starting a Zoneless one. Enforce this on the server, not only in the UI.
5. **Keep existing IDs.** Preserve the existing provider's customer and
   subscription IDs so the user can switch back.

Reuse the application's existing persistence style. For a small app with no
subscription model, add only the fields needed to answer "who has access, until
when, and who is billing them".

Keep existing provider handlers unchanged unless enforcing the same-subject
invariant genuinely requires a shared guard. If it does, ask before changing
existing checkout behavior and keep the change provider-neutral.

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
can be tied to the billing subject after validating that the user may purchase
it. A bare payment link URL carries no application context.

Create the session with `mode: 'subscription'`, one line item referencing the
mirrored `price_id`, a `success_url`, `client_reference_id` set to a stable
application reference for the billing subject, and `customer` set to a stored
Zoneless customer when one exists. Redirect the user to the returned session
URL.

Use the `checkout_url` from `store init` directly only when there is no user to
attach, such as an anonymous landing page.

Never put the API key in browser code. Create sessions from the server.

## Grant access from webhooks, not redirects

The success redirect proves only that the browser came back. It does not prove
payment. Treat verified webhook events as the only source of truth.

Reuse the application's existing webhook infrastructure. Preserve the raw body,
verify `Zoneless-Signature` using `ZONELESS_WEBHOOK_SECRET`, and make duplicate
events safe by recording `event.id`. Keep every existing provider webhook
unchanged.

Handle these events:

- `checkout.session.completed` — resolve the application subject from
  `client_reference_id`, store `subscription` and `customer`, retrieve the
  Subscription when needed, pin `billingProvider` to `zoneless`, and grant
  access.
- `invoice.paid` — resolve the subscription from
  `parent.subscription_details.subscription` and extend access using the
  invoice period. This is the event that keeps a subscriber active month after
  month.
- `invoice.payment_failed` — apply the application's existing dunning or grace
  behavior. Do not invent a new one.
- `customer.subscription.updated` — follow status changes such as `past_due`
  and `paused`.
- `customer.subscription.deleted` — revoke access at the end of the paid
  period.

On a Subscription, billing periods belong to
`items.data[*].current_period_start` and `items.data[*].current_period_end`, not
the Subscription's top level. Match the relevant item by its ID or price before
writing the entitlement period. Use SDK-shaped fixtures in tests so local
parsers cannot drift from the actual resource shape.

Process repeated and out-of-order events from current resource state. If an
event omits a field required by the application, retrieve the referenced
Checkout Session, Subscription, or Invoice rather than guessing. If the
application already has a billing reconciliation path, include Zoneless in it.

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

## Keep the first integration focused

Match the application's existing fixed-price entitlement and cancellation
behavior. Do not simulate billing behavior that is not covered by the current
API documentation. If the existing flow depends on additional behavior, report
that dependency separately and continue with the safe, supported portion when
possible.

## Verify

Use mocks or test credentials. Add tests for:

- the existing billing and checkout paths remaining unchanged;
- one billing subject never holding active subscriptions on two providers at
  once, while independent subjects remain independent;
- entitlement granted from a verified webhook and not from the success
  redirect;
- `invoice.paid` extending the same access record the existing
  provider writes;
- duplicate webhook deliveries being safe;
- Checkout Session, Subscription, and Invoice handling using actual SDK-shaped
  fixtures, including item-level subscription periods;
- cancellation routing to the provider that owns the subscription;
- no secret values reaching browser code, logs, fixtures, or snapshots.

Run the project's formatter, focused tests, linter, type checker, and build.
Fix regressions introduced by the integration.

Open a test Checkout Session and verify that the hosted page shows the expected
product, amount, cadence, and return URLs. When a test wallet is available,
complete one supervised test subscription and verify the resulting entitlement.
Do not describe unexecuted end-to-end behavior as tested.

## Human handoff

Report:

- changed files and the existing abstractions reused;
- any existing-provider checkout or management behavior that changed;
- the plans mirrored, with their Zoneless price IDs;
- database migration and deployment commands;
- required environment-variable names (`ZONELESS_API_KEY`,
  `ZONELESS_API_URL`, and `ZONELESS_WEBHOOK_SECRET`), never values;
- checks run, distinguishing static checks, unit tests, hosted-checkout
  verification, and completed end-to-end payments;
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
