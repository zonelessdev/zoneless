<p align="center">
  <a href="https://zoneless.com">
    <img src="https://zoneless.com/assets/images/screenshots/og.png" alt="Zoneless — The open-source Stripe Connect alternative" width="800" />
  </a>
</p>

<h1 align="center">Zoneless</h1>

<p align="center">
  <strong>The open-source Stripe Connect alternative.<br>Pay marketplace sellers globally with USDC. ~$0.002 fees. Instant payouts. Self-hosted.</strong>
</p>

<p align="center">
  <a href="https://zoneless.com/docs">Docs</a> &middot;
  <a href="https://zoneless.com/#live-demo">Live Demo</a> &middot;
  <a href="https://zoneless.com">Website</a> &middot;
  <a href="https://discord.gg/WcYqPmjpjm">Discord</a>
</p>

<p align="center">
  <a href="https://github.com/zonelessdev/zoneless/actions/workflows/ci.yml"><img src="https://github.com/zonelessdev/zoneless/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
  <a href="./LICENSE"><img src="https://img.shields.io/badge/License-Apache%202.0-blue.svg" alt="License: Apache 2.0"></a>
</p>

---

Zoneless is a free, open-source drop-in replacement for the **payout part of Stripe Connect**. It lets you pay marketplace sellers globally with stablecoins (USDC) using an API identical to Stripe — at near-zero cost.

If you know Stripe, you already know how to use Zoneless. Same webhooks, same object shapes, same SDK patterns. Just swap `stripe` for `@zoneless/node` and you're live.

## Battle-tested in production

Zoneless powers payouts on [PromptBase](https://promptbase.com), an AI marketplace with **450,000+ users**. At the peak, PromptBase was burning **$9,400/month** in opaque Stripe Connect fees for seller payouts. After switching to Zoneless:

<table>
  <tr>
    <td align="center"><strong>~$0.002</strong><br><sub>avg. payout cost</sub></td>
    <td align="center"><strong>1,400+</strong><br><sub>payouts completed</sub></td>
    <td align="center"><strong>73%</strong><br><sub>of sellers chose Zoneless over Stripe</sub></td>
    <td align="center"><strong>2,200+</strong><br><sub>sellers onboarded</sub></td>
  </tr>
</table>

<sub>Based on 2,500 fully-onboarded sellers given the choice of Stripe or Zoneless payouts, Dec 2025 – Apr 2026.</sub>

> _"Our payout costs dropped significantly, sellers get paid faster, and we can onboard more countries — which has helped grow the buyer side too. A big worry was that sellers would be confused and hate USDC, but they actually love it."_
>
> — **Ben Stokes**, Founder of [PromptBase](https://promptbase.com)

## Why Zoneless?

- **Near-zero fees** — Payouts cost ~$0.002 in SOL gas. No $2/month per account, no 0.25% + $0.25 per payout.
- **Stripe-compatible API** — Same webhooks, events, object shapes, and SDK patterns. Migrate with minimal code changes.
- **Truly global** — Pay anyone in 220+ countries & regions. No banking restrictions.
- **Instant payouts** — USDC settles on Solana in seconds, 24/7/365. Not 2–7 business days.
- **Open source** — Apache 2.0 licensed. Audit, fork, self-host. No vendor lock-in or surprise shutdowns.
- **Self-custodial** — You hold your keys. Funds never touch a third party.

## Zoneless vs Stripe Connect

|                       | Zoneless                 | Stripe Connect    |
| --------------------- | ------------------------ | ----------------- |
| Monthly account fee   | Free                     | $2/active account |
| Payout fee (domestic) | ~$0.002 (SOL gas)        | 0.25% + $0.25     |
| Payout fee (intl)     | ~$0.002 (SOL gas)        | $1.50 per payout  |
| Cross-border fee      | None                     | +0.25–1.25%       |
| Currency conversion   | None (USDC)              | +0.50–1% FX fee   |
| Payout speed          | Seconds                  | 2–7 business days |
| Global coverage       | 220+ countries & regions | ~47 countries     |
| Source code           | Open source (Apache 2.0) | Proprietary       |
| Self-hostable         | Yes                      | No                |

## Built for

- **Microtransaction marketplaces** — When payouts cost fractions of a cent, small transactions finally make sense. Digital goods, templates, prompts, and more.
- **Global creator platforms** — Pay creators worldwide without banking restrictions. No more "sorry, we don't support your country."
- **AI agent economies** — Programmatic payouts for AI agents and autonomous systems. Machine-to-machine commerce at scale.

## Migrate in minutes

```typescript
// Before — Stripe Connect
// import Stripe from 'stripe';
// const client = new Stripe('sk_live_...');

// After — Zoneless
import { Zoneless } from '@zoneless/node';
const client = new Zoneless('sk_z_...', 'api.example.com');

// Same API you already know
const account = await client.accounts.create({
  type: 'express',
  country: 'US',
  email: 'seller@example.com',
});

await client.payouts.create({
  amount: 10000,
  currency: 'usdc',
  destination: account.id,
});
```

## Express Dashboard

Sellers get a familiar Express-style dashboard to view payouts, track earnings, and manage their account — plus guided wallet onboarding.

<p align="center">
  <img src="https://zoneless.com/assets/images/screenshots/dashboard1.webp" alt="Zoneless Express Dashboard" width="700" />
</p>

**[Try the Live Demo →](https://zoneless.com/#live-demo)**

## How sellers get paid

1. **Seller connects a wallet** — During onboarding, sellers connect a Solana wallet (e.g. Phantom). Takes 30 seconds with guided instructions.
2. **You send USDC** — Trigger payouts via the API. Funds arrive in the seller's wallet in seconds, not days.
3. **Seller spends or off-ramps** — Sellers spend USDC directly, or convert to local currency via an exchange like Coinbase.

You create and manage your own platform wallet — top it up with USDC via any exchange and you're ready to send payouts.

## Quick Start

```bash
git clone https://github.com/zonelessdev/zoneless.git
cd zoneless
docker compose up -d
```

Open [localhost/setup](http://localhost/setup) to create your platform account and API key.

See the full [Quickstart Guide](https://zoneless.com/docs/quickstart) for creating connected accounts, transfers, and payouts.

## Documentation

All guides and API reference docs live at **[zoneless.com/docs](https://zoneless.com/docs)**:

- [Quickstart](https://zoneless.com/docs/quickstart) — end-to-end setup in under 5 minutes
- [Deployment](https://zoneless.com/docs/deployment) — deploy to a VPS with Docker
- [API Reference](https://zoneless.com/docs/account-links) — Accounts, Transfers, Payouts, Webhooks, and more
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
