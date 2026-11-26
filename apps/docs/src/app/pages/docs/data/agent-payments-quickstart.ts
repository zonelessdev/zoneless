import { DocPage } from './types';

export const AGENT_PAYMENTS_QUICKSTART_PAGE: DocPage = {
  id: 'agent-payments-quickstart',
  title: 'Agent Payments Quickstart',
  description:
    'Give a coding agent a secure, additive path for adding USDC subscriptions or one-time checkout to an existing site or app.',
  sections: [
    {
      left: [
        {
          type: 'paragraph',
          text: 'This is the stable bootstrap document for a coding agent. The agent adds Zoneless as another way to pay for what you already sell, keeps your existing billing provider working, stays in test mode, and stops at the human authorization and production secret boundaries.',
        },
        {
          type: 'callout',
          variant: 'info',
          title: 'Paying sellers on a marketplace instead?',
          text: 'Use the <a href="/agent-marketplace-quickstart">Agent Marketplace Quickstart</a> when the goal is paying sellers out rather than collecting money from customers.',
          html: true,
        },
        {
          type: 'callout',
          variant: 'info',
          title: 'Assume no crypto knowledge',
          text: 'Explain every human action in plain language. USDC is a digital dollar; Solana is the network carrying it; a public wallet address is safe to share, while its secret key authorizes spending and must remain private. Test mode uses fake USDC, so they can try checkout without a wallet, a faucet, or the live Solana network. Live mode is when real USDC moves on Solana. Never assume prior wallet experience.',
          html: true,
        },
      ],
    },
    {
      left: [
        {
          type: 'heading',
          level: 2,
          text: 'How USDC subscriptions work',
        },
        {
          type: 'paragraph',
          text: 'Recurring stablecoin billing usually fails because a wallet cannot be charged without its owner present. Zoneless solves this with a one-time on-chain approval, so a USDC subscription behaves like a card subscription.',
        },
        {
          type: 'list',
          items: [
            {
              text: '<strong>You create a recurring price.</strong> Zoneless registers an on-chain plan holding the amount, the billing period, and the single wallet allowed to receive the money.',
              html: true,
            },
            {
              text: '<strong>The customer approves once at checkout.</strong> They connect a wallet and sign an approval authorizing Zoneless to collect that exact amount, once per period, for that plan only.',
              html: true,
            },
            {
              text: '<strong>Every later cycle is automatic.</strong> Zoneless collects the payment on schedule, creates an invoice, and sends you a webhook. The customer never signs again and does not need to be online.',
              html: true,
            },
            {
              text: '<strong>The customer stays in control.</strong> The approval is limited to the plan terms and can be revoked. Nothing is custodial, and no one can pull a different amount or send funds elsewhere.',
              html: true,
            },
          ],
        },
        {
          type: 'paragraph',
          text: "You do not need to hold or manage any crypto to receive these payments. Money moves from the customer's wallet to the platform wallet that setup created for you.",
        },
      ],
    },
    {
      left: [
        {
          type: 'heading',
          level: 2,
          text: '1. Start secure setup',
        },
        {
          type: 'paragraph',
          text: 'From the application repository, infer a clear platform name and run the command below. The Node.js CLI is only the secure bootstrap tool; it does not require the application backend itself to use Node.js.',
        },
        {
          type: 'paragraph',
          text: 'If setup reports that local profiles already exist for a different platform, retry with <code>--new-platform</code>. Reuse profiles that already belong to this product.',
          html: true,
        },
      ],
      right: [
        {
          type: 'code',
          title: 'Terminal',
          tabs: [
            {
              id: 'shell',
              label: 'Shell',
              code: `npx @zoneless/cli@latest agent setup \\
  --platform-name "<product name>" \\
  --skill payments \\
  --json`,
            },
          ],
        },
      ],
    },
    {
      left: [
        {
          type: 'heading',
          level: 2,
          text: '2. Pause for human authorization',
        },
        {
          type: 'paragraph',
          text: 'Show the activation URL and code returned by the CLI, then wait for the human to review and approve the request. Never approve it for them. Setup provisions test and live profiles while keeping API credentials and wallet secrets out of the prompt and source tree.',
        },
        {
          type: 'paragraph',
          text: 'The CLI binds this repository to the provisioned profiles in <code>.zoneless/project.json</code> and selects test by default. Build and verify with <code>https://api-test.zoneless.com</code>; keep mode environment-driven and leave live promotion to the human handoff.',
          html: true,
        },
        {
          type: 'paragraph',
          text: 'Setup validates stored keys before reuse. If it reports <code>credentials_invalid</code>, run <code>npx @zoneless/cli@latest auth reconnect --json</code> and show the new authorization prompt to the human. For local testing, run <code>npx @zoneless/cli@latest env sync --json</code>; it finds an unambiguous env file, preserves unrelated values, and writes the bound test credentials without displaying them. Collecting payments needs no wallet key in your application, so do not pass <code>--include-wallet</code>. The synced <code>ZONELESS_API_URL</code> is an origin without <code>/v1</code>; pass it directly to <code>@zoneless/node</code>, which adds the API path.',
          html: true,
        },
        {
          type: 'callout',
          variant: 'warning',
          title: 'Do not handle secrets.',
          text: 'Never request, read, print, export, transmit, or commit an API key, wallet private key, seed phrase, or secret-manager value.',
        },
      ],
    },
    {
      left: [
        {
          type: 'heading',
          level: 2,
          text: '3. Read the installed payments skill',
        },
        {
          type: 'paragraph',
          text: 'After approval, parse the successful JSON response and read the file at <code>skill_path</code> before changing application code. The CLI installs the versioned <code>zoneless-payments</code> skill locally and returns its exact path, so this flow does not depend on automatic skill discovery.',
          html: true,
        },
        {
          type: 'paragraph',
          text: 'Follow that skill as the implementation and safety contract. Use <a href="https://docs.zoneless.com/llms.txt">llms.txt</a> as an index and read resource pages such as <a href="/prices/object">Prices</a>, <a href="/checkout-sessions/object">Checkout Sessions</a>, and <a href="/subscriptions/object">Subscriptions</a> only when implementing that resource or when blocked. Do not fetch the entire documentation set upfront.',
          html: true,
        },
      ],
    },
    {
      left: [
        {
          type: 'heading',
          level: 2,
          text: '4. Classify how the app sells access',
        },
        {
          type: 'paragraph',
          text: 'Determine whether the application already sells plans through Stripe Billing, Paddle, or similar, whether it has no recurring billing yet, or whether the human wants a single one-time payment. Identify where access is currently recorded and define the billing subject: the user, account, workspace, license, or other resource that owns one independently managed entitlement.',
        },
        {
          type: 'paragraph',
          text: 'Preserve every existing provider. Never migrate existing subscribers, and never cancel, refund, or modify a subscription that another provider owns. Do not assume the authenticated user is the billing subject. If the entitlement ownership or provider-ID mapping is unclear, stop and ask rather than guessing.',
        },
      ],
    },
    {
      left: [
        {
          type: 'heading',
          level: 2,
          text: '5. Add a payment method, not a plan',
        },
        {
          type: 'paragraph',
          text: 'Mirror each existing plan with a Zoneless recurring price at the same amount and cadence, then map that price onto the existing plan record. Use the CLI for catalog setup rather than improvising raw API requests.',
        },
        {
          type: 'list',
          items: [
            {
              text: '<strong>One plan, two ways to pay.</strong> Present USDC as another payment option on the plan you already sell. Do not add a duplicate plan to the pricing page or admin console.',
              html: true,
            },
            {
              text: '<strong>One entitlement record.</strong> Write access from Zoneless into the same field the existing provider already writes, so nothing else in the application has to change.',
              html: true,
            },
            {
              text: '<strong>One active provider per billing subject.</strong> Store a <code>billingProvider</code> value alongside the Zoneless subscription ID on the record that owns the entitlement. Independently billed subjects may use different providers.',
              html: true,
            },
            {
              text: '<strong>No double billing for the same subject.</strong> Enforce on the server that a billing subject with an active subscription elsewhere cancels or reaches period end before starting a Zoneless one.',
              html: true,
            },
          ],
        },
        {
          type: 'paragraph',
          text: 'Amounts use minor units, so <code>2000</code> means <code>20.00 USDC</code>. Preview with <code>--dry-run</code> first, then create with a retained <code>--idempotency-key</code>. Omit <code>--interval</code> for a one-time product instead of a subscription.',
          html: true,
        },
      ],
      right: [
        {
          type: 'code',
          title: 'Terminal',
          tabs: [
            {
              id: 'shell',
              label: 'Shell',
              code: `npx @zoneless/cli@latest store init \\
  --name "Pro" \\
  --amount 2000 \\
  --interval month \\
  --json`,
            },
          ],
        },
      ],
    },
    {
      left: [
        {
          type: 'heading',
          level: 2,
          text: '6. Open checkout and grant access from webhooks',
        },
        {
          type: 'paragraph',
          text: 'For a signed-in user, create a Checkout Session server-side with <code>mode: "subscription"</code>, the mirrored price, a <code>success_url</code>, and <code>client_reference_id</code> set to a stable application reference for the billing subject after validating access, then redirect to the returned URL. A bare payment link carries no application context. Never put the API key in browser code.',
          html: true,
        },
        {
          type: 'paragraph',
          text: 'The success redirect proves only that the browser came back. Treat verified webhook events as the only source of truth, reusing the existing webhook route, preserving the raw body, verifying <code>Zoneless-Signature</code>, and making duplicate events safe by recording <code>event.id</code>.',
          html: true,
        },
        {
          type: 'list',
          items: [
            {
              text: '<code>checkout.session.completed</code> — resolve the billing subject from <code>client_reference_id</code>, store <code>subscription</code> and <code>customer</code>, pin the provider, and grant access.',
              html: true,
            },
            {
              text: '<code>invoice.paid</code> — resolve the subscription from <code>parent.subscription_details.subscription</code> and extend access using the invoice period.',
              html: true,
            },
            {
              text: '<code>invoice.payment_failed</code> — apply the existing dunning or grace behavior rather than inventing a new one.',
              html: true,
            },
            {
              text: '<code>customer.subscription.updated</code> and <code>customer.subscription.deleted</code> — follow status changes and revoke access at the end of the paid period.',
              html: true,
            },
          ],
        },
        {
          type: 'paragraph',
          text: "On a Subscription, billing periods belong to <code>items.data[*].current_period_start</code> and <code>items.data[*].current_period_end</code>, not the Subscription's top level. Match the relevant item by ID or price, and use SDK-shaped fixtures in tests.",
          html: true,
        },
        {
          type: 'paragraph',
          text: "Route cancellation by provider. Zoneless subscription cancellation belongs in the application's existing billing UI, either at period end or immediately.",
        },
      ],
      right: [
        {
          type: 'code',
          title: 'Server',
          tabs: [
            {
              id: 'node',
              label: 'Node',
              code: `const session = await client.checkout.sessions.create({
  mode: 'subscription',
  line_items: [{ price: plan.zonelessPriceId, quantity: 1 }],
  client_reference_id: billingSubject.id,
  success_url: 'https://example.com/billing/success',
});`,
            },
          ],
        },
      ],
    },
    {
      left: [
        {
          type: 'heading',
          level: 2,
          text: '7. Configure the test webhook',
        },
        {
          type: 'paragraph',
          text: "Zoneless must be able to send signed events to the application's server-side webhook route. Use the deployed test URL, or expose localhost through a separate HTTPS tunnel such as ngrok or Cloudflare Tunnel. Then run the CLI command; it creates or updates the test endpoint, selects the standard subscription events, stores the one-time signing secret securely, and writes <code>ZONELESS_WEBHOOK_SECRET</code> to the local env file without printing it.",
          html: true,
        },
        {
          type: 'paragraph',
          text: 'Restart the application after the command so it loads the synced webhook secret.',
          html: true,
        },
        {
          type: 'callout',
          variant: 'info',
          title: 'Manual dashboard fallback',
          text: 'Open the <a href="https://dashboard-test.zoneless.com/account/developers">test Developers dashboard</a>, choose <strong>Developers</strong> in the side menu, find <strong>Webhook Endpoints</strong>, and choose <strong>Add endpoint</strong>. Enter the public URL, select <code>checkout.session.completed</code>, <code>invoice.paid</code>, <code>invoice.payment_failed</code>, <code>customer.subscription.updated</code>, and <code>customer.subscription.deleted</code>, then choose <strong>Create</strong>. Copy the displayed one-time secret directly into the server environment as <code>ZONELESS_WEBHOOK_SECRET</code> and restart the server. Never paste the secret into chat or browser code.',
          html: true,
        },
      ],
      right: [
        {
          type: 'code',
          title: 'Terminal',
          tabs: [
            {
              id: 'shell',
              label: 'Shell',
              code: `npx @zoneless/cli@latest webhook sync \\
  --url "https://YOUR-PUBLIC-HOST/api/webhooks/zoneless" \\
  --preset subscriptions \\
  --json`,
            },
          ],
        },
      ],
    },
    {
      left: [
        {
          type: 'heading',
          level: 2,
          text: '8. Verify in test mode',
        },
        {
          type: 'paragraph',
          text: 'Add focused tests that prove the existing billing path is unchanged, one billing subject never holds active subscriptions on two providers at once, independent subjects remain independent, entitlement is granted from a verified webhook rather than the redirect, SDK-shaped subscription periods are handled correctly, duplicate webhook deliveries are safe, cancellation routes to the owning provider, and no secrets reach browser code or fixtures.',
        },
        {
          type: 'paragraph',
          text: "Run the project's formatter, focused tests, linter, type checker, and build. Open a test Checkout Session and verify its product, amount, cadence, and return URLs. Complete one supervised test subscription with the simulated wallet (or the test_helpers complete endpoint) and verify the resulting entitlement. Distinguish static checks, unit tests, hosted-checkout verification, and completed payments in the handoff.",
        },
        {
          type: 'callout',
          variant: 'info',
          title: 'Keep the first integration focused',
          text: "Match the application's existing fixed-price entitlement and cancellation behavior. Do not simulate behavior that is not covered by the current API documentation; report separate dependencies without blocking the safe supported path.",
        },
      ],
    },
    {
      left: [
        {
          type: 'heading',
          level: 2,
          text: '9. Hand production setup back to the human',
        },
        {
          type: 'paragraph',
          text: 'Report changed files, any existing-provider behavior that changed, the plans mirrored with their Zoneless price IDs, migrations, deployment commands, and the required environment-variable names. Distinguish static checks, unit tests, hosted-checkout verification, and completed end-to-end payments. Tell the human where to configure the API key and webhook secret without requesting either value.',
        },
        {
          type: 'paragraph',
          text: 'To test a subscription end to end, the human opens hosted checkout in test mode and approves the simulated wallet. They can also complete a session with <code>POST /v1/test_helpers/checkout/sessions/:id/complete</code>, sending <code>email</code> in the body unless the session has a customer or a <code>customer_email</code>. No Phantom, faucet, or Devnet switch is required.',
          html: true,
        },
        {
          type: 'paragraph',
          text: 'Explain the live promotion explicitly: configure the separately provisioned live API key and <code>https://api.zoneless.com</code> in the deployment secret manager, create the live endpoint from the <a href="https://dashboard.zoneless.com/account/developers">live Developers dashboard</a> or with an explicitly selected live CLI profile, configure the live webhook secret, and complete one supervised subscription before enabling live traffic.',
          html: true,
        },
        {
          type: 'callout',
          variant: 'warning',
          title: 'Production remains a human decision.',
          text: 'Do not claim the integration is production-ready until secret provisioning, live webhook setup, and a supervised end-to-end subscription are complete.',
        },
      ],
    },
  ],
};
