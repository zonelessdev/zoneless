<p align="center">
  <a href="https://zoneless.com">
    <img src="https://docs.zoneless.com/assets/images/screenshots/og-payments.png" alt="Zoneless, an open-source payments platform" width="800" />
  </a>
</p>

<h1 align="center">Zoneless</h1>

<p align="center">
  <strong>Your own open-source payments platform.<br>Accept payments, manage subscriptions, and pay sellers globally in USDC from infrastructure you control. No middlemen and no fees.</strong>
</p>

<p align="center">
  <a href="https://docs.zoneless.com">Docs</a> &middot;
  <a href="https://zoneless.com">Website</a> &middot;
  <a href="https://zoneless.com/#live-demo">Demo</a> &middot;
  <a href="https://discord.gg/mdMQJug9mG">Discord</a>
</p>

<p align="center">
  <a href="https://github.com/zonelessdev/zoneless/actions/workflows/ci.yml"><img src="https://github.com/zonelessdev/zoneless/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
  <a href="./LICENSE"><img src="https://img.shields.io/badge/License-Apache%202.0-blue.svg" alt="License: Apache 2.0"></a>
</p>

---

Zoneless is an open-source payments stack for stablecoins.

It includes checkout, subscriptions, marketplace accounts, and payouts through a Stripe-compatible API. Use the full platform or add it alongside your current payment setup.

## Features

### Platform dashboard

Manage payments, customers, products, subscriptions, connected accounts, and balances from one place.

<p align="center">
  <a href="https://docs.zoneless.com/platform-dashboard">
    <img src="https://docs.zoneless.com/assets/images/screenshots/hero-dashboard.webp" alt="Zoneless platform dashboard" width="700" />
  </a>
</p>

### Checkout

Create products and payment links, then let customers pay with USDC through hosted checkout.

<p align="center">
  <a href="https://docs.zoneless.com/payment-link-quickstart">
    <img src="https://docs.zoneless.com/assets/images/screenshots/checkout.webp" alt="Zoneless hosted checkout" width="700" />
  </a>
</p>

### Payments

Manage payments, subscription charges, payouts, refunds, and other balance activity.

<p align="center">
  <a href="https://docs.zoneless.com/platform-dashboard">
    <img src="https://docs.zoneless.com/assets/images/screenshots/transactions.webp" alt="Payment activity in the Zoneless dashboard" width="700" />
  </a>
</p>

### Subscriptions

Manage recurring payments, invoices, and subscription status.

<p align="center">
  <a href="https://docs.zoneless.com/subscriptions">
    <img src="https://docs.zoneless.com/assets/images/screenshots/subscriptions.webp" alt="Subscriptions in the Zoneless dashboard" width="700" />
  </a>
</p>

### Seller onboarding

Onboard sellers to your marketplace via a hosted flow where they can enter their details and connect a wallet.

<p align="center">
  <a href="https://docs.zoneless.com/quickstart">
    <img src="https://docs.zoneless.com/assets/images/screenshots/onboard.webp" alt="Zoneless connected account onboarding" width="700" />
  </a>
</p>

### Identity verification

Set verification rules and review sellers who need an identity check.

<p align="center">
  <a href="https://docs.zoneless.com/identity-verification">
    <img src="https://docs.zoneless.com/assets/images/screenshots/kyc-hero.webp" alt="Seller identity verification in Zoneless" width="700" />
  </a>
</p>

### Seller dashboard

Give each seller an Express-style dashboard for viewing earnings, payouts, and account details.

<p align="center">
  <a href="https://zoneless.com/#live-demo">
    <img src="https://docs.zoneless.com/assets/images/screenshots/connect.webp" alt="Zoneless dashboard for connected accounts" width="700" />
  </a>
</p>

## A familiar API

Zoneless uses familiar resources such as Checkout Sessions, Payment Links, Customers, Products, Subscriptions, Accounts, Transfers, and Payouts. It also follows Stripe's object shapes, webhook patterns, and idempotency model.

If you have worked with Stripe before, the SDK should feel familiar:

```typescript
import { Zoneless } from '@zoneless/node';
const client = new Zoneless('sk_live_z_YOUR_API_KEY', 'https://api.zoneless.com');

const session = await client.checkout.sessions.create({
  success_url: 'https://yoursite.com/success',
  cancel_url: 'https://yoursite.com/cancel',
  line_items: [
    {
      price_data: {
        currency: 'usdc',
        unit_amount: 1000,
        product_data: { name: 'My first product' },
      },
      quantity: 1,
    },
  ],
  mode: 'payment',
});
```

The API covers checkout, subscriptions, and marketplace payouts. See the [API reference](https://docs.zoneless.com) for the full list of resources and endpoints.

## Running in production

Zoneless was built for [PromptBase](https://promptbase.com), an AI marketplace with more than 500,000 users, and runs its seller payout infrastructure in production.

## Quick start

```bash
git clone https://github.com/zonelessdev/zoneless.git
cd zoneless
docker compose up -d
```

Open [localhost/setup](http://localhost/setup) to create your platform account and API key.

See the [self-hosting guide](https://docs.zoneless.com/self-hosting) for configuration, credentials, and deployment options.

## One-Click Deploy

[![Deploy on RepoCloud](https://d16t0pc4846x52.cloudfront.net/deploylobe.svg)](https://repocloud.io/details/Zoneless/)

## Guides and documentation

The full API reference is at **[docs.zoneless.com](https://docs.zoneless.com)**. These guides are good places to start:

- [Accept your first stablecoin payment](https://docs.zoneless.com/payment-link-quickstart)
- [Create a Checkout Session with the API](https://docs.zoneless.com/checkout-api-quickstart)
- [Onboard a seller and send a payout](https://docs.zoneless.com/quickstart)
- [Run Stripe and Zoneless side by side](https://zoneless.com/blog/run-stripe-and-zoneless-side-by-side)
- [Onboard sellers outside Stripe Connect's supported regions](https://zoneless.com/blog/onboard-sellers-stripe-connect-doesnt-support)
- [Move an existing Stripe Connect payout flow](https://docs.zoneless.com/migrate-from-stripe)

For a product overview, see [marketplace payouts](https://zoneless.com) or [USDC checkout and subscriptions](https://zoneless.com/payments).

## Local development

```bash
npm install
docker compose up -d        # MongoDB
npx nx serve api            # API on :3333
npx nx serve web            # Dashboard on :4203
npx nx serve docs           # Docs on :4205
```

Or run everything at once:

```bash
npm run dev
```

### Running tests

```bash
npx nx test api
npx nx test web
npx nx test docs
npx nx test node-sdk
```

## Project structure

```
zoneless/
├── apps/
│   ├── api/              # Express.js API backend
│   ├── web/              # Angular dashboard, checkout and onboarding
│   ├── docs/             # Public product docs and API reference
│   └── cli/              # Cli for humans and agents
├── libs/
│   ├── shared-types/     # Shared TypeScript interfaces
│   └── shared-schemas/   # Shared Zod schemas
├── sdks/
│   └── node/             # @zoneless/node
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

If Zoneless is useful to you, give the repository a star. It helps more people find the project.
