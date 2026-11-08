import { useMemo } from 'react'
import { useTable } from 'spacetimedb/react'
import { tables } from '@mesa/bindings'
import type { ChainRow } from '@/lib/event-chain'
import { useSnapshot } from '@/lib/snapshot'

export interface FeedVM {
  id: string
  name: string
  lastMs: number
  batches: number
  readings: number
  stale: boolean
}

export interface IncidentVM {
  id: string
  title: string
  status: string // open | acknowledged | escalated | closed
  severity: string // low | medium | high | critical
  kind: string // manual | gpu_temp | gpu_failure | feed_stale
  source: string // manual | rule
  datacenter: string
  rack: string
  openedMs: number
  updatedMs: number
  peak: number
  closedReason: string
  reports: string[] // interim | final
}

export interface EventVM extends ChainRow {
  ms: number
}

export interface LogData {
  feeds: FeedVM[]
  incidents: IncidentVM[]
  events: EventVM[] // newest first
}

const EVENTS_KEPT_IN_CACHE = 200
const ms = (ts: { microsSinceUnixEpoch: bigint }) => Number(ts.microsSinceUnixEpoch / 1000n)
const STATUS_ORDER: Record<string, number> = { escalated: 0, open: 1, acknowledged: 2, closed: 3 }

/** Live log data from SpacetimeDB, or the cached snapshot until the subscription is ready. */
export function useLogData() {
  const [dcs, dcReady] = useTable(tables.datacenter)
  const [feeds, feedReady] = useTable(tables.feedHealth)
  const [incidents, incReady] = useTable(tables.incident)
  const [reports, repReady] = useTable(tables.incidentReport)
  const [events, evReady] = useTable(tables.eventLog)
  const ready = dcReady && feedReady && incReady && repReady && evReady

  const live = useMemo<LogData>(() => {
    const dcName = new Map(dcs.map(d => [d.datacenterId, d.name]))
    const reportsBy = new Map<string, string[]>()
    for (const r of reports) {
      const k = r.incidentId.toString()
      reportsBy.set(k, [...(reportsBy.get(k) ?? []), r.kind])
    }
    return {
      feeds: feeds
        .map(f => ({
          id: f.datacenterId,
          name: dcName.get(f.datacenterId) ?? f.datacenterId,
          lastMs: ms(f.lastIngestAt),
          batches: Number(f.batches),
          readings: Number(f.readings),
          stale: f.stale,
        }))
        .sort((a, b) => a.name.localeCompare(b.name)),
      incidents: incidents
        .map(i => ({
          id: i.incidentId.toString(),
          title: i.title,
          status: i.status,
          severity: i.severity,
          kind: i.kind,
          source: i.source,
          datacenter: dcName.get(i.datacenterId) ?? i.datacenterId,
          rack: i.rackId ? (i.rackId.split('/')[1] ?? i.rackId) : '',
          openedMs: ms(i.openedAt),
          updatedMs: ms(i.updatedAt),
          peak: i.peakValue,
          closedReason: i.closedReason,
          reports: (reportsBy.get(i.incidentId.toString()) ?? []).sort(),
        }))
        .sort((a, b) => (STATUS_ORDER[a.status] ?? 9) - (STATUS_ORDER[b.status] ?? 9) || b.updatedMs - a.updatedMs),
      events: events
        .map(e => ({
          seq: e.seq.toString(),
          atMicros: e.at.microsSinceUnixEpoch.toString(),
          ms: ms(e.at),
          actor: e.actor,
          action: e.action,
          target: e.target,
          incidentId: e.incidentId == null ? '' : e.incidentId.toString(),
          prevHash: e.prevHash,
          hash: e.hash,
        }))
        .sort((a, b) => (BigInt(b.seq) > BigInt(a.seq) ? 1 : -1)),
    }
  }, [dcs, feeds, incidents, reports, events])

  // Cache a bounded copy: every feed and incident, the newest events.
  const forCache = useMemo(() => ({ ...live, events: live.events.slice(0, EVENTS_KEPT_IN_CACHE) }), [live])
  const snap = useSnapshot<LogData>('mesa:log-snapshot:v1', forCache, ready)
  return { ...snap, live, ready }
}
