# Shift Handoff

A new operator opens **Shift Handoff** and, in under a minute, learns what happened on the last shift in plain words and what they must do next. It is a console view only: no module, schema or bindings changes.

Code: `apps/console/src/views/handoff-view.tsx` and `apps/console/src/components/handoff/*`.

## What is on the page

In this order:

1. **Shift summary.** Three to five sentences built by a template from the report's own counts (incidents and causes, what MESA closed on its own, downtime, what is still open, what to do first). No AI writes it. If the agent has written a `shift_report`, its summary is shown separately, labeled **AI drafted**.
2. **Breakdown and costs.** Every incident: where, when, how long, peak temperature, what MESA did on its own, and an estimated cost.
3. **Saved by automatic moving.** Instances moved, duplicates avoided, downtime (0 s) and warning lead time, from `remediation_run` and `remediation_stats`, with the formula in plain words and the assumptions behind it.
4. **Charts.** A line chart (hottest GPU over the shift against the 50 °C and 55 °C limits), a donut of incident causes, a donut of where the estimated saving comes from, and a list of key moments. Drawn with the shadcn chart container (recharts). They do not animate.
5. **Action items.** What, where, why, priority (color plus icon plus text) and the role who should act. Each live item has one action that opens the view with the details.

## Four tabs: one live, three sample

| Tab | Source |
|---|---|
| **This shift (live)** | Read from SpacetimeDB: `incident`, `remediation_run`, `remediation_stats`, `rack`, `instance`, `threshold`, `shift_report`, `server_reading` |
| **Last night**, **The night before**, **A week ago** | Hand-written fixtures in `components/handoff/sample-shifts.ts` |

The sample shifts exist because the database keeps no history of earlier shifts and the replayed telemetry covers only about 60 minutes of data, so three earlier shifts cannot be read from it. Every number, rack and machine name in them is made up. Each is labeled **Sample shift (illustrative)** on screen and in the PDF, and the agent panel refuses to answer about them. Items the telemetry cannot support (replace fans, upgrade RAM) appear only in the sample shifts, marked **Illustrative suggestion**.

The live report is honest about its window: it spans from the first thing the database recorded to now, not a 12-hour shift, and says so on the page. Readings are bucketed by `received_at` (server time), the same clock as incidents and runs; `measured_at` is the data's own timeline, which a fast replay runs ahead of real time. The cluster (services, instances, moves) is simulated and labeled so.

### Where live action items come from

- A rack at or above the warning threshold, or with an open incident: **Check temperatures** (or **Inspect the failed GPU** when the open incident is a GPU fault). High priority at the critical limit or for a fault, else medium. A lead is named when the incident is escalated.
- An open incident with no rack (a silent feed): **Check the data feed** or **Follow up an open incident**.
- A remediation run with status `needs_approval`: **Approve or reject a failover**, for a lead, high priority.
- Instances still power-capped: **Confirm power caps lift**, low priority.

## Cost model (every figure is an estimate)

`components/handoff/cost-model.ts`. Real counts from the shift times these assumptions, shown on the page and editable by anyone (edits stay in that browser's `localStorage`, apply to every tab, and are never sent anywhere). The defaults are placeholders, not measured prices.

| Assumption | Default |
|---|---|
| Cost of downtime | $1,500 per instance-hour |
| Downtime a failover causes | 45 s per moved instance |
| Cost of a duplicate copy | $6 per hour |
| How long a duplicate would run | 4 h |
| Handling one failover | $50 |
| Operator time | $60 per hour |
| Time for an incident a person handles | 30 min |

- **Saved** = duplicates avoided × ($ per hour × hours + handling) + instances moved × failover seconds ÷ 3600 × downtime cost.
- **Incurred** = incidents that needed a person × minutes ÷ 60 × operator rate + real downtime seconds ÷ 3600 × downtime cost.
- An incident "needs a person" when it is still open, is a GPU fault, was raised by hand, or has a run waiting for approval.

Duplicates avoided includes instances patched in place, because a rolling update by copy would have started a second copy of each (this is how `remediation_stats` counts it).

## Download PDF

No new dependency. The button copies the report into a hidden frame that has no `dark` class, so every color token resolves to its light value and the page is white, strips the interactive controls, waits for styles and fonts, and calls `print()`. In the dialog, choose **Save as PDF**. The charts print as vector graphics. The PDF carries the same labels as the screen (Estimate, Sample shift, Simulated cluster) plus a printed-at line. Code: `components/handoff/print.ts`, styles at the end of `components/handoff/handoff.css`.

Why a frame and not `@media print` on the page: the console shell clips to the window height, so a report taller than the window would print as a single page.

## Optional agent panel

**Ask the agent** opens the existing agent chat (`components/agent/agent-chat.tsx`) in a right-hand panel on wide screens and in a sheet on narrow ones. It is closed by default and the report never depends on it. The agent keeps its rules: it reads, it cannot change anything, and everything it writes is labeled AI drafted. Starter questions are drawn from the live report (for example "Why did incident #2 at North Carolina · a17 happen?").

The only change to shared code is two optional props on `AgentChat`: `compact` (drops the thought-process column) and `suggestions` (replaces the starter questions); the starter chips now wrap. Defaults keep the AI Agent view exactly as it was.

The agent answers from the live database, so on a sample shift the panel is switched off instead of letting a made-up report mix with real numbers.

## Not done yet (roadmap)

- Wiring the chat to a chosen report (for example passing the report's incident list as context). Today it is the existing chat with report-specific starter questions.
- Real history: a `shift_report` per closed shift is the right source. Once shifts are being closed and reported, the sample tabs can be replaced by real ones.
- Assumptions are per browser. A shared, role-protected setting would need a table and reducer.
- The agent service must be running (with its API key) for the panel to get answers; locally the question is recorded and shows "Sending to the agent…".

## Testing it locally

```bash
SPACETIME_DB=mesa-shift pnpm publish:local
SPACETIME_DB=mesa-shift pnpm replay -- --speed 10 --feed shift
cd apps/console && VITE_SPACETIME_URI=ws://localhost:3000 VITE_SPACETIME_DB=mesa-shift pnpm exec vite --port 5180
```

Register an operator on the Operators page, let the replay run past two minutes so automatic migrations happen, then open Shift Handoff.
