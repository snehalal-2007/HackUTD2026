# MESA Scope v2: In-Place Remediation and Automatic Incident Reports

**Status:** current scope. Where this file and `docs/PLAN.md` disagree, this file wins.
**Audience:** teammates and the coding agents working for them. Each role section ends with a prompt you can paste into your agent.

## 1. What changed and why

Feedback from NMC² changed two things.

1. **Do not fix failures by duplicating.** The common approach starts a second copy of every failing service somewhere else. At cloud scale, a 10% failure rate across 10 million services means 1 million extra copies, each using its own CPU, memory and power, plus the work of managing them. That duplication is waste.
   MESA instead fixes or moves workloads **in place**, the way Linux kernel live patching updates a running kernel without a restart, and the way live migration moves a running process instead of starting a second one. The goal is **capacity-neutral remediation**: the number of running instances stays the same while traffic is moved.
2. **The agent writes incident reports; it does not make decisions.** Thresholds decide and act (deterministic math, modeled on Kubernetes; see the handoff doc "MESA Handoff: Threshold Rules and Automated Prevention"). The agent's job changes from question-and-answer chat to **automatic incident reporting**: it summarizes aggregated telemetry with timestamps, the thresholds crossed, what the system did automatically, and the outcome.

## 2. Scope at a glance

| Area | Status | Notes |
|---|---|---|
| Live shared state across screens | **Keep (Must)** | Unchanged |
| Alert ownership, ack deadlines, scheduled escalation | **Keep (Must)** | Unchanged |
| Shift handoff lock | **Keep (Must)** | Unchanged; the shift report becomes the handoff brief |
| Scripted failure scenarios | **Keep (Must)** | Add `rack-hot` (below) as the headline scenario |
| Threshold detection and decisions (Kubernetes-style) | **Keep (Must)** | As in the handoff doc; no AI in decisions |
| In-place remediation (live migrate / throttle / patch) | **New (Must)** | Replaces duplicate-and-failover as the default |
| Automatic incident reports by the agent | **New (Must)** | Replaces chat Q&A as the agent's job |
| Duplicates-avoided and lead-time metrics | **New (Should)** | Part of the Outcomes panel |
| Hash-chained event log, role checks, honeypot | **Keep (Should)** | Security is NMC²'s selling point |
| Eight sites in the simulator | **Keep (Should)** | Spartanburg, North Carolina, six simulated |
| Free-form agent Q&A | **Cut to roadmap** | Chat stays, but shows reports and status posts only |
| Jev | **Cut** | Replaced by threshold math |
| Python predictor service (FastAPI, XGBoost) | **Cut to roadmap** | Time-to-breach is a linear fit inside the reducer; one less service to deploy |
| ElevenLabs voice escalation | **Cut** | |
| Presence avatars, replay mode, mobile view | **Cut to roadmap** | |
| `failover_to_site` as an automatic action | **Changed** | Last resort only, always needs a lead's approval |

## 3. In-place remediation

When thresholds say a rack must shed load, MESA tries these in order and stops at the first that works. Each one keeps the instance count unchanged.

| Order | Action | What it does | Duplicate copies |
|---|---|---|---|
| 1 | `throttle_in_place` | Lowers the hot service's power or CPU cap on the same rack until the trend turns | 0 |
| 2 | `live_migrate` | Moves the running instance to the best Ready rack and switches its route in the same step | 0 (no second copy is ever started) |
| 3 | `patch_in_place` | Applies a fix to the running service without restarting it (the kernel live patching idea), for faults with a known patch | 0 |
| 4 | `failover_to_site` | Starts the service at another site | Temporary; approval only |

**In the demo the cluster is simulated** (`service`, `instance`, `route` tables, labeled simulated on screen). `live_migrate` is one reducer transaction that sets `instance.rack_id` and `route.target` together, so there is no moment with two copies and no moment with none. Real live migration (for example CRIU checkpoint/restore, or VM live migration) is the roadmap path.

**Metric to show:** duplicates avoided = instances moved in place, compared with what duplicate-and-failover would have started; plus downtime (zero) and warning lead time.

### Headline scenario: `rack-hot`

Spartanburg rack B-12 runs at 85% CPU and 60% GPU utilization while its inlet temperature rises toward the hard limit.

1. Probe counting marks B-12 Unhealthy; the trend predicts the hard limit in about 14 minutes.
2. Rules pick `throttle_in_place`; the temperature trend does not turn within the stabilization window.
3. Rules pick `live_migrate`; the scheduler score chooses B-07; the instance and route move in one transaction.
4. B-12 cools and recovers after `success_threshold` passes.
5. The agent posts the incident report.

## 4. Automatic incident reports

### When a report is written

| Trigger | Report kind |
|---|---|
| An alert resolves | Incident report |
| A playbook run finishes, fails or rolls back | Incident report (updated if one exists) |
| A shift ends | Shift report: all incidents in the shift; used as the handoff brief |

The agent never writes a report on every reading, and never on a schedule shorter than these triggers.

### What a report contains

1. **Summary:** one sentence: what happened, where, and the outcome.
2. **Timeline:** timestamped events from `event_log` (first threshold crossed, decisions, each action step, recovery).
3. **Telemetry overview:** aggregates over the incident window per affected asset and metric: min, average, max, p95, and the value at each key moment. Never raw readings.
4. **Thresholds crossed:** which limits, with the values and the rules that fired.
5. **What the system did automatically:** each decision with its rule and inputs, each action and its result.
6. **Outcome:** downtime, warning lead time, duplicates avoided, time to recover.
7. **Open items:** anything unresolved, with owner and deadline.

### How it is built (keeps cost and errors down)

1. The agent service subscribes to the trigger rows.
2. It builds a **report input** in code: the aggregates, timeline rows and decisions above, as JSON. All numbers come from the database, computed by code, not by a model.
3. Claude turns that JSON into readable prose (sections 1 to 7). It is told to use only numbers present in the input.
4. **Validator:** every number and timestamp in Claude's text must appear in the input JSON. If any does not, the report is rejected and a plain template version (no AI) is posted instead.
5. The agent calls `post_incident_report`; the console shows it in the AI Agent chat with the report attachment.

One Claude call per report. If Claude is unavailable, the template version is used, so reports never block on AI.

## 5. Contract changes

These add to the tables and reducers in the handoff doc and `docs/PLAN.md` section 4. Database names are snake_case; TypeScript identifiers are camelCase.

### Tables

| Table | Change | Key fields |
|---|---|---|
| `playbook` | Changed | Add `action`: `throttle_in_place`, `live_migrate`, `patch_in_place`, `failover_to_site`; add `order` |
| `instance` | Changed | Add `cpu_pct`, `gpu_pct`, `power_cap_kw`, `version`; `rack_id` changes on live migration |
| `remediation_stats` | New | `run_id`, `instances_moved`, `duplicates_avoided`, `downtime_s`, `lead_time_s` |
| `incident_report` | New | `report_id`, `kind` (incident or shift), `alert_id`, `shift_id`, `window_start`, `window_end`, `input_json`, `body_md`, `source` (`claude` or `template`), `created_at` |
| `agent_message` | Changed | Add `report_id`; messages are report posts and short status posts only |

### Reducers

| Reducer | Caller | Purpose |
|---|---|---|
| `live_migrate_instance(instance_id, to_rack_id)` | executor role | Moves the instance and its route in one transaction; refuses if the target rack is not Ready |
| `set_power_cap(instance_id, kw)` | executor role | Throttle in place |
| `apply_patch(service_id, version)` | executor role | Patch in place; records old and new version |
| `post_incident_report(...)` | agent role | Writes `incident_report` and an `agent_message`; rejects an empty `input_json` |

## 6. Work split and agent prompts

Branches are `role/feature`. Read `AGENTS.md`, `docs/PLAN.md`, this file and the handoff doc before starting. Never commit secrets; keys live in Railway and Vercel environment variables.

### Module owner

- Add the tables and reducers in section 5 to the Phase 1 contract.
- Order the playbook actions in `ingest_readings` decisions: throttle, then live migrate, then patch, then failover (approval only).
- Compute `remediation_stats` when a run finishes.

> **Prompt for your agent:** "In `module/`, implement the Scope v2 contract from `docs/SCOPE-v2.md` section 5 on top of the Phase 1 tables in `docs/PLAN.md`. `live_migrate_instance` must update `instance.rack_id` and `route.target` in one reducer and refuse non-Ready racks. Playbook decisions try `throttle_in_place`, `live_migrate`, `patch_in_place`, then `failover_to_site` (approval only). Write unit tests for the decision order and for `remediation_stats`. Regenerate bindings with `pnpm generate` and commit them in the same PR. Follow AGENTS.md."

### Simulator owner

- Add the `rack-hot` scenario (85% CPU, 60% GPU, rising inlet temperature on Spartanburg B-12).
- Make throttling and migration affect the simulated readings: a lower power cap slows the temperature rise; a migrated instance moves its load to the new rack.

> **Prompt for your agent:** "In `services/simulator/`, add the `rack-hot` scenario from `docs/SCOPE-v2.md` section 3. Readings must react to `instance.power_cap_kw` and `instance.rack_id` changes so throttling and live migration visibly change rack temperature and load. Use the generated bindings in `packages/bindings`. Follow AGENTS.md."

### Executor and agent owner

- Executor: carry out `throttle_in_place`, `live_migrate` and `patch_in_place` against the simulated tables through the new reducers, reporting each step.
- Agent: replace chat Q&A with incident reports as in section 4, including the validator and the template fallback.

> **Prompt for your agent:** "In `services/agent/`, implement automatic incident reports from `docs/SCOPE-v2.md` section 4. Subscribe to resolved alerts, finished playbook runs and ended shifts. Build the report input JSON in code (aggregates min, avg, max, p95 per metric over the window; timeline from `event_log`; decisions with rules and inputs; outcome from `remediation_stats`). Call Claude once per report to write prose using only numbers in the input. Reject any report containing a number or timestamp not in the input and post the template version instead. Save with `post_incident_report`. Keep `ANTHROPIC_API_KEY` in env vars. Follow AGENTS.md."

### Console owner

- AI Agent chat: show report posts and the report as an attachment; remove the free-form Q&A composer or mark it as roadmap.
- Outcomes panel: add duplicates avoided, downtime and lead time from `remediation_stats`.
- Alerts view: show the remediation action taken and its order (throttle, migrate, patch, failover).

> **Prompt for your agent:** "In `apps/console/`, update the AI Agent chat to display `agent_message` and `incident_report` rows live (report attachment opens the markdown body); remove or disable free-form Q&A. Add duplicates avoided, downtime and lead time from `remediation_stats` to the Outcomes panel. Use ReUI and shadcn components already installed. Follow AGENTS.md."

### Security owner

- Executor and agent identities get only the reducers they need.
- Every remediation step and report is in the hash-chained `event_log`.

## 7. Done when

- [ ] `rack-hot` runs end to end on two laptops with no one typing
- [ ] The rack is throttled first, then live-migrated, with the instance count unchanged throughout
- [ ] An incident report appears in the AI Agent chat on both screens, with a timeline, telemetry aggregates, actions and outcome
- [ ] Every number in the report matches the database; turning Claude off produces the template report instead
- [ ] The Outcomes panel shows duplicates avoided, zero downtime and the warning lead time
- [ ] Ending the shift produces a shift report that the incoming operator reads before accepting items

## 8. Open questions

- The exact term the NMC² representative used for in-place updates (kernel live patching or live migration); use their wording in the pitch.
- Whether to keep the Python predictor code in the repo as a roadmap item or remove it.
