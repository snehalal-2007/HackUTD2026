import { table, t } from 'spacetimedb/server';

// Threshold rules (docs/INCIDENT-RULES.md). Limits live here as data, not in code.
// Kubernetes-style probe counting: `failureThreshold` bad samples in a row to open,
// `successThreshold` good samples in a row (below warn - clearMargin) to clear.
export const threshold = table(
  { name: 'threshold', public: true },
  {
    metric: t.string().primaryKey(), // gpu_temp_c | feed_silence_s
    warn: t.f64(),
    crit: t.f64(),
    failureThreshold: t.u32(),
    successThreshold: t.u32(),
    clearMargin: t.f64(),
  }
);

// Running probe state per rack. Private: an implementation detail of the rules.
export const rackProbe = table(
  { name: 'rack_probe' },
  {
    rackId: t.string().primaryKey(),
    failCount: t.u32(),
    okCount: t.u32(),
    level: t.string(), // ok | warn | crit
    incidentId: t.option(t.u64()),
  }
);

// Per data center feed statistics, updated on every batch.
export const feedHealth = table(
  { name: 'feed_health', public: true },
  {
    datacenterId: t.string().primaryKey(),
    lastIngestAt: t.timestamp(),
    batches: t.u64(),
    readings: t.u64(),
    stale: t.bool(),
    incidentId: t.option(t.u64()),
  }
);

export const watchdogTimer = table(
  { name: 'watchdog_timer' },
  {
    scheduledId: t.u64().primaryKey().autoInc(),
    scheduledAt: t.scheduleAt(),
  }
);

// Shift housekeeping (module/src/reducers/queue.ts): ends overdue shifts and hands out work to idle operators.
export const shiftTimer = table(
  { name: 'shift_timer' },
  {
    scheduledId: t.u64().primaryKey().autoInc(),
    scheduledAt: t.scheduleAt(),
  }
);
