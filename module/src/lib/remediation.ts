import { SenderError, type InferSchema, type ReducerCtx } from 'spacetimedb/server';
import { ScheduleAt, Timestamp } from 'spacetimedb';
import type spacetimedb from '../schema';
import { appendEvent } from './log';

type Ctx = ReducerCtx<InferSchema<typeof spacetimedb>>;

// Capacity-neutral, in-place remediation (docs/CLUSTER-CYCLING.md, docs/SCOPE-v2.md section 3).
// Order: throttle_in_place -> live_migrate -> patch_in_place -> failover_to_site (approval only).
// No step ever inserts or deletes an instance: the instance count is the same before and after.

export const ACTOR = 'remediation';
export const WINDOW_MICROS = 120n * 1_000_000n; // stabilization window after a throttle
export const PATCH_STEP_MICROS = 6n * 1_000_000n; // one instance per step
export const RACK_SLOTS = 5; // instances a rack can host
export const MIN_RACKS = 16; // the cluster seeds once telemetry has created this many racks
export const DEFAULT_CAP_KW = 10;
const THROTTLE_FACTOR = 0.7; // throttle lowers the cap to 70% of the current draw
// Modeled, not measured: °C a rack would shed per kW removed. Shown only as "simulated effect".
const SIM_C_PER_KW = 0.6;

const round1 = (n: number) => Math.round(n * 10) / 10;
const secondsBetween = (from: Timestamp, to: Timestamp) =>
  Number(to.microsSinceUnixEpoch - from.microsSinceUnixEpoch) / 1_000_000;
const after = (ts: Timestamp, micros: bigint) => new Timestamp(ts.microsSinceUnixEpoch + micros);

// ---------------------------------------------------------------------------
// Pure decisions (unit-tested in module/test/remediation.test.ts)
// ---------------------------------------------------------------------------

export type Action = 'throttle_in_place' | 'live_migrate' | 'patch_in_place' | 'failover_to_site' | 'none';

/** When a rack incident goes critical: throttle first, once per incident. */
export function decideOnCritical(s: { hasRun: boolean; hasInstance: boolean }): Action {
  if (s.hasRun || !s.hasInstance) return 'none';
  return 'throttle_in_place';
}

/** After the throttle's stabilization window: stop if it worked, else the next in-place option. */
export function decideAfterWindow(s: {
  stillOver: boolean;
  hasInstance: boolean;
  target: string | null;
  knownPatch: boolean;
}): Action {
  if (!s.stillOver || !s.hasInstance) return 'none';
  if (s.target) return 'live_migrate';
  if (s.knownPatch) return 'patch_in_place';
  return 'failover_to_site';
}

export interface RackView {
  rackId: string;
  datacenterId: string;
  gpuTempMaxC: number;
  ready: boolean;
  instances: number;
  services: Set<string>;
}

/**
 * The Ready rack with the most temperature headroom that has a free slot and does not
 * already run a copy of the service. Ties: fewer instances, then rack id.
 */
export function pickTarget(racks: RackView[], fromRack: string, serviceId: string, warn: number): string | null {
  const ok = racks.filter(
    r => r.rackId !== fromRack && r.ready && r.instances < RACK_SLOTS && !r.services.has(serviceId),
  );
  ok.sort(
    (a, b) =>
      warn - b.gpuTempMaxC - (warn - a.gpuTempMaxC) ||
      a.instances - b.instances ||
      (a.rackId < b.rackId ? -1 : a.rackId > b.rackId ? 1 : 0),
  );
  return ok[0]?.rackId ?? null;
}

/** The instance generating the most heat (uncapped demand), skipping one mid-patch. */
export function hottestInstance<T extends { instanceId: string; demandKw: number; state: string }>(
  list: Iterable<T>,
): T | undefined {
  let best: T | undefined;
  for (const i of list) {
    if (i.state === 'patching') continue;
    if (!best || i.demandKw > best.demandKw || (i.demandKw === best.demandKw && i.instanceId < best.instanceId)) {
      best = i;
    }
  }
  return best;
}

/** Draw and utilization after a cap change; utilization scales with the power actually drawn. */
export function withCap<T extends { demandKw: number; powerKw: number; cpuPct: number; gpuPct: number }>(
  inst: T,
  capKw: number,
): T & { powerCapKw: number; state: string } {
  const powerKw = round1(Math.min(inst.demandKw, capKw));
  const full = inst.demandKw > 0 ? powerKw / inst.demandKw : 1;
  const was = inst.demandKw > 0 ? inst.powerKw / inst.demandKw : 1;
  const scale = was > 0 ? full / was : 1;
  return {
    ...inst,
    powerCapKw: round1(capKw),
    powerKw,
    cpuPct: round1(Math.min(100, inst.cpuPct * scale)),
    gpuPct: round1(Math.min(100, inst.gpuPct * scale)),
    state: capKw < inst.demandKw ? 'throttled' : 'running',
  };
}

// ---------------------------------------------------------------------------
// Seeding
// ---------------------------------------------------------------------------

// 24 services, two instances each, spread so both copies of a service sit in different data centers.
const SERVICES: { id: string; tier: string; version: string; knownPatch?: string }[] = [
  { id: 'api-gateway', tier: 'edge', version: 'v3.8.1' },
  { id: 'auth', tier: 'app', version: 'v2.4.0', knownPatch: 'v2.4.1' },
  { id: 'checkout', tier: 'app', version: 'v5.1.2' },
  { id: 'payments', tier: 'app', version: 'v4.0.7' },
  { id: 'search', tier: 'app', version: 'v7.2.0' },
  { id: 'catalog', tier: 'app', version: 'v3.3.3' },
  { id: 'cart', tier: 'app', version: 'v2.9.0' },
  { id: 'orders', tier: 'app', version: 'v6.0.4' },
  { id: 'inventory', tier: 'data', version: 'v1.12.0' },
  { id: 'notifications', tier: 'app', version: 'v2.2.5' },
  { id: 'recommendations', tier: 'ml', version: 'v1.6.0' },
  { id: 'inference-llm', tier: 'ml', version: 'v2.3.0', knownPatch: 'v2.3.1' },
  { id: 'inference-vision', tier: 'ml', version: 'v1.9.2' },
  { id: 'embeddings', tier: 'ml', version: 'v1.4.0', knownPatch: 'v1.4.1' },
  { id: 'feature-store', tier: 'data', version: 'v0.21.0' },
  { id: 'training-batch', tier: 'ml', version: 'v3.0.0' },
  { id: 'etl-nightly', tier: 'data', version: 'v2.7.1' },
  { id: 'metrics', tier: 'platform', version: 'v2.51.0' },
  { id: 'logging', tier: 'platform', version: 'v8.12.0' },
  { id: 'tracing', tier: 'platform', version: 'v1.58.0' },
  { id: 'cache', tier: 'data', version: 'v7.2.4' },
  { id: 'queue', tier: 'platform', version: 'v3.7.0' },
  { id: 'postgres', tier: 'data', version: 'v16.4.0', knownPatch: 'v16.4.1' },
  { id: 'object-store', tier: 'data', version: 'v2024.9.0' },
];

// Per-tier ranges for the simulated load: [kW min, kW max, cpu % min, cpu % max, gpu % min, gpu % max].
const TIER_LOAD: Record<string, [number, number, number, number, number, number]> = {
  edge: [1.5, 3, 30, 60, 0, 5],
  app: [2, 4, 35, 75, 0, 10],
  data: [2.5, 5, 40, 80, 0, 5],
  ml: [5, 8.5, 25, 50, 60, 95],
  platform: [1.5, 3.5, 20, 55, 0, 5],
};

// 32-bit FNV-1a mapped to [0, 1): deterministic seed values, no ctx.random needed.
function unit(seed: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h / 0x100000000;
}
const span = (seed: string, lo: number, hi: number) => round1(lo + unit(seed) * (hi - lo));

/** Seeds the simulated cluster once all racks exist. Returns true when the cluster is ready. */
export function ensureCluster(ctx: Ctx): boolean {
  if (ctx.db.service.count() > 0n) return true;
  const racks = [...ctx.db.rack.iter()].sort((a, b) => (a.rackId < b.rackId ? -1 : 1));
  if (racks.length < MIN_RACKS) return false;
  const stride = Math.floor(racks.length / 2);
  let instances = 0;
  SERVICES.forEach((def, i) => {
    ctx.db.service.insert({
      serviceId: def.id,
      tier: def.tier,
      version: def.version,
      knownPatch: def.knownPatch ?? '',
      createdAt: ctx.timestamp,
    });
    const [kw0, kw1, c0, c1, g0, g1] = TIER_LOAD[def.tier];
    for (let j = 0; j < 2; j++) {
      const rack = racks[(i + j * stride) % racks.length];
      const instanceId = `${def.id}-${j + 1}`;
      const demandKw = span(`${instanceId}:kw`, kw0, kw1);
      ctx.db.instance.insert({
        instanceId,
        serviceId: def.id,
        rackId: rack.rackId,
        datacenterId: rack.datacenterId,
        state: 'running',
        demandKw,
        powerCapKw: DEFAULT_CAP_KW,
        powerKw: demandKw,
        cpuPct: span(`${instanceId}:cpu`, c0, c1),
        gpuPct: span(`${instanceId}:gpu`, g0, g1),
        version: def.version,
        updatedAt: ctx.timestamp,
      });
      ctx.db.route.insert({ instanceId, serviceId: def.id, target: rack.rackId, updatedAt: ctx.timestamp });
      instances++;
    }
  });
  appendEvent(
    ctx,
    ACTOR,
    'seeded simulated cluster',
    `${SERVICES.length} services, ${instances} instances on ${racks.length} racks`,
    null,
  );
  return true;
}

// ---------------------------------------------------------------------------
// Rack readiness
// ---------------------------------------------------------------------------

function tempLimits(ctx: Ctx) {
  const row = ctx.db.threshold.metric.find('gpu_temp_c');
  return { warn: row?.warn ?? 50, clearMargin: row?.clearMargin ?? 2 };
}

/**
 * Ready = no active incident, probe level ok, hottest GPU below warn - clearMargin,
 * and its data center's feed is not stale.
 */
export function rackViews(ctx: Ctx): RackView[] {
  const { warn, clearMargin } = tempLimits(ctx);
  const out: RackView[] = [];
  for (const r of ctx.db.rack.iter()) {
    const probe = ctx.db.rackProbe.rackId.find(r.rackId);
    const inc = probe?.incidentId != null ? ctx.db.incident.incidentId.find(probe.incidentId) : undefined;
    const stale = ctx.db.feedHealth.datacenterId.find(r.datacenterId)?.stale ?? false;
    const services = new Set<string>();
    let instances = 0;
    for (const i of ctx.db.instance.rackId.filter(r.rackId)) {
      instances++;
      services.add(i.serviceId);
    }
    out.push({
      rackId: r.rackId,
      datacenterId: r.datacenterId,
      gpuTempMaxC: r.gpuTempMaxC,
      ready:
        !(inc && inc.status !== 'closed') &&
        (probe?.level ?? 'ok') === 'ok' &&
        r.gpuTempMaxC < warn - clearMargin &&
        !stale,
      instances,
      services,
    });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Runs
// ---------------------------------------------------------------------------

type RunInit = {
  incidentId: bigint;
  rackId: string;
  action: Action;
  status: string;
  actor: string;
  serviceId: string;
  instanceId?: string;
  fromRack?: string;
  toRack?: string;
  version?: string;
  detail: string;
  step?: number;
  steps?: number;
  simulatedEffectC?: number;
  decideAt?: Timestamp;
  finished?: boolean;
};

function insertRun(ctx: Ctx, r: RunInit, stats: { moved?: number; avoided?: number; leadTimeS?: number } = {}) {
  const row = ctx.db.remediationRun.insert({
    runId: 0n,
    incidentId: r.incidentId,
    rackId: r.rackId,
    action: r.action,
    status: r.status,
    actor: r.actor,
    serviceId: r.serviceId,
    instanceId: r.instanceId ?? '',
    fromRack: r.fromRack ?? '',
    toRack: r.toRack ?? '',
    version: r.version ?? '',
    detail: r.detail,
    step: r.step ?? 1,
    steps: r.steps ?? 1,
    simulatedEffectC: r.simulatedEffectC ?? 0,
    startedAt: ctx.timestamp,
    decideAt: r.decideAt,
    finishedAt: r.finished ? ctx.timestamp : undefined,
  });
  ctx.db.remediationStats.insert({
    runId: row.runId,
    instancesMoved: stats.moved ?? 0,
    duplicatesAvoided: stats.avoided ?? 0,
    downtimeS: 0, // no step stops an instance
    leadTimeS: stats.leadTimeS ?? 0,
  });
  return row;
}

const incidentOrNull = (id: bigint) => (id === 0n ? null : id);

function schedule(ctx: Ctx, runId: bigint, at: Timestamp) {
  ctx.db.remediationTimer.insert({ scheduledId: 0n, scheduledAt: ScheduleAt.time(at.microsSinceUnixEpoch), runId });
}

/**
 * The one entry point from the incident rules (evaluateRack). Seeds the cluster on first use;
 * when the rack's incident is critical and has no remediation yet, throttles in place.
 */
export function remediateRack(ctx: Ctx, rackId: string, incidentId: bigint | undefined) {
  if (!ensureCluster(ctx) || incidentId == null) return;
  const inc = ctx.db.incident.incidentId.find(incidentId);
  if (!inc || inc.status === 'closed' || inc.severity !== 'critical') return;
  if (inc.kind !== 'gpu_temp' && inc.kind !== 'gpu_failure') return;
  const hasRun = !ctx.db.remediationRun.incidentId.filter(incidentId).next().done;
  const inst = hottestInstance(ctx.db.instance.rackId.filter(rackId));
  if (decideOnCritical({ hasRun, hasInstance: !!inst }) !== 'throttle_in_place' || !inst) return;
  throttle(ctx, inst.instanceId, ACTOR, incidentId, secondsBetween(inc.openedAt, ctx.timestamp));
}

function throttle(ctx: Ctx, instanceId: string, actor: string, incidentId: bigint, leadTimeS: number) {
  const inst = ctx.db.instance.instanceId.find(instanceId)!;
  const cap = Math.max(0.5, round1(inst.powerKw * THROTTLE_FACTOR));
  const next = withCap(inst, cap);
  ctx.db.instance.instanceId.update({ ...next, updatedAt: ctx.timestamp });
  const shedKw = round1(inst.powerKw - next.powerKw);
  const decideAt = after(ctx.timestamp, WINDOW_MICROS);
  const run = insertRun(
    ctx,
    {
      incidentId,
      rackId: inst.rackId,
      action: 'throttle_in_place',
      status: 'running',
      actor,
      serviceId: inst.serviceId,
      instanceId,
      fromRack: inst.rackId,
      detail: `Power cap ${inst.powerCapKw} → ${next.powerCapKw} kW, draw ${inst.powerKw} → ${next.powerKw} kW; checking again after the 2-minute window`,
      simulatedEffectC: -round1(shedKw * SIM_C_PER_KW),
      decideAt,
    },
    { leadTimeS },
  );
  schedule(ctx, run.runId, decideAt);
  appendEvent(
    ctx,
    actor,
    'throttle_in_place',
    `${instanceId} on ${inst.rackId}: cap ${inst.powerCapKw} → ${next.powerCapKw} kW (simulated cluster)`,
    incidentOrNull(incidentId),
  );
}

/** Scheduled step for a running remediation: the end of a throttle window, or the next patch step. */
export function advanceRun(ctx: Ctx, runId: bigint) {
  const run = ctx.db.remediationRun.runId.find(runId);
  if (!run || run.status !== 'running') return;
  if (run.action === 'throttle_in_place') finishThrottleWindow(ctx, run);
  else if (run.action === 'patch_in_place') patchStep(ctx, run);
}

type Run = NonNullable<ReturnType<Ctx['db']['remediationRun']['runId']['find']>>;

function finishThrottleWindow(ctx: Ctx, run: Run) {
  const { warn } = tempLimits(ctx);
  const rack = ctx.db.rack.rackId.find(run.rackId);
  const inc = run.incidentId !== 0n ? ctx.db.incident.incidentId.find(run.incidentId) : undefined;
  const temp = rack?.gpuTempMaxC ?? 0;
  const stillOver = !!rack && temp >= warn && !!inc && inc.status !== 'closed';

  const inst = hottestInstance(ctx.db.instance.rackId.filter(run.rackId));
  const svc = inst ? ctx.db.service.serviceId.find(inst.serviceId) : undefined;
  const target = inst && stillOver ? pickTarget(rackViews(ctx), run.rackId, inst.serviceId, warn) : null;
  const decision = decideAfterWindow({
    stillOver,
    hasInstance: !!inst,
    target,
    knownPatch: !!svc && svc.knownPatch !== '' && svc.knownPatch !== svc.version,
  });

  ctx.db.remediationRun.runId.update({
    ...run,
    status: stillOver ? 'insufficient' : 'succeeded',
    detail: stillOver
      ? `${run.detail}. After the window the rack was still at ${round1(temp)} °C (limit ${warn} °C)`
      : `${run.detail}. After the window the rack was below ${warn} °C or the incident had closed`,
    finishedAt: ctx.timestamp,
  });
  const incidentId = incidentOrNull(run.incidentId);
  appendEvent(
    ctx,
    ACTOR,
    stillOver ? 'throttle not enough' : 'throttle held',
    `${run.rackId} at ${round1(temp)} °C after the 2-minute window`,
    incidentId,
  );

  const leadTimeS = ctx.db.remediationStats.runId.find(run.runId)?.leadTimeS ?? 0;
  if (decision === 'live_migrate' && inst && target) {
    migrate(ctx, { instanceId: inst.instanceId, toRack: target, actor: ACTOR, incidentId: run.incidentId, leadTimeS });
  } else if (decision === 'patch_in_place' && svc) {
    startPatch(ctx, { serviceId: svc.serviceId, version: svc.knownPatch, actor: ACTOR, incidentId: run.incidentId, rackId: run.rackId });
  } else if (decision === 'failover_to_site' && inst) {
    insertRun(ctx, {
      incidentId: run.incidentId,
      rackId: run.rackId,
      action: 'failover_to_site',
      status: 'needs_approval',
      actor: ACTOR,
      serviceId: inst.serviceId,
      instanceId: inst.instanceId,
      fromRack: run.rackId,
      detail: 'No Ready rack has room and no known patch exists. Failover would start a temporary copy at another site, so it waits for an operator; nothing was started',
      finished: true,
    });
    appendEvent(ctx, ACTOR, 'failover_to_site needs approval', `${inst.instanceId} on ${run.rackId}`, incidentId);
  }
}

/**
 * Live migration: the instance's rack and its route change in this one transaction, so there is
 * never a second copy and never a moment with none. Throws SenderError if the target is not Ready.
 */
export function migrate(
  ctx: Ctx,
  a: { instanceId: string; toRack: string; actor: string; incidentId: bigint; leadTimeS?: number },
) {
  const inst = ctx.db.instance.instanceId.find(a.instanceId);
  if (!inst) throw new SenderError('no such instance');
  if (inst.state === 'patching') throw new SenderError('instance is being patched');
  if (inst.rackId === a.toRack) throw new SenderError('instance is already on that rack');
  const target = rackViews(ctx).find(r => r.rackId === a.toRack);
  if (!target) throw new SenderError('no such rack');
  if (!target.ready) throw new SenderError(`${a.toRack} is not Ready`);
  if (target.instances >= RACK_SLOTS) throw new SenderError(`${a.toRack} has no free slot`);
  if (target.services.has(inst.serviceId)) throw new SenderError(`${a.toRack} already runs ${inst.serviceId}`);

  const from = inst.rackId;
  // A cool rack lifts the throttle: the cap goes back to the default.
  const moved = withCap({ ...inst, rackId: a.toRack, datacenterId: target.datacenterId }, DEFAULT_CAP_KW);
  ctx.db.instance.instanceId.update({ ...moved, updatedAt: ctx.timestamp });
  const route = ctx.db.route.instanceId.find(a.instanceId);
  if (route) ctx.db.route.instanceId.update({ ...route, target: a.toRack, updatedAt: ctx.timestamp });
  else ctx.db.route.insert({ instanceId: a.instanceId, serviceId: inst.serviceId, target: a.toRack, updatedAt: ctx.timestamp });

  insertRun(
    ctx,
    {
      incidentId: a.incidentId,
      rackId: from,
      action: 'live_migrate',
      status: 'succeeded',
      actor: a.actor,
      serviceId: inst.serviceId,
      instanceId: a.instanceId,
      fromRack: from,
      toRack: a.toRack,
      detail: `Moved with its route in one transaction: no second copy, no gap. ${a.toRack} had ${round1(target.gpuTempMaxC)} °C hottest GPU`,
      simulatedEffectC: -round1(inst.powerKw * SIM_C_PER_KW),
      finished: true,
    },
    { moved: 1, avoided: 1, leadTimeS: a.leadTimeS ?? 0 },
  );
  appendEvent(
    ctx,
    a.actor,
    'live_migrate',
    `${a.instanceId}: ${from} → ${a.toRack}, route switched in the same transaction (simulated cluster)`,
    incidentOrNull(a.incidentId),
  );
}

/** Throttle (or unthrottle) by hand. */
export function setCap(ctx: Ctx, instanceId: string, kw: number, actor: string) {
  if (!Number.isFinite(kw) || kw < 0.5 || kw > 20) throw new SenderError('cap must be between 0.5 and 20 kW');
  const inst = ctx.db.instance.instanceId.find(instanceId);
  if (!inst) throw new SenderError('no such instance');
  const next = withCap(inst, kw);
  ctx.db.instance.instanceId.update({ ...next, updatedAt: ctx.timestamp });
  insertRun(ctx, {
    incidentId: 0n,
    rackId: inst.rackId,
    action: 'throttle_in_place',
    status: 'succeeded',
    actor,
    serviceId: inst.serviceId,
    instanceId,
    fromRack: inst.rackId,
    detail: `Power cap set by hand: ${inst.powerCapKw} → ${next.powerCapKw} kW, draw ${inst.powerKw} → ${next.powerKw} kW`,
    simulatedEffectC: -round1((inst.powerKw - next.powerKw) * SIM_C_PER_KW),
    finished: true,
  });
  appendEvent(ctx, actor, 'set_power_cap', `${instanceId}: ${inst.powerCapKw} → ${next.powerCapKw} kW (simulated cluster)`, null);
}

/** Starts a rolling in-place patch: one instance at a time, never a second copy. */
export function startPatch(
  ctx: Ctx,
  a: { serviceId: string; version: string; actor: string; incidentId: bigint; rackId: string },
) {
  const svc = ctx.db.service.serviceId.find(a.serviceId);
  if (!svc) throw new SenderError('no such service');
  const version = a.version.trim();
  if (!version) throw new SenderError('version is required');
  if (version === svc.version) throw new SenderError(`${a.serviceId} already runs ${version}`);
  for (const r of ctx.db.remediationRun.iter()) {
    if (r.action === 'patch_in_place' && r.status === 'running' && r.serviceId === a.serviceId) {
      throw new SenderError(`a patch is already rolling across ${a.serviceId}`);
    }
  }
  const insts = [...ctx.db.instance.serviceId.filter(a.serviceId)].sort((x, y) => (x.instanceId < y.instanceId ? -1 : 1));
  if (insts.length === 0) throw new SenderError(`${a.serviceId} has no instances`);

  ctx.db.instance.instanceId.update({ ...insts[0], state: 'patching', updatedAt: ctx.timestamp });
  const run = insertRun(ctx, {
    incidentId: a.incidentId,
    rackId: a.rackId,
    action: 'patch_in_place',
    status: 'running',
    actor: a.actor,
    serviceId: a.serviceId,
    instanceId: insts[0].instanceId,
    version,
    detail: `${svc.version} → ${version}, one instance at a time without a restart`,
    step: 0,
    steps: insts.length,
  });
  schedule(ctx, run.runId, after(ctx.timestamp, PATCH_STEP_MICROS));
  appendEvent(
    ctx,
    a.actor,
    'patch_in_place started',
    `${a.serviceId} ${svc.version} → ${version} across ${insts.length} instances (simulated cluster)`,
    incidentOrNull(a.incidentId),
  );
}

function patchStep(ctx: Ctx, run: Run) {
  const insts = [...ctx.db.instance.serviceId.filter(run.serviceId)].sort((x, y) => (x.instanceId < y.instanceId ? -1 : 1));
  const current = insts[run.step];
  const incidentId = incidentOrNull(run.incidentId);
  if (current) {
    ctx.db.instance.instanceId.update({
      ...current,
      version: run.version,
      state: current.powerCapKw < current.demandKw ? 'throttled' : 'running',
      updatedAt: ctx.timestamp,
    });
    appendEvent(ctx, ACTOR, 'patched instance', `${current.instanceId} → ${run.version} (${run.step + 1}/${insts.length})`, incidentId);
  }
  const done = run.step + 1;
  const next = insts[done];
  if (next) {
    ctx.db.instance.instanceId.update({ ...next, state: 'patching', updatedAt: ctx.timestamp });
    ctx.db.remediationRun.runId.update({ ...run, step: done, instanceId: next.instanceId });
    schedule(ctx, run.runId, after(ctx.timestamp, PATCH_STEP_MICROS));
    return;
  }
  const svc = ctx.db.service.serviceId.find(run.serviceId);
  if (svc) {
    ctx.db.service.serviceId.update({
      ...svc,
      version: run.version,
      knownPatch: svc.knownPatch === run.version ? '' : svc.knownPatch,
    });
  }
  ctx.db.remediationRun.runId.update({ ...run, step: done, status: 'succeeded', instanceId: '', finishedAt: ctx.timestamp });
  const stats = ctx.db.remediationStats.runId.find(run.runId);
  // A blue-green rollout would have started one new copy per instance.
  if (stats) ctx.db.remediationStats.runId.update({ ...stats, duplicatesAvoided: insts.length });
  appendEvent(ctx, ACTOR, 'patch_in_place finished', `${run.serviceId} now ${run.version} on all ${insts.length} instances`, incidentId);
}
