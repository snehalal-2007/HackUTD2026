import { Timeline, TimelineContent, TimelineDate, TimelineHeader, TimelineIndicator, TimelineItem, TimelineSeparator, TimelineTitle } from '@/components/reui/timeline'
import type { EventVM } from './use-log-data'

const time = (ms: number) => new Date(ms).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })

/** One page of the hash-chained audit trail, newest first. */
export function EventTimeline({ events }: { events: EventVM[] }) {
  if (events.length === 0) {
    return <p className="text-sm text-muted-foreground">No events yet. Every rule decision and report is recorded here.</p>
  }
  const shown = events
  return (
    <Timeline aria-label="Event log">
      {shown.map((e, i) => (
        <TimelineItem key={e.seq} step={i + 1}>
          <TimelineHeader>
            <TimelineSeparator />
            <TimelineDate dateTime={new Date(e.ms).toISOString()} className="tabular-nums">
              {time(e.ms)} · #{e.seq} · {e.actor === 'rules' || e.actor === 'agent' ? e.actor : `operator ${e.actor.slice(0, 8)}`}
            </TimelineDate>
            <TimelineTitle className="text-sm">{e.action}</TimelineTitle>
            <TimelineIndicator />
          </TimelineHeader>
          <TimelineContent className="text-xs">
            <span className="break-words">{e.target}</span>
            <span className="ml-2 font-mono text-muted-foreground" title={`hash ${e.hash}, previous ${e.prevHash}`}>
              {e.hash.slice(0, 8)}
            </span>
          </TimelineContent>
        </TimelineItem>
      ))}
    </Timeline>
  )
}
