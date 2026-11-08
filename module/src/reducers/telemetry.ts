import { t, SenderError, type InferSchema, type ReducerCtx } from 'spacetimedb/server';
import { ScheduleAt } from 'spacetimedb';
import spacetimedb, { ReadingIn, pruneTimer } from '../schema';

type Ctx = ReducerCtx<InferSchema<typeof spacetimedb>>;

const MAX_BATCH = 1000;
const HISTORY_MICROS = 15n * 60n * 1_000_000n; // keep 15 minutes of server_reading
const PRUNE_EVERY_MICROS = 60n * 1_000_000n; // prune once a minute

function ensurePruneTimer(ctx: Ctx) {
  // init only runs on a database's first publish, so the timer is also created lazily.
  if (ctx.db.pruneTimer.count() === 0n) {
    ctx.db.pruneTimer.insert({ scheduledId: 0n, scheduledAt: ScheduleAt.interval(PRUNE_EVERY_MICROS) });
  }
}

function finite(n: number, field: string, serverId: string) {
  if (!Number.isFinite(n)) throw new SenderError(`${field} is not a number for ${serverId}`);
  return n;
}

/**
 * Accept a batch of readings for one data center.
 * - The first identity to stream for a data center becomes its feed; others are rejected.
 * - Unknown racks and servers are created on first sight.
 * - A reading whose seq is not newer than the server's latest is ignored (resends, duplicates).
 * - Rack aggregates are refreshed for every rack the batch touched.
 */
export const ingestReadings = spacetimedb.reducer(
  { datacenterId: t.string(), readings: t.array(ReadingIn) },
  (ctx, { datacenterId, readings }) => {
    if (!datacenterId.trim()) throw new SenderError('datacenterId is required');
    if (readings.length === 0) return;
    if (readings.length > MAX_BATCH) throw new SenderError(`batch over ${MAX_BATCH} readings`);
    ensurePruneTimer(ctx);

    const first = readings[0];
    const dc = ctx.db.datacenter.datacenterId.find(datacenterId);
    if (!dc) {
      ctx.db.datacenter.insert({
        datacenterId,
        name: first.datacenterName,
        region: first.region,
        feed: ctx.sender,
        lastIngestAt: ctx.timestamp,
      });
    } else if (!dc.feed.isEqual(ctx.sender)) {
      throw new SenderError(`${datacenterId} is streamed by another feed`);
    } else {
      ctx.db.datacenter.datacenterId.update({ ...dc, lastIngestAt: ctx.timestamp });
    }

    const touchedRacks = new Set<string>();
    for (const r of readings) {
      if (!r.serverId.startsWith(`${datacenterId}/`) || !r.rackId.startsWith(`${datacenterId}/`)) {
        throw new SenderError(`${r.serverId} does not belong to ${datacenterId}`);
      }
      for (const [k, v] of Object.entries({
        gpuTempC: r.gpuTempC, cpuTempC: r.cpuTempC, gpuPowerW: r.gpuPowerW,
        cpuPowerW: r.cpuPowerW, nodePowerW: r.nodePowerW, gpuUtilPct: r.gpuUtilPct, cpuUtilPct: r.cpuUtilPct,
      })) finite(v, k, r.serverId);

      if (!ctx.db.server.serverId.find(r.serverId)) {
        ctx.db.server.insert({
          serverId: r.serverId,
          rackId: r.rackId,
          datacenterId,
          region: r.region,
          sourceHostname: r.sourceHostname,
        });
      }

      const latest = ctx.db.serverLatest.serverId.find(r.serverId);
      if (latest && r.seq <= latest.seq) continue; // duplicate or out of order

      const row = {
        serverId: r.serverId,
        rackId: r.rackId,
        datacenterId,
        seq: r.seq,
        measuredAt: r.measuredAt,
        receivedAt: ctx.timestamp,
        nodeState: r.nodeState,
        jobActive: r.jobActive,
        gpuFailure: r.gpuFailure,
        gpuTempC: r.gpuTempC,
        cpuTempC: r.cpuTempC,
        gpuPowerW: r.gpuPowerW,
        cpuPowerW: r.cpuPowerW,
        nodePowerW: r.nodePowerW,
        gpuUtilPct: r.gpuUtilPct,
        cpuUtilPct: r.cpuUtilPct,
        source: r.source,
      };
      if (latest) ctx.db.serverLatest.serverId.update(row);
      else ctx.db.serverLatest.insert(row);

      ctx.db.serverReading.insert({
        id: 0n,
        serverId: r.serverId,
        measuredAt: r.measuredAt,
        receivedAt: ctx.timestamp,
        gpuTempC: r.gpuTempC,
        cpuTempC: r.cpuTempC,
        nodePowerW: r.nodePowerW,
        gpuUtilPct: r.gpuUtilPct,
        cpuUtilPct: r.cpuUtilPct,
      });
      touchedRacks.add(r.rackId);
    }

    for (const rackId of touchedRacks) {
      let servers = 0;
      let gpuMax = 0;
      let cpuMax = 0;
      let watts = 0;
      for (const s of ctx.db.serverLatest.rackId.filter(rackId)) {
        servers++;
        gpuMax = Math.max(gpuMax, s.gpuTempC);
        cpuMax = Math.max(cpuMax, s.cpuTempC);
        watts += s.nodePowerW;
      }
      const row = {
        rackId,
        datacenterId,
        servers,
        gpuTempMaxC: gpuMax,
        cpuTempMaxC: cpuMax,
        powerKw: Math.round(watts / 10) / 100,
        updatedAt: ctx.timestamp,
      };
      if (ctx.db.rack.rackId.find(rackId)) ctx.db.rack.rackId.update(row);
      else ctx.db.rack.insert(row);
    }
  }
);

/** Deletes server_reading rows older than the history window. Runs every minute. */
export const pruneReadings = spacetimedb.reducer(
  { onSchedule: pruneTimer },
  { timer: pruneTimer.rowType },
  (ctx, _args) => {
    const cutoff = ctx.timestamp.microsSinceUnixEpoch - HISTORY_MICROS;
    const old: bigint[] = [];
    for (const r of ctx.db.serverReading.iter()) {
      if (r.receivedAt.microsSinceUnixEpoch < cutoff) old.push(r.id);
    }
    for (const id of old) ctx.db.serverReading.id.delete(id);
  }
);
