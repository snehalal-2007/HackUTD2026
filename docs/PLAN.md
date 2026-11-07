# MESA Build Plan

MESA is a real-time shared operations console for data-center teams, built on SpacetimeDB for HackUTD 2026 (NMC² track and Spacetime main track). Mission: **no alert left unowned.**

- Initial Devpost entry: **Sat Nov 7, 11:00 pm**
- Final submission: **Sun Nov 8, 12:00 pm** (team target 11:30 am)
- Judging: Sun 1:00 to 4:00 pm

Rule for the whole night: a missed gate cuts scope; it never borrows time from the next phase. Cut in this order: XGBoost (keep the linear trend), voice, AI brief. **Live sync and the handoff lock are never cut.**

---

## 1. Locked stack

| Layer | Choice |
|---|---|
| Monorepo | pnpm workspaces: `module/`, `packages/*`, `apps/*`, `services/*` (the Python predictor is outside the workspace) |
| Database and server logic | SpacetimeDB 2.x TypeScript module (`spacetimedb/server`), Maincloud for prod, `spacetime dev` / `spacetime start` locally |
| Client bindings | `spacetime generate --lang typescript` into `packages/bindings`, committed |
| Operator console | React + Vite + TypeScript, `spacetimedb/react`, Tailwind v4, shadcn/ui, ReUI registry; hosted on Vercel |
| Telemetry simulator | Node 24 TypeScript client using the `spacetimedb` SDK; Railway (Docker) |
| AI agent | Node 24 TypeScript client, `@anthropic-ai/sdk` (Claude Sonnet 5.5); Railway |
| Predictor | Python FastAPI, `uv`, linear trend first, XGBoost optional; Railway (Docker) |
| Voice (optional) | ElevenLabs |
| CI | GitHub Actions: typecheck, module build, bindings drift check, Python lint |

One environment variable switches every client between local and Maincloud:

```
SPACETIME_URI=ws://localhost:3000        # or wss://maincloud.spacetimedb.com
SPACETIME_DB=mesa                        # or hackutd2026-0nef9 (production)
```

---

## 2. Roles (owners are roles, not names)

| Role | Owns |
|---|---|
| **Module owner** (back-end 1) | `module/`, `packages/bindings/`, schema changes, reducer rules |
| **Simulator owner** (back-end 2) | `services/simulator/`, `services/predictor/` |
| **Console owner** (full-stack 1) | `apps/console/` |
| **Agent and deploy owner** (full-stack 2) | `services/agent/`, Vercel, Railway, CI |
| **Security owner** | `security/`, `module/src/honeypot/`, role checks, hash-chained event log |
| **Release manager** (holder of Spacetime credits) | The only person who publishes to the Maincloud `hackutd2026-0nef9` database, from `main`, at each gate |

---

## 3. Repository layout

```
HackUTD2026/
├─ module/                    SpacetimeDB TypeScript module
│  └─ src/
│     ├─ index.ts             schema export
│     ├─ tables/              one file per table
│     ├─ reducers/            alerts.ts, shifts.ts, insights.ts, telemetry.ts
│     ├─ scheduled/           escalate.ts, prune.ts
│     ├─ lib/                 auth.ts (role checks), log.ts (hash chain)
│     └─ honeypot/            decoy reducers, canary rows
├─ packages/bindings/         generated, never edited by hand
├─ apps/console/              React + Vite operator console
├─ services/
│  ├─ simulator/              telemetry + failure scenarios
│  ├─ agent/                  Claude + predictor calls, writes via attach_insight
│  └─ predictor/              FastAPI, own pyproject + Dockerfile
├─ security/
│  ├─ decoy-web/
│  └─ attack-scripts/
├─ scripts/                   generate-bindings.sh, publish.sh, run-demo.sh
├─ docs/                      charter, PLAN.md, architecture, demo script
├─ .claude/skills/            SpacetimeDB agent skills
├─ .github/workflows/ci.yml
├─ .github/CODEOWNERS
├─ CLAUDE.md / AGENTS.md
├─ .env.example
└─ README.md                  one-command local setup for judges
```

---

## 4. The contract (agree in the first hour, then freeze)

### Tables

| Table | Fields | Notes |
|---|---|---|
| `operator` | `identity` (pk), `name`, `role` (`operator` \| `lead` \| `observer` \| `agent`), `on_shift`, `zone`, `quarantined` | Identity comes from the connection |
| `asset` | `asset_id` (pk), `kind` (`rack` \| `cooling` \| `power`), `zone`, `row`, `col`, `warn_limit`, `crit_limit`, `feeds` | Seeded in `init`. Hall: 4 rows × 6 racks, 2 cooling units, 2 power units |
| `latest_reading` | `asset_id` (pk), `metric`, `value`, `ts` | What the console subscribes to. Keeps subscriptions cheap |
| `reading` | `id` (autoInc), `asset_id` (index), `metric`, `value`, `ts` | Rolling window for prediction; pruned |
| `alert` | `alert_id` (autoInc), `asset_id`, `kind`, `severity`, `status` (`open` \| `acknowledged` \| `mitigating` \| `resolved`), `owner`, `ack_deadline`, `predicted_breach_at`, `runbook_hint`, `summary`, `created_at` | |
| `shift` | `shift_id` (autoInc), `outgoing`, `incoming`, `started_at`, `status` (`active` \| `handing_over` \| `closed`), `brief` | |
| `handoff_item` | `id` (autoInc), `shift_id` (index), `alert_id`, `note`, `ai_note`, `accepted_by`, `accepted_at` | One per open alert at handoff |
| `event_log` | `seq` (autoInc), `actor`, `action`, `target`, `detail`, `ts`, `prev_hash`, `hash` | Append-only, hash-chained |
| `presence` | `identity` (pk), `viewing`, `last_seen` | Who is looking at which alert |
| `escalation_job` | `scheduled_id`, `scheduled_at`, `alert_id` | Schedule table → `escalate` |
| `prune_job` | `scheduled_id`, `scheduled_at` | Interval schedule → `prune_readings` |
| `threat_event` | `id`, `identity`, `reducer`, `ts`, `detail` | Honeypot only (Should) |

### Reducers

| Reducer | Caller | Rule enforced on the server |
|---|---|---|
| `register_operator(name)` | anyone | Creates the operator row for the caller's identity |
| `ingest_reading(asset_id, metric, value)` | simulator | Updates `latest_reading`, appends `reading`, raises an alert when a limit is crossed (deduped per asset and kind) |
| `raise_alert(asset_id, kind, severity, summary)` | simulator, agent, honeypot | Sets `ack_deadline`; inserts an `escalation_job` |
| `acknowledge_alert(alert_id)` | operator | Caller becomes owner if unowned; cancels the pending escalation |
| `assign_alert(alert_id, identity)` | lead | Target must be on shift |
| `set_mitigating(alert_id)` | owner | |
| `resolve_alert(alert_id)` | owner | **Rejects an alert without an owner** |
| `attach_insight(alert_id, predicted_breach_at, runbook_hint, summary)` | agent only | The agent cannot call anything else that changes state |
| `begin_handoff(incoming)` | outgoing operator | Creates one `handoff_item` per non-resolved alert; shift → `handing_over` |
| `set_handoff_note(item_id, note)` | outgoing operator | |
| `attach_brief(shift_id, brief)` | agent only | |
| `accept_handoff_item(item_id)` | incoming operator | |
| `end_shift(shift_id)` | lead or outgoing | **Rejects while any item is unaccepted**; transfers ownership to incoming |
| `escalate(job)` | scheduled | If still unacknowledged, reassign to the next on-call operator, raise severity, schedule the next escalation |
| `prune_readings(job)` | scheduled | Delete `reading` rows older than the window |
| `heartbeat(viewing)` | console | Presence |
| `scenario(name)` | simulator / lead | Logs the scenario start for the demo |

Every state-changing reducer appends to `event_log` through one helper in `lib/log.ts`. Every real reducer rejects quarantined identities.

---

## 5. Phases and gates

Gate times are proposals; adjust at kickoff.

### Phase 0: Bootstrap (now, about 1 h). Agent and deploy owner
- [x] Scaffold the monorepo (pnpm workspaces, TS config, lint)
- [x] `spacetime init --lang typescript` into `module/`, moved to the layout above
- [x] Vite + React + Tailwind v4 + shadcn init in `apps/console`; add the ReUI registry
- [x] Install SpacetimeDB agent skills into `.claude/skills/`; write `CLAUDE.md` and `AGENTS.md`
- [x] `scripts/generate-bindings.sh`, `.env.example`, CI workflow, CODEOWNERS
- [x] README skeleton; first commit and push to `main`
- [ ] Repo owner: make the repo public, protect `main`, turn on secret scanning and push protection

### Phase 1: Contract. Module owner
- [ ] Tables and reducer **signatures** from section 4, with stub bodies
- [ ] Seed the hall in `init`
- [x] Release manager creates `hackutd2026-0nef9` on Maincloud and publishes the placeholder module
- [ ] Generate and commit bindings

**Gate 1 (about 4:00 pm): contract frozen.** Everyone builds on these bindings.

### Phase 2: Live data path and alerts
- [ ] Simulator streams readings through `ingest_reading` (one reading per asset every 2 s)
- [ ] Console: Floor view grid subscribing to `latest_reading` and `asset`
- [ ] Threshold alerts in `ingest_reading`; acknowledge, assign, resolve
- [ ] `escalate` scheduled reducer with ack deadlines (30 s in demo mode)
- [ ] Console: My Queue with countdown chips and one primary action per row

**Gate 2 (about 8:00 pm): two laptops show the same values, an ignored alert escalates by itself.**

### Phase 3: Shift handoff lock (signature feature)
- [ ] `begin_handoff`, `accept_handoff_item`, `end_shift` with the lock
- [ ] Console: Handoff screen, checklist, progress bar ("4 of 6 accepted"), End Shift disabled with the count on it
- [ ] Simulator: scripted scenarios (cooling failure, power overload, sensor dropout), triggered on cue
- [ ] README, screenshots, push

**Gate 3 (11:00 pm): initial Devpost entry points to a working build with all five Musts.**

### Phase 4: Intelligence (Shoulds)
- [ ] Predictor: `/predict` returns time-to-breach from a rolling window (linear trend)
- [ ] Agent: on new alert → predictor + Claude → `attach_insight` (plain-language summary, runbook hint)
- [ ] Agent: on `begin_handoff` → Claude five-line brief from `event_log` → `attach_brief`
- [ ] Console: Alert detail with sparkline, runbook hint, event history; brief on the Handoff screen

**Gate 4 (about 4:00 am): prediction and brief appear live in both consoles.**

### Phase 5: Hardening and Coulds
- [ ] Role checks in every reducer; agent restricted to `attach_insight` and `attach_brief`
- [ ] Hash-chained `event_log` with a Verify button
- [ ] Honeypot: decoy reducers, `threat_event` → critical alert, quarantine
- [ ] In priority order if time allows: XGBoost, presence avatars, keyboard shortcuts, cascade awareness, voice escalation

**Gate 5 (about 9:00 am): feature freeze.** Only fixes and polish after this.

### Phase 6: Demo and submission
- [ ] Rehearse the 3-minute two-laptop script (docs/demo-script.md)
- [ ] Record the backup video
- [ ] Local SpacetimeDB fallback on the demo laptop, tested with the venue Wi-Fi off
- [ ] Final Devpost submission by 11:30 am

---

## 6. Provisioning checklist

| Item | Owner role | Where the secret lives |
|---|---|---|
| Maincloud `hackutd2026-0nef9` database (created, placeholder module published) | Release manager | n/a (`spacetime login`) |
| Anthropic API key | Agent and deploy owner | Railway env (agent) |
| Railway project: simulator, agent, predictor, decoy-web | Agent and deploy owner | Railway env |
| Vercel project for `apps/console` | Agent and deploy owner | Vercel env (`VITE_SPACETIME_URI=wss://maincloud.spacetimedb.com`, `VITE_SPACETIME_DB=hackutd2026-0nef9`) |
| ElevenLabs key (optional) | Agent and deploy owner | Railway env |
| Public repo, branch protection, secret scanning | Repo owner | GitHub settings |
| Local tools: `spacetime`, `railway`, `uv`, current Vercel CLI | Everyone | n/a |

Only `.env.example` is committed. The repo is public.

---

## 7. Repo rules

- Short-lived branches named `role/feature`; PRs into `main`; CI must pass.
- Schema changes go through the module owner. Regenerate bindings and commit them in the same PR. Announce in team chat.
- `main` always deploys. Push at every gate.
- No fake functionality in the demo. Anything unfinished is a roadmap item.

## 8. Open items

- [x] Logo mark: four-point sparkle with flanking spikes, cream `#F0E6C0` on `#1C1C1C` (`docs/brand/mesa-mark.svg`). Drawn as our own SVG in the style of the reference, not traced. Used for the favicon and console header in Phase 0
- [ ] Confirm with Spacetime mentors: TS module on Maincloud is fine for the main track; can more than one person publish; can CI publish with a token; how far the credits stretch overnight
- [ ] Ask at the NMC² workshop which signals operators watch most, and use their wording
- [ ] Decide who presents to which judging panel
- [ ] What MESA stands for
