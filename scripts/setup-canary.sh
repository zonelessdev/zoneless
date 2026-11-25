#!/bin/bash
# One-time setup for the live payment check that runs after a deploy. It
# stores two secrets in a GitHub environment without displaying either:
#   - the API key of a platform account kept for the check
#   - the key of a new wallet that pays one cent per check
#
# The wallet's key exists only in GitHub, so the wallet can be spent from but
# not emptied. Fund it with a small amount of USDC.
#
# Usage:
#   ./scripts/setup-canary.sh <environment>

set -euo pipefail

ENVIRONMENT="${1:?environment name is required, e.g. cloud}"

if gh secret list --env "$ENVIRONMENT" --json name --jq '.[].name' |
  grep -qx CANARY_WALLET_SECRET_KEY; then
  echo "\"$ENVIRONMENT\" already has a canary wallet. Remove the" >&2
  echo "CANARY_WALLET_SECRET_KEY secret first to replace it." >&2
  exit 1
fi

read -r -s -p "API key of the canary platform account: " API_KEY
echo
[[ -n "$API_KEY" ]] || { echo "No API key entered." >&2; exit 1; }

WALLET="$(node -e '
  const { Keypair } = require("@solana/web3.js");
  const bs58 = require("bs58");
  const wallet = Keypair.generate();
  console.log(
    wallet.publicKey.toBase58(),
    (bs58.default || bs58).encode(wallet.secretKey)
  );
')"

printf '%s' "$API_KEY" | gh secret set CANARY_API_KEY --env "$ENVIRONMENT"
printf '%s' "${WALLET##* }" |
  gh secret set CANARY_WALLET_SECRET_KEY --env "$ENVIRONMENT"

echo "Done. Send a small amount of USDC on Solana to the canary wallet:"
echo "  ${WALLET%% *}"
