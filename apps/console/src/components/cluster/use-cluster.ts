import { useMemo } from 'react'
import { useTable } from 'spacetimedb/react'
import { tables } from '@mesa/bindings'

// Live view models for the Cluster view: the simulated services placed on the real racks,
// and the remediation runs that move or change them (docs/CLUSTER-CYCLING.md).

export const RACK_SLOTS = 5 // matches RACK_SLOTS in module/src/lib/remediation.ts

export interface InstanceVM {
  id: string
  service: string
  state: string // running | throttled | patching
  powerKw: number
  capKw: number
  gpuPct: number
  version: string
}

export type RackStatus = 'ready' | 'warm' | 'incident' | 'stale'

export interface RackVM {
  id: string
  cab: string
  datacenterId: string
  datacenter: string
  gpuMaxC: number
  status: RackStatus
  instances: InstanceVM[]
}

export interface RunVM {
  id: string
  incidentId: string | null
  action: string
  status: string
  automatic: boolean
  service: string
  instance: string
  from: string
  to: string
  version: string
  detail: string
  step: number
  steps: number
  simulatedEffectC: number
  startedMs: number
  decideMs: number | null
  finishedMs: number | null
  instancesMoved: number
  duplicatesAvoided: number
  downtimeS: number
  leadTimeS: number
}

export interface ServiceVM {
  id: string
  tier: string
  version: string
  knownPatch: string
  instances: number
  racks: string[]
  rolling: RunVM | undefined
}

/** Where one instance is in a rolling update: still on the old version, being updated now, or on the new one. */
export type RolloutPhase = 'waiting' | 'updating' | 'updated'

export interface RolloutCell {
  id: string
  rack: string
  version: string
  throttled: boolean
  phase: RolloutPhase
}

/** One service's rolling in-place patch, read from `remediation_run` plus the live `instance` rows. */
export interface RolloutVM {
  run: RunVM
  service: string
  running: boolean
  fromVersion: string
  toVersion: string
  cells: RolloutCell[]
  updating: number
  updated: number
}

const ms = (ts: { microsSinceUnixEpoch: bigint }) => Number(ts.microsSinceUnixEpoch / 1000n)
export const cabOf = (rackId: string) => rackId.split('/')[1] ?? rackId

export function useCluster() {
  const [services, sReady] = useTable(tables.service)
  const [instances, iReady] = useTable(tables.instance)
  const [runs, rReady] = useTable(tables.remediationRun)
  const [stats, stReady] = useTable(tables.remediationStats)
  const [racks, rkReady] = useTable(tables.rack)
  const [dcs, dReady] = useTable(tables.datacenter)
  const [incidents, inReady] = useTable(tables.incident)
  const [feeds, fReady] = useTable(tables.feedHealth)
  const [thresholds, tReady] = useTable(tables.threshold)
  const ready = sReady && iReady && rReady && stReady && rkReady && dReady && inReady && fReady && tReady

  return useMemo(() => {
    const limit = thresholds.find(t => t.metric === 'gpu_temp_c')
    const warn = limit?.warn ?? 50
    const readyBelow = warn - (limit?.clearMargin ?? 2)
    const dcName = new Map(dcs.map(d => [d.datacenterId, d.name]))
    const stale = new Set(feeds.filter(f => f.stale).map(f => f.datacenterId))
    const hotRacks = new Set(incidents.filter(i => i.status !== 'closed' && i.rackId).map(i => i.rackId))

    const byRack = new Map<string, InstanceVM[]>()
    for (const i of instances) {
      const list = byRack.get(i.rackId) ?? []
      list.push({
        id: i.instanceId,
        service: i.serviceId,
        state: i.state,
        powerKw: i.powerKw,
        capKw: i.powerCapKw,
        gpuPct: i.gpuPct,
        version: i.version,
      })
      byRack.set(i.rackId, list)
    }

    // Same rule as the module's rackViews(), so "Ready" here means what the scheduler means.
    const rackVMs: RackVM[] = racks
      .map(r => ({
        id: r.rackId,
        cab: cabOf(r.rackId),
        datacenterId: r.datacenterId,
        datacenter: dcName.get(r.datacenterId) ?? r.datacenterId,
        gpuMaxC: r.gpuTempMaxC,
        status: (hotRacks.has(r.rackId)
          ? 'incident'
          : stale.has(r.datacenterId)
            ? 'stale'
            : r.gpuTempMaxC >= readyBelow
              ? 'warm'
              : 'ready') as RackStatus,
        instances: (byRack.get(r.rackId) ?? []).sort((a, b) => a.id.localeCompare(b.id)),
      }))
      .sort((a, b) => a.datacenter.localeCompare(b.datacenter) || a.cab.localeCompare(b.cab))

    const statsBy = new Map(stats.map(s => [s.runId.toString(), s]))
    const runVMs: RunVM[] = runs
      .map(r => {
        const s = statsBy.get(r.runId.toString())
        return {
          id: r.runId.toString(),
          incidentId: r.incidentId === 0n ? null : r.incidentId.toString(),
          action: r.action,
          status: r.status,
          automatic: r.actor === 'remediation',
          service: r.serviceId,
          instance: r.instanceId,
          from: r.fromRack,
          to: r.toRack,
          version: r.version,
          detail: r.detail,
          step: r.step,
          steps: r.steps,
          simulatedEffectC: r.simulatedEffectC,
          startedMs: ms(r.startedAt),
          decideMs: r.decideAt ? ms(r.decideAt) : null,
          finishedMs: r.finishedAt ? ms(r.finishedAt) : null,
          instancesMoved: s?.instancesMoved ?? 0,
          duplicatesAvoided: s?.duplicatesAvoided ?? 0,
          downtimeS: s?.downtimeS ?? 0,
          leadTimeS: s?.leadTimeS ?? 0,
        }
      })
      .sort((a, b) => Number(b.id) - Number(a.id))

    const serviceVMs: ServiceVM[] = services
      .map(s => {
        const own = instances.filter(i => i.serviceId === s.serviceId)
        return {
          id: s.serviceId,
          tier: s.tier,
          version: s.version,
          knownPatch: s.knownPatch,
          instances: own.length,
          racks: own.map(i => i.rackId).sort(),
          rolling: runVMs.find(r => r.action === 'patch_in_place' && r.status === 'running' && r.service === s.serviceId),
        }
      })
      .sort((a, b) => a.id.localeCompare(b.id))

    // The latest patch run per service: running ones first, then the few most recent finished ones.
    const rackLabel = new Map(rackVMs.map(r => [r.id, `${r.datacenter} · ${r.cab}`]))
    const latestPatch = new Map<string, RunVM>()
    for (const r of runVMs) {
      if (r.action === 'patch_in_place' && (r.status === 'running' || r.status === 'succeeded') && !latestPatch.has(r.service)) {
        latestPatch.set(r.service, r)
      }
    }
    const rolloutFor = (run: RunVM): RolloutVM => {
      const running = run.status === 'running'
      const cells = instances
        .filter(i => i.serviceId === run.service)
        .sort((a, b) => (a.instanceId < b.instanceId ? -1 : 1))
        .map(i => ({
          id: i.instanceId,
          rack: rackLabel.get(i.rackId) ?? i.rackId,
          version: i.version,
          throttled: i.state === 'throttled',
          phase: (i.state === 'patching' ? 'updating' : i.version === run.version ? 'updated' : 'waiting') as RolloutPhase,
        }))
      return {
        run,
        service: run.service,
        running,
        fromVersion: running ? (services.find(s => s.serviceId === run.service)?.version ?? '') : (/^(\S+) →/.exec(run.detail)?.[1] ?? ''),
        toVersion: run.version,
        cells,
        updating: cells.filter(c => c.phase === 'updating').length,
        updated: cells.filter(c => c.phase === 'updated').length,
      }
    }
    const patchRuns = [...latestPatch.values()].sort((a, b) => Number(b.id) - Number(a.id))
    const rollouts = [
      ...patchRuns.filter(r => r.status === 'running'),
      ...patchRuns.filter(r => r.status === 'succeeded').slice(0, 3),
    ].map(rolloutFor)

    const totals = {
      services: services.length,
      instances: instances.length,
      moved: runVMs.reduce((n, r) => n + r.instancesMoved, 0),
      duplicatesAvoided: runVMs.reduce((n, r) => n + r.duplicatesAvoided, 0),
      downtimeS: runVMs.reduce((n, r) => n + r.downtimeS, 0),
      active: runVMs.filter(r => r.status === 'running').length,
    }

    return { ready, racks: rackVMs, runs: runVMs, services: serviceVMs, rollouts, totals, warn }
  }, [ready, services, instances, runs, stats, racks, dcs, incidents, feeds, thresholds])
}
