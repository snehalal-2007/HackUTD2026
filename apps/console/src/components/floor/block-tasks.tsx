import { useMemo, useState } from 'react'
import { useReducer, useSpacetimeDB, useTable } from 'spacetimedb/react'
import { reducers, tables } from '@mesa/bindings'
import { HandIcon, InboxIcon, UserIcon } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { requestView } from '@/components/notify/navigate'
import { cn } from '@/lib/utils'
import { GPU_WARN_C, SITES, type Hall } from './data'
import { AddressBlock } from './address-block'
import { makeNamer } from './names'
import { useBlockTasks } from './use-block-tasks'

// The Tasks tab on a block: the active incidents (tasks) this block is causing. The most urgent one is shown in full, with
// who owns it and a way to take it; the rest wait underneath as "Up next" and move up as tasks are resolved,
// plus the block's risks. Incidents are opened per rack (a row of three blocks); the hottest block in the row owns
// them, and the other blocks just point to it. Claiming goes through claim_incident, which refuses a task someone owns.

export function BlockTasks({ hall, row, onPick }: { hall: Hall; row: Hall[]; onPick: (id: string) => void }) {
  const conn = useSpacetimeDB()
  const { here: tasks, elsewhere, cause } = useBlockTasks(hall, row)
  const [operators] = useTable(tables.operator)
  const [dcs] = useTable(tables.datacenter)
  const [racks] = useTable(tables.rack)
  const claim = useReducer(reducers.claimIncident)
  const [busy, setBusy] = useState<bigint | null>(null)
  const names = useMemo(() => makeNamer(dcs, racks.map(r => r.rackId)), [dcs, racks])

  const myId = conn.identity?.toHexString() ?? ''
  const me = operators.find(o => o.identity.toHexString() === myId)
  const onShift = (id: string) => operators.find(o => o.identity.toHexString() === id)?.onShift ?? false

  async function work(incidentId: bigint) {
    setBusy(incidentId)
    try {
      await claim({ incidentId })
      toast.success(`Task #${incidentId} is yours`, { action: { label: 'My Queue', onClick: () => requestView('queue') } })
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(null)
    }
  }

  const blockedWhy = !me ? 'Register as an operator first' : !me.onShift ? 'Start your shift in My Queue to take tasks' : null

  return (
    <>
      <h4 className="mb-1.5 text-[13px] font-semibold tracking-[.06em] text-muted-foreground uppercase">Tasks</h4>
      {elsewhere.length > 0 && (
        <div className="mb-2 flex flex-col gap-1.5">
          {elsewhere.map(i => (
            <button
              key={String(i.incidentId)}
              type="button"
              onClick={() => onPick(cause.id)}
              className="flex items-center gap-2 rounded-lg bg-muted px-3.5 py-2.5 text-left text-[13.5px] hover:bg-accent"
            >
              <span className="min-w-0 flex-1">
                Task #{String(i.incidentId)} on this row is about <b className="font-semibold">{cause.tag}</b>
                <span className="text-muted-foreground"> · GPU at {cause.temp.toFixed(1)} °C</span>
              </span>
              <span className="shrink-0 font-semibold">View {cause.tag} ›</span>
            </button>
          ))}
        </div>
      )}
      {!tasks.length ? (
        !elsewhere.length && <p className="text-[14px] text-muted-foreground">No open tasks on block {hall.tag}. The rules open one when a GPU stays at or over {GPU_WARN_C} °C.</p>
      ) : (
        <>
        {/* the most urgent task, in full; when it's resolved it leaves the list and the next one takes its place */}
        {tasks.slice(0, 1).map(i => {
            const id = String(i.incidentId)
            const mine = i.owner === myId
            return (
              <div key={id} className="enter-rise">
                <div className="rounded-lg bg-muted px-3.5 py-3">
                  <div className="flex gap-3.5">
                  <AddressBlock block={hall.tag} floor={hall.floor} site={SITES.find(x => x.id === hall.site)?.name ?? ''} severity={i.severity} />
                  <div className="min-w-0 flex-1">
                  <p className="text-[15px] leading-snug font-semibold">{names.text(i.title).split(': ').slice(1).join(': ') || names.text(i.title)}</p>
                  <p className="mt-0.5 text-[13px] text-muted-foreground">
                    <span className={cn('font-semibold capitalize', i.severity === 'critical' ? 'text-destructive' : i.severity === 'high' ? 'text-warning' : '')}>{i.severity}</span>
                    {' · '}#{id} · {i.status}{i.handedFrom && !i.owner ? ` · left by ${i.handedFrom}` : ''}
                  </p>
                  <div className="mt-2.5 flex items-center justify-between gap-2">
                    {mine ? (
                      <>
                        <span className="inline-flex items-center gap-1.5 text-[13.5px] font-semibold"><UserIcon className="size-4" aria-hidden="true" /> You're on it</span>
                        <Button size="sm" variant="outline" onClick={() => requestView('queue')}><InboxIcon aria-hidden="true" /> My Queue</Button>
                      </>
                    ) : i.owner ? (
                      <span className="inline-flex items-center gap-1.5 text-[13.5px]">
                        <UserIcon className="size-4 text-muted-foreground" aria-hidden="true" />
                        Assigned to <b className="font-semibold">{i.ownerName || 'another operator'}</b>
                        <span className="text-muted-foreground">· {onShift(i.owner) ? 'on shift' : 'off shift'}</span>
                      </span>
                    ) : (
                      <>
                        <span className="text-[13.5px] text-muted-foreground">Unassigned</span>
                        <Button size="sm" disabled={!!blockedWhy || busy !== null} title={blockedWhy ?? undefined} onClick={() => work(i.incidentId)}>
                          <HandIcon aria-hidden="true" /> {busy === i.incidentId ? 'Taking…' : 'Work on this'}
                        </Button>
                      </>
                    )}
                  </div>
                  {!mine && !i.owner && blockedWhy && <p className="mt-1.5 text-[12.5px] text-muted-foreground">{blockedWhy}.</p>}
                  </div>
                  </div>
                </div>
              </div>
            )
          })}
        {tasks.length > 1 && (
          <>
            <h5 className="mt-4 mb-1 text-[12px] font-semibold text-muted-foreground">Up next · {tasks.length - 1}</h5>
            <ol className="flex flex-col">
              {tasks.slice(1).map((i, n) => (
                <li key={String(i.incidentId)} className="flex items-center gap-2.5 border-t py-2 text-[13.5px] first:border-t-0">
                  <span className="w-4 shrink-0 text-[12px] text-muted-foreground tabular-nums">{n + 2}</span>
                  <span className={cn('shrink-0 text-[12.5px] font-semibold capitalize', i.severity === 'critical' ? 'text-destructive' : i.severity === 'high' ? 'text-warning' : 'text-muted-foreground')}>{i.severity}</span>
                  <span className="min-w-0 flex-1 truncate">{names.text(i.title).split(': ').slice(1).join(': ') || names.text(i.title)}</span>
                  <span className="shrink-0 text-[12.5px] text-muted-foreground">{i.owner ? (i.owner === myId ? 'You' : i.ownerName || 'Owned') : 'Unassigned'}</span>
                </li>
              ))}
            </ol>
          </>
        )}
        </>
      )}

      <h4 className="mt-5 mb-1.5 text-[13px] font-semibold tracking-[.06em] text-muted-foreground uppercase">Risks in block {hall.tag}</h4>
      {hall.risks.length ? (
        <ul>
          {hall.risks.map(r => (
            <li key={r} className="relative my-2.5 pl-5 text-[15px] leading-normal">
              <span aria-hidden="true" className={cn('absolute top-0.5 left-0 text-[10px]', hall.status === 'crit' ? 'text-destructive' : 'text-warning')}>▲</span>
              {r}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-[14px] text-muted-foreground">No GPU in block {hall.tag} is at or over {GPU_WARN_C} °C.</p>
      )}
    </>
  )
}
