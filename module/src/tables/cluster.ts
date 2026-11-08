import { table, t } from 'spacetimedb/server';

// Simulated cluster for capacity-neutral, in-place remediation (docs/CLUSTER-CYCLING.md).
// The racks are real (telemetry); the services and instances placed on them are simulated
// and labeled so on screen. Every action keeps the instance count unchanged.

// One row per service. `knownPatch` is a version that can be applied in place ('' if none).
export const service = table(
  { name: 'service', public: true },
  {
    serviceId: t.string().primaryKey(),
    tier: t.string(), // edge | app | data | ml | platform
    version: t.string(),
    knownPatch: t.string(),
    createdAt: t.timestamp(),
  }
);

// One running copy of a service on a rack. `rackId` changes on live migration; nothing
// ever inserts a second copy or deletes one.
export const instance = table(
  { name: 'instance', public: true },
  {
    instanceId: t.string().primaryKey(),
    serviceId: t.string().index('btree'),
    rackId: t.string().index('btree'),
    datacenterId: t.string(),
    state: t.string(), // running | throttled | patching
    demandKw: t.f64(), // what it would draw uncapped
    powerCapKw: t.f64(),
    powerKw: t.f64(), // min(demand, cap)
    cpuPct: t.f64(),
    gpuPct: t.f64(),
    version: t.string(),
    updatedAt: t.timestamp(),
  }
);

// Where traffic for an instance goes. Moves in the same transaction as the instance.
export const route = table(
  { name: 'route', public: true },
  {
    instanceId: t.string().primaryKey(),
    serviceId: t.string().index('btree'),
    target: t.string(), // rack id
    updatedAt: t.timestamp(),
  }
);

// One remediation step: automatic (actor `remediation`) or by an operator.
export const remediationRun = table(
  { name: 'remediation_run', public: true },
  {
    runId: t.u64().primaryKey().autoInc(),
    incidentId: t.u64().index('btree'), // 0 when started by hand without an incident
    rackId: t.string(), // the hot rack, '' for a patch started by hand
    action: t.string(), // throttle_in_place | live_migrate | patch_in_place | failover_to_site
    status: t.string(), // running | succeeded | insufficient | needs_approval | failed
    actor: t.string(),
    serviceId: t.string(),
    instanceId: t.string(),
    fromRack: t.string(),
    toRack: t.string(),
    version: t.string(), // target version for patch_in_place, '' otherwise
    detail: t.string(),
    step: t.u32(),
    steps: t.u32(),
    simulatedEffectC: t.f64(), // modeled, never measured: shown as "simulated effect"
    startedAt: t.timestamp(),
    decideAt: t.option(t.timestamp()), // end of the stabilization window, for throttles
    finishedAt: t.option(t.timestamp()),
  }
);

// Outcome numbers per run (docs/SCOPE-v2.md section 5).
export const remediationStats = table(
  { name: 'remediation_stats', public: true },
  {
    runId: t.u64().primaryKey(),
    instancesMoved: t.u32(),
    duplicatesAvoided: t.u32(),
    downtimeS: t.f64(),
    leadTimeS: t.f64(),
  }
);

// Drives the throttle window and patch rollouts, so they run with no client connected.
export const remediationTimer = table(
  { name: 'remediation_timer' },
  {
    scheduledId: t.u64().primaryKey().autoInc(),
    scheduledAt: t.scheduleAt(),
    runId: t.u64(),
  }
);
