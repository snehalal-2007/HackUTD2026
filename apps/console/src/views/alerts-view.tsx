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
import { BlockTable, OpenedTimeline } from '@/components/floor/alert-charts'
import { useIncidentPlace } from '@/components/floor/incident-place'
import { useLiveSites } from '@/components/floor/use-live-floors'
import { requestView } from '@/components/notify/navigate'
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
  const active: IncidentRow[] = incidents.filter(i => i.status !== 'closed' && here(i.datacenterId)).sort((a, b) => urgency(b, rowNow(b)) - urgency(a, rowNow(a)))
  const pick = (on: boolean) =>
    cn('flex h-9 items-center gap-1.5 rounded-lg px-3.5 text-[14px] font-medium whitespace-nowrap transition-colors', on ? 'bg-card text-foreground shadow-sm ring-1 ring-border' : 'text-muted-foreground hover:bg-card/60 hover:text-foreground')

  // Focus now lists blocks, like the heat map: every block at or over 50 °C on a rack with an active alert gets its own row,
  // with its own reading and severity. The module opens one alert per rack, so blocks on the same rack share that alert
  // (its owner and status). A rack that has cooled keeps one row (its hottest block) until the rule closes the alert;
  // a feed alert has no block, so it is one row of its own.
  const blocksOf = (rackId: string) => allHalls.filter(h => h.id.startsWith(`${rackId}#`))
  type Entry = { key: string; inc: IncidentRow; hall?: Hall; tag: string; temp?: number; sev: string }
  const entries: Entry[] = active
    .flatMap((i): Entry[] => {
      const id = String(i.incidentId)
      if (!i.rackId) return [{ key: id, inc: i, tag: placeOf(i).block, sev: i.severity }]
      const rack = blocksOf(i.rackId).sort((a, b) => b.temp - a.temp)
      const hot = rack.filter(h => h.temp >= GPU_WARN_C)
      return (hot.length ? hot : rack.slice(0, 1)).map(h => ({ key: `${id}:${h.tag}`, inc: i, hall: h, tag: h.tag, temp: h.temp, sev: h.temp >= GPU_CRIT_C ? 'critical' : h.temp >= GPU_WARN_C ? 'high' : i.severity }))
    })
    .sort((a, b) => (SEV[b.sev] ?? 0) - (SEV[a.sev] ?? 0) || (b.temp ?? 0) - (a.temp ?? 0))
  // The block to look at: the picked row's block (or the most urgent one's); with no alerts, the hottest block.
  const focusEntry = entries.find(e => e.key === picked) ?? entries[0]
  const focusIncident = focusEntry?.inc
  const focusHall =
    focusEntry?.hall ??
    (focusIncident ? hottestOf(allHalls.filter(h => h.datacenter === focusIncident.datacenterId)) : undefined) ??
    hottestOf(allHalls)
  // Chart data, all live and under the same filters as the list.
  const chartRow = (i: IncidentRow) => ({ severity: i.severity, status: i.status, datacenterId: i.datacenterId, openedMs: ms(i.openedAt) })
  const chartAll = incidents
    .filter(i => here(i.datacenterId))
    .map(chartRow)


  const crit = entries.filter(e => e.sev === 'critical').length
  const unowned = entries.filter(e => !e.inc.owner).length
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
        {/* filter: location, then floor */}
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2 lg:col-span-2">
          <div className="flex flex-wrap items-center gap-1" role="group" aria-label="Filter by location">
            <span className="mr-1.5 text-[13.5px] font-semibold">Location</span>
            {SITES.map(x => (
              <button key={x.id} type="button" aria-pressed={site === x.id} onClick={() => { setSite(x.id); setFloorsSel([]); setPicked(null) }} className={pick(site === x.id)}>
                {x.name}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-1" role="group" aria-label="Filter by floor">
            <span className="mr-1.5 text-[13.5px] font-semibold">Floor</span>
            {floorNums.map(n => (
              <button key={n} type="button" aria-pressed={floorsSel.includes(n)} onClick={() => { setFloorsSel(l => toggle(l, n)); setPicked(null) }} className={cn(pick(floorsSel.includes(n)), 'min-w-9 justify-center')}>{n}</button>
            ))}
          </div>
        </div>

        {/* totals */}
        <div className="grid grid-cols-2 gap-3.5 sm:grid-cols-4 lg:col-span-2">
          <Tile k="Blocks in alert" v={entries.length} sub={entries.length ? `${active.length} alert${active.length === 1 ? '' : 's'} · ${active.filter(i => i.status === 'escalated').length} escalated` : 'All clear'} />
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
              {entries.map(e => {
                const i = e.inc
                const id = e.key
                const on = focusEntry?.key === e.key
                const at = placeOf(i)
                const nowC = e.temp // this block's reading right now (feed alerts: none)
                const limit = e.sev === 'critical' ? GPU_CRIT_C : GPU_WARN_C
                const shared = entries.filter(x => x.inc === i && x.key !== e.key).map(x => x.tag) // other blocks on the same rack's alert
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
                      <AddressBlock block={e.tag} floor={at.floor} site={at.site} severity={e.sev} />
                      <div className="min-w-0 flex-1">
                        {/* the reading against its limit, big; feed alerts have no reading, so they say what's wrong */}
                        <div className="flex items-start justify-between gap-3">
                          {nowC != null ? (
                            <p className="flex flex-wrap items-baseline gap-x-2">
                              <span className={cn('text-[24px] leading-none font-semibold tracking-tight tabular-nums', nowC >= GPU_CRIT_C ? 'text-destructive' : nowC >= GPU_WARN_C ? 'text-warning' : 'text-success')}>{nowC.toFixed(1)} °C</span>
                              <span className="text-[13.5px] text-muted-foreground tabular-nums">{nowC >= limit ? '>' : '<'} {limit} °C limit</span>
                            </p>
                          ) : (
                            <p className="text-[15px] leading-snug font-semibold">{at.what}</p>
                          )}
                          {!i.owner ? (
                            <Button size="sm" className="shrink-0" disabled={!!blockedWhy || busy !== null} title={blockedWhy ?? undefined} onClick={e => { e.stopPropagation(); void take(i) }}>
                              <HandIcon aria-hidden="true" /> {busy === i.incidentId ? 'Taking…' : 'Take it'}
                            </Button>
                          ) : (
                            <span className="shrink-0 text-[12.5px] text-muted-foreground tabular-nums">{ago(ms(i.openedAt), now)}</span>
                          )}
                        </div>
                        {/* the small print, in one line */}
                        <p className="mt-2 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[12.5px] text-muted-foreground">
                          <span className={cn('font-semibold capitalize', e.sev === 'critical' ? 'text-destructive' : e.sev === 'high' ? 'text-warning' : '')}>{e.sev}</span>
                          <span aria-hidden="true">·</span>
                          <span>{typeOf(i.kind).label}</span>
                          <span aria-hidden="true">·</span>
                          <span className={cn('capitalize', i.status === 'escalated' && 'font-semibold text-destructive')}>{i.status}</span>
                          <span aria-hidden="true">·</span>
                          <span className="inline-flex items-center gap-1"><UserIcon className="size-3" aria-hidden="true" />{i.owner ? (i.owner === myId ? 'You' : i.ownerName) : 'Unassigned'}</span>
                          {nowC != null && <><span aria-hidden="true">·</span><span className="tabular-nums">opened at {Math.round(i.peakValue * 10) / 10} °C</span></>}
                          {!i.owner && <><span aria-hidden="true">·</span><span className="tabular-nums">{ago(ms(i.openedAt), now)}</span></>}
                          {i.handedFrom && !i.owner && <><span aria-hidden="true">·</span><span>left by {i.handedFrom}</span></>}
                          {nowC != null && nowC < GPU_WARN_C && <Badge size="sm" variant="success-light" className="ml-1" title="The row is back under 50 °C; the rule closes the alert after 12 good readings in a row">Cooling down</Badge>}
                        </p>
                        {shared.length > 0 && <p className="mt-1 text-[12px] text-muted-foreground">Same rack as {shared.join(', ')}: one alert covers them, so taking one takes both.</p>}
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
