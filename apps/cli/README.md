# @zoneless/cli

CLI for provisioning a Zoneless platform and launching an agent-managed store.

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

`agent setup` provisions managed Zoneless Cloud platforms. Self-hosted
deployments use their own setup flow, then provide the resulting API URL and API
key to the CLI.

In an interactive terminal, press Enter when prompted to open the authorization
page in the default browser. With `--json` or non-interactive execution, the CLI
prints the verification URL without opening a browser so an agent can present it
to the human approving the request.

Running setup again with valid local profiles reuses them without rotating API
keys or changing wallets. Create another isolated platform with:

```bash
npx @zoneless/cli@latest agent setup \
  --platform-name "Second store" \
  --new-platform
```

If local credentials were lost, setup lets the human reconnect to an existing
platform on the approval page. Reconnecting keeps its wallet and replaces only
the previous agent API key; the original wallet backup is still required.

After setup:

```bash
npx @zoneless/cli@latest doctor --json
npx @zoneless/cli@latest store init \
  --name "Agent product" \
  --amount 200 \
  --description "A $2 USDC test product" \
  --json
```

`--amount` is expressed in minor units, so `200` means `2.00 USDC`. The API URL
determines whether resources are created in the hosted test or live environment,
or in the configured mode of a self-hosted environment. Setup selects the
stored `test` profile by default. Pass `--profile live` for live resources.

Inspect non-secret profile metadata with:

```bash
npx @zoneless/cli@latest auth status --json
```

Create an offline wallet backup from an interactive terminal:

```bash
npx @zoneless/cli@latest wallet backup \
  --output ~/secure-backups/zoneless-wallet.json
```

The backup contains the private key. It is created with owner-only permissions;
move it to encrypted offline storage and do not expose it to an agent.

Environment credentials remain supported for CI and self-hosted deployments:

```bash
export ZONELESS_API_URL=https://your-api.example/v1
export ZONELESS_API_KEY=zk_...
npx @zoneless/cli@latest doctor --json
```
