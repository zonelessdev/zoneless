# Zoneless

[![CI](https://github.com/zonelessdev/zoneless/actions/workflows/ci.yml/badge.svg)](https://github.com/zonelessdev/zoneless/actions/workflows/ci.yml)
[![License: Apache 2.0](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](./LICENSE)
[![Node.js](https://img.shields.io/badge/node-%3E%3D18-brightgreen)](https://nodejs.org)
[![Angular](https://img.shields.io/badge/Angular-20-dd0031)](https://angular.dev)

> **The Open-source Stripe Connect Alternative. Pay your marketplace sellers globally with USDC. Near-zero fees. Instant payouts. No vendor lock-in. Self-host your entire payout stack.**

Zoneless is a self-hosted payment infrastructure for marketplaces and platforms. It provides a Stripe-compatible API for account onboarding, transfers, and payouts — except sellers get paid in USDC to their Solana wallet.

```typescript
// import Stripe from 'stripe';
// const client = new Stripe('sk_live_...');

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
