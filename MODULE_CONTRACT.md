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
