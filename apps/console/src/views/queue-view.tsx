import { useState, type ReactNode } from 'react'
import { useReducer, useSpacetimeDB, useTable } from 'spacetimedb/react'
import { reducers, tables } from '@mesa/bindings'
import { ArrowRightLeftIcon, CheckIcon, HandIcon, LogOutIcon, PlayIcon, ThermometerSnowflakeIcon, UndoIcon } from 'lucide-react'
import { toast } from 'sonner'
import { DropdownMenu } from 'radix-ui'
import { Button } from '@/components/ui/button'
import { AddressBlock } from '@/components/floor/address-block'
import { useIncidentPlace, type IncidentPlace } from '@/components/floor/incident-place'
import { CharacterAvatar } from '@/components/shell/character-avatar'
import { ago, useNow } from '@/lib/snapshot'
import { cn } from '@/lib/utils'

// My Queue, live from SpacetimeDB: incidents I own (claim_incident / resolve_incident / release_incident),
// incidents nobody owns yet, and my own shift (start_my_shift / end_my_shift). The rules (who may claim,
// resolve, or end a shift, and who gets assigned what) are enforced in module/src/reducers/queue.ts; this view only shows the outcome.

const SEV_RANK: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 }
const SHIFT_HOURS = [8, 12] as const
const ms = (ts: { microsSinceUnixEpoch: bigint }) => Number(ts.microsSinceUnixEpoch / 1000n)
const microsToMs = (m: bigint) => Number(m / 1000n)
const clock = (t: number) => new Date(t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
const span = (msLeft: number) => {
  const m = Math.max(0, Math.round(msLeft / 60_000))
  return m < 60 ? `${m} min` : `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, '0')} min`
}
const MENU_ITEM = 'flex cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 text-[13.5px] outline-none data-[highlighted]:bg-accent data-[highlighted]:text-foreground' // one row of the Reassign menu
const doneSummary = (list: { closedReason: string }[]) => { // "4 resolved · 2 recovered"
  const auto = list.filter(i => i.closedReason === 'recovered').length
  return [list.length - auto && `${list.length - auto} resolved`, auto && `${auto} recovered`].filter(Boolean).join(' · ')
}
const errText = (e: unknown) => (e instanceof Error ? e.message : String(e))

function Tile({ k, v, sub, dark }: { k: string; v: ReactNode; sub?: string; dark?: boolean }) {
  return (
    <div className={cn('flex min-w-0 flex-col justify-center gap-1 rounded-lg px-4 py-3', dark ? 'bg-[#18181b] text-white dark:bg-[#f4f4f5] dark:text-[#18181b]' : 'bg-card')}>
      <span className={cn('text-[12.5px]', dark ? 'opacity-70' : 'text-muted-foreground')}>{k}</span>
      <span className="truncate text-2xl font-semibold tabular-nums">{v}</span>
      {sub && <span className={cn('truncate text-[12.5px]', dark ? 'opacity-70' : 'text-muted-foreground')}>{sub}</span>}
    </div>
  )
}

function Card({ title, aside, children, className }: { title: string; aside?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={cn('flex min-h-0 flex-col rounded-lg bg-card p-5', className)} aria-label={title}>
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <h2 className="text-[15.5px] font-semibold">{title}</h2>
        {aside && <span className="text-[13px] text-muted-foreground">{aside}</span>}
      </div>
      {children}
    </section>
  )
}

/** The severity strip from the Security feed: a coloured card with the row laid over it. */
/** A task card: the address block (where) on the left, the task on the right. */
function Strip({ severity, at, children }: { severity: string; at: IncidentPlace; children: ReactNode }) {
  return (
    <div className="flex gap-3.5 rounded-lg bg-muted px-3.5 py-3">
      <AddressBlock block={at.block} floor={at.floor} site={at.site} severity={severity} />
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  )
}

function SevText({ severity }: { severity: string }) {
  return <span className={cn('font-semibold capitalize', severity === 'critical' ? 'text-destructive' : severity === 'high' ? 'text-warning' : 'text-muted-foreground')}>{severity}</span>
}

/** Open → Claimed → Resolved, with the current step filled. */
function Track({ step }: { step: 0 | 1 | 2 }) {
  const labels = ['Open', 'Claimed', 'Resolved']
  return (
    <ol className="flex items-center gap-1.5" aria-label={`Progress: ${labels[step]}`}>
      {labels.map((l, i) => (
        <li key={l} className="flex items-center gap-1.5">
          <span className={cn('h-1.5 w-8 rounded-full', i <= step ? 'bg-foreground' : 'bg-foreground/15')} aria-hidden="true" />
          <span className={cn('text-[12px]', i === step ? 'font-semibold text-foreground' : 'text-muted-foreground')}>{l}</span>
        </li>
      ))}
    </ol>
  )
}

export function QueueView() {
  const conn = useSpacetimeDB()
  const now = useNow(15_000)
  const [operators, opsReady] = useTable(tables.operator)
  const [incidents, incReady] = useTable(tables.incident)
  const claim = useReducer(reducers.claimIncident)
  const release = useReducer(reducers.releaseIncident)
  const reassign = useReducer(reducers.reassignIncident)
  const resolve = useReducer(reducers.resolveIncident)
  const startShift = useReducer(reducers.startMyShift)
  const endShift = useReducer(reducers.endMyShift)
  const [busy, setBusy] = useState<string | null>(null)

  const myId = conn.identity?.toHexString() ?? ''
  const me = operators.find(o => o.identity.toHexString() === myId)
  const placeOf = useIncidentPlace()

  const shiftStart = me?.onShift ? microsToMs(me.shiftStartedMicros) : 0
  const shiftEnd = me?.onShift ? microsToMs(me.shiftEndsMicros) : 0
  const shiftPct = me?.onShift ? Math.min(100, Math.max(0, ((now - shiftStart) / (shiftEnd - shiftStart)) * 100)) : 0

  const bySev = (a: { severity: string; updatedAt: { microsSinceUnixEpoch: bigint } }, b: typeof a) =>
    (SEV_RANK[a.severity] ?? 9) - (SEV_RANK[b.severity] ?? 9) || ms(b.updatedAt) - ms(a.updatedAt)
  const mine = incidents.filter(i => i.owner === myId && i.status !== 'closed').sort(bySev)
  const unclaimed = incidents.filter(i => !i.owner && i.status !== 'closed').sort(bySev)
  const doneThisShift = me?.onShift
    ? incidents.filter(i => i.owner === myId && i.status === 'closed' && ms(i.updatedAt) >= shiftStart).sort((a, b) => ms(b.updatedAt) - ms(a.updatedAt))
    : []
  const total = mine.length + doneThisShift.length
  const pool = { leftovers: unclaimed.filter(i => i.handedFrom).length }
  const teammates = operators.filter(o => o.onShift && o.role !== 'agent' && o.identity.toHexString() !== myId).sort((a, b) => a.name.localeCompare(b.name))
  const team = operators
    .filter(o => o.role !== 'agent')
    .map(o => ({ o, open: incidents.filter(i => i.owner === o.identity.toHexString() && i.status !== 'closed').length }))
    .sort((a, b) => Number(b.o.onShift) - Number(a.o.onShift) || a.o.name.localeCompare(b.o.name))

  async function run(key: string, fn: () => Promise<unknown>, ok: string) {
    setBusy(key)
    try {
      await fn()
      toast.success(ok)
    } catch (e) {
      toast.error(errText(e))
    } finally {
      setBusy(null)
    }
  }

  if (!opsReady || !incReady) return <p className="p-6 text-[15px] text-muted-foreground">Loading your queue…</p>
  if (!me) {
    return (
      <div className="p-6">
        <Card title="My Queue">
          <p className="text-[15px] text-muted-foreground">This browser isn't registered as an operator yet. Sign in again, or register on the Operators page, to claim incidents and start a shift.</p>
        </Card>
      </div>
    )
  }

  const first = me.name.split(' ')[0]
  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <div className="grid gap-3.5 p-3.5 lg:grid-cols-[minmax(0,1fr)_380px]">
        {/* who, shift status, totals */}
        <div className="grid gap-3.5 lg:col-span-2 lg:grid-cols-[minmax(0,1fr)_repeat(3,150px)]">
          <div className="flex items-center gap-4 rounded-lg bg-card px-5 py-4">
            <CharacterAvatar identity={myId} size={52} title={`${me.name}'s profile character`} />
            <div className="min-w-0">
              <h1 className="text-xl font-semibold">{me.onShift ? `On shift, ${first}` : `Hi ${first}, you're off shift`}</h1>
              <p className="text-[15px] text-muted-foreground">
                {me.onShift
                  ? `${clock(shiftStart)}–${clock(shiftEnd)} · ${now < shiftEnd ? `${span(shiftEnd - now)} left` : `over by ${span(now - shiftEnd)}`}`
                  : 'Starting a shift hands you the leftover tasks first, then the most urgent ones.'}
              </p>
            </div>
          </div>
          <Tile k="My open tasks" v={mine.length} sub={mine.length ? `${mine.filter(i => i.severity === 'critical').length} critical` : 'Nothing on you'} />
          <Tile k="Done this shift" v={doneThisShift.length} sub={total ? `${Math.round((doneThisShift.length / total) * 100)}% of your tasks` : undefined} />
          <Tile k="Up for grabs" v={unclaimed.length} sub={unclaimed.length ? 'unclaimed' : 'All owned'} />
        </div>

        <div className="flex min-w-0 flex-col gap-3.5">
          {/* my tasks */}
          <Card title="My tasks" aside={mine.length ? 'Most urgent first' : undefined} className="lg:min-h-[300px]">
            {!mine.length ? (
              <p className="text-[15px] text-muted-foreground">{me.onShift ? 'Nothing assigned to you. Claim an incident from Up for grabs.' : 'Start your shift, then claim incidents from Up for grabs.'}</p>
            ) : (
              <ul className="flex flex-col gap-2">
                {mine.map(i => {
                  const id = String(i.incidentId)
                  return (
                    <li key={id}>
                      <Strip severity={i.severity} at={placeOf(i)}>
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div className="min-w-0 flex-1">
                            <p className="text-[15px] font-semibold">{placeOf(i).what}</p>
                            <p className="text-[13.5px] text-muted-foreground">
                              <SevText severity={i.severity} /> · #{id} · {i.status === 'escalated' ? 'escalated · ' : ''}{i.handedFrom ? `left by ${i.handedFrom} · ` : ''}yours since {ago(microsToMs(i.claimedAtMicros), now)}
                            </p>
                          </div>
                          <div className="flex shrink-0 gap-1.5">
                            <DropdownMenu.Root>
                              <DropdownMenu.Trigger asChild>
                                <Button size="sm" variant="outline" disabled={!!busy}>
                                  <ArrowRightLeftIcon aria-hidden="true" /> Reassign
                                </Button>
                              </DropdownMenu.Trigger>
                              <DropdownMenu.Portal>
                                <DropdownMenu.Content align="end" sideOffset={6} aria-label={`Reassign task #${id}`} className="z-50 min-w-[200px] rounded-md bg-popover p-1 text-popover-foreground shadow-md ring-1 ring-border">
                                  <DropdownMenu.Label className="px-2 py-1 text-[12px] text-muted-foreground">Give to someone on shift</DropdownMenu.Label>
                                  {teammates.map(o => (
                                    <DropdownMenu.Item
                                      key={o.identity.toHexString()}
                                      onSelect={() => void run(`re${id}`, () => reassign({ incidentId: i.incidentId, to: o.identity }), `#${id} reassigned to ${o.name}`)}
                                      className={MENU_ITEM}
                                    >
                                      <CharacterAvatar identity={o.identity.toHexString()} size={20} />
                                      {o.name}
                                    </DropdownMenu.Item>
                                  ))}
                                  {!teammates.length && <p className="px-2 py-1 text-[13px] text-muted-foreground">Nobody else is on shift</p>}
                                  <DropdownMenu.Separator className="my-1 h-px bg-border" />
                                  <DropdownMenu.Item
                                    onSelect={() => void run(`rel${id}`, () => release({ incidentId: i.incidentId }), `#${id} is back in Up for grabs`)}
                                    className={cn(MENU_ITEM, 'text-muted-foreground')}
                                  >
                                    <UndoIcon className="size-3.5" aria-hidden="true" /> Back to the pool
                                  </DropdownMenu.Item>
                                </DropdownMenu.Content>
                              </DropdownMenu.Portal>
                            </DropdownMenu.Root>
                            <Button size="sm" disabled={!!busy} onClick={() => run(`res${id}`, () => resolve({ incidentId: i.incidentId, note: '' }), `Resolved #${id}`)}>
                              <CheckIcon aria-hidden="true" /> Resolve
                            </Button>
                          </div>
                        </div>
                        <div className="mt-2.5"><Track step={1} /></div>
                      </Strip>
                    </li>
                  )
                })}
              </ul>
            )}
          </Card>

          {/* unclaimed */}
          <Card title="Up for grabs" aside={unclaimed.length ? `${unclaimed.length} unclaimed` : undefined}>
            {!unclaimed.length ? (
              <p className="text-[15px] text-muted-foreground">Every active incident has an owner.</p>
            ) : (
              <ul className="flex flex-col gap-2">
                {unclaimed.map(i => {
                  const id = String(i.incidentId)
                  return (
                    <li key={id}>
                      <Strip severity={i.severity} at={placeOf(i)}>
                        <div className="flex items-center justify-between gap-3">
                          <div className="min-w-0">
                            <p className="truncate text-[15px] font-semibold">{placeOf(i).what}</p>
                            <p className="truncate text-[13.5px] text-muted-foreground">
                              <SevText severity={i.severity} /> · #{id} · {i.handedFrom ? <span className="font-medium text-foreground">left by {i.handedFrom}</span> : i.status} · opened {ago(ms(i.openedAt), now)}
                            </p>
                          </div>
                          <Button size="sm" variant="outline" className="shrink-0" disabled={!!busy || !me.onShift} title={me.onShift ? undefined : 'Start your shift to claim'} onClick={() => run(`claim${id}`, () => claim({ incidentId: i.incidentId }), `Claimed #${id}`)}>
                            <HandIcon aria-hidden="true" /> Claim
                          </Button>
                        </div>
                      </Strip>
                    </li>
                  )
                })}
              </ul>
            )}
          </Card>
        </div>

        <div className="flex min-w-0 flex-col gap-3.5">
          {/* shift */}
          <Card title="My shift" aside={me.onShift ? `${Math.round(shiftPct)}% through` : 'Off shift'}>
            {me.onShift ? (
              <div className="flex flex-col gap-4">
                <div>
                  <div className="h-2 overflow-hidden rounded-full bg-muted" role="progressbar" aria-label="Shift progress" aria-valuenow={Math.round(shiftPct)} aria-valuemin={0} aria-valuemax={100}>
                    <div className="h-full rounded-full bg-foreground transition-[width] duration-500" style={{ width: `${shiftPct}%` }} />
                  </div>
                  <div className="mt-1.5 flex justify-between text-[13px] text-muted-foreground tabular-nums">
                    <span>Started {clock(shiftStart)}</span>
                    <span>Ends {clock(shiftEnd)}</span>
                  </div>
                </div>
                <dl className="grid grid-cols-2 gap-2 text-[13.5px]">
                  <div className="rounded-md bg-muted px-3 py-2"><dt className="text-muted-foreground">Time on shift</dt><dd className="font-semibold tabular-nums">{span(now - shiftStart)}</dd></div>
                  <div className="rounded-md bg-muted px-3 py-2"><dt className="text-muted-foreground">Tasks done</dt><dd className="font-semibold tabular-nums">{doneThisShift.length} of {total}</dd></div>
                </dl>
                <Button variant="outline" disabled={!!busy} onClick={() => run('end', () => endShift(), mine.length ? `Shift ended · ${mine.length} task${mine.length === 1 ? '' : 's'} handed over` : 'Shift ended')}>
                  <LogOutIcon aria-hidden="true" /> {mine.length ? 'End shift & hand over' : 'End shift'}
                </Button>
                {mine.length > 0 && <p className="-mt-2 text-[12.5px] text-muted-foreground">Your {mine.length} open task{mine.length === 1 ? '' : 's'} will go to the next person who starts a shift.</p>}
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                <p className="text-[14.5px] text-muted-foreground">How long is your shift? {pool.leftovers ? `${pool.leftovers} leftover task${pool.leftovers === 1 ? '' : 's'} will be assigned to you first.` : ''}</p>
                <div className="grid grid-cols-2 gap-2">
                  {SHIFT_HOURS.map(h => (
                    <Button key={h} variant={h === 8 ? 'default' : 'outline'} disabled={!!busy} onClick={() => run(`start${h}`, () => startShift({ hours: h }), `Shift started · ${h} h`)}>
                      <PlayIcon aria-hidden="true" /> {h} hours
                    </Button>
                  ))}
                </div>
              </div>
            )}
          </Card>

          {/* team */}
          <Card title="Team" aside={`${team.filter(x => x.o.onShift).length} on shift`}>
            <ul className="flex flex-col divide-y">
              {team.map(({ o, open }) => {
                const you = o.identity.toHexString() === myId
                const end = microsToMs(o.shiftEndsMicros)
                return (
                  <li key={o.identity.toHexString()} className="flex items-center justify-between gap-3 py-2.5">
                    <CharacterAvatar identity={o.identity.toHexString()} size={36} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[14.5px] font-semibold">{o.name}{you && <span className="ml-1.5 font-normal text-muted-foreground">(you)</span>}</p>
                      <p className="truncate text-[13px] text-muted-foreground">
                        {o.onShift ? `On shift · until ${clock(end)} · ${now < end ? `${span(end - now)} left` : 'ending'}` : 'Off shift'}
                      </p>
                    </div>
                    <span className={cn('shrink-0 rounded-full px-2.5 py-0.5 text-[13px] font-semibold tabular-nums', open ? 'bg-foreground text-background' : 'bg-muted text-muted-foreground')}>
                      {open} task{open === 1 ? '' : 's'}
                    </span>
                  </li>
                )
              })}
            </ul>
          </Card>

          {/* done this shift */}
          <Card title="Done this shift" aside={doneThisShift.length ? doneSummary(doneThisShift) : undefined}>
            {!doneThisShift.length ? (
              <p className="text-[15px] text-muted-foreground">{me.onShift ? 'Incidents you resolve this shift show up here.' : 'No shift running.'}</p>
            ) : (
              <ul className="flex flex-col divide-y divide-border">
                {doneThisShift.map(i => {
                  const at = placeOf(i)
                  const auto = i.closedReason === 'recovered' // closed by the rules when the GPU cooled, not by a person
                  return (
                    <li key={String(i.incidentId)} className="flex items-center gap-3 py-2.5 first:pt-0 last:pb-0">
                      <span className={cn('grid size-7 shrink-0 place-items-center rounded-full', auto ? 'bg-muted text-muted-foreground' : 'bg-success/15 text-success')} aria-hidden="true">
                        {auto ? <ThermometerSnowflakeIcon className="size-3.5" /> : <CheckIcon className="size-3.5" />}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[14px] font-semibold">
                          <span className={cn(i.severity === 'critical' ? 'text-destructive' : i.severity === 'high' ? 'text-warning' : 'text-muted-foreground')}>{at.block}</span> · {at.what}
                        </p>
                        <p className="truncate text-[12.5px] text-muted-foreground">
                          {auto ? 'Cooled down on its own' : i.closedReason.replace(/^resolved by /, 'Resolved by ')} · took {ago(ms(i.openedAt), ms(i.updatedAt)).replace(/ ago$/, '')}
                        </p>
                      </div>
                      <span className="shrink-0 text-[12.5px] text-muted-foreground tabular-nums">{clock(ms(i.updatedAt))}</span>
                    </li>
                  )
                })}
              </ul>
            )}
          </Card>
        </div>
      </div>
    </div>
  )
}
