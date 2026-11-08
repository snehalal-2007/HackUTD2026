#!/usr/bin/env bash
# Honeypot demo: get everything running, open the console, then launch the attacker on cue.
#
# Usage:
#   scripts/demo-honeypot.sh            local demo (starts SpacetimeDB + console if needed)
#   scripts/demo-honeypot.sh --fresh    wipe the local database first (removes operators too)
#   scripts/demo-honeypot.sh --yes      don't wait for Enter before attacking
#   scripts/demo-honeypot.sh prod       attack Maincloud (the release manager must have published the honeypot);
#                                       set CONSOLE_URL to the deployed console to open it
set -euo pipefail
cd "$(dirname "$0")/.."

TARGET=local FRESH=0 WAIT=1
for a in "$@"; do
  case "$a" in
    prod|maincloud) TARGET=prod ;;
    local) TARGET=local ;;
    --fresh) FRESH=1 ;;
    --yes|-y) WAIT=0 ;;
    *) echo "Unknown option: $a" >&2; exit 1 ;;
  esac
done

DB_LOCAL="${SPACETIME_DB:-mesa}"
CONSOLE_PORT=5173
LOGS="${TMPDIR:-/tmp}/mesa-demo"
mkdir -p "$LOGS"
b() { printf '\033[1m%s\033[0m\n' "$*"; }
ok() { printf '  \033[32m✓\033[0m %s\n' "$*"; }
listening() { lsof -iTCP:"$1" -sTCP:LISTEN -n -P >/dev/null 2>&1; }
wait_port() { for _ in $(seq 1 60); do listening "$1" && return 0; sleep 0.5; done; echo "Timed out waiting for port $1 (logs in $LOGS)" >&2; exit 1; }

if [[ "$TARGET" == local ]]; then
  b "1. Local database"
  if listening 3000; then ok "SpacetimeDB already running on :3000"
  else
    spacetime start >"$LOGS/spacetime.log" 2>&1 &
    wait_port 3000; ok "Started SpacetimeDB (log: $LOGS/spacetime.log)"
  fi

  if [[ "$FRESH" == 1 ]]; then
    pnpm -s publish:local -- --delete-data >"$LOGS/publish.log" 2>&1
    ok "Published the module with a wiped database (re-register on the Operators page)"
  elif ! spacetime sql "$DB_LOCAL" "SELECT * FROM quarantine" --server local >/dev/null 2>&1; then
    pnpm -s publish:local >"$LOGS/publish.log" 2>&1
    ok "Published the module with the honeypot to '$DB_LOCAL'"
  else
    ok "Honeypot tables already on '$DB_LOCAL'"
  fi

  b "2. Console"
  if listening "$CONSOLE_PORT"; then ok "Console already running"
  else
    pnpm --filter @mesa/console dev >"$LOGS/console.log" 2>&1 &
    wait_port "$CONSOLE_PORT"; ok "Started the console (log: $LOGS/console.log)"
  fi
  URL="http://localhost:$CONSOLE_PORT"
  export STDB_URI="${STDB_URI:-ws://127.0.0.1:3000}" STDB_DB="$DB_LOCAL"
else
  b "1. Maincloud"
  export STDB_URI="${STDB_URI:-wss://maincloud.spacetimedb.com}" STDB_DB="${MAINCLOUD_DB:-hackutd2026-0nef9}"
  ok "Attacking $STDB_DB on $STDB_URI"
  URL="${CONSOLE_URL:-}"
  b "2. Console"
fi

if [[ -n "$URL" ]]; then
  open "$URL" 2>/dev/null || xdg-open "$URL" 2>/dev/null || true
  ok "Opened $URL"
else
  echo "  Open the deployed console yourself (or set CONSOLE_URL)."
fi

b "3. Attack"
echo "  Put the console on the Floor page (any page except Security), so the banner shows up."
if [[ "$WAIT" == 1 ]]; then read -r -p "  Press Enter to launch the attacker… " _; fi
echo
pnpm -s --filter @mesa/agent exec tsx ../../security/attack-scripts/attack-demo.ts
echo

b "4. What to show"
cat <<'EOF'
  • The red "Intrusion" banner at the top of every open console
  • The red count next to Security in the sidebar
  • Open Security: "Intrusion detected", the feed, click an event for the suggested fix
  • Quarantined identities: the attacker's identity, with its hit count
  • The last line above: "pivot REJECTED, identity quarantined", enforced by the database, not the UI
EOF
if [[ "$TARGET" == local ]]; then
  echo
  echo "  SpacetimeDB and the console keep running. Run this again to attack again;"
  echo "  add --fresh for a clean database."
fi
