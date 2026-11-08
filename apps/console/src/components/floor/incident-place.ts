import { useMemo } from 'react'
import { useTable } from 'spacetimedb/react'
import { tables } from '@mesa/bindings'
import { SITES, type Hall } from './data'
import { PLACE, makeNamer } from './names'
import { useLiveSites } from './use-live-floors'

// Where an incident is, as the operator thinks of it (the "address block", docs/location-designs-7.html #2):
// the block (the hottest block on the incident's rack, from live readings), its floor and its site, and the alert
// text without the place in front of it ("GPU at 56.8 °C (limit 55 °C)"). Feed alerts have no block: "Feed".

export interface IncidentPlace {
  block: string // "A1", or "Feed" for a silent-feed alert
  hall: Hall | undefined // the block itself, when known
  floor: number
  site: string
  what: string // the alert text without the location prefix
}

interface Inc { datacenterId: string; rackId: string; title: string }

export function useIncidentPlace() {
  const { sites } = useLiveSites({ withHistory: false })
  const [dcs] = useTable(tables.datacenter)
  const [racks] = useTable(tables.rack)
  const names = useMemo(() => makeNamer(dcs, racks.map(r => r.rackId)), [dcs, racks])
  const halls = useMemo(() => Object.values(sites).flat(2), [sites])

  return (i: Inc): IncidentPlace => {
    const p = PLACE.get(i.datacenterId)
    const site = SITES.find(s => s.id === p?.site)?.name ?? i.datacenterId
    const floor = p?.floor ?? 0
    const hall = i.rackId ? halls.filter(h => h.id.startsWith(`${i.rackId}#`)).sort((a, b) => b.temp - a.temp)[0] : undefined
    const full = names.text(i.title)
    const colon = full.indexOf(': ')
    let what = colon >= 0 ? full.slice(colon + 2) : full.replace(names.place(i.datacenterId), '').trim()
    what = what.charAt(0).toUpperCase() + what.slice(1)
    return { block: hall?.tag ?? (i.rackId ? names.blocks(i.rackId).replace(/^blocks /, '') : 'Feed'), hall, floor, site, what }
  }
}
