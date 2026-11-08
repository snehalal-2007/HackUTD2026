import { useState } from 'react'
import { Badge } from '@/components/reui/badge'
import { FLOORS, mostUrgent, type TabId } from '@/components/floor/data'
import { FloorSceneTile } from '@/components/floor/floor-scene'
import { HallPanel } from '@/components/floor/hall-panel'
import { KpiTiles } from '@/components/floor/kpi-tiles'
import { ChartKey, TempChart } from '@/components/floor/temp-chart'

// Floor overview, ported from docs/prototype.html: 3D floor | floor totals | hall details, chart along the bottom.
// The data is sample data (components/floor/data.ts) until the module exposes assets, readings and alerts.
export function FloorView() {
  const [floor, setFloor] = useState(3)
  const [selected, setSelected] = useState(() => mostUrgent(FLOORS[3]).id)
  const [tab, setTab] = useState<TabId>('overview')
  const halls = FLOORS[floor]
  const hall = halls.find(h => h.id === selected) ?? halls[0]

  function changeFloor(f: number) {
    if (f === floor) return
    setFloor(f)
    setSelected(mostUrgent(FLOORS[f]).id) // open on the floor's most urgent hall
  }

  return (
    <div className="grid min-h-0 flex-1 gap-3.5 overflow-auto p-3.5 lg:grid-cols-[minmax(0,1fr)_150px_360px] lg:grid-rows-[minmax(0,1fr)_minmax(0,1fr)_268px] lg:overflow-hidden">
      <div className="h-[460px] lg:col-start-1 lg:row-span-2 lg:row-start-1 lg:h-auto">
        <FloorSceneTile floor={floor} halls={halls} selected={hall.id} onFloor={changeFloor} onSelect={setSelected} />
      </div>
      <div className="h-[340px] lg:col-start-2 lg:row-span-2 lg:row-start-1 lg:h-auto">
        <KpiTiles halls={halls} />
      </div>
      <section className="min-w-0 rounded-lg bg-card px-5.5 py-4.5 lg:col-span-2 lg:col-start-1 lg:row-start-3" aria-label="Inlet temperature">
        <div className="mb-2 flex flex-wrap items-baseline justify-between gap-3">
          <h3 className="flex items-center gap-2 text-[15.5px] font-semibold">
            Inlet temperature · Hall {hall.id}
            <Badge variant="warning-light" size="sm" title="Sample data until the predictor and telemetry are wired in">Sample</Badge>
          </h3>
          <ChartKey />
        </div>
        <TempChart hall={hall} />
      </section>
      <div className="min-h-[520px] lg:col-start-3 lg:row-span-3 lg:row-start-1 lg:min-h-0">
        <HallPanel hall={hall} floor={floor} tab={tab} onTab={setTab} />
      </div>
    </div>
  )
}
