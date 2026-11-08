import { cn } from '@/lib/utils'
import { fmtHours, floorTotals, type Hall } from './data'

/** Four compact floor totals stacked down the right edge of the 3D tile. */
export function KpiTiles({ halls }: { halls: Hall[] }) {
  const t = floorTotals(halls)
  const tiles = [
    { k: 'IT load', v: t.loadMW.toFixed(2), u: 'MW' },
    { k: 'Open issues', v: String(t.issues), u: '' },
    { k: 'Avg inlet', v: t.avgTemp.toFixed(1), u: '°C' },
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
      <div className={cn('flex min-h-0 flex-1 flex-col items-center justify-center gap-1.5 rounded-lg px-2 py-2.5 text-center', 'bg-[#18181b] text-white dark:bg-[#f4f4f5] dark:text-[#18181b]')}>
        <span className="text-[12.5px] opacity-70">Next breach</span>
        {t.next ? (
          <span className="text-xl font-semibold tabular-nums">
            {t.next.id}
            <span className="ml-1 text-[13px] font-normal opacity-70">{fmtHours(t.next.breachH!)}</span>
          </span>
        ) : (
          <span className="text-base font-semibold whitespace-nowrap">None expected</span>
        )}
      </div>
    </div>
  )
}
