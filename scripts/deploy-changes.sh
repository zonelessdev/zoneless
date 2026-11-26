#!/bin/bash
# Works out which apps need deploying to an environment: those affected by
# what has changed since the environment's last successful deployment. Prints
# `api=true|false` and `web=true|false`.
#
# Both are deployed when there is no earlier deployment to compare with, or
# when the deploy workflow or Hosting config has itself changed.
#
# Usage:
#   ./scripts/deploy-changes.sh <environment>
#
# Needs a full git history, GITHUB_REPOSITORY, and a token for `gh`.

set -euo pipefail

ENVIRONMENT="${1:?environment name is required, e.g. test}"
DEPLOY_FILES=(.github/workflows/deploy.yml .github/deploy/hosting.json)

Print() {
  echo "api=$1"
  echo "web=$2"
}

LAST_DEPLOYED="$(gh api graphql \
  -f owner="${GITHUB_REPOSITORY%/*}" \
  -f name="${GITHUB_REPOSITORY#*/}" \
  -f environment="$ENVIRONMENT" \
  -f query='
    query($owner: String!, $name: String!, $environment: String!) {
      repository(owner: $owner, name: $name) {
        deployments(
          environments: [$environment]
          first: 30
          orderBy: { field: CREATED_AT, direction: DESC }
        ) {
          nodes { commitOid latestStatus { state } }
        }
      }
    }' \
  --jq '[.data.repository.deployments.nodes[]
    | select(.latestStatus.state == "SUCCESS")][0].commitOid // empty')"

if [[ -z "$LAST_DEPLOYED" ]] || ! git cat-file -e "${LAST_DEPLOYED}^{commit}" 2>/dev/null; then
  echo "No earlier deployment to compare with: deploying everything." >&2
  Print true true
  exit
fi

if ! git diff --quiet "$LAST_DEPLOYED" HEAD -- "${DEPLOY_FILES[@]}"; then
  echo "The deploy workflow changed since ${LAST_DEPLOYED:0:7}: deploying everything." >&2
  Print true true
  exit
fi

AFFECTED="$(npx nx show projects --affected --base="$LAST_DEPLOYED" --head=HEAD)"
echo "Affected since ${LAST_DEPLOYED:0:7}: ${AFFECTED//$'\n'/ }" >&2

IsAffected() {
  grep -qx "$1" <<<"$AFFECTED" && echo true || echo false
}
Print "$(IsAffected api)" "$(IsAffected web)"
