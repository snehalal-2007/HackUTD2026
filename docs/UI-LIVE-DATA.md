# Handoff: Live Telemetry in the 3D Floor View

**For:** the console owner, and the coding agent working on `apps/console` (branch `feat/UI`, PR #5).
**Goal:** replace the sample data in `components/floor/data.ts` with live data from SpacetimeDB, keeping the 3D scene, KPI tiles, chart and hall panel as they are.

## 1. What is live right now

Maincloud database `hackutd2026-0nef9` receives real OLCF Summit telemetry (ClusterWise, CC BY 4.0) from a replayer on Railway: **8 data centers, 16 racks, 288 servers, one batch per data center about every 10 seconds, around the clock.** Details: [TELEMETRY.md](TELEMETRY.md).

The console already connects to it in production (`VITE_SPACETIME_URI=wss://maincloud.spacetimedb.com`, `VITE_SPACETIME_DB=hackutd2026-0nef9` in Vercel, see `src/lib/spacetime.ts`). For local work, put the same two lines in `apps/console/.env.local` to see live data, or run `pnpm dev:db`, `pnpm publish:local` and `pnpm replay` for a local stream.

The console **only reads** these tables. It calls no reducers for telemetry.

## 2. Tables to subscribe to

All are public. Import `tables` from `@mesa/bindings` and use `useTable` from `spacetimedb/react` (as `views/operators-view.tsx` does). TypeScript field names are camelCase.

| Table | One row per | Fields to use |
|---|---|---|
| `tables.datacenter` | Data center (8) | `datacenterId`, `name` ("Spartanburg"), `region` ("us-southeast") |
| `tables.rack` | Rack (16), refreshed every batch | `rackId` ("dc-spartanburg/a18"), `datacenterId`, `servers` (18), `gpuTempMaxC`, `cpuTempMaxC`, `powerKw`, `updatedAt` |
| `tables.serverLatest` | Server (288), newest reading | `serverId`, `rackId`, `datacenterId`, `measuredAt`, `gpuTempC`, `cpuTempC`, `gpuPowerW`, `cpuPowerW`, `nodePowerW`, `gpuUtilPct`, `cpuUtilPct`, `jobActive`, `gpuFailure`, `nodeState` |
| `tables.serverReading` | Reading, last 15 minutes only | `serverId`, `measuredAt`, `gpuTempC`, `cpuTempC`, `nodePowerW`, `gpuUtilPct`, `cpuUtilPct` |

`measuredAt` and `updatedAt` are SpacetimeDB `Timestamp`s: milliseconds are `Number(ts.microsSinceUnixEpoch / 1000n)`.

`serverReading` holds about 26,000 rows (288 servers × 15 min × 6 per minute) and changes about 29 times a second. Subscribe to it only while the chart is on screen.

## 3. How the sample model maps to live data

| UI concept (sample) | Live source | Notes |
|---|---|---|
| Floor 1–4 | Region: 1 us-southeast, 2 us-east, 3 us-central, 4 us-west | Four regions, four floors. Each floor has 2 data centers × 2 racks = **4 halls**, not 8 |
| Hall | Rack | Label it with the data center name and cabinet, e.g. "Spartanburg · a18" |
| `SITE` ("Dallas DC-2") | "MESA · 8 data centers" | Or show the selected floor's two data center names |
| `temp` (inlet °C) | `rack.gpuTempMaxC` (hottest GPU core in the rack) | **The data has no inlet temperature.** Relabel "Inlet temperature" as "GPU temperature (hottest in rack)" |
| `LIMIT` (27 °C inlet) | `GPU_CRIT_C` = 55 °C, `GPU_WARN_C` = 50 °C | GPU cores run 27–57 °C in this data, so an inlet limit would flag everything |
| `status` | Hottest GPU ≥ 55 °C or any `gpuFailure` = crit; ≥ 50 °C = warn; else ok | |
| `load` (kW) | `rack.powerKw` | Live |
| `cap` (kW) | `RACK_CAP_KW` = 40 | **Assumption.** 18 Summit nodes peak around 2.2 kW each; say so in a tooltip |
| `hum` (%), `pue` | Not in the data | Hide these stats. Do not show sample values next to live ones |
| `risk` (0–100) | (hottest GPU − 40) ÷ (55 − 40) × 100, clamped | Simple headroom score |
| `past` (24 h hourly) | Per-minute max GPU temperature of the rack's servers, last 15 min, from `serverReading` | Relabel the chart axis to minutes |
| `fore` (12 h forecast) and `breachH` | Straight-line fit over those 15 minutes, projected 15 min ahead; time until it reaches 55 °C | Label it "trend", not "forecast". The predictor service is cut from scope |
| `power` items | The rack's 5 highest-power servers: node W, GPU °C | From `serverLatest` |
| `apps` items | Servers running a job (`jobActive`), with GPU and CPU use | Usage % is **derived** from power draw; label it "est." |
| `infra` items | None in the data | Hide the tab, or show "No live data for cooling yet" |
| Headline, `short`, `risks` | Generated from the numbers, e.g. "Hottest GPU 56.7 °C in Spartanburg · a18" | Keep them factual; no invented causes |

## 4. The adapter hook

Add `apps/console/src/components/floor/use-live-floors.ts`. It returns the same `Hall` shape the components already use, keyed by floor, so `floor-view.tsx` swaps `FLOORS` for `useLiveFloors().floors` and little else changes. Make `hum` and `pue` optional in the `Hall` type (`hum?: number`, `pue?: number`) and hide them when missing.

```ts
import { useMemo } from 'react'
import { useTable } from 'spacetimedb/react'
import { tables } from '@mesa/bindings'
import type { Hall, Item, ItemState, Status } from './data'

export const REGIONS = ['us-southeast', 'us-east', 'us-central', 'us-west'] as const // floor 1..4
export const GPU_WARN_C = 50
export const GPU_CRIT_C = 55
export const RACK_CAP_KW = 40 // assumption: 18 nodes × ~2.2 kW peak

const ms = (ts: { microsSinceUnixEpoch: bigint }) => Number(ts.microsSinceUnixEpoch / 1000n)
const stateOf = (c: number, failed = false): ItemState => (failed || c >= GPU_CRIT_C ? 'crit' : c >= GPU_WARN_C ? 'warn' : 'ok')

/** Least-squares slope (°C per minute) and the value at the last point. */
function trend(points: number[]) {
  const n = points.length
  if (n < 2) return { slope: 0, last: points[0] ?? 0 }
  const mx = (n - 1) / 2
  const my = points.reduce((s, v) => s + v, 0) / n
  let num = 0
  let den = 0
  points.forEach((v, i) => ((num += (i - mx) * (v - my)), (den += (i - mx) ** 2)))
  return { slope: num / den, last: points[n - 1] }
}

export function useLiveFloors(opts: { withHistory: boolean }) {
  const [dcs, dcReady] = useTable(tables.datacenter)
  const [racks, rackReady] = useTable(tables.rack)
  const [servers, serverReady] = useTable(tables.serverLatest)
  const [history] = useTable(tables.serverReading, { enabled: opts.withHistory })

  const floors = useMemo(() => {
    const dcById = new Map(dcs.map(d => [d.datacenterId, d]))
    const serversByRack = new Map<string, (typeof servers)[number][]>()
    for (const s of servers) serversByRack.set(s.rackId, [...(serversByRack.get(s.rackId) ?? []), s])
    const rackOfServer = new Map(servers.map(s => [s.serverId, s.rackId]))

    // per rack: minute bucket -> hottest GPU in that minute
    const minuteMax = new Map<string, Map<number, number>>()
    for (const r of history) {
      const rackId = rackOfServer.get(r.serverId)
      if (!rackId) continue
      const minute = Math.floor(ms(r.measuredAt) / 60_000)
      const m = minuteMax.get(rackId) ?? new Map<number, number>()
      m.set(minute, Math.max(m.get(minute) ?? -Infinity, r.gpuTempC))
      minuteMax.set(rackId, m)
    }

    const out: Record<number, Hall[]> = { 1: [], 2: [], 3: [], 4: [] }
    for (const rack of [...racks].sort((a, b) => a.rackId.localeCompare(b.rackId))) {
      const dc = dcById.get(rack.datacenterId)
      const floor = dc ? REGIONS.indexOf(dc.region as (typeof REGIONS)[number]) + 1 : 0
      if (floor < 1) continue
      const rs = serversByRack.get(rack.rackId) ?? []
      const failed = rs.some(s => s.gpuFailure)
      const temp = rack.gpuTempMaxC
      const status = stateOf(temp, failed) as Status

      const past = [...(minuteMax.get(rack.rackId) ?? new Map()).entries()].sort((a, b) => a[0] - b[0]).map(([, v]) => v)
      const { slope, last } = trend(past)
      const fore = Array.from({ length: 16 }, (_, j) => +(last + slope * j).toFixed(1))
      const breachMin = temp >= GPU_CRIT_C ? 0 : slope > 0 ? (GPU_CRIT_C - last) / slope : null

      const hot = rs.filter(s => s.gpuTempC >= GPU_WARN_C).sort((a, b) => b.gpuTempC - a.gpuTempC)
      const label = `${dc?.name ?? rack.datacenterId} · ${rack.rackId.split('/')[1]}`
      const power: Item[] = [...rs]
        .sort((a, b) => b.nodePowerW - a.nodePowerW)
        .slice(0, 5)
        .map(s => ({ name: s.serverId.split('/')[1], detail: `${Math.round(s.nodePowerW)} W · GPU ${s.gpuTempC.toFixed(1)} °C`, state: stateOf(s.gpuTempC, s.gpuFailure) }))
      const apps: Item[] = rs
        .filter(s => s.jobActive)
        .map(s => ({ name: s.serverId.split('/')[1], detail: `GPU ${Math.round(s.gpuUtilPct)}% · CPU ${Math.round(s.cpuUtilPct)}% (est.)`, state: stateOf(s.gpuTempC, s.gpuFailure) }))

      out[floor].push({
        id: rack.rackId,
        status,
        temp,
        load: rack.powerKw,
        cap: RACK_CAP_KW,
        risk: Math.round(Math.min(1, Math.max(0, (temp - 40) / (GPU_CRIT_C - 40))) * 100),
        headline: hot.length ? `Hottest GPU ${temp.toFixed(1)} °C in ${label}; ${hot.length} servers over ${GPU_WARN_C} °C.` : `All GPUs under ${GPU_WARN_C} °C in ${label}.`,
        short: status === 'ok' ? 'Nominal' : failed ? 'GPU failure' : 'GPU hot',
        risks: hot.slice(0, 3).map(s => `${s.serverId.split('/')[1]} GPU at ${s.gpuTempC.toFixed(1)} °C, drawing ${Math.round(s.nodePowerW)} W.`),
        power,
        infra: [],
        apps,
        past,
        fore,
        breachH: breachMin == null ? null : breachMin / 60, // keep the existing hours-based formatting
      } as Hall)
    }
    return out
  }, [dcs, racks, servers, history])

  return { floors, ready: dcReady && rackReady && serverReady }
}
```

This hook typechecks against the current `@mesa/bindings` and `spacetimedb/react` with the console's TypeScript settings (checked with `hum` and `pue` made optional).

## 5. Component changes

| File | Change |
|---|---|
| `views/floor-view.tsx` | Use `useLiveFloors({ withHistory: true })` instead of `FLOORS`; show a skeleton until `ready`; open on the hall with the highest `risk`. Remove the "Sample" badge from the chart |
| `components/floor/data.ts` | Keep the types and helpers; make `hum` and `pue` optional; move the sample `FLOORS` out (or keep it behind a "demo data" toggle that is labeled as such) |
| `components/floor/floor-scene.tsx` | Floors 1–4 now have 4 halls each. Lay them out 2 × 2, or keep the 8-slot grid with 4 empty slots. Use the hall label from section 3 |
| `components/floor/temp-chart.tsx` | X axis in minutes (−15 to +15) instead of hours; limit line at `GPU_CRIT_C`; title "GPU temperature (hottest in rack)"; dashed line labeled "trend" |
| `components/floor/kpi-tiles.tsx` | IT load from the sum of `powerKw`; next breach in minutes |
| `components/floor/hall-panel.tsx` | Hide Humidity and PUE when missing; rename "Inlet temperature"; Infra tab shows "No live data for cooling yet"; Apps shows running jobs with "est." usage |
| Footer or About | Credit: "Telemetry: ClusterWise (OLCF Summit), CC BY 4.0" |

## 6. Rules

- **No sample values next to live ones.** Anything not in the data is hidden or marked, never filled with made-up numbers.
- **Label derived values:** usage % is estimated from power draw, and the trend line is a straight-line fit.
- The console stays read-only for telemetry. Do not call `ingest_readings`; only the replayer's identity may stream.
- Follow `AGENTS.md`: ask before committing, no Co-Authored-By lines, PR description with what, changes, testing and what's left.

## 7. Done when

- [ ] The 3D floor shows 4 floors (regions) with 4 racks each, colored live by GPU temperature
- [ ] Values change about every 10 seconds without a reload, on two browsers at once
- [ ] The chart shows the last 15 minutes and a 15-minute trend for the selected rack
- [ ] KPI tiles show live total power and the next predicted breach
- [ ] Humidity, PUE and cooling are hidden or marked as not available; nothing shows sample numbers
- [ ] The dataset credit is visible
- [ ] `pnpm --filter @mesa/console typecheck` and `build` pass

## Prompt for your coding agent

> "Read `docs/UI-LIVE-DATA.md` and `AGENTS.md`. On branch `feat/UI` in `apps/console`, add `components/floor/use-live-floors.ts` from section 4 and wire it into the floor view as described in section 5, replacing the sample `FLOORS` data. Follow the mapping and rules in sections 3 and 6: hide humidity, PUE and cooling, relabel inlet temperature as GPU temperature, and use minutes on the chart. Typecheck and build, then show me the result in a browser against `VITE_SPACETIME_URI=wss://maincloud.spacetimedb.com` and `VITE_SPACETIME_DB=hackutd2026-0nef9` before committing."
