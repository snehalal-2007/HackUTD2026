<p align="center"><img src="docs/brand/mesa-mark.svg" width="96" alt="MESA"></p>

# MESA

**No alert left unowned.** MESA is a real-time, shared operations console for data-center teams: one live place for the telemetry, the incident and the record of what happened, shared by every screen. Ownership, acknowledgment deadlines and a shift handoff that must be accepted are the goal, and are in progress (see below).

Built for HackUTD 2026 (Zero Day) in two tracks: **NMC² "Keep the World Running"** and **Spacetime**.

## What works today

- **Live telemetry feeds.** Real OLCF Summit telemetry replayed as live feeds from 8 data centers (16 racks, 288 servers), a batch from each site about every 10 seconds. See [docs/TELEMETRY.md](docs/TELEMETRY.md).
- **Incidents opened by rule.** Fixed, stored thresholds (50 °C warn, 55 °C critical on the hottest GPU in a rack) open, escalate and close incidents inside the database, with no AI in the decision. See [docs/INCIDENT-RULES.md](docs/INCIDENT-RULES.md).
- **Feed watchdog.** A scheduled reducer opens an incident for any data center silent for 30 seconds and closes it when data returns. It runs with no client connected.
- **Log view.** Feed health per data center, active and closed incidents, and the event log.
- **Tamper-evident event log.** Every rule decision is appended to a hash-chained log. **Verify chain** recomputes every hash in the browser and names the first edited event.
- **3D floor.** Three sites, floors and blocks colored by live GPU temperature, with a per-block panel and a labeled straight-line trend. Spartanburg is the only NMC² site; the others are simulated, and the console says so.
- **Honeypot.** Decoy reducers record an intrusion and quarantine the calling identity. `register_operator` rejects quarantined identities today; the guard is not yet on every reducer.
- **Operators.** Operators register and appear live on every screen.

Not live yet: the AI Agent chat and the Alerts page show sample content and are marked as previews. The agent service does not write reports yet.

## In progress

- Incident toasts, a live scrolling temperature chart, and motion for the Log view and floor scene
- Cluster cycling: remediating a hot rack by throttling or moving a service in place, with no duplicate copies
- Acknowledge, assign and automatic escalation of incidents, then the shift handoff
- Automatic incident reports written by the AI agent

Split across parallel work streams in [docs/PARALLEL-AGENTS.md](docs/PARALLEL-AGENTS.md); scope in [docs/SCOPE-v2.md](docs/SCOPE-v2.md).

## Demo

A 3-minute, two-laptop script that uses only what is merged: [docs/DEMO.md](docs/DEMO.md).

## Why SpacetimeDB

All core state lives in one SpacetimeDB module: telemetry, incidents, rule state and the event log. Business rules run inside the database as reducers, in the same transaction as the data, so they are deterministic and replayable. The feed watchdog runs as a scheduled reducer, so it still fires when every browser is closed. Operators, the replayer and the agent are all SpacetimeDB clients that see the same state live.

```
 Operator console (React) ──┐
 Telemetry replayer (Node) ─┼──► SpacetimeDB module ◄── subscriptions + reducers
 AI agent (Node, early) ────┘         │
                                      └─ scheduled reducers: feed watchdog, prune
```

## Run it locally

Requirements: Node 22+, pnpm 10, the [SpacetimeDB CLI](https://spacetimedb.com/install), and [uv](https://docs.astral.sh/uv/) for the predictor.

```bash
pnpm install
cp .env.example .env
pnpm dev:db            # terminal 1: local SpacetimeDB on :3000
pnpm publish:local     # publish the module and regenerate bindings
pnpm dev:console       # terminal 2: http://localhost:5173
pnpm replay            # terminal 3: stream real Summit telemetry from 8 data centers
```

Open the console in two windows to see both update together.

The production database is `hackutd2026-0nef9` on Maincloud. Point a client at it with `wss://maincloud.spacetimedb.com` and that database name (see `.env.example`).

Predictor:

```bash
cd services/predictor && uv sync && uv run uvicorn app.main:app --reload
```

## Repository

| Path | What |
|---|---|
| `module/` | SpacetimeDB TypeScript module: tables, reducers, scheduled reducers |
| `packages/bindings/` | Generated client bindings. Never edit by hand; run `pnpm generate` |
| `apps/console/` | Operator console: React, Vite, Tailwind, shadcn/ui, ReUI |
| `services/replayer/` | Streams real data-center telemetry (OLCF Summit) from 8 sites; see [docs/TELEMETRY.md](docs/TELEMETRY.md) |
| `services/simulator/` | Scripted failure scenarios (planned; a stub today) |
| `services/agent/` | AI agent that will write incident reports through reducers (a stub today) |
| `services/predictor/` | Time-to-breach prediction (FastAPI), on the roadmap; the console's trend is a straight-line fit in the browser |
| `security/` | Honeypot attack script (`pnpm demo:attack`), clearly labeled |
| `docs/` | Charter, build plan, agent reference, brand |

## Data credit

Telemetry is replayed from [ClusterWise](https://huggingface.co/datasets/MachaParfait/ClusterWise), OLCF Summit operational data, licensed CC BY 4.0.

## Status

The telemetry, rules, Log, honeypot and 3D floor are merged and described above. The rest is in progress: see [docs/PARALLEL-AGENTS.md](docs/PARALLEL-AGENTS.md) for the open work streams, [docs/SCOPE-v2.md](docs/SCOPE-v2.md) for current scope and [docs/PLAN.md](docs/PLAN.md) for the build plan.
