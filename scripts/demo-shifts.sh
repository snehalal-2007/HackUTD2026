#!/usr/bin/env bash
# Demo shifts for My Queue on the LOCAL database only: puts the three demo accounts on different shifts,
# so you can watch tasks move between shifts. Never run this against Maincloud.
#
#   Marcus  night shift that ends ~90 s after you run this, holding two tasks.
#                       When it ends, the shift timer puts his unfinished tasks back as leftovers.
#   Priya   on shift for 4 more hours, holding one task.
#   Daniel off shift.
#
# Then start your own shift in My Queue: you get Marcus's leftovers first.
# Usage: bash scripts/demo-shifts.sh        (re-run any time to reset the demo shifts)
#        bash scripts/demo-shifts.sh clear  (take them off shift and free their tasks)
set -euo pipefail
cd "$(dirname "$0")/.."
DB="${SPACETIME_DB:-mesa}"
# --no-config: spacetime.local.json names a database ("mesa"), and the CLI would send these queries there instead of $DB.
sql() { spacetime sql --no-config --server local "$DB" "$1" 2>/dev/null; }

# The accounts are real identities made by scripts/demo-accounts.ts (sign in with first name / first name).
[[ -f .demo-accounts.json ]] || { echo "Run pnpm demo:accounts first (it creates the accounts, then runs this)." >&2; exit 1; }
id_of() { python3 -c "import json,sys; print(json.load(open('.demo-accounts.json'))[sys.argv[1]]['identity'])" "$1"; }
MARCUS=$(id_of Marcus); PRIYA=$(id_of Priya); DANIEL=$(id_of Daniel)
# Older versions of this script made placeholder identities; remove them.
for old in 1 2 3; do sql "DELETE FROM operator WHERE identity = 0xc2de$(printf '%059d' 0)$old" >/dev/null; done

# Free any tasks the demo operators hold, then remove them.
for id in $MARCUS $PRIYA $DANIEL; do
  sql "UPDATE incident SET owner = '', owner_name = '', claimed_at_micros = 0, status = 'open' WHERE owner = '$id' AND status = 'acknowledged'" >/dev/null
  sql "UPDATE incident SET owner = '', owner_name = '', claimed_at_micros = 0 WHERE owner = '$id'" >/dev/null
  sql "UPDATE operator SET on_shift = false, shift_started_micros = 0, shift_ends_micros = 0 WHERE identity = 0x$id" >/dev/null
done
sql "UPDATE incident SET handed_from = '' WHERE handed_from != ''" >/dev/null
[[ "${1:-}" == "clear" ]] && { echo "Demo shifts cleared (the accounts stay; sign in as them any time)."; exit 0; }

NOW=$(( $(date +%s) * 1000000 ))
H=3600000000
set_shift() { # identity on_shift started ends
  sql "UPDATE operator SET on_shift = $2, shift_started_micros = $3, shift_ends_micros = $4 WHERE identity = 0x$1" >/dev/null
}
set_shift $MARCUS true  $(( NOW - 8 * H )) $(( NOW + 90 * 1000000 ))
set_shift $PRIYA  true  $(( NOW - 4 * H )) $(( NOW + 4 * H ))
set_shift $DANIEL false 0 0

# Hand out active, unowned incidents: two to Marcus, one to Priya.
IDS=$(sql "SELECT incident_id FROM incident WHERE status != 'closed' AND owner = ''" | awk 'NR>2 && $1 ~ /^[0-9]+$/ {print $1}')
i=0
for id in $IDS; do
  if   (( i < 2 )); then who=$MARCUS; name='Marcus'
  elif (( i < 3 )); then who=$PRIYA;  name='Priya'
  else break; fi
  sql "UPDATE incident SET owner = '$who', owner_name = '$name', claimed_at_micros = $NOW WHERE incident_id = $id" >/dev/null
  sql "UPDATE incident SET status = 'acknowledged' WHERE incident_id = $id AND status = 'open'" >/dev/null
  i=$(( i + 1 ))
done
echo "Demo operators added. Marcus's shift ends in ~90 s; his unfinished tasks then become leftovers."
sql "SELECT incident_id, status, severity, owner_name, handed_from FROM incident WHERE status != 'closed'"
