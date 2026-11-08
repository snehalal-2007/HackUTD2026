import { useMemo } from 'react'
import { useTable } from 'spacetimedb/react'
import { tables } from '@mesa/bindings'
import type { ChainRow } from '@/lib/event-chain'
import { useSnapshot } from '@/lib/snapshot'
import { makeNamer } from '@/components/floor/names'
import { SITES } from '@/components/floor/data'

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
  dcId: string // telemetry data center id, for the location filter
  rackId: string // telemetry rack id ('' for feed incidents), for the block filter
  rack: string
  openedMs: number
  updatedMs: number
  peak: number
  closedReason: string
  reports: string[] // interim | final
  ownerName: string // '' = nobody owns it
  handedFrom: string // '' = not a leftover from an earlier shift
}

export interface EventVM extends ChainRow {
  ms: number
  label: string // target in console names, for display; target itself stays as stored so the chain verifies
  dcId: string // the data center it's about ('' for questions, shifts and other events with no location)
  rackId: string // the rack it's about, when it's tied to a rack incident
}

export interface LogData {
  feeds: FeedVM[]
  incidents: IncidentVM[]
  events: EventVM[] // newest first
}

const EVENTS_KEPT_IN_CACHE = 200
const ms = (ts: { microsSinceUnixEpoch: bigint }) => Number(ts.microsSinceUnixEpoch / 1000n)
const FEED_ORDER = (dc: string) => { const i = SITES.flatMap(s => s.floors.flat()).indexOf(dc); return i < 0 ? 99 : i } // site → floor, like the 3D floor
const STATUS_ORDER: Record<string, number> = { escalated: 0, open: 1, acknowledged: 2, closed: 3 }

/** Live log data from SpacetimeDB, or the cached snapshot until the subscription is ready. */
export function useLogData() {
  const [dcs, dcReady] = useTable(tables.datacenter)
  const [feeds, feedReady] = useTable(tables.feedHealth)
  const [incidents, incReady] = useTable(tables.incident)
  const [reports, repReady] = useTable(tables.incidentReport)
  const [events, evReady] = useTable(tables.eventLog)
  const [racks] = useTable(tables.rack)
  const ready = dcReady && feedReady && incReady && repReady && evReady

  const live = useMemo<LogData>(() => {
    const names = makeNamer(dcs, racks.map(r => r.rackId))
    const dcOfIncident = new Map(incidents.map(i => [i.incidentId, i.datacenterId]))
    const rackOfIncident = new Map(incidents.map(i => [i.incidentId, i.rackId]))
    const reportsBy = new Map<string, string[]>()
    for (const r of reports) {
      const k = r.incidentId.toString()
      reportsBy.set(k, [...(reportsBy.get(k) ?? []), r.kind])
    }
    return {
      feeds: feeds
        .map(f => ({
          id: f.datacenterId,
          name: names.place(f.datacenterId),
          lastMs: ms(f.lastIngestAt),
          batches: Number(f.batches),
          readings: Number(f.readings),
          stale: f.stale,
        }))
        .sort((a, b) => FEED_ORDER(a.id) - FEED_ORDER(b.id)),
      incidents: incidents
        .map(i => ({
          id: i.incidentId.toString(),
          title: names.text(i.title),
          status: i.status,
          severity: i.severity,
          kind: i.kind,
          source: i.source,
          datacenter: names.place(i.datacenterId),
          dcId: i.datacenterId,
          rackId: i.rackId,
          rack: i.rackId ? names.blocks(i.rackId) : '',
          openedMs: ms(i.openedAt),
          updatedMs: ms(i.updatedAt),
          peak: i.peakValue,
          closedReason: i.closedReason,
          reports: (reportsBy.get(i.incidentId.toString()) ?? []).sort(),
          ownerName: i.owner ? i.ownerName || 'another operator' : '',
          handedFrom: i.handedFrom,
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
          label: names.text(e.target),
          dcId: (e.incidentId != null ? dcOfIncident.get(e.incidentId) : undefined) ?? names.locate(e.target),
          rackId: (e.incidentId != null ? rackOfIncident.get(e.incidentId) : undefined) ?? '',
          incidentId: e.incidentId == null ? '' : e.incidentId.toString(),
          prevHash: e.prevHash,
          hash: e.hash,
        }))
        .sort((a, b) => (BigInt(b.seq) > BigInt(a.seq) ? 1 : -1)),
    }
  }, [dcs, racks, feeds, incidents, reports, events])

  // Cache a bounded copy: every feed and incident, the newest events.
  const forCache = useMemo(() => ({ ...live, events: live.events.slice(0, EVENTS_KEPT_IN_CACHE) }), [live])
  const snap = useSnapshot<LogData>('mesa:log-snapshot:v5', forCache, ready)
  return { ...snap, live, ready }
}
