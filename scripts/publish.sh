#!/usr/bin/env bash
# Publish the module. Usage: scripts/publish.sh [local|maincloud] [extra spacetime args]
#   local:     database $SPACETIME_DB (default mesa) on your own `spacetime start`
#   maincloud: production database $MAINCLOUD_DB (default hackutd2026-0nef9)
# Only the release manager publishes to maincloud, from main, at a gate.
set -euo pipefail
cd "$(dirname "$0")/.."
TARGET="${1:-local}"; shift || true
case "$TARGET" in
  local)     DB="${SPACETIME_DB:-mesa}" ;;
  maincloud) DB="${MAINCLOUD_DB:-hackutd2026-0nef9}"
             if [[ "$(git rev-parse --abbrev-ref HEAD)" != "main" ]]; then
               echo "Refusing to publish to maincloud from a branch other than main." >&2; exit 1
             fi ;;
  *) echo "Unknown target '$TARGET'. Use local or maincloud." >&2; exit 1 ;;
esac
echo "Publishing module to $DB on $TARGET"
spacetime publish "$DB" --server "$TARGET" --module-path ./module --yes "$@"
bash scripts/generate-bindings.sh
