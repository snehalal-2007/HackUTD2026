// Types, thresholds and helpers for the floor view. The data itself is live: see use-live-floors.ts
// (SpacetimeDB tables datacenter, rack, server_latest, server_reading; mapping in docs/UI-LIVE-DATA.md).

export type Status = 'ok' | 'warn' | 'crit'
export type ItemState = Status | 'info'
export type Category = 'power' | 'infra' | 'apps'
export type TabId = 'overview' | 'tasks' | Category

export interface Item {
  name: string
  detail: string
  state: ItemState
}

/** One block on a floor: 6 servers of a telemetry rack (servers 1–6, 7–12 or 13–18). Shown as a hall in the 3D floor. */
export interface Hall {
  id: string // "dc-spartanburg/a18#1" (rack + block index)
  label: string // "Block A1"
  tag: string // block name, unique across every site: "A1"
  cabinet: string // the Summit cabinet in the telemetry, e.g. "a18"
  nodes: string // which servers of the cabinet, e.g. "n01–n06"
  site: string // site id
  floor: number // 1-based floor within the site
  datacenter: string // the data center id in the telemetry, kept for traceability
  status: Status
  temp: number // hottest GPU in the rack, °C
  hum?: number // not in the telemetry: hidden when missing
  pue?: number // not in the telemetry: hidden when missing
  load: number // rack power, kW
  cap: number // kW (assumed, see RACK_CAP_KW)
  servers: number
  hot: number // servers with a GPU at or above GPU_WARN_C
  risk: number // 0–100 headroom score
  headline: string
  short: string
  risks: string[]
  power: Item[]
  infra: Item[]
  apps: Item[]
  past: number[] // per-minute hottest GPU, oldest → now
  fore: number[] // straight-line trend, now → +15 min
  breachH: number | null // hours until GPU_CRIT_C on the trend, null if not heading there
}

/**
 * NMC² sites on the map. Each floor is one telemetry data center: 2 racks of 18 Summit servers, shown as 6 blocks of
 * 6 servers (each rack is a row of 3 blocks). 16 racks → 8 floors → 48 blocks.
 * Only Spartanburg is a confirmed NMC² (NorthMark Compute & Cloud) data center; the other two are simulated.
 */
export interface Site {
  id: string
  name: string
  place: string
  lat: number
  lon: number
  verified: boolean
  note: string
  floors: string[][] // per floor (floor 1 first): the telemetry datacenter ids whose racks it holds
}
export const SITES: Site[] = [
  {
    id: 'spartanburg', name: 'Spartanburg', place: 'South Carolina', lat: 34.918, lon: -81.894, verified: true,
    note: 'NMC² high-performance computing center at the former Kohler plant, 4000 S. Pine St.',
    floors: [['dc-spartanburg'], ['dc-site-3'], ['dc-site-4']],
  },
  {
    id: 'north-carolina', name: 'North Carolina', place: 'Raleigh–Durham area', lat: 35.9, lon: -78.85, verified: false,
    note: 'Simulated site: no public source confirms an NMC² data center in North Carolina.',
    floors: [['dc-north-carolina'], ['dc-site-5'], ['dc-site-6']],
  },
  {
    id: 'dallas', name: 'Dallas', place: 'Texas', lat: 32.78, lon: -96.8, verified: false,
    note: 'Simulated site near NorthMark’s Dallas headquarters (an office, not a data center).',
    floors: [['dc-site-7'], ['dc-site-8']],
  },
]
export const GPU_WARN_C = 50
export const GPU_CRIT_C = 55
export const LIMIT = GPU_CRIT_C
export const SERVERS_PER_BLOCK = 6
export const RACK_CAP_KW = 14 // assumed block capacity: 6 Summit nodes × ~2.2 kW peak
export const CREDIT = 'Telemetry: ClusterWise (OLCF Summit), CC BY 4.0'

export const TABS: { id: TabId; label: string; full: string }[] = [
  { id: 'overview', label: 'Overview', full: 'Overview' },
  { id: 'tasks', label: 'Tasks', full: 'Tasks and risks on this block' },
  { id: 'power', label: 'Power', full: 'Power: highest-draw servers' },
  { id: 'infra', label: 'Infra', full: 'Infrastructure' },
  { id: 'apps', label: 'Jobs', full: 'Servers running a job' },
]

export const STATUS: Record<ItemState, { label: string; glyph: string }> = {
  ok: { label: 'Nominal', glyph: '●' },
  warn: { label: 'Watch', glyph: '▲' },
  crit: { label: 'Critical', glyph: '◆' },
  info: { label: 'Scheduled', glyph: '○' },
}
export const ITEM_LABEL: Record<ItemState, string> = { ok: 'OK', warn: 'Hot', crit: 'Critical', info: 'Standby' }

export const worstOf = (halls: Hall[]): Status => (halls.some(h => h.status === 'crit') ? 'crit' : halls.some(h => h.status === 'warn') ? 'warn' : 'ok')
export const mostUrgent = (halls: Hall[]): Hall | undefined => [...halls].sort((a, b) => b.risk - a.risk)[0]
/** Servers running hot on a floor; the floor filter's badge. */
export const hotOn = (halls: Hall[]) => halls.reduce((s, h) => s + h.hot, 0)

export function floorTotals(halls: Hall[]) {
  const next = halls.filter(h => h.breachH != null).sort((a, b) => a.breachH! - b.breachH!)[0]
  return {
    loadKW: halls.reduce((s, h) => s + h.load, 0),
    hot: hotOn(halls),
    servers: halls.reduce((s, h) => s + h.servers, 0),
    maxTemp: halls.length ? Math.max(...halls.map(h => h.temp)) : 0,
    next, // undefined when nothing on the floor is heading for the limit
  }
}

export function fmtHours(h: number) {
  const m = Math.round(h * 60)
  return m < 1 ? 'now' : m < 60 ? `${m} m` : `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, '0')} m`
}
