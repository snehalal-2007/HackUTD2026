import { FileTextIcon } from 'lucide-react'
import { Badge } from '@/components/reui/badge'
import { ago } from '@/lib/snapshot'
import type { IncidentVM } from './use-log-data'

const SEVERITY = {
  critical: 'destructive',
  high: 'warning',
  medium: 'info',
  low: 'secondary',
} as const

const STATUS = {
  escalated: 'destructive-light',
  open: 'warning-light',
  acknowledged: 'info-light',
  closed: 'secondary',
} as const

function unit(kind: string) {
  return kind === 'feed_stale' ? 's silent' : kind.startsWith('gpu') ? ' °C peak' : ''
}

export function IncidentList({ incidents, now }: { incidents: IncidentVM[]; now: number }) {
  if (incidents.length === 0) {
    return <p className="text-sm text-muted-foreground">No incidents. Rules open one when a rack passes its limit or a feed goes silent.</p>
  }
  return (
    <ul className="flex flex-col divide-y rounded-lg border bg-card" aria-label="Incidents">
      {incidents.map(i => (
        <li key={i.id} className="flex flex-col gap-1.5 px-3 py-2.5">
          <div className="flex flex-wrap items-center gap-1.5">
            <Badge size="sm" variant={SEVERITY[i.severity as keyof typeof SEVERITY] ?? 'secondary'} className="capitalize">
              {i.severity}
            </Badge>
            <Badge size="sm" variant={STATUS[i.status as keyof typeof STATUS] ?? 'secondary'} className="capitalize">
              {i.status}
            </Badge>
            <span className="text-xs text-muted-foreground tabular-nums">#{i.id}</span>
            <span className="ml-auto text-xs text-muted-foreground tabular-nums">{ago(i.updatedMs, now)}</span>
          </div>
          <p className="text-sm font-medium">{i.title}</p>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
            <span>{i.datacenter}{i.rack ? ` · rack ${i.rack}` : ''}</span>
            {i.peak > 0 && <span className="tabular-nums">{Math.round(i.peak * 10) / 10}{unit(i.kind)}</span>}
            <span>{i.source === 'rule' ? 'Opened by rule' : 'Opened manually'}</span>
            {i.closedReason && <span>Closed: {i.closedReason}</span>}
            {i.reports.map(r => (
              <span key={r} className="inline-flex items-center gap-1">
                <FileTextIcon className="size-3" aria-hidden="true" />
                {r} report
              </span>
            ))}
          </div>
        </li>
      ))}
    </ul>
  )
}
