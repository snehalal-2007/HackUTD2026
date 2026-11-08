import { ActivityIcon, CircleAlertIcon } from 'lucide-react'
import { Badge } from '@/components/reui/badge'
import { ago } from '@/lib/snapshot'
import type { FeedVM } from './use-log-data'

/** One chip per data center: seconds since its last batch, red when the watchdog marked it stale. */
export function FeedHealth({ feeds, now, cached = false }: { feeds: FeedVM[]; now: number; cached?: boolean }) {
  if (feeds.length === 0) {
    return <p className="text-sm text-muted-foreground">No feeds yet. Start the replayer to stream telemetry.</p>
  }
  return (
    <ul className="grid grid-cols-2 gap-2 sm:grid-cols-4" aria-label="Telemetry feeds">
      {feeds.map(f => (
        <li key={f.id} className="flex min-w-0 flex-col gap-1 rounded-lg border bg-card px-3 py-2">
          <div className="flex min-w-0 items-center gap-2">
            <span className="truncate text-sm font-medium">{f.name}</span>
            <Badge className="ml-auto shrink-0" variant={f.stale ? 'destructive-light' : cached ? 'secondary' : 'success-light'} size="sm">
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
