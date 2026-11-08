import type { InferSchema, ReducerCtx } from 'spacetimedb/server';
import { ScheduleAt } from 'spacetimedb';
import type spacetimedb from '../schema';
import { appendEvent } from './log';

type Ctx = ReducerCtx<InferSchema<typeof spacetimedb>>;

// Starting values; operators change them live in the `threshold` table.
// successThreshold 12 = about 2 minutes below the limit at one batch per 10 s:
// a stabilization window so a rack hovering at the limit does not open and close repeatedly.
const DEFAULTS = [
  { metric: 'gpu_temp_c', warn: 50, crit: 55, failureThreshold: 3, successThreshold: 12, clearMargin: 2 },
  { metric: 'feed_silence_s', warn: 30, crit: 60, failureThreshold: 1, successThreshold: 1, clearMargin: 0 },
];
const WATCHDOG_EVERY_MICROS = 10n * 1_000_000n;
const RULES_ACTOR = 'rules';

export function ensureRules(ctx: Ctx) {
  for (const d of DEFAULTS) {
    if (!ctx.db.threshold.metric.find(d.metric)) ctx.db.threshold.insert(d);
  }
  if (ctx.db.watchdogTimer.count() === 0n) {
    ctx.db.watchdogTimer.insert({ scheduledId: 0n, scheduledAt: ScheduleAt.interval(WATCHDOG_EVERY_MICROS) });
  }
}

function limits(ctx: Ctx, metric: string) {
  const row = ctx.db.threshold.metric.find(metric);
  if (!row) throw new Error(`missing threshold ${metric}`);
  return row;
}

const round1 = (n: number) => Math.round(n * 10) / 10;

function openRuleIncident(
  ctx: Ctx,
  args: { kind: string; severity: string; title: string; datacenterId: string; rackId: string; value: number },
) {
  const row = ctx.db.incident.insert({
    incidentId: 0n,
    status: 'open',
    title: args.title,
    severity: args.severity,
    datacenterId: args.datacenterId,
    openedAt: ctx.timestamp,
    updatedAt: ctx.timestamp,
    kind: args.kind,
    rackId: args.rackId,
    source: 'rule',
    peakValue: args.value,
    closedReason: '',
    owner: '',
    ownerName: '',
    claimedAtMicros: 0n,
    handedFrom: '',
  });
  appendEvent(ctx, RULES_ACTOR, `opened ${args.kind} incident`, args.title, row.incidentId);
  return row.incidentId;
}

function closeRuleIncident(ctx: Ctx, incidentId: bigint, reason: string, target: string) {
  const row = ctx.db.incident.incidentId.find(incidentId);
  if (!row || row.status === 'closed') return;
  ctx.db.incident.incidentId.update({ ...row, status: 'closed', closedReason: reason, updatedAt: ctx.timestamp });
  appendEvent(ctx, RULES_ACTOR, `closed incident (${reason})`, target, incidentId);
}

/**
 * Evaluates one rack after its aggregates were refreshed.
 * ok -> open (after failureThreshold hits) -> escalated (on crit or GPU failure) -> closed
 * (after successThreshold readings below warn - clearMargin).
 */
export function evaluateRack(
  ctx: Ctx,
  rack: { rackId: string; datacenterId: string; gpuTempMaxC: number },
  gpuFailure: boolean,
) {
  const lim = limits(ctx, 'gpu_temp_c');
  const value = rack.gpuTempMaxC;
  const level = gpuFailure || value >= lim.crit ? 'crit' : value >= lim.warn ? 'warn' : 'ok';

  const probe = ctx.db.rackProbe.rackId.find(rack.rackId) ?? {
    rackId: rack.rackId,
    failCount: 0,
    okCount: 0,
    level: 'ok',
    incidentId: undefined as bigint | undefined,
  };
  let { failCount, okCount, incidentId } = probe;

  if (level !== 'ok') {
    failCount += 1;
    okCount = 0;
  } else if (value < lim.warn - lim.clearMargin) {
    okCount += 1;
    failCount = 0;
  } // between warn - clearMargin and warn: hold both counts (hysteresis)

  const open = incidentId != null ? ctx.db.incident.incidentId.find(incidentId) : undefined;
  const cab = rack.rackId.split('/')[1] ?? rack.rackId;
  const dcName = ctx.db.datacenter.datacenterId.find(rack.datacenterId)?.name ?? rack.datacenterId;

  if ((!open || open.status === 'closed') && failCount >= lim.failureThreshold) {
    const kind = gpuFailure ? 'gpu_failure' : 'gpu_temp';
    const title = gpuFailure
      ? `${dcName} rack ${cab}: GPU failure reported`
      : `${dcName} rack ${cab}: GPU at ${round1(value)} °C (limit ${level === 'crit' ? lim.crit : lim.warn} °C)`;
    incidentId = openRuleIncident(ctx, {
      kind,
      severity: level === 'crit' ? 'critical' : 'high',
      title,
      datacenterId: rack.datacenterId,
      rackId: rack.rackId,
      value,
    });
  } else if (open && open.status !== 'closed') {
    if (okCount >= lim.successThreshold) {
      closeRuleIncident(ctx, open.incidentId, 'recovered', `incident ${open.incidentId}`);
      incidentId = undefined;
    } else {
      const escalate = level === 'crit' && open.severity !== 'critical';
      const peak = Math.max(open.peakValue, value);
      if (escalate || peak !== open.peakValue) {
        ctx.db.incident.incidentId.update({
          ...open,
          severity: escalate ? 'critical' : open.severity,
          status: escalate ? 'escalated' : open.status,
          peakValue: peak,
          updatedAt: ctx.timestamp,
        });
        if (escalate) {
          appendEvent(ctx, RULES_ACTOR, 'escalated incident', `${open.title} (now ${round1(value)} °C)`, open.incidentId);
        }
      }
    }
  }

  const next = { rackId: rack.rackId, failCount, okCount, level, incidentId };
  if (ctx.db.rackProbe.rackId.find(rack.rackId)) ctx.db.rackProbe.rackId.update(next);
  else ctx.db.rackProbe.insert(next);
}

/** Called on every batch: updates feed stats and closes a stale-feed incident when data returns. */
export function recordFeedBatch(ctx: Ctx, datacenterId: string, readings: number) {
  const row = ctx.db.feedHealth.datacenterId.find(datacenterId);
  if (!row) {
    ctx.db.feedHealth.insert({
      datacenterId,
      lastIngestAt: ctx.timestamp,
      batches: 1n,
      readings: BigInt(readings),
      stale: false,
      incidentId: undefined,
    });
    return;
  }
  if (row.stale && row.incidentId != null) {
    closeRuleIncident(ctx, row.incidentId, 'feed resumed', `${datacenterId} feed`);
  }
  ctx.db.feedHealth.datacenterId.update({
    ...row,
    lastIngestAt: ctx.timestamp,
    batches: row.batches + 1n,
    readings: row.readings + BigInt(readings),
    stale: false,
    incidentId: row.stale ? undefined : row.incidentId,
  });
}

/** Scheduled every 10 s: opens an incident for any data center silent past the threshold. */
export function checkFeeds(ctx: Ctx) {
  const lim = limits(ctx, 'feed_silence_s');
  const now = ctx.timestamp.microsSinceUnixEpoch;
  for (const f of ctx.db.feedHealth.iter()) {
    if (f.stale) continue;
    const silentS = Number(now - f.lastIngestAt.microsSinceUnixEpoch) / 1_000_000;
    if (silentS < lim.warn) continue;
    const dcName = ctx.db.datacenter.datacenterId.find(f.datacenterId)?.name ?? f.datacenterId;
    const incidentId = openRuleIncident(ctx, {
      kind: 'feed_stale',
      severity: silentS >= lim.crit ? 'critical' : 'high',
      title: `${dcName} telemetry feed silent for ${Math.round(silentS)} s`,
      datacenterId: f.datacenterId,
      rackId: '',
      value: silentS,
    });
    ctx.db.feedHealth.datacenterId.update({ ...f, stale: true, incidentId });
  }
}
