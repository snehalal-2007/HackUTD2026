import { ActivityIcon, CircleAlertIcon } from 'lucide-react'
import { Badge } from '@/components/reui/badge'
import { ago } from '@/lib/snapshot'
import { useArrivals } from '@/lib/use-arrivals'
import type { FeedVM } from './use-log-data'

/** One chip per data center: seconds since its last batch, red when the watchdog marked it stale. */
export function FeedHealth({ feeds, now, cached = false }: { feeds: FeedVM[]; now: number; cached?: boolean }) {
  // A feed flipping between Live and Silent pops its badge once; the ticking "x s ago" never moves.
  const flipped = useArrivals(feeds.map(f => `${f.id}:${f.stale}`), !cached)
  const newFeeds = useArrivals(feeds.map(f => f.id), !cached)
  if (feeds.length === 0) {
    return <p className="text-sm text-muted-foreground">No feeds yet. Start the replayer to stream telemetry.</p>
  }
  return (
    <ul className="grid grid-cols-2 gap-2 sm:grid-cols-4" aria-label="Telemetry feeds">
      {feeds.map(f => (
        <li key={f.id} className="flex min-w-0 flex-col gap-1 rounded-lg border bg-card px-3 py-2">
          <div className="flex min-w-0 items-center gap-2">
            <span className="truncate text-sm font-medium">{f.name}</span>
            <Badge
              key={String(f.stale)}
              className={`state-shift ml-auto shrink-0${!newFeeds.has(f.id) && flipped.has(`${f.id}:${f.stale}`) ? ' enter-pop' : ''}`}
              variant={f.stale ? 'destructive-light' : cached ? 'secondary' : 'success-light'}
              size="sm"
            >
              {f.stale ? <CircleAlertIcon aria-hidden="true" /> : <ActivityIcon aria-hidden="true" />}
              {f.stale ? 'Silent' : cached ? 'Last known' : 'Live'}
            </Badge>
          </div>
          <span className="text-xs text-muted-foreground tabular-nums">
            Last batch {ago(f.lastMs, now)} · {f.batches.toLocaleString()} batches
          </span>
        </li>
      ))}
    </ul>
  )
}
