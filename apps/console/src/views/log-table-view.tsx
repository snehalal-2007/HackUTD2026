import { ArrowLeftIcon, ChevronLeftIcon, ChevronRightIcon, ChevronsLeftIcon, ChevronsRightIcon } from 'lucide-react'
import { Badge } from '@/components/reui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { useLogData } from '@/components/log/use-log-data'

const PAGE_SIZE = 50
const TH = 'sticky top-0 z-10 bg-card shadow-[inset_0_-1px_0_var(--border)]'

const fullTime = (ms: number) => {
  const d = new Date(ms)
  return {
    date: d.toLocaleDateString([], { month: 'short', day: 'numeric' }),
    time: d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
    iso: d.toISOString(),
  }
}

function actorLabel(actor: string) {
  return actor === 'rules' || actor === 'agent' ? actor : `operator ${actor.slice(0, 8)}`
}

/**
 * Every event in a table, newest first, PAGE_SIZE per page. The page lives in the URL
 * (/logs/:page) so a page can be linked and the browser's Back button works.
 * The table scrolls inside its own panel; the page itself never grows.
 */
export function LogTableView({ page, onPage, onBack }: { page: number; onPage: (p: number) => void; onBack: () => void }) {
  const { data, cached } = useLogData()

  if (!data) {
    return (
      <div className="flex flex-col gap-3 p-4" aria-busy="true">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-96 w-full" />
      </div>
    )
  }

  const total = data.events.length
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE))
  const outOfRange = page > pages
  const start = (page - 1) * PAGE_SIZE
  const rows = outOfRange ? [] : data.events.slice(start, start + PAGE_SIZE)

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="mx-auto flex min-h-0 w-full max-w-6xl flex-1 flex-col gap-3 px-4 py-4">
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <Button size="sm" variant="ghost" onClick={onBack}>
            <ArrowLeftIcon aria-hidden="true" />
            Back to Log
          </Button>
          {cached && <Badge variant="warning" size="sm">Cached (last {total} events)</Badge>}
          <span className="ml-auto text-xs text-muted-foreground tabular-nums">
            {total === 0 ? 'No events' : outOfRange ? `Page ${page} is past the last page` : `${(start + 1).toLocaleString()}–${(start + rows.length).toLocaleString()} of ${total.toLocaleString()}`}
          </span>
        </div>

        <div className="min-h-0 flex-1 overflow-auto rounded-lg border bg-card">
          {outOfRange ? (
            <div className="flex flex-col items-start gap-2 p-6 text-sm">
              <p>There are only {pages} pages of events.</p>
              <Button size="sm" variant="outline" onClick={() => onPage(pages)}>
                Go to page {pages}
              </Button>
            </div>
          ) : (
            // A plain <table>: the shadcn Table wrapper adds its own scroll box, which stops sticky headers.
            <table className="w-full caption-bottom text-sm">
              <TableHeader>
                <TableRow>
                  <TableHead className={`${TH} w-16`}>#</TableHead>
                  <TableHead className={`${TH} w-40`}>Time</TableHead>
                  <TableHead className={`${TH} w-32`}>Actor</TableHead>
                  <TableHead className={`${TH} w-56`}>Action</TableHead>
                  <TableHead className={TH}>Target</TableHead>
                  <TableHead className={`${TH} w-20`}>Incident</TableHead>
                  <TableHead className={`${TH} w-28`}>Hash</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-muted-foreground">
                      No events yet. Every rule decision and report is recorded here.
                    </TableCell>
                  </TableRow>
                ) : (
                  rows.map(e => {
                    const t = fullTime(e.ms)
                    return (
                      <TableRow key={e.seq}>
                        <TableCell className="text-muted-foreground tabular-nums">{e.seq}</TableCell>
                        <TableCell className="tabular-nums">
                          <time dateTime={t.iso} title={t.iso}>
                            <span className="text-muted-foreground">{t.date}</span> {t.time}
                          </time>
                        </TableCell>
                        <TableCell>{actorLabel(e.actor)}</TableCell>
                        <TableCell>{e.action}</TableCell>
                        <TableCell className="max-w-md truncate" title={e.target}>
                          {e.target}
                        </TableCell>
                        <TableCell className="tabular-nums">{e.incidentId ? `#${e.incidentId}` : ''}</TableCell>
                        <TableCell className="font-mono text-xs" title={`hash ${e.hash}\nprevious ${e.prevHash}`}>
                          {e.hash.slice(0, 8)}
                        </TableCell>
                      </TableRow>
                    )
                  })
                )}
              </TableBody>
            </table>
          )}
        </div>

        {pages > 1 && (
          <nav className="flex shrink-0 items-center justify-center gap-1" aria-label="Log pages">
            <Button size="icon-sm" variant="ghost" disabled={page <= 1} onClick={() => onPage(1)} aria-label="First page (newest)">
              <ChevronsLeftIcon aria-hidden="true" />
            </Button>
            <Button size="sm" variant="ghost" disabled={page <= 1} onClick={() => onPage(page - 1)}>
              <ChevronLeftIcon aria-hidden="true" />
              Newer
            </Button>
            <span className="px-2 text-xs text-muted-foreground tabular-nums">
              Page {Math.min(page, pages)} of {pages}
            </span>
            <Button size="sm" variant="ghost" disabled={page >= pages} onClick={() => onPage(page + 1)}>
              Older
              <ChevronRightIcon aria-hidden="true" />
            </Button>
            <Button size="icon-sm" variant="ghost" disabled={page >= pages} onClick={() => onPage(pages)} aria-label="Last page (oldest)">
              <ChevronsRightIcon aria-hidden="true" />
            </Button>
          </nav>
        )}
      </div>
    </div>
  )
}
