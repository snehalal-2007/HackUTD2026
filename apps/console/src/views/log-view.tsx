import { useState } from 'react'
import { useSpacetimeDB } from 'spacetimedb/react'
import { ChevronLeftIcon, ChevronRightIcon, ShieldAlertIcon, ShieldCheckIcon, TableIcon } from 'lucide-react'
import { Badge } from '@/components/reui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { EventTimeline } from '@/components/log/event-timeline'
import { FeedHealth } from '@/components/log/feed-health'
import { IncidentList } from '@/components/log/incident-list'
import { useLogData } from '@/components/log/use-log-data'
import { verifyChain, type ChainResult } from '@/lib/event-chain'
import { ago, useNow } from '@/lib/snapshot'
import { useArrivals } from '@/lib/use-arrivals'

const TIMELINE_PAGE = 12

// Layout: on desktop (lg) the view fits the window and each panel scrolls inside itself,
// so the page never grows. On narrow screens it is one ordinary vertical scroll.
export function LogView({ onViewAll }: { onViewAll: () => void }) {
  const { data, cached, savedAt, live, ready } = useLogData()
  const conn = useSpacetimeDB()
  const now = useNow()
  const [filter, setFilter] = useState<'active' | 'all'>('active')
  const [page, setPage] = useState(0) // 0 = newest
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

  const incidents = filter === 'active' ? data.incidents.filter(i => i.status !== 'closed') : data.incidents
  const activeCount = data.incidents.filter(i => i.status !== 'closed').length
  const pages = Math.max(1, Math.ceil(data.events.length / TIMELINE_PAGE))
  const current = Math.min(page, pages - 1)
  const pageEvents = data.events.slice(current * TIMELINE_PAGE, (current + 1) * TIMELINE_PAGE)

  return (
    <div className="min-h-0 flex-1 overflow-y-auto lg:overflow-hidden">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-4 px-4 py-4 lg:h-full">
        {cached && (
          <div className="flex shrink-0 items-center gap-2 text-xs text-muted-foreground" role="status">
            <Badge variant="warning" size="sm">Cached</Badge>
            <span>
              {conn.connectionError ? 'Live connection unavailable. ' : 'Connecting. '}
              Showing data saved {savedAt ? ago(savedAt, now) : 'earlier'}.
            </span>
          </div>
        )}

        <section aria-labelledby="feeds" className="flex shrink-0 flex-col gap-2">
          <h2 id="feeds" className="text-sm font-medium">Telemetry feeds</h2>
          <FeedHealth feeds={data.feeds} now={now} cached={cached} />
        </section>

        <div className="grid gap-4 lg:min-h-0 lg:flex-1 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <section aria-labelledby="incidents" className="flex flex-col gap-2 lg:min-h-0">
            <div className="flex shrink-0 flex-wrap items-center gap-2">
              <h2 id="incidents" className="text-sm font-medium">Incidents</h2>
              <span className="text-xs text-muted-foreground">{activeCount} active of {data.incidents.length}</span>
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
              <span className="text-xs text-muted-foreground">{data.events.length.toLocaleString()} events</span>
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
              {data.events.length > TIMELINE_PAGE && (
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
