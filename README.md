<p align="center"><img src="docs/brand/mesa-mark.svg" width="96" alt="MESA"></p>

# MESA

**No alert left unowned.** MESA is a real-time, shared operations console for data-center teams. Every warning gets an owner and a deadline, every shift change requires the incoming operator to accept each open issue, and every alert shows how long until it gets worse.

Built for HackUTD 2026 (Zero Day) in two tracks: **NMC² "Keep the World Running"** and **Spacetime**.

## Why SpacetimeDB

All core state lives in one SpacetimeDB module: telemetry, alerts, ownership, shifts, handoff items and the event log. Business rules run inside the database as reducers, so an alert cannot be resolved without an owner and a shift cannot end while an item is unaccepted. Escalation runs as a scheduled reducer, so it still fires when every browser is closed. Operators, the telemetry simulator and the AI agent are all SpacetimeDB clients that see the same state live.

```
 Operator console (React) ─┐
 Telemetry simulator (Node) ┼──► SpacetimeDB module ◄── subscriptions + reducers
 AI agent (Node) ───────────┘         │
        │                             └─ scheduled reducers: escalate, prune
        ├──► Predictor (FastAPI)
        └──► Claude
```

## Run it locally

Requirements: Node 22+, pnpm 10, the [SpacetimeDB CLI](https://spacetimedb.com/install), and [uv](https://docs.astral.sh/uv/) for the predictor.

```bash
pnpm install
cp .env.example .env
pnpm dev:db            # terminal 1: local SpacetimeDB on :3000
pnpm publish:local     # publish the module and regenerate bindings
pnpm dev:console       # terminal 2: http://localhost:5173
pnpm dev:sim           # terminal 3: telemetry simulator
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
| `services/simulator/` | Telemetry simulator and failure scenarios |
| `services/agent/` | AI agent: predictor and Claude calls, writes insights through reducers |
| `services/predictor/` | Time-to-breach prediction (FastAPI) |
| `security/` | Honeypot components, clearly labeled |
| `docs/` | Charter, build plan, agent reference, brand |

## Status

Phase 0 (bootstrap) is done. See [docs/PLAN.md](docs/PLAN.md) for the build plan and checkpoints.
