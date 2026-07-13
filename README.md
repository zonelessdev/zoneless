<p align="center">
  <a href="https://zoneless.com">
    <img src="https://zoneless.com/assets/images/screenshots/og.png" alt="Zoneless — The open-source Stripe, built on stablecoins" width="800" />
  </a>
</p>

<h1 align="center">Zoneless</h1>

<p align="center">
  <strong>The open-source Stripe alternative, built on stablecoins.<br>Payments infrastructure you actually own. Same API and dashboard you already know, minus the fees.</strong>
</p>

<p align="center">
  <a href="https://zoneless.com/docs">Docs</a> &middot;
  <a href="https://zoneless.com">Website</a> &middot;
  <a href="https://discord.gg/mdMQJug9mG">Discord</a>
</p>

<p align="center">
  <a href="https://github.com/zonelessdev/zoneless/actions/workflows/ci.yml"><img src="https://github.com/zonelessdev/zoneless/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
  <a href="./LICENSE"><img src="https://img.shields.io/badge/License-Apache%202.0-blue.svg" alt="License: Apache 2.0"></a>
</p>

---

Zoneless is a free, open-source payments platform with a **one-to-one mapping of Stripe's API, objects, and dashboard** — except every payment settles in USDC, moving wallet to wallet with no banks in between.

If you know Stripe, you already know Zoneless. Same webhooks, same object shapes, same SDK patterns. Swap `stripe` for `@zoneless/node`, point it at your instance, and your integration keeps working.

<table>
  <tr>
    <td align="center"><strong>~$0.002</strong><br><sub>network cost per payment</sub></td>
    <td align="center"><strong>Seconds</strong><br><sub>to settle, 24/7/365</sub></td>
    <td align="center"><strong>220+</strong><br><sub>countries &amp; regions</sub></td>
    <td align="center"><strong>450k+</strong><br><sub>users on platforms running Zoneless</sub></td>
  </tr>
</table>

## Your own full payments stack

- **Dashboard** — Payments, customers, products, and balances in one place. If you know the Stripe dashboard, you know this one.
- **Checkout** — A hosted payment page your customers pay from in seconds. One redirect to integrate, guided wallet flow built in.
- **Connect** — Pay sellers and partners worldwide in seconds, for fractions of a cent. Each seller gets their own Express dashboard to track earnings and payouts.
- **Developer Tools** — API keys, webhooks, and event logs. Everything you need to integrate, test, and debug.

## Why Zoneless?

- **Keep the 2.9%** — Payments cost fractions of a cent in network fees, not a percentage cut.
- **Stripe-compatible API** — Same webhooks, events, object shapes, and SDK patterns. Migrate in an afternoon.
- **Instant settlement** — USDC settles on Solana in seconds, 24/7/365. Not 2–7 business days.
- **Truly global** — Accept payments and send payouts in 220+ countries & regions. No banking restrictions.
- **No chargebacks** — Payments are final. No disputes or fraud reversals.
- **No frozen accounts** — No processor can hold your balance or shut you off.
- **Self-custodial** — Your keys, your money. Funds never touch a third party.
- **Open source** — Apache 2.0 licensed. Audit, fork, self-host. No vendor lock-in or surprise shutdowns.

## Migrate in an afternoon

Zoneless mirrors Stripe's API one-to-one. Swap the SDK, point it at your instance, and your integration keeps working — same event names, same payloads, same signature verification, same idempotency keys.

```typescript
// Before — Stripe
// import Stripe from 'stripe';
// const client = new Stripe('sk_live_...');

// After — Zoneless
import { Zoneless } from '@zoneless/node';
const client = new Zoneless('sk_z_...', 'api.example.com');

// Same API you already know
const session = await client.checkout.sessions.create({
  mode: 'payment',
  line_items: [
    {
      price: 'price_z_...',
      quantity: 1,
    },
  ],
  success_url: 'https://example.com/success',
});
```

## How the money moves

Every payment settles in USDC — digital dollars worth exactly $1 — moving wallet to wallet with no banks in between.

1. **Customer pays** — USDC leaves their wallet at checkout. Hosted Checkout guides first-timers through wallet setup in about a minute.
2. **You hold the funds** — Money lands instantly in a wallet you control. No processor sits between you and your revenue.
3. **Send money anywhere** — Payouts, refunds, or withdrawals land in seconds, anywhere in the world.

## Battle-tested in production

Zoneless powers payments on [PromptBase](https://promptbase.com), an AI marketplace with **450,000+ users**. At the peak, PromptBase was paying Stripe over **$9,400/month** in fees. After switching to Zoneless:

<table>
  <tr>
    <td align="center"><strong>~$0.002</strong><br><sub>avg. payout cost</sub></td>
    <td align="center"><strong>73%</strong><br><sub>of sellers chose Zoneless over Stripe</sub></td>
    <td align="center"><strong>2,200+</strong><br><sub>sellers onboarded</sub></td>
  </tr>
</table>

> _"At the peak we were paying Stripe over $9,400 a month in Connect fees. I built Zoneless to replace it — payouts now cost fractions of a cent, sellers get paid in seconds, and we onboard countries Stripe never supported."_
>
> — **Ben Stokes**, Founder of [PromptBase](https://promptbase.com)

## Dashboard

You get the full platform dashboard; connected sellers get a familiar Express-style dashboard to view payouts, track earnings, and manage their account — plus guided wallet onboarding.

<p align="center">
  <img src="https://zoneless.com/assets/images/screenshots/hero-dashboard.webp" alt="Zoneless Dashboard" width="700" />
</p>

## Quick Start

```bash
git clone https://github.com/zonelessdev/zoneless.git
cd zoneless
docker compose up -d
```

Open [localhost/setup](http://localhost/setup) to create your platform account and API key.

See the full [Quickstart Guide](https://zoneless.com/docs/quickstart) for creating checkout sessions, connected accounts, transfers, and payouts.

## Documentation

All guides and API reference docs live at **[zoneless.com/docs](https://zoneless.com/docs)**:

- [Quickstart](https://zoneless.com/docs/quickstart) — end-to-end setup in under 5 minutes
- [Deployment](https://zoneless.com/docs/deployment) — deploy to a VPS with Docker
- [API Reference](https://zoneless.com/docs/account-links) — Checkout, Accounts, Transfers, Payouts, Webhooks, and more
- [Migrate from Stripe](https://zoneless.com/docs/migrate-from-stripe) — step-by-step migration guide

## Local Development

```bash
npm install
docker compose up -d        # MongoDB
npx nx serve api            # API on :3333
npx nx serve web            # Dashboard on :4203
```

Or run everything at once:

```bash
npm run dev
```

### Running Tests

```bash
npx nx test api
npx nx test web
```

## Project Structure

```
zoneless/
├── apps/
│   ├── api/              # Express.js API backend
│   └── web/              # Angular dashboard & onboarding
├── libs/
│   └── shared-types/     # Shared TypeScript interfaces
├── docker-compose.yml    # Full-stack Docker setup
└── nx.json
```

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md) for development setup, style guidelines, and the pull request process.

## Security

See [SECURITY.md](./SECURITY.md) to report vulnerabilities.

## License

[Apache License 2.0](./LICENSE)

---

If Zoneless is useful to you, consider giving it a star — it helps others find the project.
