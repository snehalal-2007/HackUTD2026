import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import { useTable } from 'spacetimedb/react'
import { tables } from '@mesa/bindings'
import { PLACE, rowLetters } from './names'
import { GPU_CRIT_C, GPU_WARN_C, RACK_CAP_KW, SERVERS_PER_BLOCK, SITES, type Hall, type Item, type ItemState, type Status } from './data'

// Live sites from SpacetimeDB telemetry (docs/UI-LIVE-DATA.md): site → floors → blocks. Each floor is one telemetry data
// center (see SITES); each of its racks is a row of 3 blocks of 6 servers. Every number is a real reading, aggregated
// per block. Read-only: the console never calls ingest_readings.

export type SiteFloors = Record<string, Hall[][]> // site id → floors (index 0 = Floor 1) → blocks
const BLOCKS_PER_RACK = 3 // 18 servers / 6

const ms = (ts: { microsSinceUnixEpoch: bigint }) => Number(ts.microsSinceUnixEpoch / 1000n)
const stateOf = (c: number, failed = false): ItemState => (failed || c >= GPU_CRIT_C ? 'crit' : c >= GPU_WARN_C ? 'warn' : 'ok')
const cabinet = (id: string) => id.split('/')[1] ?? id
/** server number within its cabinet: "dc-x/a18n05" → 5 */
const nodeNo = (serverId: string) => Number(/n(\d+)$/.exec(serverId)?.[1] ?? 0)
const blockOf = (serverId: string) => Math.min(BLOCKS_PER_RACK - 1, Math.max(0, Math.floor((nodeNo(serverId) - 1) / SERVERS_PER_BLOCK)))
const two = (n: number) => String(n).padStart(2, '0')

/** The server ids of one block, from its hall id ("dc-x/a18#2" → dc-x/a18n07 … dc-x/a18n12). Mirrors blockOf. */
export function blockServerIds(hallId: string) {
  const [rackId, b] = hallId.split('#')
  const first = (Number(b) - 1) * SERVERS_PER_BLOCK + 1
  return Array.from({ length: SERVERS_PER_BLOCK }, (_, i) => `${rackId}n${two(first + i)}`)
}

// server_reading is large and busy, so history is subscribed only while the temperature chart is on screen.
// The chart reports its visibility here (setHistoryOnScreen); useLiveSites follows it.
let historyOnScreen = false
const historyListeners = new Set<() => void>()
export function setHistoryOnScreen(onScreen: boolean) {
  if (onScreen === historyOnScreen) return
  historyOnScreen = onScreen
  historyListeners.forEach(l => l())
}
function subscribeHistoryOnScreen(l: () => void) {
  historyListeners.add(l)
  return () => void historyListeners.delete(l)
}

/** Least-squares slope (°C per minute) and the value at the last point. */
function trend(points: number[]) {
  const n = points.length
  if (n < 2) return { slope: 0, last: points[0] ?? 0 }
  const mx = (n - 1) / 2
  const my = points.reduce((s, v) => s + v, 0) / n
  let num = 0
  let den = 0
  points.forEach((v, i) => {
    num += (i - mx) * (v - my)
    den += (i - mx) ** 2
  })
  return { slope: num / den, last: points[n - 1] }
}

export function useLiveSites({ withHistory }: { withHistory: boolean }) {
  const [, dcReady] = useTable(tables.datacenter) // only for the ready signal; racks carry their datacenterId
  const [racks, rackReady] = useTable(tables.rack)
  const [servers, serverReady] = useTable(tables.serverLatest)
  const chartOnScreen = useSyncExternalStore(subscribeHistoryOnScreen, () => historyOnScreen)
  const [history] = useTable(tables.serverReading, { enabled: withHistory && chartOnScreen })

  // server_reading changes ~29 times a second; take a snapshot every 3 s instead of recomputing every floor each time
  const latestHistory = useRef(history)
  useEffect(() => { latestHistory.current = history }, [history])
  const [snapshot, setSnapshot] = useState(history)
  useEffect(() => {
    const id = setInterval(() => setSnapshot(latestHistory.current), 3000)
    return () => clearInterval(id)
  }, [])

  const sites = useMemo(() => {
    const blockKey = (rackId: string, b: number) => `${rackId}#${b + 1}`
    const serversByBlock = new Map<string, (typeof servers)[number][]>()
    const blockOfServer = new Map<string, string>()
    for (const s of servers) {
      const key = blockKey(s.rackId, blockOf(s.serverId))
      serversByBlock.set(key, [...(serversByBlock.get(key) ?? []), s])
      blockOfServer.set(s.serverId, key)
    }

    // per block: minute bucket -> hottest GPU in that minute
    const minuteMax = new Map<string, Map<number, number>>()
    for (const r of snapshot) {
      const key = blockOfServer.get(r.serverId)
      if (!key) continue
      const minute = Math.floor(ms(r.measuredAt) / 60_000)
      const m = minuteMax.get(key) ?? new Map<number, number>()
      m.set(minute, Math.max(m.get(minute) ?? -Infinity, r.gpuTempC))
      minuteMax.set(key, m)
    }

    const out: SiteFloors = Object.fromEntries(SITES.map(site => [site.id, site.floors.map(() => [] as Hall[])]))
    const letters = rowLetters(racks.map(r => r.rackId))
    for (const rack of racks) {
      const place = PLACE.get(rack.datacenterId)
      if (!place) continue // a data center that isn't part of the site model
      const cab = cabinet(rack.rackId)
      const letter = letters.get(rack.rackId) ?? '?'
      for (let b = 0; b < BLOCKS_PER_RACK; b++) {
        const key = blockKey(rack.rackId, b)
        const rs = (serversByBlock.get(key) ?? []).sort((x, y) => nodeNo(x.serverId) - nodeNo(y.serverId))
        if (!rs.length) continue // no readings for these servers yet
        const tag = `${letter}${b + 1}`
        const name = (s: (typeof rs)[number]) => `${tag}-n${two(nodeNo(s.serverId))}`
        const failed = rs.some(s => s.gpuFailure)
        const temp = Math.max(...rs.map(s => s.gpuTempC))
        const status = stateOf(temp, failed) as Status

        const past = [...(minuteMax.get(key) ?? new Map<number, number>()).entries()].sort((x, y) => x[0] - y[0]).map(([, v]) => +v.toFixed(1))
        if (!past.length) past.push(+temp.toFixed(1)) // before history arrives, the chart starts from the latest value
        const { slope, last } = trend(past)
        const fore = Array.from({ length: 16 }, (_, j) => +(last + slope * j).toFixed(1))
        const breachMin = temp >= GPU_CRIT_C ? 0 : slope > 0 ? (GPU_CRIT_C - last) / slope : null

        const hot = rs.filter(s => s.gpuTempC >= GPU_WARN_C).sort((x, y) => y.gpuTempC - x.gpuTempC)
        const power: Item[] = [...rs]
          .sort((x, y) => y.nodePowerW - x.nodePowerW)
          .slice(0, 5)
          .map(s => ({ name: name(s), detail: `${Math.round(s.nodePowerW)} W · GPU ${s.gpuTempC.toFixed(1)} °C`, state: stateOf(s.gpuTempC, s.gpuFailure) }))
        const apps: Item[] = rs
          .filter(s => s.jobActive)
          .sort((x, y) => y.gpuUtilPct - x.gpuUtilPct)
          .map(s => ({ name: name(s), detail: `GPU ${Math.round(s.gpuUtilPct)}% · CPU ${Math.round(s.cpuUtilPct)}% (est.)`, state: stateOf(s.gpuTempC, s.gpuFailure) }))
        const first = b * SERVERS_PER_BLOCK + 1

        out[place.site][place.floor - 1].push({
          id: key,
          label: `Block ${tag}`,
          tag,
          cabinet: cab,
          nodes: `n${two(first)}–n${two(first + SERVERS_PER_BLOCK - 1)}`,
          site: place.site,
          floor: place.floor,
          datacenter: rack.datacenterId,
          status,
          temp,
          load: rs.reduce((s, x) => s + x.nodePowerW, 0) / 1000,
          cap: RACK_CAP_KW,
          servers: rs.length,
          hot: hot.length,
          risk: Math.round(Math.min(1, Math.max(0, (temp - 40) / (GPU_CRIT_C - 40))) * 100),
          headline: hot.length
            ? `Hottest GPU ${temp.toFixed(1)} °C in block ${tag}; ${hot.length} of ${rs.length} servers at or over ${GPU_WARN_C} °C.`
            : `All GPUs in block ${tag} are under ${GPU_WARN_C} °C.`,
          short: status === 'ok' ? 'Nominal' : failed ? 'GPU failure' : 'GPU hot',
          risks: [
            ...(failed ? [`${rs.filter(s => s.gpuFailure).length} server(s) report a GPU failure.`] : []),
            ...hot.slice(0, 3).map(s => `${name(s)} GPU at ${s.gpuTempC.toFixed(1)} °C, drawing ${Math.round(s.nodePowerW)} W.`),
          ],
          power,
          infra: [], // no cooling data in the telemetry
          apps,
          past,
          fore,
          breachH: breachMin == null ? null : breachMin / 60, // the UI formats hours; under an hour it shows minutes
        })
      }
    }
    // order each floor A1 A2 A3, B1 B2 B3 so the 3D rows match the names
    for (const floors of Object.values(out)) for (const f of floors) f.sort((a, b) => a.tag.localeCompare(b.tag))
    return out
  }, [racks, servers, snapshot])

  return { sites, ready: dcReady && rackReady && serverReady }
}
