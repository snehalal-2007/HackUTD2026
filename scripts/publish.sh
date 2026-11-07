#!/usr/bin/env bash
# Publish the module. Usage: scripts/publish.sh [local|maincloud] [extra spacetime args]
# Only the release manager publishes to maincloud, from main, at a gate.
set -euo pipefail
cd "$(dirname "$0")/.."
TARGET="${1:-local}"; shift || true
DB="${SPACETIME_DB:-mesa}"
if [[ "$TARGET" == "maincloud" && "$(git rev-parse --abbrev-ref HEAD)" != "main" ]]; then
  echo "Refusing to publish to maincloud from a branch other than main." >&2; exit 1
fi
spacetime publish "$DB" --server "$TARGET" --module-path ./module --yes "$@"
bash scripts/generate-bindings.sh
