import { table, t } from 'spacetimedb/server';

export const quarantine = table(
  { name: 'quarantine', public: true },
  {
    identity: t.identity().primaryKey(),
    reason: t.string(),
    at: t.timestamp(),
    hits: t.u32(),
  }
);

export const threatEvent = table(
  { name: 'threat_event', public: true },
  {
    id: t.u64().primaryKey().autoInc(),
    identity: t.identity(),
    connectionId: t.string(),
    decoy: t.string(),
    hitNumber: t.u32(),
    kind: t.string(),
    severity: t.string(),
    summary: t.string(),
    suggestedFix: t.string(),
    at: t.timestamp(),
  }
);
