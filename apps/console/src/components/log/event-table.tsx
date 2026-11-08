import { TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { useActorName } from './event-timeline'
import type { EventVM } from './use-log-data'

// Events as a table, newest first: number, time, who, action, where, incident and hash. Used on the Log page's
// Table view and on the full-page table (/logs/:page). Scrolls inside its parent; the header sticks.

const TH = 'sticky top-0 z-10 bg-card shadow-[inset_0_-1px_0_var(--border)]'
const fullTime = (ms: number) => {
  const d = new Date(ms)
  return { date: d.toLocaleDateString([], { month: 'short', day: 'numeric' }), time: d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }), iso: d.toISOString() }
}

export function EventTable({ rows, empty = 'No events yet. Every rule decision and report is recorded here.' }: { rows: EventVM[]; empty?: string }) {
  const who = useActorName()
  return (
    // A plain <table>: the shadcn Table wrapper adds its own scroll box, which stops sticky headers.
    <table className="w-full caption-bottom text-sm">
      <TableHeader>
        <TableRow>
          <TableHead className={`${TH} w-16`}>#</TableHead>
          <TableHead className={`${TH} w-40`}>Time</TableHead>
          <TableHead className={`${TH} w-32`}>Who</TableHead>
          <TableHead className={`${TH} w-56`}>Action</TableHead>
          <TableHead className={TH}>Where</TableHead>
          <TableHead className={`${TH} w-20`}>Incident</TableHead>
          <TableHead className={`${TH} w-28`}>Hash</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.length === 0 ? (
          <TableRow><TableCell colSpan={7} className="text-muted-foreground">{empty}</TableCell></TableRow>
        ) : (
          rows.map(e => {
            const t = fullTime(e.ms)
            return (
              <TableRow key={e.seq}>
                <TableCell className="text-muted-foreground tabular-nums">{e.seq}</TableCell>
                <TableCell className="tabular-nums"><time dateTime={t.iso} title={t.iso}><span className="text-muted-foreground">{t.date}</span> {t.time}</time></TableCell>
                <TableCell>{who(e.actor)}</TableCell>
                <TableCell>{e.action}</TableCell>
                <TableCell className="max-w-md truncate" title={e.label}>{e.label}</TableCell>
                <TableCell className="tabular-nums">{e.incidentId ? `#${e.incidentId}` : ''}</TableCell>
                <TableCell className="font-mono text-xs" title={`hash ${e.hash}\nprevious ${e.prevHash}`}>{e.hash.slice(0, 8)}</TableCell>
              </TableRow>
            )
          })
        )}
      </TableBody>
    </table>
  )
}
