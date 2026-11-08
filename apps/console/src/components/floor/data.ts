// Floor overview data. SAMPLE ONLY: the same halls and stories as docs/prototype.html.
// Swap for the `asset`, `latest_reading` and `alert` subscriptions once the module has them.

export type Status = 'ok' | 'warn' | 'crit'
export type ItemState = Status | 'info'
export type Category = 'power' | 'infra' | 'apps'
export type TabId = 'overview' | Category

export interface Item {
  name: string
  detail: string
  state: ItemState
}

export interface Hall {
  id: string
  status: Status
  temp: number // inlet, °C
  hum: number // relative humidity, %
  load: number // IT load, kW
  cap: number // kW
  pue: number
  risk: number // 0–100
  headline: string
  short: string
  risks: string[]
  power: Item[]
  infra: Item[]
  apps: Item[]
  past: number[] // hourly inlet temperature, −24 h … now
  fore: number[] // forecast, now … +12 h
  breachH: number | null // hours until the inlet limit, null if not heading there
}

export const LIMIT = 27 // °C, ASHRAE recommended inlet maximum
export const SITE = 'Dallas DC-2'

export const TABS: { id: TabId; label: string; full: string }[] = [
  { id: 'overview', label: 'Overview', full: 'Overview' },
  { id: 'power', label: 'Power', full: 'Power' },
  { id: 'infra', label: 'Infra', full: 'Infrastructure' },
  { id: 'apps', label: 'Apps', full: 'App services' },
]

export const STATUS: Record<ItemState, { label: string; glyph: string }> = {
  ok: { label: 'Nominal', glyph: '●' },
  warn: { label: 'Watch', glyph: '▲' },
  crit: { label: 'Critical', glyph: '◆' },
  info: { label: 'Scheduled', glyph: '○' },
}
export const ITEM_LABEL: Record<ItemState, string> = { ok: 'OK', warn: 'Degraded', crit: 'Down', info: 'Standby' }

type Patch = [Category, number, Partial<Item>]
interface HallInput extends Partial<Omit<Hall, 'power' | 'infra' | 'apps' | 'past' | 'fore' | 'breachH'>> {
  slope?: number // °C per hour over the past day
  fslope?: number // °C per hour in the forecast
  patch?: Patch[]
}

function mkHall(id: string, o: HallInput = {}): Hall {
  const { slope = 0.02, fslope = 0.01, patch = [], ...rest } = o
  const base = { status: 'ok' as Status, temp: 22.2, hum: 45, load: 610, cap: 900, pue: 1.28, risk: 10, headline: `All systems are nominal in ${id}.`, short: 'Nominal', risks: [] as string[], ...rest }
  const power: Item[] = [
    { name: 'Utility feed A', detail: '13.8 kV · 100% voltage', state: 'ok' },
    { name: 'Utility feed B', detail: '13.8 kV · 100% voltage', state: 'ok' },
    { name: `UPS-${id}-1`, detail: 'Online · 100% charge', state: 'ok' },
    { name: 'PDU rows 1–6', detail: `${Math.round((base.load / base.cap) * 100)}% average draw`, state: 'ok' },
    { name: `Generator G-${id}`, detail: 'Standby · fuel 96%', state: 'info' },
  ]
  const infra: Item[] = [
    { name: `CRAH-${id}-1`, detail: 'Supply 18.2 °C · fans 64%', state: 'ok' },
    { name: `CRAH-${id}-2`, detail: 'Supply 18.4 °C · fans 61%', state: 'ok' },
    { name: 'Chilled-water loop', detail: '7.1 °C supply · 410 L/min', state: 'ok' },
    { name: 'Leak detection', detail: 'All 12 zones dry', state: 'ok' },
    { name: 'Fire suppression', detail: 'Armed · Novec 1230', state: 'ok' },
    { name: 'Network spine', detail: '2 × 400G · 31% utilised', state: 'ok' },
  ]
  const apps: Item[] = [
    { name: 'auth-api', detail: 'p95 38 ms · 99.99% up', state: 'ok' },
    { name: 'payments-core', detail: 'p95 61 ms · 99.99% up', state: 'ok' },
    { name: 'search-index', detail: '6 of 6 nodes · p95 24 ms', state: 'ok' },
    { name: 'telemetry-ingest', detail: '41k events/s', state: 'ok' },
    { name: 'object-store', detail: '2.1 PB · 99.999% up', state: 'ok' },
  ]
  const lists = { power, infra, apps }
  patch.forEach(([cat, i, v]) => Object.assign(lists[cat][i], v))
  // deterministic temperature history and forecast
  const seed = id.charCodeAt(1)
  const past = Array.from({ length: 25 }, (_, i) =>
    i === 24 ? base.temp : +(base.temp - slope * (24 - i) + 0.32 * Math.sin(i * 0.9 + seed) + 0.14 * Math.cos(i * 2.3 + seed)).toFixed(1),
  )
  const fore = Array.from({ length: 13 }, (_, j) => (j === 0 ? base.temp : +(base.temp + fslope * j + 0.12 * Math.sin(j * 1.1 + seed)).toFixed(1)))
  const k = fore.findIndex(v => v >= LIMIT)
  const breachH = base.temp >= LIMIT ? 0 : k > 0 ? k - 1 + (LIMIT - fore[k - 1]) / (fore[k] - fore[k - 1]) : null
  return { id, ...base, power, infra, apps, past, fore, breachH }
}

const n = (id: string, temp: number, load: number, risk: number, hum = 45) => mkHall(id, { temp, load, risk, hum })

export const FLOORS: Record<number, Hall[]> = {
  1: [n('1A', 21.8, 540, 8), n('1B', 22.4, 610, 14), n('1C', 22.0, 575, 11), n('1D', 23.1, 690, 19),
    mkHall('1E', { status: 'warn', temp: 22.9, hum: 63, load: 560, risk: 38, short: 'Humidity high',
      headline: 'Humidity in 1E is above the 60% limit.',
      risks: ['Relative humidity is 63%, so condensation can form on cold chilled-water pipes.', 'The CRAH-1E-1 humidifier valve is stuck open; a technician is on the way.'],
      patch: [['infra', 0, { detail: 'Humidifier valve stuck open', state: 'warn' }]] }),
    n('1F', 21.5, 498, 7), n('1G', 22.2, 602, 13), n('1H', 21.9, 588, 10)],
  2: [n('2A', 22.6, 640, 16),
    mkHall('2B', { status: 'warn', temp: 23.0, load: 861, risk: 52, short: 'PDU near limit',
      headline: 'PDU-B in 2B is running near its breaker limit.',
      risks: ['PDU-B is at 96% of its breaker rating; one more busy rack could trip it.', 'If PDU-B trips, rows 4–6 drop to a single feed.'],
      patch: [['power', 3, { detail: 'PDU-B at 96% of breaker rating', state: 'warn' }]] }),
    n('2C', 22.1, 600, 12), n('2D', 22.8, 655, 17), n('2E', 21.7, 520, 9), n('2F', 22.3, 610, 13),
    mkHall('2G', { status: 'warn', temp: 25.9, hum: 42, load: 705, risk: 44, slope: 0.08, fslope: 0.32, short: 'Inlet rising',
      headline: 'Inlet air in 2G is warming after a hot-aisle door was left open.',
      risks: ['Inlet air is rising about 0.3 °C per hour and reaches 27 °C in about 3 h 30 m.', 'The hot-aisle containment door on row 2 reports open.'],
      patch: [['infra', 2, { detail: 'Return air 38 °C · door open on row 2', state: 'warn' }]] }),
    n('2H', 22.0, 590, 11)],
  3: [mkHall('3A', { temp: 22.1, risk: 12, hum: 44, load: 588 }),
    mkHall('3B', { status: 'warn', temp: 26.6, hum: 39, load: 655, risk: 58, slope: 0.12, fslope: 0.3, short: 'Cooling degraded',
      headline: 'Cooling is degraded in 3B and inlet air is warming.',
      risks: ['Inlet air is rising about 0.3 °C per hour and reaches the 27 °C limit in about 1 h 20 m.', 'CRAH-3B-2 lost 1 of 4 fans; the other three are running at 92%.'],
      patch: [['infra', 1, { detail: 'Fan 3 failed · others at 92%', state: 'warn' }], ['infra', 0, { detail: 'Supply 19.6 °C · fans 88%' }]] }),
    mkHall('3C', { status: 'crit', temp: 24.9, hum: 41, load: 702, pue: 1.41, risk: 86, slope: 0.04, fslope: 0.22, short: 'UPS on battery',
      headline: 'Utility feed A is down and 3C is running on UPS battery.',
      risks: ['UPS-3C-1 is on battery with about 14 minutes of runtime left at the current load.', 'Generator G-3C failed its first start; a second attempt is in progress.', 'payments-core failed over to 3D and is running at reduced capacity.'],
      patch: [['power', 0, { detail: 'No voltage for 18 min', state: 'crit' }], ['power', 2, { detail: 'On battery · 14 min left', state: 'crit' }], ['power', 4, { detail: 'Start failed · retrying', state: 'warn' }], ['apps', 1, { detail: 'Failed over to 3D · p95 180 ms', state: 'warn' }]] }),
    mkHall('3D', { temp: 23.4, hum: 46, load: 784, risk: 31, slope: 0.03, fslope: 0.05, short: 'Carrying failover',
      headline: '3D is healthy and is carrying payments-core traffic from 3C.',
      risks: ['Load is at 87% of capacity while it carries the payments-core failover from 3C.'] }),
    mkHall('3E', { status: 'warn', temp: 23.1, hum: 47, load: 540, risk: 41, short: 'search-index down',
      headline: 'search-index is partly down in 3E.',
      risks: ['search-index lost 2 of 6 nodes after a kernel panic, so queries are slower.', 'auth-api latency is 8× normal because it shares hosts with search-index.'],
      patch: [['apps', 2, { detail: '2 of 6 nodes down', state: 'crit' }], ['apps', 0, { detail: 'p95 310 ms · 99.2% up', state: 'warn' }]] }),
    mkHall('3F', { temp: 21.6, hum: 43, load: 497, risk: 9 }),
    mkHall('3G', { temp: 22.7, hum: 45, load: 621, risk: 22, short: 'Maintenance 02:00',
      headline: 'Maintenance is scheduled in 3G tonight at 02:00.',
      risks: ['Rows 1–3 run on a single PDU feed during the 02:00 firmware update.'],
      patch: [['power', 3, { detail: 'PDU-B firmware update at 02:00', state: 'info' }]] }),
    mkHall('3H', { status: 'warn', temp: 22.8, hum: 52, load: 600, risk: 49, short: 'Leak detected',
      headline: 'A leak sensor tripped under row 4 in 3H.',
      risks: ['Moisture under row 4 near the chilled-water manifold; a technician is on the way.', 'If the leak grows, rows 3–5 (14 racks) need a controlled shutdown.'],
      patch: [['infra', 3, { detail: 'Zone 4 wet · technician dispatched', state: 'warn' }]] })],
  4: [mkHall('4A', { status: 'warn', temp: 22.3, load: 410, risk: 35, short: 'Fire panel fault',
      headline: 'The fire-suppression panel in 4A reports a fault.',
      risks: ['Panel FS-4A reports a ground fault. Suppression is still armed, but the next alarm may not show on the panel.'],
      patch: [['infra', 4, { detail: 'Ground fault on panel FS-4A', state: 'warn' }]] }),
    n('4B', 21.4, 380, 8), n('4C', 21.2, 300, 6), n('4D', 21.0, 260, 5),
    n('4E', 20.8, 120, 4), n('4F', 20.9, 140, 4), n('4G', 20.6, 90, 3), n('4H', 20.7, 80, 3)],
}
export const FLOOR_IDS = Object.keys(FLOORS).map(Number)

/** Open problems (degraded or down items) in one hall. */
export const issuesIn = (h: Hall) => (['power', 'infra', 'apps'] as const).reduce((s, c) => s + h[c].filter(x => x.state === 'warn' || x.state === 'crit').length, 0)
export const worstOf = (halls: Hall[]): Status => (halls.some(h => h.status === 'crit') ? 'crit' : halls.some(h => h.status === 'warn') ? 'warn' : 'ok')
export const mostUrgent = (halls: Hall[]) => [...halls].sort((a, b) => b.risk - a.risk)[0]

export function floorTotals(halls: Hall[]) {
  const next = halls.filter(h => h.breachH != null).sort((a, b) => a.breachH! - b.breachH!)[0]
  return {
    loadMW: halls.reduce((s, h) => s + h.load, 0) / 1000,
    issues: halls.reduce((s, h) => s + issuesIn(h), 0),
    avgTemp: halls.reduce((s, h) => s + h.temp, 0) / halls.length,
    next, // undefined when nothing on the floor is heading for the limit
  }
}

export function fmtHours(h: number) {
  const m = Math.round(h * 60)
  return m < 60 ? `${m} m` : `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, '0')} m`
}
