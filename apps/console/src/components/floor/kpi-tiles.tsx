import type { ReactNode } from 'react'
import { GPU_WARN_C, floorTotals, type Hall } from './data'

/** Compact floor totals stacked down the right edge of the 3D tile (live), with a last tile for extra content (the site map). */
export function KpiTiles({ halls, children }: { halls: Hall[]; children?: ReactNode }) {
  const t = floorTotals(halls)
  const empty = !halls.length
  const tiles = [
    { k: 'Floor power', v: empty ? '—' : t.loadKW.toFixed(1), u: empty ? '' : 'kW' },
    { k: `Servers ≥ ${GPU_WARN_C} °C`, v: empty ? '—' : String(t.hot), u: empty ? '' : `of ${t.servers}` },
    { k: 'Hottest GPU', v: empty ? '—' : t.maxTemp.toFixed(1), u: empty ? '' : '°C' },
  ]
  return (
    <div className="flex h-full min-h-0 flex-col gap-2.5">
      {tiles.map(x => (
        <div key={x.k} className="flex min-h-0 flex-1 flex-col items-center justify-center gap-1.5 rounded-lg bg-card px-2 py-2.5 text-center">
          <span className="text-[12.5px] text-muted-foreground">{x.k}</span>
          <span className="text-xl font-semibold tabular-nums">
            {x.v}
            {x.u && <span className="ml-1 text-[13px] font-normal text-muted-foreground">{x.u}</span>}
          </span>
        </div>
      ))}
      {children}
    </div>
  )
}
