import { table, t } from 'spacetimedb/server';

export const quarantine = table(
  { name: 'quarantine', public: true },
  { identity: t.identity().primaryKey(), reason: t.string(), at: t.timestamp() }
);

export const threatEvent = table(
  { name: 'threat_event', public: true },
  {
    id: t.u64().primaryKey().autoInc(),
    identity: t.identity(),
    kind: t.string(),
    severity: t.string(),
    summary: t.string(),
    suggestedFix: t.string(),
    at: t.timestamp(),
  }
);
