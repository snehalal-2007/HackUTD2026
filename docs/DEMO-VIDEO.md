# Demo Video Script: Three Minutes, One Take

The script for the recorded HackUTD 2026 demo video on DevPost. It is written for a screen recording with a voiceover, not for a live room (that is [DEMO.md](DEMO.md)).

The story is **capacity-neutral, in-place remediation**. A rack runs hot. MESA throttles the hottest instance where it is. After a two-minute window it live-migrates an instance to a cooler rack. The instance count stays 48, no duplicate copy is started, downtime is 0 s, and every step is in the hash-chained log. Along the way it shows the SpacetimeDB angle for the Spacetime track.

Everything below uses only what is merged on `main` (checked against `origin/main` at `c9ffbf4`). Features still in a branch are in [the pending section](#optional-pending-only-if-merged-by-recording-day) and nowhere else.

## 1. Length and constraints

**The official limit is not in the repo, and I could not reach it.** `docs/PLAN.md` has the dates (final submission Sun Nov 8, 12:00 pm; judging Sun 1:00 to 4:00 pm) and nothing on the video. The HackUTD 2026 DevPost rules page returned HTTP 403 to an automated fetch. Unofficial HackUTD guides from other years suggest about 2 minutes; they are not the 2026 rules.

**Decision needed from the team:** read the video rule on the DevPost "Rules" tab and confirm the maximum length. Until then this script assumes **3:00 maximum** and targets 2:58. Sections 6 and 7 give a 2:00 and a 1:00 cut if the real limit is shorter.

Check these on the DevPost page too, because the repo does not say: whether the video must be public on YouTube, Vimeo or similar, whether captions are required, and whether judges are told to expect a link or an upload.

**What the repo tells us about what judges look at.** The criteria text for each track is not in the repo. What the repo records:

| Track | What the repo records | What the video does about it |
|---|---|---|
| NMC2 "Keep the World Running" | The workshop asked for one sentence (when, user, task, why) and a measurable outcome, defined before the solution. NMC2 sells to security-conscious, compute-hungry customers and owns its stack. Their feedback was: do not fix failures by starting duplicates (see [SCOPE-v2.md](SCOPE-v2.md) section 1). See [nmc2-workshop-notes.md](nmc2-workshop-notes.md) | Opens on the problem sentence, ends on numbers read off the screen, shows zero duplicates and a tamper-evident log |
| Spacetime | Not recorded. The product claim is: all core state in the module, subscriptions for reads, reducers for writes, scheduled reducers that run with no client | Beat 5 says and shows each of those |

## 2. Honesty rules

Say these on camera or leave the claim out. The product rule in `AGENTS.md` applies: no fake functionality; anything unfinished is a roadmap item.

| Rule | Where it is said |
|---|---|
| The cluster is **simulated**. Services, instances and routes are simulated tables placed on the 16 real racks. The map and the Cluster page both carry a "Simulated cluster" label | Beat 4 |
| Telemetry is **replayed** OLCF Summit data (ClusterWise, CC BY 4.0), shown at 10x speed for the recording. Keep the credit line under the Floor chart on screen for a few seconds | Beats 2 and 3 |
| Only **one NMC2 site, Spartanburg, is verified**. The other seven data centers are simulated, and the console says so | Beat 2 |
| Cooling from an action is a modeled **"Simulated effect"**. Telemetry is recorded, so a move cannot change the temperatures you see | Beat 6 |
| **No AI in incident decisions.** Fixed thresholds decide and act, inside the module | Beat 2 |
| The agent may only write reports, and its output is labeled **AI drafted**. The agent service is not part of this recording, so the **AI Agent page stays closed** (it shows sample content when the service is off) | Not shown. Say nothing about the agent unless you add a beat that runs it |
| Do not claim owners, acknowledgment deadlines, escalation or the shift handoff lock. They are not merged | The problem sentence in beat 1 describes the pain; the script never says MESA already solves the owner and handoff part |
| Do not open **Alerts** (Preview, sample data), **My Queue** or **Shift Handoff** ("Soon") | Never on screen |

The problem sentence in beat 1 is the workshop sentence from the notes, shortened: it keeps the situation, the user, the task and the why, and drops "Our solution" because the owner, deadline, escalation and handoff parts of that sentence are not merged.

## 3. Recording setup (tested)

All of this was run on a local database named `mesa-video`. Never use `hackutd2026-0nef9` (Maincloud) for recording and never call reducers on it. `pnpm publish:local` always targets `--server local`.

### One time

```bash
pnpm install
```

Check that `.env` does not point at Maincloud. `SPACETIME_URI` must be `ws://localhost:3000` or unset.

### Every take

Terminal 1, the database (skip if one is already running on port 3000):

```bash
pnpm dev:db
```

Terminal 2, a clean module. The first run:

```bash
SPACETIME_DB=mesa-video pnpm publish:local
```

To reset between takes, republish with a data wipe (tested). This empties the event log, the cluster and the operators:

```bash
SPACETIME_DB=mesa-video pnpm publish:local --delete-data
```

Terminal 3, console for window A, on its own port:

```bash
cd apps/console && VITE_SPACETIME_URI=ws://localhost:3000 VITE_SPACETIME_DB=mesa-video pnpm exec vite --port 5190
```

Terminal 4, a second console for window B. A different port is a different browser origin, so it gets its own identity and shows as a second operator:

```bash
cd apps/console && VITE_SPACETIME_URI=ws://localhost:3000 VITE_SPACETIME_DB=mesa-video pnpm exec vite --port 5191
```

Terminal 5, the replayer. **Type it and do not press Return yet.** Keep this terminal out of the recorded area:

```bash
SPACETIME_DB=mesa-video pnpm replay -- --speed 10 --feed video
```

When you do press Return, the first line must read `connected to ws://localhost:3000/mesa-video`. If it says anything else, stop it.

### In the browser, once per database wipe

1. Open `http://localhost:5190` (window A) and `http://localhost:5191` (window B).
2. In each window: sidebar **Operators**, type a name, **Register**. The page reads "Signed in as <name>" and the list shows role `operator` with both names. Operators are required for the hand migration.
3. In each window: click the moon icon at the bottom of the sidebar ("Switch to dark mode"). The console starts light; the choice is saved per origin, so it survives a database reset.
4. Window A: open **Log**. Window B: open **Log** too.

### The timeline the system follows

The replay clock **R** starts when you press Return in the replayer. Measured on two clean runs on the same machine, the same second each time:

| R | What happens | Seen where |
|---|---|---|
| +0:04 | First batches land. The cluster seeds itself (24 services, 48 instances). Racks a17 and a18 open **already critical**, and MESA starts a throttle on each (`cart-2` on a18, `inventory-2` on a17). Incidents appear in the Log, a toast shows bottom right | Log, toast, Cluster |
| +0:48 | Rack a19 escalates to critical. A third throttle starts (`training-batch-1`) | Cluster, Remediation runs |
| +2:04 | The a17 and a18 throttle windows end (2:00 after they started). Both racks are still over 50 °C, so MESA live-migrates `cart-2` and `inventory-2` to Ready racks. Both instances fly on the 3D map | Cluster, Log |
| +2:48 | The a19 window ends. The rack has recovered, so the throttle **holds**, and nothing is migrated. Do not plan a beat around a19 migrating | Cluster, Log |

So, to land an automatic migration at video time T, press Return at T minus 2:04. This script presses Return at **0:20 of the video**, so the automatic migration lands at **2:24**.

The first pass of the recorded hour is what makes this repeatable. The hour is 6 minutes at 10x; after that it loops and the racks behave differently. Always record on a freshly wiped database and stop the replayer once the take is done.

### Measured in the dry run

Run 1 and run 2 (run 2 in the video's order, with the hand migration at R+1:09):

| Measurement | Result |
|---|---|
| Replayer command to first throttle | 4 s in run 2, 5 s in run 1 |
| Throttle start to automatic live migration | 2:00 both runs, to the second |
| Automatic migrations | 2 in each run (`cart-2` a18, `inventory-2` a17). Targets were `d04` in run 1 and `b17` and `e09` in run 2, because the hand move changed the headroom. Say "the instance", not the target rack |
| Hand migration (select, click a Ready rack) | Worked in both runs. About 1 to 2 s from the click to "landed". The map caption reads `postgres-2 selected on a18...` then `Last move: ... one transaction: no second copy, no gap.` |
| Hand migration of a throttled instance on a hot rack | Does not change the automatic migrations, which still fired at R+2:04 |
| Window B (other origin, other identity) | Showed the new "Instances moved" count without a reload (checked 1.5 s after the click) |
| Totals after both automatic moves plus one hand move | Instances 48, Instances moved 3, Duplicates avoided 3, Downtime 0 s. Active runs is still 1 until R+2:48 |
| Event log | 19 to 24 events verified, "Chain intact" |
| Tamper command, then Verify chain | "Chain broken at event #2: it was changed after it was written" |
| Rolling patch (`auth` to v2.4.1, two instances) | Finished in about 12 s, at most one instance updating at a time |
| Floor chart | Shows "No readings in the last 15 minutes" for several seconds after you open Floor, then fills in |

### Not tested

The script was run with the browser pane at 1536x864 (1920x1080 at 125 percent zoom), 1440x900 and 960x1000. The macOS window tiling used in beat 5 and a real screen recording were not done. A hand migration at 960 px wide was not tried; the script does it at full width for that reason.

## 4. The script

Total target **2:58**, hard limit 3:00. Voiceover is about 140 words per minute. Pronounce NMC2 as "N M C two".

Record the screen first, in one take, so the replay clock stays continuous. Record the voiceover afterwards against the picture. The word counts below tell you if a line fits its slot.

| Time | Beat | Window and view | Words |
|---|---|---|---|
| 0:00 | 1. The problem | A, Log, empty | 63 |
| 0:28 | 2. Feeds go live, an incident opens by rule | A, Log | 58 |
| 0:55 | 3. The floor | A, Floor | 38 |
| 1:10 | 4. Throttle in place, and a hand migration | A, Cluster | 64 |
| 1:45 | 5. The SpacetimeDB angle, two windows | A left (Cluster), B right (Log) | 53 |
| 2:20 | 6. The automatic migration | A and B | 39 |
| 2:38 | 7. The measured outcome | A and B | 42 |
| 2:56 | End card | Logo | none |

### Beat 1. The problem (0:00 to 0:28)

**On screen:** Window A, maximized, on **Log**. It reads "No feeds yet. Start the replayer to stream telemetry.", "No incidents" and "No events yet". Hold still.

**At 0:20, off camera:** press Return in the replayer terminal.

**Say:**

> When a cooling unit starts failing twenty minutes before shift change, the on-site technician struggles to make sure the problem has an owner, because the warning lives in one tool, the discussion in a chat channel and the handover in an end-of-night log. MESA puts the telemetry, the incident and the record in one live place. These screens start empty. Nothing is faked.

**Judge takes away:** the user, the pain and the reason, in NMC2's own format, and that the demo is not staged.

### Beat 2. Feeds go live, an incident opens by rule (0:28 to 0:55)

**On screen:** still **Log**. Eight chips under **Telemetry feeds** turn **Live** and their batch counts climb about once a second. Within about 5 s of the Return press, incidents appear under **Incidents**: for example "Spartanburg rack a19: GPU at 53 °C (limit 50 °C)", tagged **Opened by rule**, with a peak temperature. A toast appears bottom right with **View in Log**. In the **Event log**, entries from actor `rules` read "opened gpu_temp incident", each with a short hash. Do not click the toast.

**Say:**

> This is real telemetry from the Summit supercomputer, replayed like a live feed at ten times speed so the video fits. Eight data centers, sixteen racks. Only Spartanburg is an NMC2 site; the rest are simulated. A rule inside the database opens an incident when a rack's hottest GPU stays over fifty degrees. No AI makes that call.

**Judge takes away:** the data is real and honestly labeled, incidents come from rules, and there is no AI in the decision.

### Beat 3. The floor (0:55 to 1:10)

**On screen:** at **0:50** click **Floor** in the sidebar (the chart needs several seconds to fill, so open it early). It opens on Spartanburg, Floor 1, with Block A1 selected: a red **Critical** badge, "Hottest GPU", "Servers ≥ 50 °C" and the scrolling chart with the 55 °C limit and a dashed **Trend** line. The credit "Telemetry: ClusterWise (OLCF Summit), CC BY 4.0" is under the chart. Leave it readable. Do not click anything else.

**Say:**

> The same data, as a floor you can read at five in the morning. Status is a color, a symbol and a word. This block is critical, and the trend line is a straight-line fit, labeled as one.

**Judge takes away:** a console built for a tired operator, with the trend labeled rather than oversold, and the dataset credited.

### Beat 4. Throttle in place, and a hand migration (1:10 to 1:45)

**On screen:**

1. **1:10** Click **Cluster**. Point at the **Simulated cluster** badge on the map, and the totals row: **Instances 48**, "never changes".
2. **1:15** Scroll down to **Remediation runs**. Entries read "Throttle in place" with **Running** and "decides in m:ss", for example `cart-2` on a18 with "Power cap 10 → 2.3 kW". Scroll back to the top.
3. **1:25** On the 3D map, click the **orange** (throttled) cube on rack **a19**, which is `training-batch-1`. The caption reads "training-batch-1 selected on a19. Click a highlighted Ready rack to live-migrate it (operator or lead)."
4. **1:30** Click the highlighted Ready rack **b17** (bottom left of the map). The instance lifts, flies to b17 and lands with a green ring. The caption reads "Last move: training-batch-1 a19 → b17, one transaction: no second copy, no gap." **Instances moved** becomes 1 and **Duplicates avoided** becomes 1.

If the click selects a different instance, that is fine: any instance on a hot rack works, and the caption names it.

**Say:**

> Now the fix. This cluster is simulated: forty-eight instances on the real racks. The usual answer to a hot rack is a second copy somewhere else, which pays for capacity twice. MESA starts by throttling the hottest instance in place, then waits two minutes. While it waits, I move one by hand. It flies as one object, so there is never a second copy.

**Judge takes away:** the order of remediation, that the cluster is labeled simulated, the 48 that never changes, and that a move is one object with no duplicate.

### Beat 5. The SpacetimeDB angle, two windows (1:45 to 2:20)

**On screen:** at **1:42** un-maximize window A so it takes the left half, which reveals window B on the right half, already on **Log**. Window A stays on **Cluster**. In B's **Event log**, the top entries include "live_migrate ... route switched in the same transaction (simulated cluster)", written by an operator. Point at it. Window B updates by itself: no refresh.

**Say:**

> Everything here lives in one SpacetimeDB module. Both windows read it through subscriptions and change it only by calling reducers. My role was checked inside the reducer, not in the interface. The right window updates with no refresh. The two-minute check is a scheduled reducer, so it runs even with every browser closed.

**Judge takes away (Spacetime track):** core state in the module, reads by subscription, writes by reducer, a server-side role check, live sync across two windows, and scheduled work with no client connected.

### Beat 6. The automatic migration (2:20 to 2:38)

**On screen:** watch window A's map. At about **2:24** two instances (`cart-2` and `inventory-2`) fly to cooler racks on their own, and window B's Event log gains "throttle not enough" and "live_migrate" entries from actor `remediation`. Then scroll window A to **Remediation runs**: "Live migrate", **Succeeded**, "Automatic · incident #3" (or #2), "Simulated effect: -1.4 °C on the rack", "1 duplicate avoided", "Downtime 0 s".

**Say:**

> Two minutes are up, and these racks are still over the limit. MESA moves the instance on its own, in one transaction. The cooling number says Simulated effect, because the telemetry is recorded and a move cannot change it.

**Judge takes away:** the payoff happens with nobody clicking, the effect is honestly labeled as modeled, and the rule, not a person or a model, decided.

### Beat 7. The measured outcome (2:38 to 2:56)

**On screen:** in window B click **Verify chain**. A green badge reads "Chain intact: N events verified" (N is about 22 to 26 by now). In window A scroll to the totals: **Instances 48**, **Instances moved 3**, **Duplicates avoided 3**, **Downtime 0 s**. Read the numbers on screen, not from this script: if they differ, say what the screen says.

**Say:**

> When a rack runs hot, the technician struggles to cut its load without paying for a second copy. Forty-eight instances before and after. Three copies avoided. Zero seconds of downtime. Every step is in a hash-chained log, and Verify chain says intact.

**Judge takes away:** the measurable outcome in the workshop's sentence format, backed by numbers the viewer can see, and a record a security-conscious customer can check.

### End card (2:56 to 2:58)

The approved MESA logo end-card animation, 2 to 3 s. It is a separate asset, shared outside the repo.

### Voiceover word count

Counted from the blockquotes above with a script. At 140 words per minute, 357 words is 2 min 33 s of speech in a 2:56 voiced timeline, which leaves about 23 s for pauses, clicks and animations.

| Beat | Slot | Words | Speech at 140 wpm |
|---|---|---|---|
| 1 | 28 s | 63 | 27 s |
| 2 | 27 s | 58 | 25 s |
| 3 | 15 s | 38 | 16 s |
| 4 | 35 s | 64 | 27 s |
| 5 | 35 s | 53 | 23 s |
| 6 | 18 s | 39 | 17 s |
| 7 | 18 s | 42 | 18 s |
| Total | 176 s | 357 | 153 s |

Beats 3 and 7 are as long as their slots or a second over. Trim "labeled as one" in beat 3, and "and Verify chain says intact" to "Verify chain: intact" in beat 7, if a take runs tight. Update the table if you change a line.

## 5. Optional merged beats (only with a longer limit)

These work today and were tried. Add them only if the real limit allows, and take the time from beat 3 first.

**Tamper check (about 20 s).** Needs a terminal in frame. After beat 7, run this from the repo root (the `--no-config` flag is needed because `spacetime.local.json` names a database and the CLI then misreads the arguments):

```bash
spacetime sql --no-config --server local mesa-video "UPDATE event_log SET target = 'edited by hand' WHERE seq = 2"
```

Then click **Verify chain** again. The badge turns red: "Chain broken at event #2: it was changed after it was written". Say: "Now I edit one row straight in the database. Check again. Broken, at the exact event." The log is broken until you reset the database.

**Rolling patch (about 15 s).** On the Cluster page, in **Services**, click **Patch to v2.4.1** on `auth`. In **Rolling updates**, a card shows the two instances as cells: one **Updating** at a time, then **Updated**, ending **Completed** after about 12 s with "0 updating now (at most 1)" and "2 duplicate copies avoided". Say: "A patch rolls in place, one instance at a time. None restarts, none is copied." This adds 2 to Duplicates avoided, so the outcome numbers in beat 7 change: read the screen.

**Feed watchdog (about 40 s).** Stop the replayer with Ctrl+C. About 34 s later the chips turn red **Silent** and an incident opens for each data center, from a scheduled reducer with no client involved. It ends the replay, so only use it after beat 7.

## 6. Shot list and tips

| Item | Setting |
|---|---|
| Capture | 1920x1080 at 30 fps or more, one continuous recording, mouse cursor visible |
| Window A, beats 1 to 4 | Maximized, browser zoom 125 percent (about 1536x864 CSS pixels). Tested: the Floor fits one screen at this size |
| Beats 5 to 7 | A left, B right, each 960 px wide at 100 percent zoom. Tested at 960x1000: both Cluster and Log lay out. The Floor does not fit at 960, which is why it comes before the split |
| Theme | Dark, set in both windows before the take. The console defaults to light today |
| Hide | Bookmarks bar, other tabs, desktop notifications (Do Not Disturb), the replayer terminal, the dock |
| Do not open | AI Agent, Alerts, My Queue, Shift Handoff, Security |
| Mouse | Slow, deliberate moves. Click once and wait |
| Audio | Record the voiceover after the picture, one beat at a time, using the word counts as timing |
| Sidebar clock | It shows the real time, so leave it |

Tiling is not required. If tiling is awkward, keep one window full-screen for beats 5 to 7 and press Cmd+` to flip to window B for a few seconds each time.

### If it breaks

| Symptom | Fix |
|---|---|
| No feeds or incidents 10 s after Return | The replayer did not connect. Read its first lines. Confirm `connected to ws://localhost:3000/mesa-video`. Check the console's database name (`VITE_SPACETIME_DB`) matches |
| Wrong incidents, or a rack already migrated before you start | The database was not reset. Stop the replayer, run the wipe command, reload both windows, register again, restart |
| Clicks on the 3D map miss | Click the cube itself, not its label. The map has **+** and **-** zoom buttons (not tried for this) |
| The hand migration does nothing | The reducer needs a registered operator (or lead), and the target must be a highlighted Ready rack. Register on the Operators page, then pick a highlighted rack |
| The map caption says the rack is not Ready | Pick another green **Ready** rack. Racks that received instances can turn **Warm** |
| The automatic migration does not happen at R+2:04 | Check **Remediation runs** for "Throttle in place · Not enough". If the status is **Running** with a countdown, wait for it. If the rack recovered, the throttle held: that is correct, not a bug. If this keeps happening, you pressed Return on a database that was not wiped. Reset and redo the take |
| Window B shows "Connecting" or no data | Reload it. Both consoles must use the same `VITE_SPACETIME_DB` |
| Verify chain is greyed out | Live data has not loaded. Wait a moment |
| Verify chain says broken before you tampered | A previous take tampered with this database. Reset it |
| After a reset, the Log still shows old rows marked **Cached** | The console keeps a local snapshot and paints it until the live data loads. Wait a second or reload. If it stays, you are on the wrong database |
| The chart says "No readings in the last 15 minutes" | Wait 5 to 10 s after opening Floor |
| The replay passed 6 minutes | It looped and racks now behave differently. Stop and reset |

### Pre-record checklist

- [ ] The team has confirmed the video length limit and format on the DevPost Rules tab
- [ ] Branch is `main`, up to date; `pnpm install` done
- [ ] `.env` does not point at Maincloud; the replayer line reads `ws://localhost:3000/mesa-video`
- [ ] Database wiped with `--delete-data` just now
- [ ] Both consoles open, dark theme, operators registered (role `operator` on both)
- [ ] Window A on Log, maximized, browser zoom 125 percent; window B on Log, hidden behind A and sized to the right half
- [ ] Replayer command typed, not run, in a terminal outside the capture area
- [ ] Notifications off, bookmarks bar hidden, other tabs closed
- [ ] You know the Return press happens at 0:20 of the video
- [ ] The dataset credit "ClusterWise, CC BY 4.0" is in the DevPost description, and shows on the Floor in beat 3
- [ ] After the take: stop the replayer, watch the video once, and check every number said against the screen

### Cut list: 2:00 version

If the real limit is 2 minutes, edit the same recording. A live wait of 2:04 does not fit in 2:00, so the version cuts the wait in the edit and shows a "Two minutes later" card. Do not re-record.

| Use from the full take (T) | Replace the voiceover with | Time |
|---|---|---|
| T 0:00 to 0:22, Log empty | Beat 1, first sentence, then "These screens start empty. Nothing is faked." | 22 s |
| T 0:26 to 0:46, feeds, incident, toast | Beat 2, but only: "Real Summit telemetry, replayed at ten times speed. A rule opens an incident. No AI makes that call." Add "Only Spartanburg is an NMC2 site; the rest are simulated." | 20 s |
| T 1:10 to 1:40, Cluster, throttle, hand migration | Beat 4 as written | 30 s |
| T 1:45 to 2:00, two windows | Beat 5, first two sentences | 12 s |
| Card: "Two minutes later" | none | 2 s |
| T 2:22 to 2:55, automatic migration, totals, Verify chain | Beat 6 as written, then only: "Forty-eight instances before and after. Three copies avoided. Zero seconds of downtime. Verify chain: intact." | 30 s |

That is about 1:56 with the floor (beat 3) dropped. The voiceover in these segments is about 225 words, roughly 96 s at 140 words per minute, so each segment has room for pauses. Put the dataset credit in the DevPost description, because the Floor credit line is no longer on screen.

### Cut list: 60-second version

A 2:04 wait cannot fit in 60 s, so cut it in the edit. Use the same recording and these source timecodes (T is the video time of the full take).

| Output | From the full take | Text on screen | Voiceover |
|---|---|---|---|
| 0:00 to 0:10 | T 0:00 to 0:10, Log empty | none | First sentence of beat 1 |
| 0:10 to 0:20 | T 0:26 to 0:40, incident and toast on Log | none | "A rule opens an incident. No AI makes that call." |
| 0:20 to 0:32 | T 1:12 to 1:24, Cluster with "decides in" countdown | "Simulated cluster" | "MESA throttles in place first. This cluster is simulated." |
| 0:32 to 0:46 | T 2:20 to 2:34, the automatic migration flying | "Two minutes later" | "Two minutes on, the rack is still hot. MESA moves the instance, in one transaction." |
| 0:46 to 0:55 | T 2:42 to 2:54, totals and Verify chain | none | "48 instances, 3 copies avoided, 0 seconds of downtime. Verify chain: intact." |
| 0:55 to 0:58 | End card | | none |

## Optional (pending, only if merged by recording day)

**Nothing in this section is merged. Do not record or claim any of it until you have checked it on `main`.** At the time of writing, `origin/main` is at `c9ffbf4`; no `feature/migration-report` branch exists on `origin`, and the sidebar still shows **Shift Handoff** as "Soon".

Before using it, run `git fetch && git log origin/main --oneline` and look for the migration report and the shift handoff with PDF export. Then run each step below on a local database, correct the wording to what the screen really says, and only then record.

| Beat to add if merged | Where | What to do and say (draft, not verified) |
|---|---|---|
| A. Migration report and toast (about 10 s) | After beat 6 | A toast appears when a migration finishes, linking to a migration report. Open the report. Say what it lists, using only what it shows. Draft: "Each migration writes a report: what moved, from where, to where, and the duplicates it avoided." Check that its numbers match the Remediation runs card |
| B. Shift Handoff blocked until accepted (about 15 s) | New beat 8, before the end card | Sidebar **Shift Handoff**: end the shift, show it refused while an item is unaccepted, accept as the incoming operator, then end it. Draft: "The shift will not end until the incoming operator accepts each open item." This matches the rule in `AGENTS.md` (`end_shift` rejects while any handoff item is unaccepted). Confirm the Handoff page really does that on camera |
| C. PDF export (about 8 s) | Right after B | Click export, show the PDF opening. Draft: "The handoff exports as a PDF." Confirm that the PDF contents are real data, and never read out anything the PDF does not contain. If the report is written by the AI agent, say it is AI drafted and show the label |

To make room, cut beat 3 first, then shorten beat 5. If B and C go in, update the outcome in beat 7 to add what the handoff measures, and add the handoff completeness number from the screen. The workshop's other measures (time to acknowledge, escalations) depend on incident ownership, which is not merged either.

## Where each beat lives in the code

| Beat | Source |
|---|---|
| Feeds, 8 sites | `services/replayer/src/index.ts`, `module/src/reducers/telemetry.ts`, [TELEMETRY.md](TELEMETRY.md) |
| Rule opens an incident, escalation | `module/src/lib/rules.ts` (`evaluateRack`), [INCIDENT-RULES.md](INCIDENT-RULES.md) |
| Toast on open or escalate | `apps/console/src/components/notify/incident-toasts.tsx` |
| Floor, chart | `apps/console/src/views/floor-view.tsx`, `components/floor/*` |
| Throttle, live migration, patch | `module/src/lib/remediation.ts`, `module/src/reducers/cluster.ts`, [CLUSTER-CYCLING.md](CLUSTER-CYCLING.md) |
| Live placement map, hand migration | `apps/console/src/components/cluster/placement-3d.tsx`, `placement-scene.ts` |
| Hash-chained log, Verify chain | `module/src/lib/log.ts`, `apps/console/src/lib/event-chain.ts` |
