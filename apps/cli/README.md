# @zoneless/cli

CLI for securely provisioning Zoneless platforms for agent-managed store or
marketplace integrations.

Run without installing globally:

```bash
npx @zoneless/cli@latest agent setup --platform-name "My agent store"
```

Or install once with `npm install --global @zoneless/cli` and replace
`npx @zoneless/cli@latest` below with `zoneless`.

The command generates a Solana wallet locally, opens a one-time authorization
flow, provisions live and test environments after human approval, saves API
keys and the wallet secret in the operating-system credential store, and
installs the `zoneless-store` Agent Skill in the current project. Secrets are
never printed or sent to the approval page.

For an existing marketplace that should add Zoneless as an optional USDC payout
method while preserving checkout and its other payout methods, select the
marketplace skill:

```bash
npx @zoneless/cli@latest agent setup \
  --platform-name "My marketplace" \
  --skill marketplace \
  --json
```

The final JSON object includes `skill_path`, the exact local path to
`.agents/skills/zoneless-marketplace/SKILL.md`. The agent should read that file
before changing the marketplace. Omitting `--skill` continues to install the
`zoneless-store` skill. The supported values are `store` and `marketplace`.

To install either skill without provisioning a platform:

```bash
npx @zoneless/cli@latest agent install-skill --skill marketplace --json
```

`agent setup` provisions managed Zoneless Cloud platforms. Self-hosted
deployments use their own setup flow, then provide the resulting API URL and API
key to the CLI.

In an interactive terminal, press Enter when prompted to open the authorization
page in the default browser. With `--json` or non-interactive execution, the CLI
prints the verification URL without opening a browser so an agent can present it
to the human approving the request.

Running setup again with valid local profiles reuses them without rotating API
keys or changing wallets. Setup validates both keys before reuse and writes
`.zoneless/project.json`, a non-secret binding that lets commands run from the
repository without relying on whichever profile was last used globally.

If a key was rotated or revoked, authorize replacement keys without creating a
new platform:

```bash
npx @zoneless/cli@latest auth reconnect --json
```

Create another isolated platform with:

```bash
npx @zoneless/cli@latest agent setup \
  --platform-name "Second store" \
  --new-platform
```

Reconnecting keeps the platform and wallet while replacing the previous agent
API keys. The original wallet backup is still required if its local key was
lost.

After setup:

```bash
npx @zoneless/cli@latest doctor --json
npx @zoneless/cli@latest env sync --include-wallet --json
npx @zoneless/cli@latest store init \
  --name "Agent product" \
  --amount 200 \
  --description "A $2 USDC test product" \
  --json
```

`env sync` validates the selected profile, finds an unambiguous local env file
or creates the framework-appropriate default, and updates
`ZONELESS_API_URL`, `ZONELESS_API_KEY`, and, with `--include-wallet`,
`SOLANA_SECRET_KEY`. It preserves unrelated values, adds the target to
`.gitignore`, sets owner-only permissions, and never prints secret values. Use
`--target <path>` when the repository contains multiple env files. This command
is for local development; continue to use the deployment secret manager for
live credentials.

`--amount` is expressed in minor units, so `200` means `2.00 USDC`. The API URL
determines whether resources are created in the hosted test or live environment,
or in the configured mode of a self-hosted environment. Setup binds the
repository to its test and live profiles and selects test by default. Pass an
explicit `--profile <name>` when working with another profile.

Inspect non-secret profile metadata with:

```bash
npx @zoneless/cli@latest auth status --json
```

Create an offline wallet backup from an interactive terminal:

```bash
npx @zoneless/cli@latest wallet backup \
  --output ~/secure-backups/zoneless-wallet.json
```

The backup contains the private key in both its original base64 representation
and an SDK-compatible `secretKeyBase58` field. For a server-side payout worker,
place `secretKeyBase58` directly in the deployment secret manager as
`SOLANA_SECRET_KEY`. The file is created with owner-only permissions; delete
the temporary export securely after storing the secret, and never expose it to
an agent.

Environment credentials remain supported for CI and self-hosted deployments:

```bash
export ZONELESS_API_URL=https://your-api.example/v1
export ZONELESS_API_KEY=zk_...
npx @zoneless/cli@latest doctor --json
```
