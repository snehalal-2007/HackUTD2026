import { table, t } from 'spacetimedb/server';

// Tables for the agent's incident and shift reports (docs/agents/MODULE_CONTRACT.md).
//
// `incident`, `shift` and `event_log` are minimal here: only the fields the report
// reducers need. The module owner extends them (owner, deadlines, handoff items)
// without renaming these columns, because the agent subscribes to them.

export const incident = table(
  { name: 'incident', public: true },
  {
    incidentId: t.u64().primaryKey().autoInc(),
    status: t.string(), // open | acknowledged | escalated | closed
    title: t.string(),
    severity: t.string(), // low | medium | high | critical
    datacenterId: t.string(),
    openedAt: t.timestamp(),
    updatedAt: t.timestamp(),
    // Appended with defaults so existing databases migrate without a reset.
    kind: t.string().default('manual'), // manual | gpu_temp | gpu_failure | feed_stale
    rackId: t.string().default(''),
    source: t.string().default('manual'), // manual | rule
    peakValue: t.f64().default(0),
    closedReason: t.string().default(''),
    // Ownership (My Queue). Appended with defaults so existing rows migrate without a reset.
    owner: t.string().default(''), // owning operator's identity (hex); '' = nobody has claimed it
    ownerName: t.string().default(''),
    claimedAtMicros: t.u64().default(0n), // when the owner claimed it; 0 = never
    handedFrom: t.string().default(''), // name of the operator whose shift ended with this unfinished; '' = not a leftover
  }
);

export const shift = table(
  { name: 'shift', public: true },
  {
    shiftId: t.u64().primaryKey().autoInc(),
    status: t.string(), // active | handing_over | closed
    startedAt: t.timestamp(),
  }
);

// Append-only and hash-chained: each row's hash covers its fields and the previous
// row's hash, so editing or deleting a past row breaks every hash after it.
export const eventLog = table(
  { name: 'event_log', public: true },
  {
    seq: t.u64().primaryKey().autoInc(),
    at: t.timestamp(),
    actor: t.string(),
    action: t.string(),
    target: t.string(),
    incidentId: t.option(t.u64()),
    prevHash: t.string(),
    hash: t.string(),
  }
);

// One report per incident and kind. `final` when the incident closes,
// `interim` when it escalates.
export const incidentReport = table(
  {
    name: 'incident_report',
    public: true,
    indexes: [{ accessor: 'by_incident_kind', algorithm: 'btree', columns: ['incidentId', 'kind'] }],
  },
  {
    reportId: t.u64().primaryKey().autoInc(),
    incidentId: t.u64(),
    kind: t.string(), // final | interim
    reportJson: t.string(),
    source: t.string(), // claude | template
    writtenAt: t.timestamp(),
  }
);

export const shiftReport = table(
  { name: 'shift_report', public: true },
  {
    shiftId: t.u64().primaryKey(),
    reportJson: t.string(),
    source: t.string(), // claude | template
    writtenAt: t.timestamp(),
  }
);

// Identities allowed to write reports. Private: clients cannot read it.
// The database owner seeds it with the identity the agent prints on first connect.
export const agentIdentity = table(
  { name: 'agent_identity' },
  {
    identity: t.identity().primaryKey(),
  }
);
