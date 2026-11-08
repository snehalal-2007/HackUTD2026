import { schema, table, t } from 'spacetimedb/server';
import { agentIdentity, eventLog, incident, incidentReport, shift, shiftReport } from './tables/reporting';
import { feedHealth, rackProbe, threshold, watchdogTimer } from './tables/rules';

// Keep this file as the single schema() call. The rest of the Phase 1 contract
// (docs/PLAN.md section 4, docs/SCOPE-v2.md) is added here as it lands.

// Operators (Phase 0).
export const operator = table(
  { name: 'operator', public: true },
  {
    identity: t.identity().primaryKey(),
    name: t.string(),
    role: t.string(), // operator | lead | observer | agent
    onShift: t.bool(),
    online: t.bool(),
  }
);

// ---------------------------------------------------------------------------
// Telemetry (docs/TELEMETRY.md). Hierarchy: region > datacenter > rack > server.
// ---------------------------------------------------------------------------

// One row per data center. `feed` is the identity allowed to stream for it:
// the first client to ingest claims it, and other identities are rejected.
export const datacenter = table(
  { name: 'datacenter', public: true },
  {
    datacenterId: t.string().primaryKey(),
    name: t.string(),
    region: t.string(),
    feed: t.identity(),
    lastIngestAt: t.timestamp(),
  }
);

// One row per rack, with aggregates refreshed on every batch.
export const rack = table(
  { name: 'rack', public: true },
  {
    rackId: t.string().primaryKey(),
    datacenterId: t.string().index('btree'),
    servers: t.u32(),
    gpuTempMaxC: t.f64(),
    cpuTempMaxC: t.f64(),
    powerKw: t.f64(),
    updatedAt: t.timestamp(),
  }
);

export const server = table(
  { name: 'server', public: true },
  {
    serverId: t.string().primaryKey(),
    rackId: t.string().index('btree'),
    datacenterId: t.string().index('btree'),
    region: t.string(),
    sourceHostname: t.string(),
  }
);

// The newest reading per server. The console subscribes to this, not to history.
export const serverLatest = table(
  { name: 'server_latest', public: true },
  {
    serverId: t.string().primaryKey(),
    rackId: t.string().index('btree'),
    datacenterId: t.string().index('btree'),
    seq: t.u64(),
    measuredAt: t.timestamp(),
    receivedAt: t.timestamp(),
    nodeState: t.string(),
    jobActive: t.bool(),
    gpuFailure: t.bool(),
    gpuTempC: t.f64(),
    cpuTempC: t.f64(),
    gpuPowerW: t.f64(),
    cpuPowerW: t.f64(),
    nodePowerW: t.f64(),
    gpuUtilPct: t.f64(), // derived from GPU power / rated max
    cpuUtilPct: t.f64(), // derived from CPU power / rated max
    source: t.string(), // e.g. summit (measured) | synthetic
  }
);

// Rolling history for trends and prediction. Pruned by `prune_readings`.
export const serverReading = table(
  { name: 'server_reading', public: true },
  {
    id: t.u64().primaryKey().autoInc(),
    serverId: t.string().index('btree'),
    measuredAt: t.timestamp(),
    receivedAt: t.timestamp(),
    gpuTempC: t.f64(),
    cpuTempC: t.f64(),
    nodePowerW: t.f64(),
    gpuUtilPct: t.f64(),
    cpuUtilPct: t.f64(),
  }
);

export const pruneTimer = table(
  { name: 'prune_timer' },
  {
    scheduledId: t.u64().primaryKey().autoInc(),
    scheduledAt: t.scheduleAt(),
  }
);

// One reading as sent by a feed. Field names match the replayer's CSV.
export const ReadingIn = t.object('ReadingIn', {
  region: t.string(),
  datacenterName: t.string(),
  rackId: t.string(),
  serverId: t.string(),
  sourceHostname: t.string(),
  seq: t.u64(),
  measuredAt: t.timestamp(),
  nodeState: t.string(),
  jobActive: t.bool(),
  gpuFailure: t.bool(),
  gpuTempC: t.f64(),
  cpuTempC: t.f64(),
  gpuPowerW: t.f64(),
  cpuPowerW: t.f64(),
  nodePowerW: t.f64(),
  gpuUtilPct: t.f64(),
  cpuUtilPct: t.f64(),
  source: t.string(),
});

const spacetimedb = schema({
  operator,
  datacenter,
  rack,
  server,
  serverLatest,
  serverReading,
  pruneTimer,
  incident,
  shift,
  eventLog,
  incidentReport,
  shiftReport,
  agentIdentity,
  threshold,
  rackProbe,
  feedHealth,
  watchdogTimer,
});
export default spacetimedb;
