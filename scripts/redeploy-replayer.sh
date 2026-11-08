#!/usr/bin/env bash
# Redeploy the telemetry replayer on Railway from the latest source of its configured branch.
# Run it after a module publish (which disconnects the replayer) or when the feed has stopped.
#
# Usage: scripts/redeploy-replayer.sh [--yes] [--no-wait] [--dry-run]
#   --yes       skip the confirmation prompt
#   --no-wait   return right after the redeploy starts instead of waiting for the result
#   --dry-run   print what would run and change nothing
#
# Needs the Railway CLI, logged in and linked to the project (`railway login`, `railway link`).
# Only the release manager runs this: it restarts a production service. It prints no variables.
set -euo pipefail
cd "$(dirname "$0")/.."

YES=0; WAIT=1; DRY=0
for arg in "$@"; do
  case "$arg" in
    --yes|-y) YES=1 ;;
    --no-wait) WAIT=0 ;;
    --dry-run) DRY=1 ;;
    -h|--help) sed -n '2,13p' "$0"; exit 0 ;;
    *) echo "Unknown option '$arg'. Use --yes, --no-wait or --dry-run." >&2; exit 1 ;;
  esac
done

command -v railway >/dev/null || { echo "Install the Railway CLI first: https://docs.railway.com/guides/cli" >&2; exit 1; }
railway whoami >/dev/null 2>&1 || { echo "Not logged in to Railway. Run: railway login" >&2; exit 1; }

echo "Redeploying this Railway service (workspace, project, environment, service):"
railway status | sed -n '1,14p'

if [[ "$DRY" == 1 ]]; then
  echo "Dry run: would run 'railway redeploy --from-source --yes' and then wait for the deployment."
  exit 0
fi

if [[ "$YES" != 1 ]]; then
  read -r -p "Restart the production replayer from the latest source? [y/N] " answer
  [[ "$answer" =~ ^[Yy]$ ]] || { echo "Cancelled."; exit 1; }
fi

railway redeploy --from-source --yes

if [[ "$WAIT" == 1 ]]; then
  echo "Waiting for the new deployment (up to 5 minutes)..."
  status=""
  for _ in $(seq 1 60); do
    status="$(railway deployment list --limit 1 2>/dev/null | sed -n 2p)"
    # The first row can still be the previous deployment for a moment, so wait for a final state.
    if echo "$status" | grep -qE "SUCCESS|FAILED|CRASHED|REMOVED"; then break; fi
    sleep 5
  done
  echo "$status"
  echo "Recent replayer logs (look for 'connected to' and 'sample 1/352'):"
  railway logs --lines 12 2>&1 | tail -14
  echo "Then check the Log view in the console: feeds should read Live within a few seconds."
fi
