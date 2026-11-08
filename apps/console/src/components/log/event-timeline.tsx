import { useTable } from 'spacetimedb/react'
import { tables } from '@mesa/bindings'
import { Timeline, TimelineContent, TimelineDate, TimelineHeader, TimelineIndicator, TimelineItem, TimelineSeparator, TimelineTitle } from '@/components/reui/timeline'
import { ago } from '@/lib/snapshot'
import type { EventVM } from './use-log-data'

const time = (ms: number) => new Date(ms).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
const SYSTEM_ACTORS: Record<string, string> = { rules: 'Rules', agent: 'AI agent', shifts: 'Shifts' }

/** Event actor → a readable name: the system actors by name, operators by their registered name (the log stores an id prefix). */
export function useActorName() {
  const [operators] = useTable(tables.operator)
  return (actor: string) =>
    SYSTEM_ACTORS[actor] ?? operators.find(o => o.identity.toHexString().startsWith(actor))?.name ?? `Operator ${actor.slice(0, 6)}`
}

const tech = (e: EventVM) => `#${e.seq} · hash ${e.hash.slice(0, 12)}… · previous ${e.prevHash.slice(0, 12)}…` // kept out of sight, on hover

/** The newest few events as plain sentences: who did what, where, how long ago. No ids or hashes. */
export function RecentSummary({ events, now }: { events: EventVM[]; now: number }) {
  const who = useActorName()
  if (!events.length) return null
  return (
    <ul className="flex flex-col gap-2.5">
      {events.map(e => (
        <li key={e.seq} className="flex gap-2.5 text-[13.5px] leading-snug" title={tech(e)}>
          <span className="mt-[7px] size-1.5 shrink-0 rounded-full bg-foreground/40" aria-hidden="true" />
          <span className="min-w-0 flex-1">
            <b className="font-semibold">{who(e.actor)}</b> {e.action}
            {e.label && <span className="text-muted-foreground"> · {e.label}</span>}
          </span>
          <span className="shrink-0 text-[12px] text-muted-foreground tabular-nums">{ago(e.ms, now)}</span>
        </li>
      ))}
    </ul>
  )
}

/** One page of the hash-chained audit trail, newest first. `fresh` holds the seqs that arrived while watching; only those rise in, so paging stays instant. */
export function EventTimeline({ events, fresh }: { events: EventVM[]; fresh?: Set<string> }) {
  const who = useActorName()
  if (events.length === 0) {
    return <p className="text-sm text-muted-foreground">No earlier events here.</p>
  }
  return (
    <Timeline aria-label="Earlier events">
      {events.map((e, i) => (
        <TimelineItem key={e.seq} step={i + 1} className={fresh?.has(e.seq) ? 'enter-rise' : undefined} title={tech(e)}>
          <TimelineHeader>
            <TimelineSeparator />
            <TimelineDate dateTime={new Date(e.ms).toISOString()} className="tabular-nums">
              {time(e.ms)} · {who(e.actor)}
            </TimelineDate>
            <TimelineTitle className="text-sm">{e.action}</TimelineTitle>
            <TimelineIndicator />
          </TimelineHeader>
          {e.label && <TimelineContent className="text-xs break-words">{e.label}</TimelineContent>}
        </TimelineItem>
      ))}
    </Timeline>
  )
}
