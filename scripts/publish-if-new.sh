#!/bin/bash
# Publishes an npm tarball unless that exact version is already on the
# registry. Extra arguments are passed to `npm publish`.
#
# Usage:
#   ./scripts/publish-if-new.sh <tarball> [npm publish arguments]

set -euo pipefail

TARBALL="${1:?tarball path is required}"
shift

MANIFEST="$(tar -xOf "$TARBALL" package/package.json)"
NAME="$(node -p 'JSON.parse(process.argv[1]).name' "$MANIFEST")"
VERSION="$(node -p 'JSON.parse(process.argv[1]).version' "$MANIFEST")"

# Ask the registry directly so the answer does not depend on npm's auth state.
STATUS="$(curl --silent --output /dev/null --write-out '%{http_code}' \
  "https://registry.npmjs.org/${NAME/\//%2f}/${VERSION}")"

case "$STATUS" in
  200)
    echo "${NAME}@${VERSION} is already published. Nothing to do."
    ;;
  404)
    echo "Publishing ${NAME}@${VERSION}..."
    npm publish "$TARBALL" --access public "$@"
    ;;
  *)
    echo "Could not check ${NAME}@${VERSION}: registry returned ${STATUS}." >&2
    exit 1
    ;;
esac
