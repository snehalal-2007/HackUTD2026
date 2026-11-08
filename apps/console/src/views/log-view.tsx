import { useState, type ReactNode } from 'react'
import { useSpacetimeDB } from 'spacetimedb/react'
import { ChevronLeftIcon, ChevronRightIcon, ExternalLinkIcon, ShieldAlertIcon, ShieldCheckIcon } from 'lucide-react'
import { Badge } from '@/components/reui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import { RecentSummary, useActorName } from '@/components/log/event-timeline'
import { EventTable } from '@/components/log/event-table'
import { PageActions } from '@/components/shell/page-actions'
import { useLogData, type EventVM } from '@/components/log/use-log-data'
import { verifyChain, type ChainResult } from '@/lib/event-chain'
import { ago, useNow } from '@/lib/snapshot'
import { useArrivals } from '@/lib/use-arrivals'
import { SITES } from '@/components/floor/data'
import { PLACE } from '@/components/floor/names'

// The Log page, top to bottom: a summary of the selected place (one sentence, four numbers, the latest events and the
// active alerts), then the event log itself as a plain list, or as a table (the optional view). Location sits in the
// header bar; a floor picker narrows it further. Events with no place (shifts, questions) always show.

const LIST_PAGE = 15
const TABLE_PAGE = 25
const SEV_RANK: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 }
const clock = (ms: number) => new Date(ms).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })

function Stat({ k, v, sub, tone }: { k: string; v: ReactNode; sub?: string; tone?: 'crit' | 'warn' }) {
  return (
    <div className="min-w-0 rounded-lg bg-muted/60 px-4 py-3">
      <div className="text-[12.5px] text-muted-foreground">{k}</div>
      <div className={cn('truncate text-2xl font-semibold tabular-nums', tone === 'crit' && 'text-destructive', tone === 'warn' && 'text-warning')}>{v}</div>
      {sub && <div className="truncate text-[12px] text-muted-foreground">{sub}</div>}
    </div>
  )
}

/** The event log as quiet rows: time, who, what, where. Numbers and hashes stay in the Table view (and on hover). */
function EventRows({ events, fresh }: { events: EventVM[]; fresh: Set<string> }) {
  const who = useActorName()
  if (!events.length) return <p className="py-6 text-center text-[14px] text-muted-foreground">No events here yet.</p>
  return (
    <ol className="flex flex-col">
      {events.map(e => (
        <li key={e.seq} title={`#${e.seq} · hash ${e.hash.slice(0, 12)}…`} className={cn('grid grid-cols-[52px_minmax(0,1fr)] gap-3 border-t py-2.5 text-[14px] first:border-t-0', fresh.has(e.seq) && 'enter-rise')}>
          <time className="pt-px text-[12.5px] text-muted-foreground tabular-nums" dateTime={new Date(e.ms).toISOString()}>{clock(e.ms)}</time>
          <span className="min-w-0">
            <b className="font-semibold">{who(e.actor)}</b> {e.action}
            {e.label && <span className="block truncate text-[13px] text-muted-foreground">{e.label}</span>}
          </span>
        </li>
      ))}
    </ol>
  )
}

export function LogView({ onViewAll }: { onViewAll: () => void }) {
  const { data, cached, savedAt, live, ready } = useLogData()
  const conn = useSpacetimeDB()
  const now = useNow()
  const [sitesSel, setSitesSel] = useState<string[]>([SITES[0].id]) // locations picked; always at least one
  const [floor, setFloor] = useState<number | null>(null) // null = every floor of the picked locations
  const [mode, setMode] = useState<'list' | 'table'>('list')
  const [page, setPage] = useState(0) // 0 = newest
  const [check, setCheck] = useState<(ChainResult & { at: number }) | null>(null)
  const freshEvents = useArrivals(data?.events.map(e => e.seq) ?? [], ready && !cached) // only new arrivals animate, never paging

  if (!data) {
    return (
      <div className="flex flex-col gap-3 p-4" aria-busy="true">
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-96 w-full" />
      </div>
    )
  }

  const siteOf = (dc: string) => PLACE.get(dc)?.site ?? ''
  const inPlace = (dc: string) => sitesSel.includes(siteOf(dc)) && (floor == null || PLACE.get(dc)?.floor === floor)
  const floors = Math.max(...SITES.filter(s => sitesSel.includes(s.id)).map(s => s.floors.length))
  const feeds = data.feeds.filter(f => inPlace(f.id))
  const silent = feeds.filter(f => f.stale)
  const active = data.incidents.filter(i => i.status !== 'closed' && inPlace(i.dcId)).sort((a, b) => (SEV_RANK[a.severity] ?? 9) - (SEV_RANK[b.severity] ?? 9))
  const critical = active.filter(i => i.severity === 'critical').length
  const events = data.events.filter(e => !e.dcId || inPlace(e.dcId))
  const lastHour = events.filter(e => e.ms >= now - 3_600_000).length
  const where = `${SITES.filter(s => sitesSel.includes(s.id)).map(s => s.name).join(' + ')} · ${floor == null ? 'all floors' : `Floor ${floor}`}`
  const sentence = active.length
    ? `${active.length} active alert${active.length === 1 ? '' : 's'}${critical ? `, ${critical} critical` : ''}. ${silent.length ? `${silent.length} feed${silent.length === 1 ? '' : 's'} silent.` : 'Every feed is live.'}`
    : silent.length ? `No active alerts, but ${silent.length} feed${silent.length === 1 ? ' is' : 's are'} silent.` : 'All quiet: no active alerts and every feed is live.'

  const size = mode === 'list' ? LIST_PAGE : TABLE_PAGE
  const pages = Math.max(1, Math.ceil(events.length / size))
  const current = Math.min(page, pages - 1)
  const shown = events.slice(current * size, (current + 1) * size)
  const changed = () => setPage(0)
  const pill = (on: boolean) => cn('flex h-8 items-center gap-1.5 rounded-lg px-3 text-[13.5px] font-medium whitespace-nowrap transition-colors', on ? 'bg-card text-foreground shadow-sm ring-1 ring-border' : 'text-muted-foreground hover:bg-card/60 hover:text-foreground')

  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <PageActions>
        <div className="flex items-center gap-1" role="group" aria-label="Filter by location">
          <span className="mr-1.5 text-[13px] font-semibold">Location</span>
          {SITES.map(s => {
            const silentHere = data.feeds.filter(f => siteOf(f.id) === s.id && f.stale).length
            return (
              <button key={s.id} type="button" aria-pressed={sitesSel.includes(s.id)} className={pill(sitesSel.includes(s.id))}
                onClick={() => { setSitesSel(l => (l.length === 1 && l[0] === s.id ? l : l.includes(s.id) ? l.filter(x => x !== s.id) : [...l, s.id])); setFloor(null); changed() }}>
                {s.name}
                {silentHere > 0 && <Badge variant="destructive-light" size="sm">{silentHere} silent</Badge>}
              </button>
            )
          })}
        </div>
      </PageActions>

      <div className="mx-auto flex w-full max-w-6xl flex-col gap-3.5 p-3.5">
        {/* floor picker + cached note */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1 rounded-lg bg-muted p-0.5" role="group" aria-label="Filter by floor">
            {[null, ...Array.from({ length: floors }, (_, i) => i + 1)].map(f => (
              <button key={f ?? 'all'} type="button" aria-pressed={floor === f} onClick={() => { setFloor(f); changed() }} className={cn(pill(floor === f), 'h-7')}>
                {f == null ? 'All floors' : `Floor ${f}`}
              </button>
            ))}
          </div>
          {cached && (
            <span className="flex items-center gap-2 text-xs text-muted-foreground" role="status">
              <Badge variant="warning" size="sm">Cached</Badge>
              {conn.connectionError ? 'Live connection unavailable. ' : 'Connecting. '}Showing data saved {savedAt ? ago(savedAt, now) : 'earlier'}.
            </span>
          )}
        </div>

        {/* summary */}
        <section aria-labelledby="log-summary" className="rounded-lg bg-card p-5">
          <div className="mb-4">
            <h2 id="log-summary" className="text-[13px] text-muted-foreground">{where}</h2>
            <p className="mt-0.5 text-[18px] leading-snug font-semibold">{sentence}</p>
          </div>
          <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-4">
            <Stat k="Active alerts" v={active.length} sub={critical ? `${critical} critical` : active.length ? 'none critical' : 'nothing open'} tone={critical ? 'crit' : active.length ? 'warn' : undefined} />
            <Stat k="Feeds live" v={`${feeds.length - silent.length}/${feeds.length}`} sub={silent.length ? `${silent.map(f => f.name).join(', ')} silent` : 'all reporting'} tone={silent.length ? 'crit' : undefined} />
            <Stat k="Events, last hour" v={lastHour.toLocaleString()} sub={`${events.length.toLocaleString()} in total`} />
            <Stat k="Last event" v={events[0] ? ago(events[0].ms, now) : '—'} sub={events[0]?.action} />
          </div>
          <div className="mt-5 grid gap-5 lg:grid-cols-2">
            <div>
              <h3 className="mb-2 text-[12px] font-semibold tracking-[.06em] text-muted-foreground uppercase">Latest</h3>
              {events.length ? <RecentSummary events={events.slice(0, 5)} now={now} /> : <p className="text-[14px] text-muted-foreground">Nothing recorded here yet.</p>}
            </div>
            <div>
              <h3 className="mb-2 text-[12px] font-semibold tracking-[.06em] text-muted-foreground uppercase">Active alerts</h3>
              {!active.length ? (
                <p className="text-[14px] text-muted-foreground">None. The rules open one when a GPU stays over 50 °C or a feed goes silent.</p>
              ) : (
                <ul className="flex flex-col gap-2">
                  {active.slice(0, 4).map(i => (
                    <li key={i.id} className="flex items-baseline gap-2.5 text-[13.5px] leading-snug">
                      <span className={cn('shrink-0 font-semibold capitalize', i.severity === 'critical' ? 'text-destructive' : i.severity === 'high' ? 'text-warning' : 'text-muted-foreground')}>{i.severity === 'critical' ? '◆' : '▲'} {i.severity}</span>
                      <span className="min-w-0 flex-1 truncate">{i.title}</span>
                      <span className="shrink-0 text-[12.5px] text-muted-foreground">{i.ownerName || 'Unassigned'}</span>
                    </li>
                  ))}
                  {active.length > 4 && <li className="text-[12.5px] text-muted-foreground">and {active.length - 4} more</li>}
                </ul>
              )}
            </div>
          </div>
        </section>

        {/* the log: a list, or the table */}
        <section aria-labelledby="log-events" className="rounded-lg bg-card">
          <div className="flex flex-wrap items-center gap-2 border-b px-5 py-3">
            <h2 id="log-events" className="text-[15px] font-semibold">Event log</h2>
            <span className="text-xs text-muted-foreground tabular-nums">{events.length.toLocaleString()} events</span>
            <div className="ml-auto flex items-center gap-2">
              <div className="flex items-center gap-0.5 rounded-lg bg-muted p-0.5" role="tablist" aria-label="Show the log as">
                {(['list', 'table'] as const).map(m => (
                  <button key={m} type="button" role="tab" aria-selected={mode === m} onClick={() => { setMode(m); changed() }}
                    className={cn('rounded-md px-2.5 py-1 text-[12.5px] font-medium', mode === m ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground')}>
                    {m === 'list' ? 'List' : 'Table'}
                  </button>
                ))}
              </div>
              <Button size="xs" variant="outline" disabled={!ready} title={ready ? 'Recompute every hash in the chain' : 'Available once live data has loaded'} onClick={() => setCheck({ ...verifyChain(live.events), at: Date.now() })}>
                Verify chain
              </Button>
            </div>
          </div>
          {check && (
            <Badge key={check.at} variant={check.ok ? 'success-light' : 'destructive-light'} className="enter-pop mx-5 mt-3" role="status">
              {check.ok ? <ShieldCheckIcon aria-hidden="true" /> : <ShieldAlertIcon aria-hidden="true" />}
              {check.ok ? `Chain intact: ${check.count.toLocaleString()} events verified` : `Chain broken at event #${check.brokenAt}: it ${check.reason}`}
            </Badge>
          )}
          <div className={cn(mode === 'list' ? 'px-5 py-1' : 'max-h-[560px] overflow-auto')}>
            {mode === 'list' ? <EventRows events={shown} fresh={freshEvents} /> : <EventTable rows={shown} empty="No events here yet." />}
          </div>
          <nav className="flex items-center gap-2 border-t px-3 py-2" aria-label="Event log pages">
            <Button size="xs" variant="ghost" disabled={current === 0} onClick={() => setPage(current - 1)}><ChevronLeftIcon aria-hidden="true" /> Newer</Button>
            <span className="mx-auto text-xs text-muted-foreground tabular-nums">Page {current + 1} of {pages}</span>
            {mode === 'table' && (
              <Button size="xs" variant="ghost" onClick={onViewAll} title="Every event, at every location, on its own page"><ExternalLinkIcon aria-hidden="true" /> Full page</Button>
            )}
            <Button size="xs" variant="ghost" disabled={current >= pages - 1} onClick={() => setPage(current + 1)}>Older <ChevronRightIcon aria-hidden="true" /></Button>
          </nav>
        </section>
      </div>
    </div>
  )
}
