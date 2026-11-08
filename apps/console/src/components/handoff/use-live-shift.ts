import { useEffect, useMemo, useRef, useState } from 'react'
import { useTable } from 'spacetimedb/react'
import { tables } from '@mesa/bindings'
import type { Incident, RemediationRun } from '@mesa/bindings/types'
import { useNow } from '@/lib/snapshot'
import { cabOf } from '@/components/cluster/use-cluster'
import type { ActionItem, IncidentKind, Moment, Priority, Remediation, ShiftIncident, ShiftReportData, Severity, TempPoint } from './types'
import { KIND_LABEL, clockAt } from './types'

// Builds the LIVE shift report from SpacetimeDB: incident, remediation_run, remediation_stats, rack, instance,
// feed_health, shift_report and server_reading. Everything here is read, never written.
//
// What is real and what is not:
//  - Real: incidents, remediation runs and their stats, rack temperatures, feed health, the hottest GPU over time.
//  - Readings are bucketed by `received_at` (server time), the same clock as incidents and runs. `measured_at` is the
//    data's own timeline, which a fast replay runs ahead of real time.
//  - The window is whatever the database holds. The replayed telemetry covers about 60 minutes of recorded data and
//    the database keeps no earlier shifts, so this is not a full 12-hour shift. The report says so.
//  - The cluster (services and instances) is simulated; moves are real rows in that simulation, labeled as such.

const ms = (ts: { microsSinceUnixEpoch: bigint }) => Number(ts.microsSinceUnixEpoch / 1000n)
const KINDS: IncidentKind[] = ['gpu_temp', 'gpu_failure', 'feed_stale', 'manual']
const SEVERITIES: Severity[] = ['low', 'medium', 'high', 'critical']
const PRIORITY_ORDER: Record<Priority, number> = { high: 0, medium: 1, low: 2 }
const GPU_WARN_C = 50 // fallback; the `threshold` table is the source when present
const GPU_CRIT_C = 55


function floorMinute(t: number) {
  return Math.floor(t / 60_000) * 60_000
}
const clockOf = (t: number) => new Date(t).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false })

/** Plain-words account of what the remediation runs for one incident did. */
function describeRuns(runs: RemediationRun[], incident: Incident, instancesOf: (id: bigint) => number): string {
  if (!runs.length) {
    if (incident.kind === 'feed_stale') return 'The watchdog flagged the silent feed. Nothing else is automatic for a silent feed.'
    if (incident.kind === 'gpu_failure') return 'MESA flagged the GPU fault. A failed GPU needs a person to look at the hardware.'
    if (incident.kind === 'gpu_temp') return 'MESA opened the incident. It starts moving or slowing work only when the rack goes critical.'
    return 'Raised by hand. No rule was involved.'
  }
  const parts: string[] = []
  const sorted = [...runs].sort((a, b) => (a.runId < b.runId ? -1 : 1))
  const throttle = sorted.find(r => r.action === 'throttle_in_place')
  if (throttle) {
    parts.push(throttle.status === 'insufficient' ? 'Lowered the power cap, but the rack stayed too hot' : 'Lowered the power cap')
  }
  const moved = instancesOf(incident.incidentId)
  const failover = sorted.find(r => r.action === 'failover_to_site')
  if (moved > 0) parts.push(`moved ${moved} running instance${moved === 1 ? '' : 's'} to a cooler rack with no downtime`)
  const patch = sorted.find(r => r.action === 'patch_in_place')
  if (patch) parts.push('patched the service in place without a restart')
  if (failover && failover.status === 'needs_approval') parts.push('asked a lead to approve a failover to another site')
  if (!parts.length) return 'MESA started remediation.'
  const text = parts.join(', then ')
  return `${text[0].toUpperCase()}${text.slice(1)}.`
}

/**
 * The live report. `enabled` should be true only while the live tab is on screen: server_reading is large and busy,
 * so its subscription follows it (the Floor chart does the same).
 */
export function useLiveShift(enabled: boolean) {
  const [incidents, incReady] = useTable(tables.incident)
  const [runs, runReady] = useTable(tables.remediationRun)
  const [stats, statReady] = useTable(tables.remediationStats)
  const [racks, rackReady] = useTable(tables.rack)
  const [dcs, dcReady] = useTable(tables.datacenter)
  const [instances, instReady] = useTable(tables.instance)
  const [thresholds, thrReady] = useTable(tables.threshold)
  const [shiftReports, srReady] = useTable(tables.shiftReport)
  const [history] = useTable(tables.serverReading, { enabled })
  const now = useNow(10_000)
  const ready = incReady && runReady && statReady && rackReady && dcReady && instReady && thrReady && srReady

  // server_reading changes many times a second; recompute from a snapshot every 5 s instead.
  const latest = useRef(history)
  useEffect(() => {
    latest.current = history
  }, [history])
  const [taken, setTaken] = useState(history)
  useEffect(() => {
    if (!enabled) return
    const id = setInterval(() => setTaken(latest.current), 5000)
    return () => clearInterval(id)
  }, [enabled])
  // Until the first snapshot is taken, use the history as it arrives, so the page does not wait 5 s for its first chart.
  const snapshot = taken.length ? taken : history

  const report = useMemo<ShiftReportData>(() => {
    const dcName = new Map(dcs.map(d => [d.datacenterId, d.name]))
    const gpuWarn = thresholds.find(t => t.metric === 'gpu_temp_c')?.warn ?? GPU_WARN_C
    const gpuCrit = thresholds.find(t => t.metric === 'gpu_temp_c')?.crit ?? GPU_CRIT_C
    const statsBy = new Map(stats.map(s => [s.runId.toString(), s]))

    // --- the window: from the first thing the database recorded to now
    let first = Infinity
    for (const r of snapshot) first = Math.min(first, ms(r.receivedAt)) // server time, the same clock as incidents and runs
    for (const i of incidents) first = Math.min(first, ms(i.openedAt))
    for (const r of runs) first = Math.min(first, ms(r.startedAt))
    const end = now
    const start = floorMinute(Number.isFinite(first) ? first : end - 10 * 60_000)
    const startClock = clockOf(start)
    const minOf = (t: number) => Math.max(0, (t - start) / 60_000)
    const durationMin = Math.max(1, (end - start) / 60_000)

    // --- remediation
    const runsByIncident = new Map<string, RemediationRun[]>()
    for (const r of runs) {
      const k = r.incidentId.toString()
      runsByIncident.set(k, [...(runsByIncident.get(k) ?? []), r])
    }
    const movedFor = (incidentId: bigint) =>
      (runsByIncident.get(incidentId.toString()) ?? []).reduce((n, r) => n + (statsBy.get(r.runId.toString())?.instancesMoved ?? 0), 0)

    const leadTimes = stats.filter(s => s.leadTimeS > 0).map(s => s.leadTimeS)
    const remediation: Remediation = {
      instancesMoved: stats.reduce((n, s) => n + s.instancesMoved, 0),
      duplicatesAvoided: stats.reduce((n, s) => n + s.duplicatesAvoided, 0),
      downtimeS: stats.reduce((n, s) => n + s.downtimeS, 0),
      leadTimeS: leadTimes.length ? leadTimes.reduce((a, b) => a + b, 0) / leadTimes.length : null,
      throttles: runs.filter(r => r.action === 'throttle_in_place').length,
      migrations: runs.filter(r => r.action === 'live_migrate').length,
      patches: runs.filter(r => r.action === 'patch_in_place').length,
      needsApproval: runs.filter(r => r.status === 'needs_approval').length,
    }

    // --- incidents
    const shiftIncidents: ShiftIncident[] = incidents
      .map(i => {
        const incRuns = runsByIncident.get(i.incidentId.toString()) ?? []
        const kind = (KINDS as string[]).includes(i.kind) ? (i.kind as IncidentKind) : 'manual'
        const severity = (SEVERITIES as string[]).includes(i.severity) ? (i.severity as Severity) : 'low'
        const status = (['open', 'acknowledged', 'escalated', 'closed'] as const).find(s => s === i.status) ?? 'open'
        const place = [dcName.get(i.datacenterId) ?? i.datacenterId, i.rackId ? cabOf(i.rackId) : ''].filter(Boolean).join(' · ')
        return {
          id: i.incidentId.toString(),
          title: KIND_LABEL[kind],
          kind,
          severity,
          place,
          openedMin: minOf(ms(i.openedAt)),
          closedMin: status === 'closed' ? minOf(ms(i.updatedAt)) : null,
          status,
          peakC: i.peakValue > 0 && kind !== 'feed_stale' ? i.peakValue : null,
          mesaDid: describeRuns(incRuns, i, movedFor),
          needsHuman: status !== 'closed' || kind === 'gpu_failure' || kind === 'manual' || incRuns.some(r => r.status === 'needs_approval'),
        }
      })
      .sort((a, b) => a.openedMin - b.openedMin)

    // --- the line chart: hottest GPU in any rack, per bucket
    const span = end - start
    const bucketMs = Math.max(15_000, Math.ceil(span / 36 / 15_000) * 15_000)
    const maxBy = new Map<number, number>()
    for (const r of snapshot) {
      const b = Math.floor((ms(r.receivedAt) - start) / bucketMs)
      if (b < 0) continue
      maxBy.set(b, Math.max(maxBy.get(b) ?? -Infinity, r.gpuTempC))
    }
    const hottest: TempPoint[] = [...maxBy.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([b, tempC]) => ({ min: Math.round(((b * bucketMs) / 60_000) * 100) / 100, tempC: Math.round(tempC * 10) / 10 }))

    // --- moments: what happened, oldest first
    const moments: Moment[] = []
    for (const i of shiftIncidents) {
      const peak = i.peakC ? ` (peak ${i.peakC.toFixed(1)} °C)` : ''
      moments.push({ min: i.openedMin, text: `${i.title} at ${i.place}${peak}. Incident #${i.id} opened.`, tone: i.severity === 'critical' || i.severity === 'high' ? 'bad' : 'warn' })
      if (i.closedMin != null) moments.push({ min: i.closedMin, text: `Incident #${i.id} at ${i.place} closed.`, tone: 'ok' })
    }
    for (const r of runs) {
      const at = minOf(ms(r.startedAt))
      if (r.action === 'live_migrate' && r.status === 'succeeded') {
        moments.push({ min: at, text: `Moved ${r.instanceId || r.serviceId} from ${cabOf(r.fromRack)} to ${cabOf(r.toRack)} with no downtime.`, tone: 'ok' })
      } else if (r.status === 'needs_approval') {
        moments.push({ min: at, text: `A failover for ${r.instanceId || r.serviceId} is waiting for a lead’s approval.`, tone: 'bad' })
      } else if (r.action === 'patch_in_place') {
        moments.push({ min: at, text: `Rolling patch of ${r.serviceId} to ${r.version} started.`, tone: 'info' })
      } else if (r.action === 'throttle_in_place') {
        moments.push({ min: at, text: `Lowered the power cap on ${cabOf(r.rackId)}.`, tone: 'info' })
      }
    }
    moments.sort((a, b) => a.min - b.min)

    // --- action items from real data
    const actions: ActionItem[] = []
    const open = shiftIncidents.filter(i => i.status !== 'closed')
    const racksById = new Map(racks.map(r => [r.rackId, r]))
    const rackPlace = (rackId: string) => `${dcName.get(racksById.get(rackId)?.datacenterId ?? '') ?? ''} · ${cabOf(rackId)}`.replace(/^ · /, '')
    const openByRack = new Map<string, ShiftIncident[]>()
    const rackOfIncident = new Map(incidents.map(i => [i.incidentId.toString(), i.rackId]))
    for (const i of open) {
      const rackId = rackOfIncident.get(i.id)
      if (!rackId) continue
      openByRack.set(rackId, [...(openByRack.get(rackId) ?? []), i])
    }
    const hotRacks = racks.filter(r => r.gpuTempMaxC >= gpuWarn)
    const rackIds = new Set([...hotRacks.map(r => r.rackId), ...openByRack.keys()])
    for (const rackId of rackIds) {
      const rack = racksById.get(rackId)
      const own = openByRack.get(rackId) ?? []
      const temp = rack?.gpuTempMaxC ?? 0
      const hasFault = own.some(i => i.kind === 'gpu_failure')
      const critical = temp >= gpuCrit || own.some(i => i.severity === 'critical')
      const priority: Priority = critical || hasFault ? 'high' : 'medium'
      const why = [
        temp ? `The hottest GPU is ${temp.toFixed(1)} °C (warning ${gpuWarn} °C, critical ${gpuCrit} °C).` : '',
        own.length ? `Open incident${own.length === 1 ? '' : 's'}: ${own.map(i => `#${i.id}`).join(', ')}.` : '',
      ]
        .filter(Boolean)
        .join(' ')
      actions.push({
        id: `rack-${rackId}`,
        what: hasFault ? 'Inspect the failed GPU' : 'Check temperatures',
        where: rackPlace(rackId),
        why: why || 'It was hot during this shift.',
        priority,
        role: own.some(i => i.status === 'escalated') ? 'Lead' : 'Operator',
        illustrative: false,
        view: own.length ? 'log' : 'floor',
      })
    }
    for (const i of open) {
      if (rackOfIncident.get(i.id)) continue // already covered by its rack
      actions.push({
        id: `inc-${i.id}`,
        what: i.kind === 'feed_stale' ? 'Check the data feed' : 'Follow up an open incident',
        where: i.place,
        why: i.kind === 'feed_stale' ? `The feed went silent (incident #${i.id}) and has not been closed yet.` : `Incident #${i.id} is ${i.status} and has no resolution yet.`,
        priority: i.severity === 'critical' || i.severity === 'high' ? 'high' : 'medium',
        role: i.status === 'escalated' ? 'Lead' : 'Operator',
        illustrative: false,
        view: 'log',
      })
    }
    for (const r of runs.filter(r => r.status === 'needs_approval')) {
      actions.push({
        id: `run-${r.runId}`,
        what: 'Approve or reject a failover',
        where: `${rackPlace(r.rackId)} · ${r.instanceId || r.serviceId}`,
        why: 'No safe rack was free, so the only option left is starting the service at another site. A failover always needs a lead.',
        priority: 'high',
        role: 'Lead',
        illustrative: false,
        view: 'cluster',
      })
    }
    const capped = instances.filter(i => i.state === 'throttled')
    if (capped.length) {
      const where = [...new Set(capped.map(i => rackPlace(i.rackId)))].slice(0, 3).join(', ')
      actions.push({
        id: 'capped',
        what: `Confirm power caps lift (${capped.length} instance${capped.length === 1 ? '' : 's'})`,
        where,
        why: 'MESA lowered their power cap to cool the rack. It lifts the cap by itself when the rack’s incident closes; check that it did once the rack is cool.',
        priority: 'low',
        role: 'Operator',
        illustrative: false,
        view: 'cluster',
      })
    }
    actions.sort((a, b) => PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority])

    // --- the agent's own brief, if one exists (always shown as AI drafted)
    let aiBrief: ShiftReportData['aiBrief'] = null
    const newest = [...shiftReports].sort((a, b) => (a.writtenAt.microsSinceUnixEpoch < b.writtenAt.microsSinceUnixEpoch ? 1 : -1))[0]
    if (newest) {
      try {
        const body = JSON.parse(newest.reportJson) as { summary?: string }
        if (body.summary) aiBrief = { summary: body.summary, source: newest.source }
      } catch {
        aiBrief = null // a malformed brief is ignored, the report does not depend on it
      }
    }

    const caveats = [
      `This is live data from the database. It holds about ${Math.round(durationMin)} min of recorded telemetry (the replay covers about 60 minutes of data), not a full 12-hour shift, and keeps no earlier shifts.`,
      'The cluster (services, instances and their moves) is simulated; the racks and temperatures are recorded telemetry.',
    ]

    return {
      id: 'live',
      kind: 'live',
      tabLabel: 'This shift (live)',
      title: 'This shift so far',
      windowLabel: `${clockAt(startClock, 0)} to ${clockOf(end)} · ${Math.round(durationMin)} min of recorded data`,
      startClock,
      durationMin,
      incidents: shiftIncidents,
      remediation,
      hottest,
      provenance: `Read live from the database: ${incidents.length} incident${incidents.length === 1 ? '' : 's'}, ${runs.length} remediation run${runs.length === 1 ? '' : 's'}, ${snapshot.length.toLocaleString('en-US')} temperature reading${snapshot.length === 1 ? '' : 's'}.`,
      moments,
      actions,
      aiBrief,
      caveats,
    }
  }, [incidents, runs, stats, racks, dcs, instances, thresholds, shiftReports, snapshot, now])

  return { report, ready }
}
