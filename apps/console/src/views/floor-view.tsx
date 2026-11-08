import { useState } from 'react'
import { CREDIT, GPU_CRIT_C, GPU_WARN_C, SITES, floorTotals, hotOn, worstOf, type Hall, type Site, type TabId } from '@/components/floor/data'
import { FloorSceneTile } from '@/components/floor/floor-scene'
import { HallPanel } from '@/components/floor/hall-panel'
import { SitesMap, type SitePin } from '@/components/floor/sites-map'
import { ChartKey, TempChart } from '@/components/floor/temp-chart'
import { useLiveSites, type SiteFloors } from '@/components/floor/use-live-floors'

// Live from SpacetimeDB telemetry (docs/UI-LIVE-DATA.md): one NMC² site at a time in 3D; the small map tile switches sites.
export function FloorView() {
  const { sites, ready } = useLiveSites({ withHistory: true })
  const [siteId, setSiteId] = useState(SITES[0].id)
  const site = SITES.find(s => s.id === siteId) ?? SITES[0]
  const pins = SITES.map(s => {
    const halls = (sites[s.id] ?? []).flat()
    return { site: s, status: worstOf(halls), hot: hotOn(halls) }
  })
  // key: switching site resets its floor, selection and tab
  return <SiteView key={site.id} site={site} floors={sites[site.id] ?? []} ready={ready} pins={pins} onSite={setSiteId} />
}

function SiteView({ site, floors, ready, pins, onSite }: { site: Site; floors: SiteFloors[string]; ready: boolean; pins: SitePin[]; onSite: (id: string) => void }) {
  const [floor, setFloor] = useState(1)
  const [picked, setPicked] = useState<string | null>(null)
  const [tab, setTab] = useState<TabId>('overview')
  const halls = floors[floor - 1] ?? []
  const hall = halls.find(h => h.id === picked) ?? halls[0] // halls are sorted A1, A2, …: the first is the top-left block
  if (picked === null && hall) setPicked(hall.id) // every floor opens on its top-left block, and stays put as live data updates

  function changeFloor(f: number) {
    if (f === floor) return
    setFloor(f)
    setPicked(null) // open the new floor on its top-left block
  }

  return (
    <div className="grid min-h-0 flex-1 gap-3.5 overflow-auto p-3.5 lg:grid-cols-[minmax(0,1fr)_460px] lg:grid-rows-[minmax(0,1fr)_280px] lg:overflow-hidden">
      {/* top left: the 3D floor */}
      <div className="h-[460px] lg:col-start-1 lg:row-start-1 lg:h-auto">
        <FloorSceneTile site={site} floor={floor} floors={floors} halls={halls} selected={hall?.id ?? ''} onFloor={changeFloor} onSelect={setPicked} />
      </div>

      {/* top right: the selected block's details */}
      <div className="min-h-[520px] lg:col-start-2 lg:row-start-1 lg:min-h-0">
        {hall ? (
          <HallPanel hall={hall} siteName={site.name} floor={floor} tab={tab} onTab={setTab} />
        ) : (
          <div className="grid h-full place-items-center rounded-lg bg-card p-6 text-center text-[15px] text-muted-foreground">
            {ready ? 'No racks on this floor yet.' : 'Connecting to live telemetry…'}
          </div>
        )}
      </div>

      {/* bottom row, both columns: a compact map with this floor's totals, then the chart filling the rest */}
      <div className="grid min-w-0 gap-3.5 lg:col-span-2 lg:row-start-2 lg:grid-cols-[480px_minmax(0,1fr)]">
      <section className="grid min-h-[260px] min-w-0 gap-4 rounded-lg bg-card px-4 py-3.5 sm:grid-cols-[minmax(0,1fr)_170px]" aria-label="Location">
        <div className="flex min-h-[200px] min-w-0 flex-col">
          <div className="flex items-baseline justify-between gap-2">
            <h3 className="text-[15.5px] font-semibold">Location</h3>
            <span className="text-[12.5px] text-muted-foreground">Click a site</span>
          </div>
          <div className="relative my-1 min-h-0 flex-1">
            <div className="absolute inset-0"><SitesMap compact pins={pins} selected={site.id} onOpen={onSite} /></div> {/* fills the space left between title and footer, never grows the row */}
          </div>
          <div className="flex items-baseline justify-between gap-2" title={site.note}>
            <span className="truncate text-[14.5px] font-semibold">{site.name}<span className="ml-1.5 font-normal text-muted-foreground">{site.place}</span></span>
          </div>
        </div>
        <FloorTotals halls={halls} floor={floor} />
      </section>

      {/* the selected block's temperature */}
      <section className="flex min-w-0 flex-col rounded-lg bg-card px-5 py-3.5" aria-label="GPU temperature">
        <div className="mb-2 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
          <h3 className="text-[15.5px] font-semibold">Hottest GPU{hall ? ` · Block ${hall.tag}` : ''}</h3>
          <ChartKey />
        </div>
        {hall ? <TempChart hall={hall} height={170} /> : <p className="py-8 text-[15px] text-muted-foreground">{ready ? `No racks report from Floor ${floor} yet.` : 'Waiting for telemetry…'}</p>}
        <p className="mt-auto pt-1 text-[12px] text-muted-foreground">{CREDIT} · trend is a straight-line fit; warns at {GPU_CRIT_C} °C</p>
      </section>
      </div>
    </div>
  )
}

/** This floor's live totals, stacked beside the map (they used to be three tiles beside the 3D view). */
function FloorTotals({ halls, floor }: { halls: Hall[]; floor: number }) {
  const t = floorTotals(halls)
  const empty = !halls.length
  const rows = [
    { k: 'Floor power', v: empty ? '—' : t.loadKW.toFixed(1), u: empty ? '' : 'kW' },
    { k: `Servers ≥ ${GPU_WARN_C} °C`, v: empty ? '—' : String(t.hot), u: empty ? '' : `of ${t.servers}` },
    { k: 'Hottest GPU', v: empty ? '—' : t.maxTemp.toFixed(1), u: empty ? '' : '°C' },
  ]
  return (
    <dl className="flex flex-col justify-center gap-2 border-t pt-3 sm:border-t-0 sm:border-l sm:pt-0 sm:pl-4" aria-label={`Floor ${floor} totals`}>
      <span className="text-[12.5px] text-muted-foreground">Floor {floor} now</span>
      {rows.map(x => (
        <div key={x.k} className="rounded-md bg-muted px-3 py-2">
          <dt className="text-[12.5px] text-muted-foreground">{x.k}</dt>
          <dd className="text-xl font-semibold tabular-nums">
            {x.v}
            {x.u && <span className="ml-1 text-[13px] font-normal text-muted-foreground">{x.u}</span>}
          </dd>
        </div>
      ))}
    </dl>
  )
}
