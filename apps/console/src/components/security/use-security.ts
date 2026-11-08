import { useEffect, useMemo, useState } from 'react'
import { useSpacetimeDB, useTable } from 'spacetimedb/react'
import { tables } from '@mesa/bindings'

// Live honeypot data from the module (module/src/honeypot): every decoy hit is a `threat_event` row,
// and the caller's identity gets a `quarantine` row that every real reducer checks.

/** The decoy reducers in module/src/honeypot/decoys.ts and what each one pretends to be. */
export const DECOYS = [
  { name: 'admin_override_alarm', bait: 'Looks like a maintenance override that silences alarms' },
  { name: 'export_operator_tokens', bait: 'Looks like an export of every operator login token' },
] as const

export function useSecurity() {
  const conn = useSpacetimeDB()
  const [events, eventsReady] = useTable(tables.threatEvent)
  const [quarantined, quarantineReady] = useTable(tables.quarantine)

  return useMemo(() => {
    const sorted = [...events].sort((a, b) => (a.id < b.id ? 1 : -1)) // newest first
    const me = conn.identity
    const meQuarantined = me ? quarantined.find(q => q.identity.isEqual(me)) : undefined
    const hitsByDecoy = new Map<string, number>()
    for (const e of events) hitsByDecoy.set(e.decoy, (hitsByDecoy.get(e.decoy) ?? 0) + 1)
    return {
      ready: eventsReady && quarantineReady,
      events: sorted,
      quarantined: [...quarantined].sort((a, b) => (a.at.toDate() < b.at.toDate() ? 1 : -1)),
      latest: sorted[0],
      hitsByDecoy,
      meQuarantined,
    }
  }, [events, quarantined, eventsReady, quarantineReady, conn.identity])
}

export type ThreatEvent = ReturnType<typeof useSecurity>['events'][number]
export type QuarantineRow = ReturnType<typeof useSecurity>['quarantined'][number]

/** Threat events that arrived after this browser loaded, so old intrusions don't raise the banner again. */
export function useNewIntrusions() {
  const { events, ready } = useSecurity()
  const [baseline, setBaseline] = useState<bigint | null>(null)
  const [dismissed, setDismissed] = useState<bigint>(0n)
  if (ready && baseline === null) setBaseline(events[0]?.id ?? 0n) // first load: everything up to here counts as already seen
  const fresh = baseline === null ? [] : events.filter(e => e.id > baseline && e.id > dismissed)
  return { fresh, dismiss: () => setDismissed(events[0]?.id ?? 0n) }
}

/** Re-renders every 15 s so "2 min ago" labels stay current. */
export function useNow(intervalMs = 15000) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs)
    return () => clearInterval(id)
  }, [intervalMs])
  return now
}

export function ago(d: Date, now: number) {
  const s = Math.max(0, Math.round((now - d.getTime()) / 1000))
  if (s < 60) return 'just now'
  const m = Math.round(s / 60)
  if (m < 60) return `${m} min ago`
  const h = Math.round(m / 60)
  return h < 24 ? `${h} h ago` : d.toLocaleDateString()
}

export const clock = (d: Date) => d.toLocaleTimeString('en-GB', { hour12: false })
export const shortId = (hex: string) => `${hex.slice(0, 8)}…`
