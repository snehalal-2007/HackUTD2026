import { useState } from 'react'
import { useSpacetimeDB } from 'spacetimedb/react'
import { ChevronLeftIcon, ChevronRightIcon, ShieldAlertIcon, ShieldCheckIcon, TableIcon } from 'lucide-react'
import { Badge } from '@/components/reui/badge'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { Skeleton } from '@/components/ui/skeleton'
import { EventTimeline, RecentSummary } from '@/components/log/event-timeline'
import { PlacesPanel, type Focus } from '@/components/log/places-panel'
import { PlaceDetail } from '@/components/log/place-detail'
import { PageActions } from '@/components/shell/page-actions'
import { useLiveSites } from '@/components/floor/use-live-floors'
import { useLogData } from '@/components/log/use-log-data'
import { verifyChain, type ChainResult } from '@/lib/event-chain'
import { ago, useNow } from '@/lib/snapshot'
import { useArrivals } from '@/lib/use-arrivals'
import { SITES } from '@/components/floor/data'
import { PLACE } from '@/components/floor/names'

const TIMELINE_PAGE = 12
const RECENT = 5 // newest events summarised at the top of the event log

// Layout: on desktop (lg) the view fits the window and each panel scrolls inside itself,
// so the page never grows. On narrow screens it is one ordinary vertical scroll.
export function LogView({ onViewAll }: { onViewAll: () => void }) {
  const { data, cached, savedAt, live, ready } = useLogData()
  const conn = useSpacetimeDB()
  const now = useNow()
  const [filter, setFilter] = useState<'active' | 'all'>('active')
  const [sitesSel, setSitesSel] = useState<string[]>([SITES[0].id]) // locations picked (the first one to start); none = every location
  const [page, setPage] = useState(0) // 0 = newest
  const [picked, setPicked] = useState<Focus>(null) // a floor or block clicked in the left column
  const { sites } = useLiveSites({ withHistory: false })
  const [check, setCheck] = useState<(ChainResult & { at: number }) | null>(null)
  // Track arrivals across all events (not just the visible page) so paging never animates.
  const freshEvents = useArrivals(data?.events.map(e => e.seq) ?? [], ready && !cached)

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
  const floorsSel: number[] = [] // floors are picked in the left column now, not in the filter
  const shownFeeds = inSite.filter(f => !floorsSel.length || floorsSel.includes(PLACE.get(f.id)?.floor ?? 0))
  // Location buttons toggle, but the last picked location can't be unpicked: there's always at least one.
  const toggle = <T,>(list: T[], v: T) => (list.includes(v) ? list.filter(x => x !== v) : [...list, v])
  const changed = () => { setPicked(null); setPage(0) }
  const pick = (on: boolean) =>
    cn('flex h-9 items-center gap-1.5 rounded-lg px-3.5 text-[14px] font-medium whitespace-nowrap transition-colors', on ? 'bg-card text-foreground shadow-sm ring-1 ring-border' : 'text-muted-foreground hover:bg-card/60 hover:text-foreground')
  // The location + floor filter applies to the whole page: feeds, incidents and the event log.
  const filtering = sitesSel.length > 0 || floorsSel.length > 0
  const here = (dc: string) =>
    !filtering || (!!dc && (!sitesSel.length || sitesSel.includes(siteOf(dc))) && (!floorsSel.length || floorsSel.includes(PLACE.get(dc)?.floor ?? 0)))
  // The middle column always shows a place: the floor or block clicked on the left, or, until one is clicked (or if
  // the filter no longer includes it), the first floor of the selection.
  const firstSite = SITES.find(x => !sitesSel.length || sitesSel.includes(x.id)) ?? SITES[0]
  const firstFloor = (floorsSel.length ? [...floorsSel].sort((a, b) => a - b)[0] : 1)
  const firstDc = firstSite.floors[firstFloor - 1]?.[0] ?? firstSite.floors[0][0]
  const focus: NonNullable<Focus> =
    picked && here(picked.dc) ? picked : { kind: 'floor', dc: firstDc, label: `${firstSite.name} · Floor ${PLACE.get(firstDc)?.floor ?? 1}` }
  // The picked floor or block narrows the incidents and events (a block = its rack's incidents and their events).
  const inFocus = (x: { dcId: string; rackId: string }) =>
    focus.kind === 'floor' ? x.dcId === focus.dc : x.rackId === focus.rackId
  const placeIncidents = data.incidents.filter(i => here(i.dcId) && inFocus(i))
  const placeEvents = data.events.filter(e => here(e.dcId) && inFocus(e))
  const incidents = filter === 'active' ? placeIncidents.filter(i => i.status !== 'closed') : placeIncidents
  const activeCount = placeIncidents.filter(i => i.status !== 'closed').length
  const recent = placeEvents.slice(0, RECENT)
  const earlier = placeEvents.slice(RECENT) // the long list starts after the summary, so nothing shows twice
  const pages = Math.max(1, Math.ceil(earlier.length / TIMELINE_PAGE))
  const current = Math.min(page, pages - 1)
  const pageEvents = earlier.slice(current * TIMELINE_PAGE, (current + 1) * TIMELINE_PAGE)

  return (
    <div className="min-h-0 flex-1 overflow-y-auto lg:overflow-hidden">
      <PageActions>
            <div className="flex items-center gap-1" role="group" aria-label="Filter by location">
              <span className="mr-1.5 text-[13px] font-semibold">Location</span>
              {siteTabs.map(t => (
                <button key={t.id} type="button" aria-pressed={sitesSel.includes(t.id)} onClick={() => { setSitesSel(l => (l.length === 1 && l[0] === t.id ? l : toggle(l, t.id))); changed() }} className={cn(pick(sitesSel.includes(t.id)), 'h-8')}>
                  {t.label}
                  <span className="text-[13px] text-muted-foreground tabular-nums">{t.count}</span>
                  {t.silent > 0 && <Badge variant="destructive-light" size="sm">{t.silent} silent</Badge>}
                </button>
              ))}
            </div>
      </PageActions>
      {/* same edges as the Floor page. The event log runs the full height on the right; the filter sits above the other two. */}
      <div className="grid w-full gap-3.5 p-3.5 lg:h-full lg:grid-cols-[280px_minmax(0,1fr)_minmax(0,1fr)] lg:grid-rows-[auto_minmax(0,1fr)]">

        <div className="flex shrink-0 flex-wrap items-center gap-x-6 gap-y-2 lg:col-span-2 lg:col-start-1 lg:row-start-1" aria-label="Filter the log by location">
        {cached && (
          <div className="flex shrink-0 items-center gap-2 text-xs text-muted-foreground" role="status">
            <Badge variant="warning" size="sm">Cached</Badge>
            <span>
              {conn.connectionError ? 'Live connection unavailable. ' : 'Connecting. '}
              Showing data saved {savedAt ? ago(savedAt, now) : 'earlier'}.
            </span>
          </div>
        )}
          </div>
          {/* left: places to pick (floors, blocks) with their feed status */}
          <section aria-labelledby="places" className="flex flex-col gap-2 lg:col-start-1 lg:row-start-2 lg:min-h-0">
            <div className="flex shrink-0 flex-wrap items-baseline gap-2">
              <h2 id="places" className="text-sm font-medium">{sitesSel.length && floorsSel.length ? 'Blocks' : sitesSel.length ? 'Floors and blocks' : 'Floors'}</h2>
              <span className="text-xs text-muted-foreground">{shownFeeds.filter(f => !f.stale).length} of {shownFeeds.length} feeds live</span>
            </div>
            <div className="no-scrollbar -m-[3px] p-[3px] lg:min-h-0 lg:flex-1 lg:overflow-y-auto"> {/* 3px of room so the selected floor's outline isn't clipped by the scroll edge */}
              <PlacesPanel sitesSel={sitesSel} floorsSel={floorsSel} sites={sites} feeds={data.feeds} incidents={data.incidents} focus={focus} onFocus={f => { setPicked(f); setPage(0) }} now={now} />
            </div>
          </section>

          <section aria-labelledby="incidents" className="flex flex-col gap-2 lg:col-start-2 lg:row-start-2 lg:min-h-0">
            <div className="flex shrink-0 flex-wrap items-center gap-2">
              <h2 id="incidents" className="text-sm font-medium">Details</h2>
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
              <PlaceDetail
                focus={focus}
                halls={(() => { const p = PLACE.get(focus.dc); return p ? (sites[p.site]?.[p.floor - 1] ?? []) : [] })()}
                feed={data.feeds.find(f => f.id === focus.dc)}
                incidents={incidents}
                onFocus={f => { setPicked(f); setPage(0) }}
                now={now}
              />
            </div>
          </section>

          <section aria-labelledby="events" className="flex flex-col rounded-lg border bg-card lg:col-start-3 lg:row-span-2 lg:row-start-1 lg:min-h-0">
            <div className="flex shrink-0 flex-wrap items-center gap-2 border-b px-4 py-3">
              <h2 id="events" className="text-[15px] font-semibold">Event log</h2>
              <span className="text-xs text-muted-foreground">{placeEvents.length.toLocaleString()} events here</span>
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
                <Button size="xs" variant="outline" onClick={onViewAll} title="Every event with its number and hash, as a table">
                  <TableIcon aria-hidden="true" />
                  Table view
                </Button>
              </div>
            </div>
            {check && (
              <Badge key={check.at} variant={check.ok ? 'success-light' : 'destructive-light'} className="enter-pop mx-4 mt-3 shrink-0 self-start" role="status">
                {check.ok ? <ShieldCheckIcon aria-hidden="true" /> : <ShieldAlertIcon aria-hidden="true" />}
                {check.ok
                  ? `Chain intact: ${check.count.toLocaleString()} events verified`
                  : `Chain broken at event #${check.brokenAt}: it ${check.reason}`}
              </Badge>
            )}
            <div className="flex flex-col lg:min-h-0 lg:flex-1">
              <div className="px-4 py-4 lg:min-h-0 lg:flex-1 lg:overflow-y-auto">
                {!placeEvents.length ? (
                  <p className="px-2 text-sm text-muted-foreground">No events here yet. Every rule decision, claim and report is recorded in this log.</p>
                ) : (
                  <>
                    <div className="rounded-md bg-muted/60 px-3.5 py-3">
                      <h3 className="mb-2 text-[12px] font-semibold tracking-[.06em] text-muted-foreground uppercase">Latest</h3>
                      <RecentSummary events={recent} now={now} />
                    </div>
                    {earlier.length > 0 && (
                      <>
                        <h3 className="mt-5 mb-3 px-2 text-[12px] font-semibold tracking-[.06em] text-muted-foreground uppercase">Earlier</h3>
                        <div className="px-2"><EventTimeline events={pageEvents} fresh={freshEvents} /></div>
                      </>
                    )}
                  </>
                )}
              </div>
              {earlier.length > TIMELINE_PAGE && (
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
  )
}
