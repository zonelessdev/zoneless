# AGENTS.md

Zoneless is an open-source, Stripe-compatible payments platform that uses USDC on Solana. Platforms like marketplaces can self-host their own instance.

This is an Nx monorepo with an Angular frontend (dashboard, checkout, connected-account onboarding, and docs), an Express API, and the Node SDK in [`sdks/node`](sdks/node).

Public product docs live in [`apps/docs`](apps/docs). Serve them with `npx nx serve docs`. Edit the TypeScript page trees, not generated Markdown.

## Design

The API, object shapes, webhook events, and dashboard flows should match Stripe. If you are unsure how something should look, check the [Stripe docs](https://docs.stripe.com/api) and follow that structure. Zoneless uses USDC, Solana wallets, and crypto instead of cards and bank accounts.

Prefer existing patterns in this repo over new ones. Do not add a dependency unless the work cannot be done with what is already here.

## Code

- Write DRY TypeScript that matches the existing formatting, folder structure, and code structure
- PascalCase for function names, camelCase for variables (SDK resource methods follow Stripe's naming)
- Prefer `const` over `let`; use `async`/`await`
- Standalone Angular components with signals for state
- Zod for API request validation
- Reuse styles from the styles folder
- Remove unused code
- Comments only where the code cannot say it clearly

## API docs

Document every public endpoint for the resource that exists in [`apps/api/src/routes`](apps/api/src/routes). Open the matching [Stripe API reference](https://docs.stripe.com/api) page and follow its structure (object, endpoints, parameters, examples). The route, Zod schema in [`libs/shared-schemas`](libs/shared-schemas), and type in [`libs/shared-types`](libs/shared-types) decide which fields exist — do not invent card or bank objects.

Copy a similar existing resource. For small resources, use [`login-links.ts`](apps/docs/src/app/pages/docs/data/login-links.ts) or [`account-links.ts`](apps/docs/src/app/pages/docs/data/account-links.ts):

1. Add `apps/docs/src/app/pages/docs/data/<resource>.ts` with a `*_SUBSECTION`, attribute lists, sample JSON, method pages, and a `*_PAGES` array
2. Re-export from [`data/index.ts`](apps/docs/src/app/pages/docs/data/index.ts)
3. Add the subsection to the appropriate API section in [`data/connect.ts`](apps/docs/src/app/pages/docs/data/connect.ts)
4. Map the slug in [`docs-catalog.ts`](apps/docs/src/app/pages/docs/docs-catalog.ts)
5. Add events in [`event-types.ts`](apps/docs/src/app/pages/docs/data/event-types.ts) if the resource emits them

Keep copy close to Stripe, but not identical. Shorten wordy Stripe prose. Write as Zoneless, not as a Stripe comparison. Mention Stripe rarely.

Mark required, expandable, and nullable fields the same way neighbouring pages do (`required`, `requiredText`, `expandable`, `nullable`, `enumValues`, `EXPAND_TOOLTIP`). Prefix fields or endpoints Stripe does not have with `<strong>Zoneless extension:</strong>` on the attribute, or a `Zoneless extension: ` callout on the page.

Reuse `NODE_INIT` and `BuildEndpointSummaries`. Node examples must use the real SDK names (`zoneless.checkout.sessions.create`). Use different timestamps, names, and IDs than Stripe's samples.

## Node SDK

Add methods in [`sdks/node`](sdks/node) for every public route for the resource. Open the matching [Stripe API reference](https://docs.stripe.com/api) page and copy its Node SDK shape and names: `subscriptions.create()`, `checkout.sessions.create()`, `identity.verificationSessions.create()`.

Copy [`Customers.ts`](sdks/node/src/resources/Customers.ts) for a flat resource or [`Checkout.ts`](sdks/node/src/resources/Checkout.ts) for a namespace. Return types come from `@zoneless/shared-types`. Request types are `*Input` aliases imported from `../generated/Inputs` (expanded from `@zoneless/shared-schemas` on build).

Wire the class in [`sdks/node/src/index.ts`](sdks/node/src/index.ts) and [`sdks/node/src/resources/index.ts`](sdks/node/src/resources/index.ts). Run `npx nx build node-sdk` so `generate-inputs.ts` picks up new Input imports. Add a focused test.

Do not wrap internal routes (`/operator`, `/setup`, `/auth`, `/telemetry`, `/payment_pages`, inbound webhooks). Docs Node snippets must match the methods you add.

## Changes

Keep diffs small and focused. Add tests for behaviour you change. Do not produce one large untested patch.

When you change how money moves (checkout, balances, transfers, payouts), run `npx nx e2e api-e2e` and extend [`apps/api-e2e`](apps/api-e2e) to cover the new behaviour.

When you change a public API, update docs and the Node SDK in the same PR.

Human process, PR size, and how to pick work are in [CONTRIBUTING.md](./CONTRIBUTING.md).
