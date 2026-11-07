#!/usr/bin/env bash
# Regenerate TypeScript client bindings. Commit the output in the same PR as the schema change.
set -euo pipefail
cd "$(dirname "$0")/.."
OUT=packages/bindings/src
rm -rf "$OUT" && mkdir -p "$OUT"
spacetime generate --lang typescript --out-dir "$OUT" --module-path ./module --yes
echo "Bindings written to $OUT"
