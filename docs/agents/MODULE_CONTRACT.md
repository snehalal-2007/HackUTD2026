# Agent ↔ module contract (for the module owner)

The agent needs exactly two reducers and one allow-list. Adapt the sketch to the SpacetimeDB
TypeScript module syntax used in `module/src/index.ts`.

## Tables

```
incident_report:  incident_id (u64), kind ('final' | 'interim'), report_json (string),
                  source ('claude' | 'template'), written_at (timestamp)
                  -- unique on (incident_id, kind)
shift_report:     shift_id (u64, pk), report_json (string), source (string), written_at (timestamp)
agent_identity:   identity (pk)   -- seed with the identity the agent prints on first connect
```

All of `incident`, `migration`, `telemetry_rollup`, `event_log`, `shift`, `service`,
`incident_report`, `shift_report` must be `public: true` (the agent subscribes to them).

## Reducers

```ts
// attach_report({ incidentId: u64, kind: string, reportJson: string, source: string })
export function attach_report(ctx, { incidentId, kind, reportJson, source }) {
  if (!ctx.db.agentIdentity.identity.find(ctx.sender)) throw new Error('forbidden');
  if (kind !== 'final' && kind !== 'interim') throw new Error('bad kind');
  if (!ctx.db.incident.incidentId.find(incidentId)) throw new Error('no incident');
  const exists = [...ctx.db.incidentReport.iter()].some(r => r.incidentId === incidentId && r.kind === kind);
  if (exists) return;                                     // idempotent
  ctx.db.incidentReport.insert({ incidentId, kind, reportJson: reportJson.slice(0, 20000), source, writtenAt: ctx.timestamp });
  appendEvent(ctx, 'agent', `wrote ${kind} report`, `incident ${incidentId}`, incidentId);
}

// attach_shift_report({ shiftId: u64, reportJson: string, source: string })
export function attach_shift_report(ctx, { shiftId, reportJson, source }) {
  if (!ctx.db.agentIdentity.identity.find(ctx.sender)) throw new Error('forbidden');
  if (ctx.db.shiftReport.shiftId.find(shiftId)) return;
  ctx.db.shiftReport.insert({ shiftId, reportJson: reportJson.slice(0, 20000), source, writtenAt: ctx.timestamp });
  appendEvent(ctx, 'agent', 'wrote shift report', `shift ${shiftId}`, null);
}
```

And in `assertAllowed`: reject the agent identity for every other reducer
(acknowledge, assign, close, rollback, pause, config, handoff, end_shift).

## Events the agent reacts to

| Change | Agent writes |
|---|---|
| `incident.status` becomes `closed` | `attach_report(kind: 'final')` |
| `incident.status` becomes `escalated` | `attach_report(kind: 'interim')` |
| `shift.status` becomes `handing_over` | `attach_shift_report` |

---

## Implementation status (module)

Implemented in `module/src`:

| Contract item | Where | Notes |
|---|---|---|
| `incident_report` | `tables/reporting.ts` | Adds a `report_id` primary key; `(incident_id, kind)` lookup via the `by_incident_kind` index |
| `shift_report` | `tables/reporting.ts` | As specified |
| `agent_identity` | `tables/reporting.ts` | Private table (clients cannot read it) |
| `attach_report` | `reducers/reports.ts` | Also rejects an unknown `source` (allowed: `claude`, `template`) and an empty report; idempotent per incident and kind |
| `attach_shift_report` | `reducers/reports.ts` | Also rejects an unknown shift, unknown `source` and an empty report; idempotent per shift |
| `appendEvent` | `lib/log.ts` | Hash-chained `event_log` (64-bit FNV-1a over the previous hash and the row) |
| Agent blocked elsewhere | `lib/agent.ts` (`rejectAgent`) | Called by every other state-changing reducer. When the honeypot guard (`assertAllowed`) merges, call both |

Minimal versions added so the reducers work (the module owner extends them without renaming columns):

| Table | Fields | Reducers |
|---|---|---|
| `incident` | `incident_id`, `status` (open, acknowledged, escalated, closed), `title`, `severity`, `datacenter_id`, `opened_at`, `updated_at` | `open_incident`, `set_incident_status` (a closed incident cannot change) |
| `shift` | `shift_id`, `status` (active, handing_over, closed), `started_at` | `start_shift`, `set_shift_status` |
| `event_log` | `seq`, `at`, `actor`, `action`, `target`, `incident_id`, `prev_hash`, `hash` | Written only through `appendEvent` |

**Not yet in the module:** `migration`, `telemetry_rollup`, `service`. Their fields are not defined anywhere the module owner can see. The agent's subscription to them will fail until they exist; whoever owns the agent should send their field lists.

### Seed the agent identity

Run the agent once and copy the identity it prints. Then, as the database owner:

```bash
spacetime sql hackutd2026-0nef9 "INSERT INTO agent_identity (identity) VALUES (0x<64 hex chars>)" --server maincloud
```

Use `--server local` and your local database name for local testing. Remove an identity with `DELETE FROM agent_identity WHERE identity = 0x…`.

### Tested locally

- Operator opened, escalated and closed an incident, started a shift and set it to handing_over. Reopening the closed incident was rejected.
- Agent wrote a final and an interim report and a shift report. Repeating them changed nothing. Bad kind, bad source, unknown incident and unknown shift were rejected.
- Agent calling `register_operator` and `ingest_readings` was rejected. A non-agent calling either report reducer got `forbidden`.
- `event_log` held all 8 actions with an unbroken hash chain.
