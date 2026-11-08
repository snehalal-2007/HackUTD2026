# Running Several Agents in Parallel

How to split the remaining MESA work across several Claude Code agents at once without them overwriting each other. Each **stream** below owns its own files, branch, worktree, local database and dev-server port, and ends in one PR.

Read this together with `AGENTS.md`, `docs/SCOPE-v2.md`, `docs/INCIDENT-RULES.md` and `docs/TELEMETRY.md`.

## 1. Where things stand

| Area | State |
|---|---|
| Telemetry | Live on Maincloud (`hackutd2026-0nef9`): 8 data centers, 288 servers, every ~10 s, replayed from OLCF Summit (ClusterWise, CC BY 4.0) by a Railway service |
| Module on `main` | Telemetry tables, agent reporting (`incident_report`, `shift_report`, `agent_identity`), incident rules (`threshold`, `feed_health`, watchdog), honeypot (`quarantine`, `threat_event`) |
| Console on `main` | Agent chat, Alerts, Log (+ `/logs/:page`), Operators, Security, 3D floor wired to live data |
| Not yet on Maincloud | The incident rules and watchdog from PR #10 need `pnpm publish:prod` from `main` (release manager only, after Railway has redeployed the replayer) |
| In review | `feat/motion`: motion for the Log view, agent chat and floor scene (stream A, its own PR) |

## 2. Setup for every agent

1. **One worktree per stream**, so agents never share a working directory:

   ```bash
   cd ~/Documents/GitHub/HackUTD2026 && git fetch && git worktree add ../mesa-<stream> -b <branch> origin/main
   ```

   Then open a separate Claude Code session in `../mesa-<stream>` and run `pnpm install` there.
2. **One local database per stream**, so test data never mixes. All agents share the one local server (`pnpm dev:db`, started once):

   ```bash
   SPACETIME_DB=mesa-<stream> pnpm publish:local
   SPACETIME_DB=mesa-<stream> pnpm replay -- --speed 10 --feed <stream>
   ```

3. **One dev-server port per stream**:

   ```bash
   cd apps/console && VITE_SPACETIME_URI=ws://localhost:3000 VITE_SPACETIME_DB=mesa-<stream> pnpm exec vite --port <port>
   ```

4. **Before every commit:** `pnpm -r typecheck`, `spacetime build -p ./module`, `pnpm --filter @mesa/console build`. Restart the Vite dev server after adding new Tailwind classes (its class scan can go stale; production builds are unaffected).

| Stream | Branch | Worktree | Local DB | Port |
|---|---|---|---|---|
| A. Motion (finish) | `feat/motion` | main checkout | `mesa-dev` | 5173 |
| B. Incident toasts | `console/incident-toasts` | `../mesa-toasts` | `mesa-toasts` | 5174 |
| C. Live temperature chart | `console/live-chart` | `../mesa-chart` | `mesa-chart` | 5175 |
| D. Cluster cycling (in-place remediation) | `feat/cluster-cycling` | `../mesa-cluster` | `mesa-cluster` | 5176 |
| E. Acknowledge, assign, escalate | `module/ack-escalation` | `../mesa-ack` | `mesa-ack` | 5177 |
| F. Demo script and Devpost | `docs/demo` | `../mesa-demo` | none | none |

## 3. Rules that keep parallel agents safe

- **Only touch the files your stream owns** (section 4). Need a file another stream owns? Stop and ask the human; don't edit it.
- **Module streams (D and E) both edit `module/src/schema.ts` and regenerate `packages/bindings`.** Whichever merges second: rebase on `main`, run `pnpm generate`, commit the regenerated bindings, rerun the checks. Never hand-edit bindings.
- **Never publish to Maincloud** and never call reducers on `hackutd2026-0nef9`. Only the release manager publishes, from `main`.
- **Never put secrets in the repo** (keys live in Railway and Vercel). Never print `REPLAYER_TOKEN` or `.replayer-tokens.json`.
- Follow `AGENTS.md`: ask before committing, no Co-Authored-By or "Generated with Claude Code" lines, detailed PR descriptions (what was done, what changed, how it was tested, what's left), no names of people in docs or code.
- **Motion rules (from the animate skill):** never animate live numbers or data people read; animate only genuine arrivals and state changes (use `src/lib/use-arrivals.ts` once stream A merges); `transform`/`opacity` only; `cubic-bezier(0.23, 1, 0.32, 1)` (`--ease-out-strong`), 150–250 ms; always ship a `prefers-reduced-motion` variant.
- **Library picks (from pick-ui-library):** toasts → Sonner; real-time streaming charts → Liveline; other charts → recharts (already installed); unstyled primitives → base-ui only if shadcn/radix can't do it. Don't add a library a stream doesn't own.
- **Budget on a Max plan:** run 3–4 streams at once at most; use a cheaper model (Sonnet) for stream F and for read-only reviews.

## 4. Streams

### A. Motion (finish): main checkout, `feat/motion`

**Owns:** `apps/console/src/index.css` (motion section), `src/lib/use-arrivals.ts`, `src/components/log/*`, `src/views/log-view.tsx`, `src/components/agent/agent-chat.tsx`, `src/components/agent/agent-message.tsx`, `src/components/floor/scene.ts`.

Built, verified and opened as its own PR: no animation on load, paging, filter toggles or view switches; new events and incidents rise in; status flips pop; Verify result pops; floor status colours ease; reduced motion stops the idle turn and beacon pulse. **Left:** review and merge; fix anything the review finds on the same branch.

> **Prompt (only if the review asks for changes):** "Read `docs/PARALLEL-AGENTS.md` (stream A) and `AGENTS.md`. On branch `feat/motion`, address the PR review comments. After any change, re-verify in the browser on `mesa-dev` (port 5173) with a MutationObserver that new incidents and events still rise in and nothing animates on paging, the Active/All filter or view switches. Run the checks, then ask me before committing."

### B. Incident toasts (Sonner): `console/incident-toasts`

**Owns:** new `apps/console/src/components/notify/*`, `src/main.tsx` (mount `<Toaster />` only), `apps/console/package.json` and `pnpm-lock.yaml` (adding `sonner`).

A toast when an incident **opens** or **escalates** while the operator is watching, with severity, title and a "View in Log" action. Not on first load, not for incidents that close (the Log shows those), at most one toast per incident per status. Bottom-right, dark theme, respects reduced motion (Sonner handles it).

> **Prompt:** "Read `docs/PARALLEL-AGENTS.md` (stream B) and `AGENTS.md`. In `apps/console`, add Sonner and show a toast when an incident opens or escalates while the page is open: subscribe to `tables.incident`, ignore everything present at first load and anything closed, one toast per incident per status, action 'View in Log' that switches to the Log view. Mount `<Toaster />` in `main.tsx`. Only touch the files stream B owns. Test with a local replay on `mesa-toasts`, port 5174, then ask me before committing."

### C. Live temperature chart (Liveline): `console/live-chart`

**Owns:** `apps/console/src/components/floor/temp-chart.tsx`, `src/components/floor/use-live-floors.ts`, `apps/console/package.json` and `pnpm-lock.yaml` (adding `liveline`). Coordinate with the console owner before starting: these are their components.

Replace the floor view's per-rack temperature chart with a streaming chart that scrolls with time from `server_reading` (last 15 minutes), with the 55 °C limit line and a dashed straight-line trend labeled "trend". Subscribe to history only while the chart is visible.

> **Prompt:** "Read `docs/PARALLEL-AGENTS.md` (stream C), `docs/UI-LIVE-DATA.md` and `AGENTS.md`. Check that Liveline (github.com/benjitaylor/liveline) works with React 19; if it does, replace the chart in `components/floor/temp-chart.tsx` with a live streaming chart of the selected rack's hottest GPU temperature from `server_reading`, keeping the 55 °C limit and a labeled trend. If it doesn't, keep recharts and tell me why. Only touch stream C's files. Test on `mesa-chart`, port 5175, then ask me before committing."

### D. Cluster cycling, in-place remediation: `feat/cluster-cycling`

**Owns:** new `module/src/tables/cluster.ts`, `module/src/lib/remediation.ts`, `module/src/reducers/cluster.ts`; the registration lines in `module/src/schema.ts` and `module/src/index.ts`; one call into remediation from `module/src/lib/rules.ts` (`evaluateRack`, when an incident escalates); new `apps/console/src/views/cluster-view.tsx` and `src/components/cluster/*`; the nav entry in `App.tsx`, `components/shell/nav.ts`, `components/shell/app-shell.tsx`; new `docs/CLUSTER-CYCLING.md`.

Spec: `docs/SCOPE-v2.md` section 3. A simulated cluster (`service`, `instance`, `route`, `remediation_run`), seeded on first use with about 24 services across the 16 racks. When a rack incident escalates: `throttle_in_place` first; if still over the limit after the 2-minute window, `live_migrate` the hottest instance to the Ready rack with the most headroom, moving `instance.rack_id` and `route.target` in **one reducer transaction** (no second copy, never zero copies); `patch_in_place` rolls a version across a service's instances one at a time. Count `duplicates_avoided`. Telemetry is recorded, so moving a service can't cool the real data: show the actions, and if an effect is shown, label it "simulated effect". Everything appends to `event_log`.

> **Prompt:** "Read `docs/PARALLEL-AGENTS.md` (stream D), `docs/SCOPE-v2.md` section 3, `docs/INCIDENT-RULES.md` and `AGENTS.md`. Implement capacity-neutral in-place remediation in the module as specified there, plus a Cluster view in the console showing services per rack and remediation runs live. Unit-test the decision order and that instance count never changes. Only touch stream D's files; if you need others, stop and ask. Test with a replay on `mesa-cluster`, port 5176, then ask me before committing."

### E. Acknowledge, assign, escalate: `module/ack-escalation`

**Owns:** `module/src/reducers/incidents.ts`, `module/src/tables/reporting.ts` (incident columns, appended with defaults), a new escalation timer in `module/src/tables/rules.ts`; `apps/console/src/components/log/incident-actions.tsx` (new) and the actions slot in `components/log/incident-list.tsx`. Starts after stream A merges, because A also edits `incident-list.tsx`.

Add `owner` and `ack_deadline` to incidents (defaults so existing data migrates). `acknowledge_incident` and `assign_incident` reducers (role checks; the agent identity stays rejected). A scheduled reducer escalates an unacknowledged incident past its deadline to the next operator on shift and appends to `event_log`. Acknowledge and Assign buttons on each active incident in the Log view.

> **Prompt:** "Read `docs/PARALLEL-AGENTS.md` (stream E), `docs/PLAN.md` section 4, `docs/INCIDENT-RULES.md` and `AGENTS.md`. After `feat/motion` has merged, add incident ownership, acknowledgment deadlines and scheduled escalation to the next on-shift operator, plus Acknowledge and Assign buttons in the Log view, as described. New columns must have defaults so Maincloud migrates without a reset. Only touch stream E's files. Test on `mesa-ack`, port 5177, then ask me before committing."

### F. Demo script and Devpost: `docs/demo`

**Owns:** new `docs/DEMO.md`, `README.md`.

A 3-minute, two-laptop demo script built on what is live (feeds, an incident opening by rule, the watchdog when a feed stops, Verify chain, the 3D floor), the NMC² problem sentence and measurable outcome (`docs/nmc2-workshop-notes.md`), and a README refresh with the dataset credit. No claims about features that are not merged.

> **Prompt:** "Read `docs/PARALLEL-AGENTS.md` (stream F), `docs/nmc2-workshop-notes.md`, `docs/INCIDENT-RULES.md` and `README.md`. Write `docs/DEMO.md`: a 3-minute two-laptop demo script, beat by beat with timings, using only features on `main`, ending with the measured outcome. Refresh the README's feature list and keep the ClusterWise credit. Plain, specific language. Ask me before committing."

## 5. Merge order

1. **A** (motion), then **B** and **C** in any order (separate files).
2. **D** and **E**: whichever is second rebases, regenerates bindings and reruns checks. E waits for A.
3. **F** last, so the demo script matches what merged.
4. After module changes merge: Railway redeploys the replayer, then the release manager runs `pnpm publish:prod` from `main`. New columns use defaults, so no reset; the publish disconnects clients and the replayer restarts itself.

## 6. Cleanup

When a stream's PR has merged:

```bash
cd ~/Documents/GitHub/HackUTD2026 && git worktree remove ../mesa-<stream> && git branch -d <branch>
```
