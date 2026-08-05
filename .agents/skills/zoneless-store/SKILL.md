---
name: zoneless-store
description: Launches a Zoneless USDC product and payment link, then integrates the checkout URL into a site. Use when an agent is asked to create a Zoneless store, sell a product with USDC, or add a Zoneless payment link.
---

# Launch a Zoneless store

Use the Zoneless CLI for resource creation. Do not create resources through the
dashboard or improvise raw API requests when the CLI is available.

## Safety requirements

- Never request, read, print, export, or transmit a wallet private key or seed
  phrase. The CLI generates it locally and stores it directly in the operating
  system's credential store.
- Treat API keys as secrets. Let the CLI read them from the operating-system
  credential store or environment; do not place them in prompts, commands,
  source files, logs, or reports.
- Stop on a partial failure. Report the returned resource IDs; do not create
  replacements until the user decides whether to retry with the same
  idempotency key.
- Never perform wallet signing, payout, or subscription operations as part of
  this workflow.

## Workflow

1. Read `https://zoneless.com/llms.txt`.
2. Read the Markdown docs linked there for authentication, products, prices,
   and payment links. Prefer URLs ending in `.md`.
3. Check whether Zoneless credentials are already available:

   ```bash
   npx @zoneless/cli@latest doctor --json
   ```

4. If the CLI reports that no profile or environment credentials exist, start
   one-time setup:

   ```bash
   npx @zoneless/cli@latest agent setup \
     --platform-name "<store name>" \
     --json
   ```

   Show the human the returned `verification_url` and `user_code`, then wait.
   Do not attempt to approve the request yourself. The command resumes after
   approval and stores both live and test profiles without printing secrets.
   If the user explicitly asked for another isolated platform, add
   `--new-platform`. Otherwise, setup reuses valid local profiles without
   changing their API keys or wallets. On a new machine, let the human choose
   create or reconnect on the approval page.

5. Run `npx @zoneless/cli@latest doctor --json` again. Setup selects the test
   profile. Use `--profile live` only when the user explicitly asked to create
   live resources.
6. Preview the requested product. Amounts use minor units; `200` means `2.00
   USDC:

   ```bash
   npx @zoneless/cli@latest store init \
     --name "<product name>" \
     --amount <positive integer> \
     --description "<description>" \
     --dry-run \
     --json
   ```

7. If the preview is correct, create the resources. Generate a non-secret,
   operation-specific idempotency key and retain it for retries:

   ```bash
   npx @zoneless/cli@latest store init \
     --name "<product name>" \
     --amount <positive integer> \
     --description "<description>" \
     --idempotency-key "<operation key>" \
     --json
   ```

8. Add the returned `checkout_url` to the site as the product's purchase link.
   Do not embed the API key or resource-creation code in the site.
9. Verify the checkout URL loads and that the visible product name and amount
   match the request.
10. Report only the final URL and the returned `product_id`, `price_id`, and
    `payment_link_id`. Mention retries or interventions without exposing
    secrets.

## Error handling

- Exit code `2`: fix invalid input or missing environment configuration.
- Exit code `4`: report the API error and request ID, if present.
- Exit code `5`: stop and report `partial_resources`. Retry only with the
  original `--idempotency-key` after the user approves.
