# Contributing to Zoneless

Thanks for wanting to help. Zoneless is an open-source payments platform you can self-host on your own infrastructure. Imagine an open-source Stripe that you own.

The goal is to stay open source through the whole stack: the payment rail, the blockchain, the stablecoins, and the software that sits on top.

We only take on external dependencies where something cannot reasonably be open sourced today. Card networks are the usual example: accepting a Visa or Mastercard payment is not something we can currently do with an open stack, so that kind of integration stays optional and at the edges.

If you have a question, [join the Discord](https://discord.gg/mdMQJug9mG) or open a [GitHub issue](https://github.com/zonelessdev/zoneless/issues). Product docs, API reference, and self-hosting live at [docs.zoneless.com](https://docs.zoneless.com) and can be edited in this repo under [`apps/docs`](apps/docs).

This project is governed by our [Code of Conduct](CODE_OF_CONDUCT.md). By participating, you are expected to uphold it.

## Looking for something to work on?

Browse [good first issue](https://github.com/zonelessdev/zoneless/issues?q=is%3Aissue+is%3Aopen+label%3A%22good+first+issue%22) for small, well-scoped tasks or [help wanted](https://github.com/zonelessdev/zoneless/issues?q=is%3Aissue+is%3Aopen+label%3A%22help+wanted%22) for larger contributions.

If you want to work on an issue, leave a comment before starting so we can avoid duplicate work.

For larger changes, open an issue first and agree on the approach before writing code.

Then:

1. Set up the repo locally (below).
2. Make a small, focused change with tests.
3. Open a pull request.

Please do not open one huge pull request of untested, AI-generated code. Small, scoped PRs with a clear goal are much easier to review and much more likely to land.

## Design thesis

The API should match Stripe.

If you are unsure how a resource, field, webhook, or object should look, check the [Stripe docs](https://docs.stripe.com/api) and follow that structure: field names, object shapes, emitted events, and behaviour. Zoneless uses USDC on Solana instead of cards and bank accounts, but the programming model should feel like Stripe. See the [API reference](https://docs.zoneless.com) and [migrating from Stripe](https://docs.zoneless.com/migrate-from-stripe) for how that mapping works in this project.

## Other ways to contribute

You do not need to write code to help. Useful contributions include bug reports, docs fixes, and reproductions.

- **Bugs.** Search [existing issues](https://github.com/zonelessdev/zoneless/issues) first. Include steps to reproduce, expected vs actual behaviour, and environment details (OS, Node version, browser).
- **Features.** Feature requests live in the [issues tab](https://github.com/zonelessdev/zoneless/issues). Open one before building something large.
- **Questions and design discussion.** Use [Discord](https://discord.gg/mdMQJug9mG). Issues are better for work that should be tracked and reviewed.

## Development setup

You need Node.js 24 (see `.nvmrc`), npm, and Docker (for MongoDB).

```bash
git clone https://github.com/YOUR_USERNAME/zoneless.git
cd zoneless
git remote add upstream https://github.com/zonelessdev/zoneless.git
npm install
docker compose up -d        # MongoDB
npx nx serve api            # API on :3333
npx nx serve web            # Dashboard on :4203
npx nx serve docs           # Docs on :4205
```

Or run the API and dashboard together:

```bash
npm run dev
```

To run the full Docker stack instead (API, dashboard, and database behind one local URL), follow the [self-hosting](https://docs.zoneless.com/self-hosting) and [local development](https://docs.zoneless.com/local-development) guides.

Test mode uses simulated funds by default (`SETTLEMENT_RAIL=simulated`). To exercise Solana Devnet, set `LIVEMODE=false` and `SETTLEMENT_RAIL=onchain`.

### Tests, lint, and formatting

```bash
npx nx test api
npx nx test web
npx nx test docs
npx nx test node-sdk
npx nx lint api --fix
npx nx lint web --fix
npx nx lint docs --fix
npx nx lint node-sdk --fix
npm run format
```

CI also runs `npm run format:check` and `npx nx run-many --target=test --all`. Run those locally before you open a PR.

`npx nx e2e api-e2e` runs the end-to-end payment tests. It starts the built API in simulated test mode against a separate `zoneless_e2e` database, then drives checkout, transfers, and payouts over HTTP. MongoDB must be running (`npm run start:db`). CI runs it on every pull request.

## Pull requests

1. Branch from `main`. Name the branch whatever describes the change (`fix-payout-status`, `account-link-return-url`, and so on). A `feature/` prefix is not required.
2. Keep the change small and focused on one goal.
3. Add tests for the behaviour you changed. If the change affects a public API, dashboard flow, or self-hosting step, update the matching page in [`apps/docs`](apps/docs). Keep [`sdks/node`](sdks/node) in the same PR when you change API types or request schemas.
4. Follow the existing structure, naming, and formatting. Reuse styles from the styles folder rather than introducing new ones. Remove code that your change makes unused.
5. Use comments only where the code cannot say it clearly.
6. Fill out the PR template so reviewers know what changed and how you tested it.

### PR checklist

- [ ] Tests pass (`npx nx run-many --target=test --all`)
- [ ] Linting passes (`npx nx run-many --target=lint --all`)
- [ ] Formatting passes (`npm run format:check`)
- [ ] No merge conflicts with `main`

By contributing, you agree that your contributions are licensed under the [Apache License 2.0](./LICENSE).

## Style

- TypeScript for all new code
- PascalCase for function names: `GetAccount()`, `ValidateUser()`
- camelCase for variables: `accountId`, `userName`
- Prefer `const` over `let`, avoid `var`
- Use `async`/`await` over raw promises
- Standalone Angular components with signals for state
- Zod for API request validation
- Do not add a new dependency unless the work cannot be done with what is already in the repo

## Commit messages

We follow [Conventional Commits](https://www.conventionalcommits.org/):

```
<type>: <subject>
```

A scope is optional. Use one when it helps (`feat: add payout failure webhook`), not as a required `(api)` / `(web)` prefix.

Types: `feat`, `fix`, `docs`, `style`, `refactor`, `perf`, `test`, `chore`

Examples:

```
feat: emit payout.failed webhook on on-chain error
fix: validate wallet address on paste
docs: clarify test-mode settlement defaults
```

## Working with coding agents

If you use Cursor, Claude Code, or a similar agent, this repo has an [AGENTS.md](./AGENTS.md). Coding tools pick that file up automatically.

The agent still needs a small, reviewable change with tests. A large generated diff is not a shortcut around the pull request process.

## Security

Do not report vulnerabilities in public issues. See [SECURITY.md](./SECURITY.md).
