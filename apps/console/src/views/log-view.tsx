import { useState } from 'react'
import { useSpacetimeDB } from 'spacetimedb/react'
import { ChevronLeftIcon, ChevronRightIcon, ShieldAlertIcon, ShieldCheckIcon, TableIcon } from 'lucide-react'
import { Badge } from '@/components/reui/badge'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { Skeleton } from '@/components/ui/skeleton'
import { EventTimeline } from '@/components/log/event-timeline'
import { PlacesPanel, type Focus } from '@/components/log/places-panel'
import { useLiveSites } from '@/components/floor/use-live-floors'
import { IncidentList } from '@/components/log/incident-list'
import { useLogData } from '@/components/log/use-log-data'
import { verifyChain, type ChainResult } from '@/lib/event-chain'
import { ago, useNow } from '@/lib/snapshot'
import { useArrivals } from '@/lib/use-arrivals'
import { SITES } from '@/components/floor/data'
import { PLACE } from '@/components/floor/names'

const TIMELINE_PAGE = 12

// Layout: on desktop (lg) the view fits the window and each panel scrolls inside itself,
// so the page never grows. On narrow screens it is one ordinary vertical scroll.
export function LogView({ onViewAll }: { onViewAll: () => void }) {
  const { data, cached, savedAt, live, ready } = useLogData()
  const conn = useSpacetimeDB()
  const now = useNow()
  const [filter, setFilter] = useState<'active' | 'all'>('active')
  const [sitesSel, setSitesSel] = useState<string[]>([]) // locations picked; none = every location
  const [floorsPick, setFloorsPick] = useState<number[]>([]) // floors picked; none = every floor
  const [page, setPage] = useState(0) // 0 = newest
  const [focus, setFocus] = useState<Focus>(null) // a floor or block picked in the left column
  const { sites } = useLiveSites({ withHistory: false })
  const [check, setCheck] = useState<(ChainResult & { at: number }) | null>(null)
  // Track arrivals across all events (not just the visible page) so paging never animates.
  const freshEvents = useArrivals(data?.events.map(e => e.seq) ?? [], ready && !cached)
  const newIncidents = useArrivals(data?.incidents.map(i => i.id) ?? [], ready && !cached)
  const changedIncidents = useArrivals(data?.incidents.map(i => `${i.id}:${i.status}:${i.severity}`) ?? [], ready && !cached)

  if (!data) {
    return (
      <div className="flex flex-col gap-3 p-4" aria-busy="true">
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    )
  }

  // Feeds by location: a site's feeds are its floors, so once a site is picked each card just says "Floor N".
  const siteOf = (dc: string) => PLACE.get(dc)?.site ?? 'other'
  const siteTabs = SITES.map(s => {
    const fs = data.feeds.filter(f => siteOf(f.id) === s.id)
    return { id: s.id, label: s.name, count: fs.length, silent: fs.filter(f => f.stale).length }
  })
  const inSite = sitesSel.length ? data.feeds.filter(f => sitesSel.includes(siteOf(f.id))) : data.feeds
  const floorNums = [...new Set(inSite.map(f => PLACE.get(f.id)?.floor ?? 0))].filter(Boolean).sort((a, b) => a - b)
  const floorsSel = floorsPick.filter(n => floorNums.includes(n)) // floors the picked locations don't have drop out
  const shownFeeds = inSite.filter(f => !floorsSel.length || floorsSel.includes(PLACE.get(f.id)?.floor ?? 0))
  const toggle = <T,>(list: T[], v: T) => (list.includes(v) ? list.filter(x => x !== v) : [...list, v])
  const changed = () => { setFocus(null); setPage(0) }
  const pick = (on: boolean) =>
    cn('flex h-9 items-center gap-1.5 rounded-lg px-3.5 text-[14px] font-medium whitespace-nowrap transition-colors', on ? 'bg-card text-foreground shadow-sm ring-1 ring-border' : 'text-muted-foreground hover:bg-card/60 hover:text-foreground')
  // The location + floor filter applies to the whole page: feeds, incidents and the event log.
  const filtering = sitesSel.length > 0 || floorsSel.length > 0
  const here = (dc: string) =>
    !filtering || (!!dc && (!sitesSel.length || sitesSel.includes(siteOf(dc))) && (!floorsSel.length || floorsSel.includes(PLACE.get(dc)?.floor ?? 0)))
  // A floor or block picked on the left narrows further (a block = its rack's incidents and their events).
  const inFocus = (x: { dcId: string; rackId: string }) =>
    !focus || (focus.kind === 'floor' ? x.dcId === focus.dc : x.rackId === focus.rackId)
  const placeIncidents = data.incidents.filter(i => here(i.dcId) && inFocus(i))
  const placeEvents = data.events.filter(e => here(e.dcId) && inFocus(e))
  const incidents = filter === 'active' ? placeIncidents.filter(i => i.status !== 'closed') : placeIncidents
  const activeCount = placeIncidents.filter(i => i.status !== 'closed').length
  const pages = Math.max(1, Math.ceil(placeEvents.length / TIMELINE_PAGE))
  const current = Math.min(page, pages - 1)
  const pageEvents = placeEvents.slice(current * TIMELINE_PAGE, (current + 1) * TIMELINE_PAGE)

  return (
    <div className="min-h-0 flex-1 overflow-y-auto lg:overflow-hidden">
      <div className="flex w-full flex-col gap-3.5 p-3.5 lg:h-full"> {/* same edges as the Floor page */}
        {cached && (
          <div className="flex shrink-0 items-center gap-2 text-xs text-muted-foreground" role="status">
            <Badge variant="warning" size="sm">Cached</Badge>
            <span>
              {conn.connectionError ? 'Live connection unavailable. ' : 'Connecting. '}
              Showing data saved {savedAt ? ago(savedAt, now) : 'earlier'}.
            </span>
          </div>
        )}

        <div className="flex shrink-0 flex-wrap items-center gap-x-6 gap-y-2" aria-label="Filter the log by location">
            <div className="flex flex-wrap items-center gap-1" role="group" aria-label="Filter by location">
              <span className="mr-1.5 text-[13.5px] font-semibold">Location</span>
              {siteTabs.map(t => (
                <button key={t.id} type="button" aria-pressed={sitesSel.includes(t.id)} onClick={() => { setSitesSel(l => toggle(l, t.id)); changed() }} className={pick(sitesSel.includes(t.id))}>
                  {t.label}
                  <span className="text-[13px] text-muted-foreground tabular-nums">{t.count}</span>
                  {t.silent > 0 && <Badge variant="destructive-light" size="sm">{t.silent} silent</Badge>}
                </button>
              ))}
            </div>
            <div className="flex flex-wrap items-center gap-1" role="group" aria-label="Filter by floor">
              <span className="mr-1.5 text-[13.5px] font-semibold">Floor</span>
              {floorNums.map(n => (
                <button key={n} type="button" aria-pressed={floorsSel.includes(n)} onClick={() => { setFloorsPick(l => toggle(l, n)); changed() }} className={cn(pick(floorsSel.includes(n)), 'min-w-9 justify-center')}>{n}</button>
              ))}
            </div>
            {filtering && (
              <button type="button" onClick={() => { setSitesSel([]); setFloorsPick([]); changed() }} className="text-[13px] font-medium text-muted-foreground underline-offset-4 hover:text-foreground hover:underline">
                Clear filters
              </button>
            )}
            {!filtering && <span className="text-[12.5px] text-muted-foreground">Showing everything · pick one or more</span>}
          </div>
        <div className="grid gap-3.5 lg:min-h-0 lg:flex-1 lg:grid-cols-[280px_minmax(0,1fr)_minmax(0,1fr)]">
          {/* left: places to pick (floors, blocks) with their feed status */}
          <section aria-labelledby="places" className="flex flex-col gap-2 lg:min-h-0">
            <div className="flex shrink-0 flex-wrap items-baseline gap-2">
              <h2 id="places" className="text-sm font-medium">{sitesSel.length && floorsSel.length ? 'Blocks' : sitesSel.length ? 'Floors and blocks' : 'Floors'}</h2>
              <span className="text-xs text-muted-foreground">{shownFeeds.filter(f => !f.stale).length} of {shownFeeds.length} feeds live</span>
            </div>
            <div className="rounded-lg bg-card p-2 lg:min-h-0 lg:flex-1 lg:overflow-y-auto">
              <PlacesPanel sitesSel={sitesSel} floorsSel={floorsSel} sites={sites} feeds={data.feeds} incidents={data.incidents} focus={focus} onFocus={f => { setFocus(f); setPage(0) }} now={now} />
            </div>
          </section>

          <section aria-labelledby="incidents" className="flex flex-col gap-2 lg:min-h-0">
            <div className="flex shrink-0 flex-wrap items-center gap-2">
              <h2 id="incidents" className="text-sm font-medium">Incidents</h2>
              {focus && (
                <button type="button" onClick={() => setFocus(null)} className="inline-flex items-center gap-1 rounded-full bg-foreground px-2.5 py-0.5 text-[12px] font-medium text-background" title="Show the whole selection again">
                  {focus.label} <span aria-hidden="true">×</span>
                </button>
              )}
              <span className="text-xs text-muted-foreground">{activeCount} active of {placeIncidents.length}</span>
              <div className="ml-auto flex gap-1" role="group" aria-label="Filter incidents">
                <Button size="xs" variant={filter === 'active' ? 'secondary' : 'ghost'} aria-pressed={filter === 'active'} onClick={() => setFilter('active')}>
                  Active
                </Button>
                <Button size="xs" variant={filter === 'all' ? 'secondary' : 'ghost'} aria-pressed={filter === 'all'} onClick={() => setFilter('all')}>
                  All
                </Button>
              </div>
            </div>
            <div className="lg:min-h-0 lg:flex-1 lg:overflow-y-auto">
              <IncidentList incidents={incidents} now={now} newRows={newIncidents} changed={changedIncidents} />
            </div>
          </section>

          <section aria-labelledby="events" className="flex flex-col gap-2 lg:min-h-0">
            <div className="flex shrink-0 flex-wrap items-center gap-2">
              <h2 id="events" className="text-sm font-medium">Event log</h2>
              <span className="text-xs text-muted-foreground">{placeEvents.length.toLocaleString()} events{filtering || focus ? ' here' : ''}</span>
              <div className="ml-auto flex gap-1">
                <Button
                  size="xs"
                  variant="outline"
                  disabled={!ready}
                  title={ready ? 'Recompute every hash in the chain' : 'Available once live data has loaded'}
                  onClick={() => setCheck({ ...verifyChain(live.events), at: Date.now() })}
                >
                  Verify chain
                </Button>
                <Button size="xs" variant="outline" onClick={onViewAll}>
                  <TableIcon aria-hidden="true" />
                  View all
                </Button>
              </div>
            </div>
            {check && (
              <Badge key={check.at} variant={check.ok ? 'success-light' : 'destructive-light'} className="enter-pop shrink-0 self-start" role="status">
                {check.ok ? <ShieldCheckIcon aria-hidden="true" /> : <ShieldAlertIcon aria-hidden="true" />}
                {check.ok
                  ? `Chain intact: ${check.count.toLocaleString()} events verified`
                  : `Chain broken at event #${check.brokenAt}: it ${check.reason}`}
              </Badge>
            )}
            <div className="flex flex-col rounded-lg border bg-card lg:min-h-0 lg:flex-1">
              <div className="px-6 py-4 lg:min-h-0 lg:flex-1 lg:overflow-y-auto">
                <EventTimeline events={pageEvents} fresh={freshEvents} />
              </div>
              {placeEvents.length > TIMELINE_PAGE && (
                <nav className="flex shrink-0 items-center gap-2 border-t px-3 py-2" aria-label="Event log pages">
                  <Button size="xs" variant="ghost" disabled={current === 0} onClick={() => setPage(current - 1)}>
                    <ChevronLeftIcon aria-hidden="true" />
                    Newer
                  </Button>
                  <span className="mx-auto text-xs text-muted-foreground tabular-nums">
                    Page {current + 1} of {pages}
                  </span>
                  <Button size="xs" variant="ghost" disabled={current >= pages - 1} onClick={() => setPage(current + 1)}>
                    Older
                    <ChevronRightIcon aria-hidden="true" />
                  </Button>
                </nav>
              )}
            </div>
          </section>
        </div>
      </div>
    </div>
  )
}
