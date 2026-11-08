# Incident Rules and the Log View

Telemetry now turns into incidents automatically, with fixed threshold rules and no AI in the decision. The agent reacts to the incidents' status changes by writing reports (`docs/agents/MODULE_CONTRACT.md`), and the console's **Log** view shows feeds, incidents and the audit trail.

## Rules (module)

Rules run inside `ingest_readings`, in the same transaction as the data, so they are deterministic and replayable. Every limit is a row in the public `threshold` table; change it live with `spacetime sql … UPDATE threshold …` as the database owner.

| Metric | Warn | Crit | Open after | Close after | Clear margin |
|---|---|---|---|---|---|
| `gpu_temp_c` (hottest GPU in a rack) | 50 °C | 55 °C | 3 batches in a row over warn (~30 s) | 12 batches in a row under warn − margin (~2 min) | 2 °C |
| `feed_silence_s` (time since a data center's last batch) | 30 s | 60 s | First watchdog check over warn | First batch received | n/a |

### Rack temperature lifecycle

| Event | What happens | Agent |
|---|---|---|
| Hottest GPU ≥ 50 °C for 3 batches | Opens a `gpu_temp` incident, severity `high` (or `critical` if already ≥ 55 °C or a GPU failure is reported) | |
| Reaches 55 °C, or a GPU failure, while open | Severity becomes `critical`, status `escalated` | Interim report |
| Below 48 °C for 12 batches | Status `closed`, reason `recovered` | Final report |

- Between 48 °C and 50 °C both counts hold (hysteresis), so a rack hovering at the limit neither opens nor closes.
- The 2-minute close window is a stabilization window: in testing, one rack hovering near 50 °C opened and closed 4 times in an hour with a 30-second window, and once with 2 minutes.
- One open incident per rack at a time; `peak_value` keeps the highest temperature seen.

### Feed watchdog

`watch_feeds` runs every 10 seconds (scheduled reducer, so it runs with no clients connected). A data center silent for 30 seconds gets a `feed_stale` incident (`critical` past 60 s). The next batch from that data center closes it with reason `feed resumed`.

### Tables added

| Table | Public | Purpose |
|---|---|---|
| `threshold` | Yes | Limits and counts, as data |
| `feed_health` | Yes | Per data center: last batch, batch and reading counts, stale flag |
| `rack_probe` | No | Running counts per rack |
| `watchdog_timer` | No | Schedules `watch_feeds` |
| `incident` (changed) | Yes | New columns `kind`, `rack_id`, `source`, `peak_value`, `closed_reason`, added with defaults so existing databases migrate without a reset |

Every open, escalation and close is appended to the hash-chained `event_log` with actor `rules`.

## Log view (console)

**Log** in the sidebar (System section).

- **Telemetry feeds:** one chip per data center with time since its last batch, ticking live; "Silent" in red when the watchdog has marked it stale.
- **Incidents:** active first (escalated, open, acknowledged), then closed under **All**. Severity, status, data center and rack, peak value, how it was opened, close reason, and which agent reports exist.
- **Event log:** the audit trail on the ReUI timeline, newest first, 12 per page with **Newer** and **Older**. **Verify chain** recomputes every hash in the browser with the same function as the module and reports "Chain intact" or the first broken event.
- **View all** opens every event as a table at **`/logs/1`, `/logs/2`, …** (50 per page, newest first): sequence number, full timestamp, actor, action, target, incident and hash. Pages can be linked and the browser's Back button works; a page past the end offers a jump to the last page. The column headers stay pinned while the table scrolls.
- **No page overflow:** on desktop the Log view and the table page fit the window and each panel scrolls inside itself. On phones the Log view is one ordinary scroll.

### Local cache

The console keeps a snapshot of the Log view (all feeds and incidents, newest 200 events, about 22 KB) in `localStorage`, saved at most every 2 seconds. On reload the view paints instantly from it, marked **Cached**, until the live subscription is ready. While cached, feeds show "Last known" instead of "Live" and **Verify chain** is disabled. If storage is blocked the view still works; it just loads from the network.

Live updates themselves need no extra cache: the SpacetimeDB client already holds every subscribed row in memory.

## Tested locally

- One replayed hour: 10 rule incidents; 2 racks critical (peaks 55.9 °C and 57 °C); one escalation; 8 closed as recovered. With the 2-minute close window the flapping rack produced 1 incident instead of 4.
- Stopping the replayer opened 8 `feed_stale` incidents after 34 s; resuming one data center closed only its incident.
- The browser's **Verify chain** matched the module's hashes (59 events); editing one event's text directly in the database made it report "Chain broken at event #10".
- With the database unreachable, a reload showed the cached view, labeled, with Verify disabled. Phone width (375 px) has no horizontal scroll.

## Deploying (order matters)

1. Merge this PR. Railway redeploys the replayer from `main` with the new exit-on-disconnect behavior.
2. Then publish the module from `main` (`pnpm publish:prod`). Adding columns to `incident` disconnects all clients; the replayer exits and Railway restarts it.
