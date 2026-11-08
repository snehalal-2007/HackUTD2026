import { useMemo, useState, type ReactNode } from 'react'
import { useReducer, useSpacetimeDB, useTable } from 'spacetimedb/react'
import { reducers, tables } from '@mesa/bindings'
import { HandIcon, UserIcon } from 'lucide-react'
import { toast } from 'sonner'
import { Badge } from '@/components/reui/badge'
import { Button } from '@/components/ui/button'
import { GPU_CRIT_C, GPU_WARN_C, SITES, type Hall } from '@/components/floor/data'
import { PLACE } from '@/components/floor/names'
import { AddressBlock } from '@/components/floor/address-block'
import { typeOf } from '@/components/floor/alert-types'
import { StatusGlyph } from '@/components/floor/status-glyph'
import { BlockTable, OpenedTimeline } from '@/components/floor/alert-charts'
import { useIncidentPlace } from '@/components/floor/incident-place'
import { useLiveSites } from '@/components/floor/use-live-floors'
import { requestView } from '@/components/notify/navigate'
import { PageActions } from '@/components/shell/page-actions'
import { setFloorTarget } from '@/components/floor/floor-link'
import { ago, useNow } from '@/lib/snapshot'
import { cn } from '@/lib/utils'

// Alerts dashboard, live from SpacetimeDB: the active incidents ranked by what needs attention first, and on the
// right the data-center floor that holds the most urgent one, turning slowly on its own with that block picked out.
// Clicking an alert moves the 3D to its block. Taking an alert goes through claim_incident (module rules apply).

interface IncidentRow {
  incidentId: bigint
  status: string
  severity: string
  title: string
  datacenterId: string
  rackId: string
  owner: string
  ownerName: string
  handedFrom: string
  openedAt: { microsSinceUnixEpoch: bigint }
  peakValue: number // the reading the rule recorded when it opened or escalated
  kind: string // gpu_temp | gpu_failure | feed_stale | manual
}

const SEV: Record<string, number> = { critical: 3, high: 2, medium: 1, low: 0 }
const SEVERITIES = [
  { id: 'critical', label: 'Critical', glyph: 'diamond', tone: 'text-destructive' },
  { id: 'high', label: 'High', glyph: 'triangle', tone: 'text-warning' },
  { id: 'medium', label: 'Medium', glyph: 'triangle', tone: 'text-warning/70' },
  { id: 'low', label: 'Low', glyph: 'dot', tone: 'text-muted-foreground' },
] as const
const ms = (ts: { microsSinceUnixEpoch: bigint }) => Number(ts.microsSinceUnixEpoch / 1000n)

/**
 * Higher is more urgent. What the row reads *now* comes first (critical heat, then warning heat, then a row that has
 * cooled but whose alert the rules haven't closed yet), then escalation, the recorded severity, nobody on it, oldest.
 */
function urgency(i: IncidentRow, nowC: number | undefined) {
  const live = nowC == null ? 1 : nowC >= GPU_CRIT_C ? 3 : nowC >= GPU_WARN_C ? 2 : 0
  return live * 1000 + (i.status === 'escalated' ? 100 : 0) + (SEV[i.severity] ?? 0) * 10 + (i.owner ? 0 : 5) - ms(i.openedAt) / 1e13
}

function Tile({ k, v, sub, tone }: { k: string; v: ReactNode; sub?: string; tone?: 'crit' | 'warn' }) {
  return (
    <div className="flex min-w-0 flex-col justify-center gap-1 rounded-lg bg-card px-4 py-3">
      <span className="text-[12.5px] text-muted-foreground">{k}</span>
      <span className={cn('truncate text-2xl font-semibold tabular-nums', tone === 'crit' && 'text-destructive', tone === 'warn' && 'text-warning')}>{v}</span>
      {sub && <span className="truncate text-[12.5px] text-muted-foreground">{sub}</span>}
    </div>
  )
}

export function AlertsView() {
  const conn = useSpacetimeDB()
  const now = useNow(15_000)
  const { sites, ready: floorsReady } = useLiveSites({ withHistory: false })
  const [incidents, ready] = useTable(tables.incident)
  const [operators] = useTable(tables.operator)
  const claim = useReducer(reducers.claimIncident)
  const [picked, setPicked] = useState<string | null>(null) // an alert the operator clicked; null = follow the most urgent
  const [busy, setBusy] = useState<bigint | null>(null)
  const [site, setSite] = useState<string>(SITES[0].id) // the one data center the whole page shows, so no two panels disagree
  const [floorsSel, setFloorsSel] = useState<number[]>([]) // floors picked; none = every floor
  const [sevSel, setSevSel] = useState<string[]>([]) // severities picked; none = every severity
  const placeOf = useIncidentPlace()

  const myId = conn.identity?.toHexString() ?? ''
  const me = operators.find(o => o.identity.toHexString() === myId)
  // Location + floor filter: applies to the totals, the list and the 3D.
  const here = (dc: string) => {
    const p = PLACE.get(dc)
    return !!p && p.site === site && (!floorsSel.length || floorsSel.includes(p.floor))
  }
  const toggle = <T,>(list: T[], v: T) => (list.includes(v) ? list.filter(x => x !== v) : [...list, v])
  const floorNums = (SITES.find(x => x.id === site)?.floors ?? []).map((_, i) => i + 1)
  const hottestOf = (hs: Hall[]) => [...hs].sort((a, b) => b.temp - a.temp)[0] as Hall | undefined
  const allHalls = useMemo(() => Object.values(sites).flat(2), [sites]).filter(h => here(h.datacenter))
  // The live reading behind each alert: the hottest block on its rack right now (feed alerts: none).
  const rowNow = (i: IncidentRow) => (i.rackId ? hottestOf(allHalls.filter(h => h.id.startsWith(`${i.rackId}#`)))?.temp : undefined)
  const active: IncidentRow[] = incidents.filter(i => i.status !== 'closed' && here(i.datacenterId) && (!sevSel.length || sevSel.includes(i.severity))).sort((a, b) => urgency(b, rowNow(b)) - urgency(a, rowNow(a)))
  const pick = (on: boolean) =>
    cn('flex h-9 items-center gap-1.5 rounded-lg px-3.5 text-[14px] font-medium whitespace-nowrap transition-colors', on ? 'bg-card text-foreground shadow-sm ring-1 ring-border' : 'text-muted-foreground hover:bg-card/60 hover:text-foreground')

  // The block to look at: the picked alert's (or the most urgent one's) hottest block; with no alerts, the hottest block.
  const focusIncident = active.find(i => String(i.incidentId) === picked) ?? active[0]
  const blocksOf = (rackId: string) => allHalls.filter(h => h.id.startsWith(`${rackId}#`))
  const focusHall =
    (focusIncident?.rackId ? hottestOf(blocksOf(focusIncident.rackId)) : undefined) ??
    (focusIncident ? hottestOf(allHalls.filter(h => h.datacenter === focusIncident.datacenterId)) : undefined) ??
    hottestOf(allHalls)
  // Chart data, all live and under the same filters as the list.
  const chartRow = (i: IncidentRow) => ({ severity: i.severity, status: i.status, datacenterId: i.datacenterId, openedMs: ms(i.openedAt) })
  const chartAll = incidents
    .filter(i => here(i.datacenterId) && (!sevSel.length || sevSel.includes(i.severity)))
    .map(chartRow)


  const crit = active.filter(i => i.severity === 'critical').length
  const unowned = active.filter(i => !i.owner).length
  const hottest = hottestOf(allHalls)
  const blockedWhy = !me ? 'Register as an operator first' : !me.onShift ? 'Start your shift in My Queue to take alerts' : null

  /** Opens the Floor page on this block. */
  function openOnFloor(h: Hall) {
    setFloorTarget({ site: h.site, floor: h.floor, block: h.id })
    requestView('floor')
  }

  async function take(i: IncidentRow) {
    setBusy(i.incidentId)
    try {
      await claim({ incidentId: i.incidentId })
      toast.success(`Alert #${i.incidentId} is yours`, { action: { label: 'My Queue', onClick: () => requestView('queue') } })
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="min-h-0 flex-1 overflow-y-auto lg:overflow-hidden">
      <div className="grid gap-3.5 p-3.5 lg:h-full lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:grid-rows-[auto_auto_minmax(0,1fr)]">
        <PageActions>
          <div className="flex items-center gap-1" role="group" aria-label="Filter by location">
            <span className="mr-1.5 text-[13px] font-semibold">Location</span>
            {SITES.map(x => (
              <button key={x.id} type="button" aria-pressed={site === x.id} onClick={() => { setSite(x.id); setFloorsSel([]); setPicked(null) }} className={cn(pick(site === x.id), 'h-8')}>
                {x.name}
              </button>
            ))}
          </div>
        </PageActions>
        {/* filter */}
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2 lg:col-span-2">
          <div className="flex flex-wrap items-center gap-1" role="group" aria-label="Filter by floor">
            <span className="mr-1.5 text-[13.5px] font-semibold">Floor</span>
            {floorNums.map(n => (
              <button key={n} type="button" aria-pressed={floorsSel.includes(n)} onClick={() => { setFloorsSel(l => toggle(l, n)); setPicked(null) }} className={cn(pick(floorsSel.includes(n)), 'min-w-9 justify-center')}>{n}</button>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-1" role="group" aria-label="Filter by severity">
            <span className="mr-1.5 text-[13.5px] font-semibold">Severity</span>
            {SEVERITIES.map(x => (
              <button key={x.id} type="button" aria-pressed={sevSel.includes(x.id)} onClick={() => { setSevSel(l => toggle(l, x.id)); setPicked(null) }} className={pick(sevSel.includes(x.id))}>
                <StatusGlyph shape={x.glyph} className={x.tone} />
                {x.label}
              </button>
            ))}
          </div>
          {!floorsSel.length && !sevSel.length && <span className="text-[12.5px] text-muted-foreground">All floors and severities · pick to narrow</span>}
        </div>

        {/* totals */}
        <div className="grid grid-cols-2 gap-3.5 sm:grid-cols-4 lg:col-span-2">
          <Tile k="Active alerts" v={active.length} sub={active.length ? `${active.filter(i => i.status === 'escalated').length} escalated` : 'All clear'} />
          <Tile k="Critical" v={crit} tone={crit ? 'crit' : undefined} sub={crit ? 'need eyes now' : 'none'} />
          <Tile k="Unassigned" v={unowned} tone={unowned ? 'warn' : undefined} sub={unowned ? 'nobody on them yet' : 'every alert has an owner'} />
          <Tile k="Hottest GPU" v={hottest ? `${hottest.temp.toFixed(1)} °C` : '—'} sub={hottest ? `Block ${hottest.tag} · ${SITES.find(s => s.id === hottest.site)?.name} · Floor ${hottest.floor}` : undefined} />
        </div>

        {/* focus list */}
        <section aria-labelledby="focus" className="flex min-h-0 flex-col rounded-lg bg-card p-5">
          <div className="mb-3 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
            <h2 id="focus" className="text-[15.5px] font-semibold">Focus now</h2>
            <span className="text-[13px] text-muted-foreground">Most urgent first · click one to highlight its block</span>
          </div>
          {!ready ? (
            <p className="text-[15px] text-muted-foreground">Loading alerts…</p>
          ) : !active.length ? (
            <p className="text-[15px] text-muted-foreground">No active alerts. The rules open one when a GPU stays over 50 °C or a feed goes silent.</p>
          ) : (
            <ol className="-mr-2 flex min-h-0 flex-col gap-2 overflow-y-auto pr-2">
              {active.map(i => {
                const id = String(i.incidentId)
                const on = focusIncident?.incidentId === i.incidentId
                const at = placeOf(i)
                return (
                  <li key={id} className="shrink-0">
                    <div
                      role="button"
                      tabIndex={0}
                      aria-pressed={on}
                      onClick={() => setPicked(id)}
                      onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setPicked(id) } }}
                      className={cn('flex cursor-pointer gap-3.5 rounded-lg px-3.5 py-3 outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring', on ? 'bg-[#eeebe5] ring-1 ring-inset ring-foreground/20 dark:bg-[#2a2a2e]' : 'bg-muted/60 hover:bg-muted')} // lighter fills; the picked one gets a thin outline drawn inside, so the scrolling list can't clip it
                    >
                      <AddressBlock block={at.block} floor={at.floor} site={at.site} severity={i.severity} />
                      <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className={cn('text-[13px] font-semibold capitalize', i.severity === 'critical' ? 'text-destructive' : i.severity === 'high' ? 'text-warning' : 'text-muted-foreground')}>{i.severity}</span>
                        <Badge size="sm" variant="outline">{(() => { const T = typeOf(i.kind); const Icon = T.icon; return <><Icon aria-hidden="true" />{T.label}</> })()}</Badge>
                        <Badge size="sm" variant={i.status === 'escalated' ? 'destructive-light' : i.status === 'open' ? 'warning-light' : 'info-light'} className="capitalize">{i.status}</Badge>
                        {i.owner ? <Badge size="sm" variant="secondary"><UserIcon aria-hidden="true" />{i.owner === myId ? 'You' : i.ownerName}</Badge> : <Badge size="sm" variant="outline">Unassigned</Badge>}
                        {rowNow(i) != null && rowNow(i)! < GPU_WARN_C && <Badge size="sm" variant="success-light" title="The row is back under 50 °C; the rule closes the alert after 12 good readings in a row">Cooling down</Badge>}
                        <span className="ml-auto text-[12.5px] text-muted-foreground tabular-nums">open {ago(ms(i.openedAt), now)}</span>
                      </div>
                      <p className="mt-1 text-[15px] leading-snug font-semibold">{at.what}</p>
                      <div className="mt-1.5 flex items-center justify-between gap-2">
                        <span className="truncate text-[13px] text-muted-foreground">
                          {rowNow(i) != null && (
                            <>opened at {Math.round(i.peakValue * 10) / 10} °C · <b className={cn('font-semibold', rowNow(i)! >= GPU_CRIT_C ? 'text-destructive' : rowNow(i)! >= GPU_WARN_C ? 'text-warning' : 'text-success')}>now {rowNow(i)!.toFixed(1)} °C</b></>
                          )}
                          {i.handedFrom && !i.owner ? ` · left by ${i.handedFrom}` : ''}
                        </span>
                        {!i.owner && (
                          <Button size="sm" disabled={!!blockedWhy || busy !== null} title={blockedWhy ?? undefined} onClick={e => { e.stopPropagation(); void take(i) }}>
                            <HandIcon aria-hidden="true" /> {busy === i.incidentId ? 'Taking…' : 'Take it'}
                          </Button>
                        )}
                      </div>
                      </div>
                    </div>
                  </li>
                )
              })}
            </ol>
          )}
          {!!active.length && blockedWhy && <p className="mt-2 text-[12.5px] text-muted-foreground">{blockedWhy}.</p>}
        </section>

        {/* the picture: where the heat is, where the alerts are, and whether it's getting worse */}
        <section aria-label="Overview" className="no-scrollbar flex min-h-0 flex-col gap-3.5 lg:overflow-y-auto">
          <BlockTable
            sites={sites}
            site={site}
            floorsSel={floorsSel}
            openOn={rack => incidents.filter(i => i.rackId === rack && i.status !== 'closed').length}
            focus={focusHall?.id}
            onOpen={openOnFloor}
          />
          <OpenedTimeline all={chartAll} now={now} />
          {!floorsReady && <p className="text-[13px] text-muted-foreground">Connecting to live telemetry…</p>}
        </section>
      </div>
    </div>
  )
}
