<p align="center">
  <a href="https://zoneless.com">
    <img src="https://zoneless.com/assets/images/screenshots/og.png" alt="Zoneless, an open-source Stripe Connect alternative" width="800" />
  </a>
</p>

<h1 align="center">Zoneless</h1>

<p align="center">
  <strong>The open-source Stripe Connect replacement, built on stablecoins.<br>Onboard sellers and send payouts without percentage fees.</strong>
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

Zoneless gives marketplaces and platforms a self-hosted replacement for Stripe Connect. It includes connected account onboarding, transfers, payouts, and an Express-style dashboard for sellers.

Payouts settle in USDC on Solana. Funds move from a wallet controlled by the platform to a wallet controlled by the seller. Zoneless does not hold the funds.

<table>
  <tr>
    <td align="center"><strong>~$0.002</strong><br><sub>average network cost per payout</sub></td>
    <td align="center"><strong>Seconds</strong><br><sub>to settle on Solana</sub></td>
    <td align="center"><strong>2,500+</strong><br><sub>sellers onboarded in production</sub></td>
    <td align="center"><strong>73%</strong><br><sub>of eligible sellers chose USDC payouts</sub></td>
  </tr>
</table>

## What is included

- **Platform dashboard:** View connected accounts, transfers, payouts, and balances.
- **Seller onboarding:** Collect account details and wallet addresses through a hosted onboarding flow.
- **Express dashboard:** Give each seller a place to view earnings, payouts, and account details.
- **Stripe-style API:** Work with familiar resources such as Accounts, Account Links, Transfers, Payouts, Persons, and External Accounts.
- **Developer tools:** Manage API keys, webhook endpoints, events, and logs.
- **Self-hosting:** Run the API, dashboard, database, and wallet infrastructure on your own servers.

## Why it exists

Stripe Connect can become expensive for marketplaces with lots of sellers, small balances, or frequent payouts. It can also leave platforms dependent on Stripe's country coverage and account approval process.

Zoneless uses USDC and Solana to make the payout part simpler:

- Payouts cost fractions of a cent in network fees.
- Transfers settle in seconds instead of business days.
- The platform and seller keep control of their own wallets.
- The API follows Stripe Connect's resource names and object shapes.
- The whole stack is available under the Apache 2.0 license.

## A drop-in replacement for Stripe Connect

Swap the SDK, point it at your Zoneless instance, and keep your existing payout flow. Accounts, Account Links, Transfers, Payouts, webhook events, idempotency keys, and object shapes follow Stripe Connect's API.

```typescript
// import Stripe from 'stripe';
// const client = new Stripe('sk_live_...');

import { Zoneless } from '@zoneless/node';
const client = new Zoneless('sk_live_z_YOUR_API_KEY', 'https://api.zoneless.com');

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

The payout is sent as USDC on Solana instead of through a bank. See the [migration guide](https://zoneless.com/docs/migrate-from-stripe) for setup instructions and a complete example.

## How a payout works

1. **Create a connected account:** Add the seller through the API or platform dashboard.
2. **Onboard the seller:** Send the seller a hosted Account Link. They enter their details and connect a Solana wallet.
3. **Transfer their earnings:** Allocate funds to the connected account using the Transfers API.
4. **Send the payout:** USDC moves from the platform wallet to the seller's wallet and the API emits the relevant webhook events.

Sellers can hold or spend the USDC, or move it to an exchange that supports withdrawals in their country.

## Used in production

Zoneless was built for [PromptBase](https://promptbase.com), an AI marketplace serving more than 450,000 users. PromptBase had reached more than $9,400 per month in Stripe Connect fees, so it began offering sellers USDC payouts through Zoneless.

Over a 14-week period, 73% of eligible sellers chose Zoneless instead of Stripe for their payouts. More than 2,500 sellers completed onboarding.

## Dashboard and onboarding

### Platform dashboard

Manage connected accounts, transfers, payouts, and balances from the platform dashboard.

<p align="center">
  <img src="https://zoneless.com/assets/images/screenshots/hero-dashboard.webp" alt="Zoneless platform dashboard" width="700" />
</p>

### Seller onboarding

Send each seller a hosted onboarding link where they can enter their account details and connect a wallet.

<p align="center">
  <img src="https://zoneless.com/assets/images/screenshots/onboard.webp" alt="Zoneless connected account onboarding" width="700" />
</p>

### Express dashboard

Each seller gets an Express-style dashboard for viewing earnings, payouts, and account details.

<p align="center">
  <img src="https://zoneless.com/assets/images/screenshots/connect.webp" alt="Zoneless Express dashboard for connected accounts" width="700" />
</p>

## Payments

The repository also includes checkout, payment links, customers, products, invoices, and subscriptions. These can be used alongside Connect, but connected accounts and marketplace payouts are the current focus of the project.

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

- [Quickstart](https://zoneless.com/docs/quickstart): Set up an instance and make your first API requests
- [Deployment](https://zoneless.com/docs/deployment): Deploy Zoneless with Docker
- [Account Links](https://zoneless.com/docs/account-links): Build hosted onboarding for connected accounts
- [Migrate from Stripe](https://zoneless.com/docs/migrate-from-stripe): Move an existing Stripe Connect payout flow

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

## Anonymous usage telemetry

Self-hosted Zoneless can optionally share anonymous usage heartbeats with
maintainers (opt-in, off by default). See [TELEMETRY.md](./TELEMETRY.md).

## Security

See [SECURITY.md](./SECURITY.md) to report vulnerabilities.

## License

[Apache License 2.0](./LICENSE)

---

If Zoneless is useful to you, consider giving it a star. It helps others find the project.
