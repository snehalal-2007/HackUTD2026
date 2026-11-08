# Demo Script: Two Laptops, Three Minutes

A beat-by-beat script for the HackUTD 2026 demo. It uses only what is merged on `main`: live telemetry feeds, an incident that opens by rule, the feed watchdog, the **Verify chain** check on the event log, and the 3D floor. Anything still in a branch is listed under [In progress](#in-progress) and is not in the script.

Since this script was written, incident toasts, the live temperature chart, motion, and the Cluster view (in-place throttle, live migration, rolling patch and the 3D live placement map) have merged. The two-laptop script below does not use the Cluster view and still runs as written; a toast now appears at the bottom right when an incident opens. The recorded version, which tells the capacity-neutral remediation story, is [DEMO-VIDEO.md](DEMO-VIDEO.md).

## The two screens

| | Laptop A (presenter) | Laptop B (audience) |
|---|---|---|
| Runs | SpacetimeDB, the replayer, a console | A console only |
| Console view | **Log** | **Floor** (Spartanburg, Floor 1) |
| Terminal | Two tabs: the replayer (command typed, not run) and the tamper command (typed, not run) | None |

Both consoles read the same database, so every change shows on both at once.

## Setup (before the demo, not counted in the 3 minutes)

The demo runs on a **local database on Laptop A**, not on Maincloud. Maincloud has the live feed, but the incident rules reach it only when the release manager runs `pnpm publish:prod`, and the watchdog beat needs the replayer stopped, which on Maincloud means stopping the Railway service. Rehearse locally.

1. Put both laptops on a network that lets them reach each other (a phone hotspot or a cable if the venue Wi-Fi isolates devices). Note Laptop A's IP address.
2. On Laptop A, start the database and publish a clean module. `--delete-data` wipes the local `mesa` database, so every run starts with an empty event log:

   ```bash
   pnpm dev:db
   ```

   ```bash
   bash scripts/publish.sh local --delete-data
   ```

3. Start a console on each laptop. Laptop B points at Laptop A:

   ```bash
   pnpm dev:console
   ```

   ```bash
   VITE_SPACETIME_URI=ws://<laptop-a-ip>:3000 pnpm dev:console
   ```

4. Open each console and click the view from the table above in the sidebar. The console opens on **AI Agent** by default; that page is sample content, so leave it. With no replayer running, the Log shows "No feeds yet" and the Floor shows "Connecting" or "No racks": that empty start is intended.
5. In the replayer tab on Laptop A, type (do not run): `pnpm replay`
6. In the second tab on Laptop A, type (do not run), with the database name `mesa`, `--server local` and `--no-config`:

   ```bash
   spacetime sql --no-config --server local mesa "UPDATE event_log SET target = 'edited by hand' WHERE seq = 2"
   ```

   The `--no-config` flag is needed when you run it from the repo root: `spacetime.local.json` names a database, and without the flag the CLI reads `mesa` as part of the query and fails with a 400 error.

7. Check the dataset credit is on screen on Laptop B: "Telemetry: ClusterWise (OLCF Summit), CC BY 4.0", under the temperature chart.

## The script

Total: 3:00. Timings in the "Cue" column are when each beat starts.

| Cue | Beat | Laptop A does | Laptop B shows |
|---|---|---|---|
| 0:00 | 1. The problem | Nothing | Empty Floor |
| 0:20 | 2. Feeds go live | Press Return in the replayer tab | The floor fills in |
| 0:45 | 3. An incident opens by rule | Point at the new incident in the Log | The hot block turns red |
| 1:10 | 4. The 3D floor | Stays on the Log | Click a floor, a block, the site map |
| 1:40 | 5. A feed stops, and the log proves itself | Ctrl+C the replayer, then **Verify chain**, the tamper command, **Verify chain** again | Unchanged |
| 2:15 | 6. The watchdog fires | Point at "Silent" and the new incidents, then restart the replayer | Unchanged |
| 2:40 | 7. The measured outcome | Stay on the Log | Stay on the Floor |

### 1. The problem (0:00 to 0:20)

**Say** (the NMC² workshop sentence):

> When a cooling unit starts failing twenty minutes before shift change, the on-site technician struggles to make sure the problem has an owner and is handed over, because the warning lives in one tool, the discussion in a chat channel and the handover in an end-of-night log, so it gets missed or handed over badly. MESA is one live place that every screen shares: the telemetry, the incident and the record of what happened.

**Do:** nothing. Let the empty screens show that nothing is faked.

### 2. Feeds go live (0:20 to 0:45)

**Do:** press Return in the replayer tab on Laptop A.

**Say:** "This is real telemetry from the Summit supercomputer, replayed so it arrives like a live feed. Eight data centers, 288 servers, one batch from each site about every ten seconds. We replay it because operators do not publish live rack data. Spartanburg is the one NMC² site; the other sites are simulated, and the map says so."

**Look for:** on Laptop A, eight chips under **Telemetry feeds**, each reading **Live** with "Last batch N s ago" and a batch count that climbs. On Laptop B, the floor fills in with live temperatures. Point at "NMC² · verified" under the map and at the credit line.

### 3. An incident opens by rule (0:45 to 1:10)

By now the replay has run about 25 seconds. The first racks start the hour above their limit, so incidents open about three batches in.

**Say:** "Nobody typed anything. A rule inside the database opens an incident when a rack's hottest GPU stays at or over 50 °C for three batches in a row, about 30 seconds. The limits are rows in a table, not code."

**Look for:** on Laptop A, under **Incidents** (Active), entries such as "Spartanburg rack a18: GPU at 5x °C (limit 55 °C)" tagged **Critical** or **High**, "Opened by rule", with the peak temperature. In the **Event log**, entries from actor `rules` reading "opened gpu_temp incident", each with a short hash. On Laptop B, the matching blocks show **Critical** or **Watch** in color, glyph and word.

### 4. The 3D floor (1:10 to 1:40)

**Do on Laptop B:** click the block flagged hot to open its panel; click Floor 2 and Floor 3 in the floor selector; click another site on the map.

**Say:** "The same data, as a floor you can walk. Status is color, a symbol and a word, so it reads at 5 a.m. Click a block and the panel gives the hottest GPU, how many servers are over 50 °C, power, and the highest-draw servers. If a block is heading for the limit, it says when, on a straight-line trend, and labels it as a trend. Humidity and cooling are not in this dataset, so the console says that instead of making numbers up."

**Look for:** the panel's **Overview** with "Hottest GPU", "Servers ≥ 50 °C", "Block power". The **Infra** tab reads "No live data for cooling, leak detection or fire suppression yet."

### 5. A feed stops, and the log proves itself (1:40 to 2:15)

**Do on Laptop A, in order:**

1. **1:40** Ctrl+C in the replayer tab. All eight feeds stop.
2. **1:45** Click **Verify chain**. Expect a green badge: "Chain intact: N events verified".
3. **1:55** Switch to the second tab and run the tamper command. It edits one event row directly in the database.
4. **2:03** Back in the console, click **Verify chain** again. Expect a red badge: "Chain broken at event #2: it was changed after it was written".

**Say, over the clicks:** "I just stopped the feed. The console has not changed, because a stopped feed looks like a quiet one. While we wait: every rule decision is appended to a log where each row's hash includes the one before it. Your browser recomputes every hash, with the same function the database uses. Intact. Now I edit one row straight in the database, as someone with access would. Check again. Broken, at the exact event. That is a record a security-conscious customer can trust."

**Look for:** the feed chips keep counting "Last batch 20 s ago, 30 s ago…".

### 6. The watchdog fires (2:15 to 2:40)

A scheduled reducer in the database checks every 10 seconds, so it runs with no client open. A data center silent for 30 seconds gets an incident. In testing this took 34 seconds from the stop.

**Look for:** the chips flip to a red **Silent** badge, and new incidents appear: "<data center> telemetry feed silent for N s", opened by rule. There is one per data center, eight in all.

**Say:** "Thirty seconds of silence, and the database itself opens an incident for each site. A dead sensor feed is a failure, not an empty chart."

**Do:** press the up arrow and Return in the replayer tab to restart it. The first batch from each data center closes its incident.

**Look for:** chips back to **Live**. Click **All** next to the Incidents heading to see the feed incidents closed with "Closed: feed resumed". (The restart replays the hour from the beginning, so racks a18 and a19 run hot again.)

### 7. The measured outcome (2:40 to 3:00)

**Say**, in the workshop's format:

> When a rack runs hot, or a site's feed goes quiet, the technician struggles to notice it because the warning sits in a tool nobody is watching. MESA's rules open the incident without anyone typing. What we measured: about 30 seconds from a rack passing its warning limit to an open incident, 34 seconds from a feed stopping to every affected site flagged, and one edited row in the log caught by its event number. Same state on both screens, no refresh.

**Do:** point at the time on the incident row and at the "silent for N s" titles. The numbers on screen are the measurement.

## If something slips

| Symptom | Check or fix |
|---|---|
| Log shows no feeds after Return | Replayer tab: look for `connected to` and `sample 1/352` lines. Confirm `SPACETIME_URI` and `SPACETIME_DB` match the database |
| Laptop B shows "Connecting" | Wrong IP, or the network isolates devices. Use a hotspot. `spacetime start` listens on all addresses by default |
| No incident by 1:10 | You started from old data. Reset with the setup command and start again; a fresh replay opens incidents within about 30 seconds |
| **Verify chain** is greyed out | The live data has not loaded yet. Wait a moment |
| Tamper command fails with a 400 error | Add `--no-config` when running from the repo root. The command was run against a local database and made **Verify chain** report "Chain broken at event #2" |
| Chain stays broken after the demo | Expected. Reset with the setup command before the next run |
| Short on time | Drop beat 4 and keep the order: feeds, incident, stop, Verify, watchdog |

## What not to open

The sidebar has pages that are not live. Do not click them in the demo:

- **AI Agent** shows sample content and answers "I can't answer yet". The agent service does not write reports yet.
- **Alerts** is marked Preview and shows sample alerts.
- **My Queue** and **Shift Handoff** are greyed out ("Soon").

**Cluster**, **Operators** and **Security** are live but not in this script (Cluster is in [DEMO-VIDEO.md](DEMO-VIDEO.md)). If asked about security, run `pnpm demo:attack` on Laptop A with the Security view open. A new identity calls a decoy, appears in the intrusion feed and is quarantined. The decoy calls are not appended to the event log.

## In progress

Not merged, so not in the script and not claimed anywhere above. Each is its own stream in [PARALLEL-AGENTS.md](PARALLEL-AGENTS.md).

- Acknowledge, assign and automatic escalation of incidents (stream E)
- A migration report with toasts, and the Shift Handoff report with PDF export

Merged since this script was written and not in it: incident toasts, the live scrolling temperature chart, motion, and the Cluster view. The Cluster view is the centre of the recorded demo, see [DEMO-VIDEO.md](DEMO-VIDEO.md).

The workshop's other outcome measures (time to acknowledge, escalations, handoff completeness) depend on stream E and the shift handoff work. Add them to beat 7 when they merge.

## Where each beat lives in the code

| Beat | Source |
|---|---|
| Feeds, 8 sites, batches | `services/replayer/src/index.ts`, `module/src/reducers/telemetry.ts`, [TELEMETRY.md](TELEMETRY.md) |
| Rule opens an incident (3 batches, 50 and 55 °C) | `module/src/lib/rules.ts` (`evaluateRack`), `threshold` table |
| Incident list, feed chips, Verify chain | `apps/console/src/views/log-view.tsx`, `components/log/*`, `lib/event-chain.ts` |
| Hash-chained event log | `module/src/lib/log.ts` (`appendEvent`) |
| Watchdog, 30 s, every 10 s | `module/src/lib/rules.ts` (`checkFeeds`), `watchFeeds` in `module/src/reducers/telemetry.ts` |
| Resume closes the incident | `recordFeedBatch` in `module/src/lib/rules.ts` |
| 3D floor, panel, trend | `apps/console/src/views/floor-view.tsx`, `components/floor/*`, [UI-LIVE-DATA.md](UI-LIVE-DATA.md) |
| Rules and Log details | [INCIDENT-RULES.md](INCIDENT-RULES.md) |
