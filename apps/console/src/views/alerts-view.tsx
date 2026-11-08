import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useReducer, useSpacetimeDB, useTable } from 'spacetimedb/react'
import { reducers, tables } from '@mesa/bindings'
import { CrosshairIcon, HandIcon, UserIcon } from 'lucide-react'
import { toast } from 'sonner'
import { Badge } from '@/components/reui/badge'
import { Button } from '@/components/ui/button'
import { SITES, type Hall } from '@/components/floor/data'
import { makeNamer } from '@/components/floor/names'
import { DARK_PALETTE, FloorScene, LIGHT_PALETTE } from '@/components/floor/scene'
import { useLiveSites } from '@/components/floor/use-live-floors'
import { requestView } from '@/components/notify/navigate'
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
}

const SEV: Record<string, number> = { critical: 3, high: 2, medium: 1, low: 0 }
const ms = (ts: { microsSinceUnixEpoch: bigint }) => Number(ts.microsSinceUnixEpoch / 1000n)
const isDark = () => document.documentElement.classList.contains('dark')

/** Higher is more urgent: escalated, then severity, then nobody on it, then oldest. */
function urgency(i: IncidentRow) {
  return (i.status === 'escalated' ? 100 : 0) + (SEV[i.severity] ?? 0) * 10 + (i.owner ? 0 : 5) - ms(i.openedAt) / 1e13
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

/** The floor with the focused block, turning on its own. Not interactive: it only shows where to look. */
function FocusFloor({ halls, focus }: { halls: Hall[]; focus: string }) {
  const hostRef = useRef<HTMLDivElement>(null)
  const labelsRef = useRef<HTMLDivElement>(null)
  const sceneRef = useRef<FloorScene | null>(null)
  const floorKey = useRef('')

  useEffect(() => {
    const scene = new FloorScene(hostRef.current!, labelsRef.current!, { onSelect: () => {}, topInset: () => 0, spin: 0.0028 })
    scene.setPalette(isDark() ? DARK_PALETTE : LIGHT_PALETTE)
    sceneRef.current = scene
    const mo = new MutationObserver(() => scene.setPalette(isDark() ? DARK_PALETTE : LIGHT_PALETTE))
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] })
    return () => { mo.disconnect(); scene.dispose(); sceneRef.current = null }
  }, [])

  useEffect(() => {
    const scene = sceneRef.current
    if (!scene || !halls.length) return
    const key = `${halls[0].site}/${halls[0].floor}`
    scene.setSelected(focus)
    const changed = floorKey.current !== key
    scene.setHalls(halls, floorKey.current !== '' && changed) // a different floor drops in
    if (changed) { scene.zoom('out'); scene.zoom('out') } // each new floor resets the camera; pull back so it fits this half-width panel
    floorKey.current = key
  }, [halls, focus])

  return (
    <div ref={hostRef} className="pointer-events-none absolute inset-0" aria-hidden="true">
      <div ref={labelsRef} className="absolute inset-0" />
    </div>
  )
}

export function AlertsView() {
  const conn = useSpacetimeDB()
  const now = useNow(15_000)
  const { sites, ready: floorsReady } = useLiveSites({ withHistory: false })
  const [incidents, ready] = useTable(tables.incident)
  const [operators] = useTable(tables.operator)
  const [dcs] = useTable(tables.datacenter)
  const [racks] = useTable(tables.rack)
  const claim = useReducer(reducers.claimIncident)
  const [picked, setPicked] = useState<string | null>(null) // an alert the operator clicked; null = follow the most urgent
  const [busy, setBusy] = useState<bigint | null>(null)
  const names = useMemo(() => makeNamer(dcs, racks.map(r => r.rackId)), [dcs, racks])

  const myId = conn.identity?.toHexString() ?? ''
  const me = operators.find(o => o.identity.toHexString() === myId)
  const active: IncidentRow[] = incidents.filter(i => i.status !== 'closed').sort((a, b) => urgency(b) - urgency(a))
  const allHalls = useMemo(() => Object.values(sites).flat(2), [sites])

  // The block to look at: the picked alert's (or the most urgent one's) hottest block; with no alerts, the hottest block.
  const focusIncident = active.find(i => String(i.incidentId) === picked) ?? active[0]
  const blocksOf = (rackId: string) => allHalls.filter(h => h.id.startsWith(`${rackId}#`))
  const hottestOf = (hs: Hall[]) => [...hs].sort((a, b) => b.temp - a.temp)[0] as Hall | undefined
  const focusHall =
    (focusIncident?.rackId ? hottestOf(blocksOf(focusIncident.rackId)) : undefined) ??
    (focusIncident ? hottestOf(allHalls.filter(h => h.datacenter === focusIncident.datacenterId)) : undefined) ??
    hottestOf(allHalls)
  const floorHalls = focusHall ? (sites[focusHall.site]?.[focusHall.floor - 1] ?? []) : []
  const siteName = SITES.find(s => s.id === focusHall?.site)?.name ?? ''

  const crit = active.filter(i => i.severity === 'critical').length
  const unowned = active.filter(i => !i.owner).length
  const hottest = hottestOf(allHalls)
  const blockedWhy = !me ? 'Register as an operator first' : !me.onShift ? 'Start your shift in My Queue to take alerts' : null

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
      <div className="grid gap-3.5 p-3.5 lg:h-full lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:grid-rows-[auto_minmax(0,1fr)]">
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
            <span className="text-[13px] text-muted-foreground">Most urgent first · click one to see it on the right</span>
          </div>
          {!ready ? (
            <p className="text-[15px] text-muted-foreground">Loading alerts…</p>
          ) : !active.length ? (
            <p className="text-[15px] text-muted-foreground">No active alerts. The rules open one when a GPU stays over 50 °C or a feed goes silent.</p>
          ) : (
            <ol className="-mr-2 flex min-h-0 flex-col gap-2 overflow-y-auto pr-2">
              {active.map((i, n) => {
                const id = String(i.incidentId)
                const on = focusIncident?.incidentId === i.incidentId
                const strip = i.severity === 'critical' ? 'bg-destructive/65' : i.severity === 'high' ? 'bg-warning/65' : 'bg-muted-foreground/30'
                const where = i.rackId ? `${names.place(i.datacenterId)} · ${names.blocks(i.rackId)}` : names.place(i.datacenterId)
                return (
                  <li key={id} className={cn('shrink-0 rounded-lg pl-1.5', strip)}>
                    <div
                      role="button"
                      tabIndex={0}
                      aria-pressed={on}
                      onClick={() => setPicked(id)}
                      onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setPicked(id) } }}
                      className={cn('cursor-pointer rounded-lg px-3.5 py-3 outline-none focus-visible:ring-2 focus-visible:ring-ring', on ? 'bg-[#e6e2da] dark:bg-[#303035]' : 'bg-muted hover:bg-accent')}
                    >
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="w-5 text-[13px] font-semibold text-muted-foreground tabular-nums">{n + 1}</span>
                        <span className={cn('text-[13px] font-semibold capitalize', i.severity === 'critical' ? 'text-destructive' : i.severity === 'high' ? 'text-warning' : 'text-muted-foreground')}>{i.severity}</span>
                        <Badge size="sm" variant={i.status === 'escalated' ? 'destructive-light' : i.status === 'open' ? 'warning-light' : 'info-light'} className="capitalize">{i.status}</Badge>
                        {i.owner ? <Badge size="sm" variant="secondary"><UserIcon aria-hidden="true" />{i.owner === myId ? 'You' : i.ownerName}</Badge> : <Badge size="sm" variant="outline">Unassigned</Badge>}
                        {on && <span className="inline-flex items-center gap-1 text-[12.5px] font-medium"><CrosshairIcon className="size-3.5" aria-hidden="true" /> on the map</span>}
                        <span className="ml-auto text-[12.5px] text-muted-foreground tabular-nums">open {ago(ms(i.openedAt), now)}</span>
                      </div>
                      <p className="mt-1 text-[14.5px] leading-snug font-semibold">{names.text(i.title)}</p>
                      <div className="mt-1.5 flex items-center justify-between gap-2">
                        <span className="truncate text-[13px] text-muted-foreground">{where}{i.handedFrom && !i.owner ? ` · left by ${i.handedFrom}` : ''}</span>
                        {!i.owner && (
                          <Button size="sm" disabled={!!blockedWhy || busy !== null} title={blockedWhy ?? undefined} onClick={e => { e.stopPropagation(); void take(i) }}>
                            <HandIcon aria-hidden="true" /> {busy === i.incidentId ? 'Taking…' : 'Take it'}
                          </Button>
                        )}
                      </div>
                    </div>
                  </li>
                )
              })}
            </ol>
          )}
          {!!active.length && blockedWhy && <p className="mt-2 text-[12.5px] text-muted-foreground">{blockedWhy}.</p>}
        </section>

        {/* the floor to look at */}
        <section aria-label="Where to look" className="relative min-h-[420px] overflow-hidden rounded-lg bg-gradient-to-b from-[#f7f5f1] to-[#efece6] dark:from-[#1a1a1d] dark:to-[#141416]">
          {floorHalls.length ? <FocusFloor halls={floorHalls} focus={focusHall?.id ?? ''} /> : (
            <p className="grid h-full place-items-center text-[15px] text-muted-foreground">{floorsReady ? 'No racks report yet.' : 'Connecting to live telemetry…'}</p>
          )}
          {focusHall && (
            <div className="absolute inset-x-4 top-4 flex flex-wrap items-start justify-between gap-2">
              <div className="rounded-lg bg-card/90 px-3.5 py-2.5 shadow-sm backdrop-blur">
                <p className="text-[12.5px] text-muted-foreground">{focusIncident ? (picked ? 'Selected alert' : 'Look here first') : 'Hottest block (no alerts)'}</p>
                <p className="text-[16px] font-semibold">Block {focusHall.tag} · {siteName} · Floor {focusHall.floor}</p>
                <p className={cn('text-[13.5px] font-medium tabular-nums', focusHall.status === 'crit' ? 'text-destructive' : focusHall.status === 'warn' ? 'text-warning' : 'text-success')}>
                  Hottest GPU {focusHall.temp.toFixed(1)} °C · {focusHall.hot} of {focusHall.servers} servers ≥ 50 °C
                </p>
              </div>
              {picked && <Button size="sm" variant="outline" className="bg-card/90" onClick={() => setPicked(null)}>Back to most urgent</Button>}
            </div>
          )}
          {focusHall && (
            <Button size="sm" variant="outline" className="absolute right-4 bottom-4 bg-card/90" onClick={() => requestView('floor')}>
              Open on the Floor page
            </Button>
          )}
        </section>
      </div>
    </div>
  )
}
