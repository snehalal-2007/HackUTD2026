import { useMemo, useState } from 'react'
import { useReducer, useSpacetimeDB, useTable } from 'spacetimedb/react'
import { reducers, tables } from '@mesa/bindings'
import { HandIcon, InboxIcon, UserIcon } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { requestView } from '@/components/notify/navigate'
import { cn } from '@/lib/utils'
import { GPU_WARN_C, type Hall } from './data'
import { makeNamer } from './names'
import { rackOf, useBlockTasks } from './use-block-tasks'

// The Tasks tab on a block: the active incidents (tasks) on its rack, who owns each one, and a way to take one,
// plus the block's risks. Incidents are opened per rack by the threshold rules, and a rack is one row of three
// blocks, so a task covers the whole row. Claiming goes through claim_incident, which refuses a task someone owns.

export function BlockTasks({ hall }: { hall: Hall }) {
  const conn = useSpacetimeDB()
  const tasks = useBlockTasks(hall)
  const [operators] = useTable(tables.operator)
  const [dcs] = useTable(tables.datacenter)
  const [racks] = useTable(tables.rack)
  const claim = useReducer(reducers.claimIncident)
  const [busy, setBusy] = useState<bigint | null>(null)
  const names = useMemo(() => makeNamer(dcs, racks.map(r => r.rackId)), [dcs, racks])

  const myId = conn.identity?.toHexString() ?? ''
  const me = operators.find(o => o.identity.toHexString() === myId)
  const onShift = (id: string) => operators.find(o => o.identity.toHexString() === id)?.onShift ?? false
  const row = names.blocks(rackOf(hall)).replace(/^blocks /, '')

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
      <p className="-mt-0.5 mb-2.5 text-[12.5px] text-muted-foreground">Tasks are opened per rack, so these cover the whole row ({row}).</p>
      {!tasks.length ? (
        <p className="text-[14px] text-muted-foreground">No open tasks on this row. The rules open one when a GPU stays at or over {GPU_WARN_C} °C.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {tasks.map(i => {
            const id = String(i.incidentId)
            const mine = i.owner === myId
            const strip = i.severity === 'critical' ? 'bg-destructive/65' : i.severity === 'high' ? 'bg-warning/65' : 'bg-muted-foreground/30'
            return (
              <li key={id} className={cn('rounded-lg pl-1.5', strip)}>
                <div className="rounded-lg bg-muted px-3.5 py-3">
                  <p className="text-[14.5px] leading-snug font-semibold">{names.text(i.title)}</p>
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
              </li>
            )
          })}
        </ul>
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
