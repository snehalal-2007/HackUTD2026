import { FileTextIcon, UserIcon } from 'lucide-react'
import { Badge } from '@/components/reui/badge'
import { ago } from '@/lib/snapshot'
import type { IncidentVM } from './use-log-data'

const STRIP: Record<string, string> = {
  critical: 'bg-destructive/65',
  high: 'bg-warning/65',
  medium: 'bg-warning/40',
  low: 'bg-muted-foreground/30',
}

const STATUS = {
  escalated: 'destructive-light',
  open: 'warning-light',
  acknowledged: 'info-light',
  closed: 'secondary',
} as const

function unit(kind: string) {
  return kind === 'feed_stale' ? 's silent' : kind.startsWith('gpu') ? ' °C peak' : ''
}

/**
 * `newRows` (incident ids) and `changed` (`id:status:severity`) come from the parent, which tracks
 * arrivals across ALL incidents, so switching the Active/All filter never animates old rows.
 */
export function IncidentList({
  incidents,
  now,
  newRows = new Set(),
  changed = new Set(),
}: {
  incidents: IncidentVM[]
  now: number
  newRows?: Set<string>
  changed?: Set<string>
}) {
  if (incidents.length === 0) {
    return <p className="text-sm text-muted-foreground">No incidents. Rules open one when a rack passes its limit or a feed goes silent.</p>
  }
  return (
    <ul className="flex flex-col gap-2" aria-label="Incidents">
      {incidents.map(i => {
        const crit = i.severity === 'critical'
        const pop = !newRows.has(i.id) && changed.has(`${i.id}:${i.status}:${i.severity}`) ? ' enter-pop' : ''
        return (
          // Severity strip, as on the Security page: a coloured card with the incident laid over it.
          <li key={i.id} className={`rounded-lg pl-1.5 transition-colors ${STRIP[i.severity] ?? STRIP.low}${newRows.has(i.id) ? ' enter-rise' : ''}`}>
            <div className="flex flex-col gap-1.5 rounded-lg bg-card px-3.5 py-2.5">
              <div className="flex flex-wrap items-center gap-1.5">
                <span className={`state-shift text-xs font-semibold capitalize${crit ? ' text-destructive' : i.severity === 'high' ? ' text-warning' : ' text-muted-foreground'}${pop}`}>
                  {i.severity}
                </span>
                <Badge key={i.status} size="sm" variant={STATUS[i.status as keyof typeof STATUS] ?? 'secondary'} className={`state-shift capitalize${pop}`}>
                  {i.status}
                </Badge>
                {i.status !== 'closed' && (
                  i.ownerName
                    ? <Badge size="sm" variant="secondary"><UserIcon aria-hidden="true" />{i.ownerName}</Badge>
                    : <Badge size="sm" variant="outline">Unassigned</Badge>
                )}
                {i.handedFrom && !i.ownerName && i.status !== 'closed' && <Badge size="sm" variant="outline">Left by {i.handedFrom}</Badge>}
                {i.reports.map(r => (
                  <Badge key={r} size="sm" variant="outline"><FileTextIcon aria-hidden="true" />{r} report</Badge>
                ))}
                <span className="text-xs text-muted-foreground tabular-nums">#{i.id}</span>
                <span className="ml-auto text-xs text-muted-foreground tabular-nums">{ago(i.updatedMs, now)}</span>
              </div>
              <p className="text-sm font-medium">{i.title}</p>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                <span>{i.datacenter}{i.rack ? ` · ${i.rack}` : ''}</span>
                {i.peak > 0 && <span className="tabular-nums">{Math.round(i.peak * 10) / 10}{unit(i.kind)}</span>}
                <span>{i.source === 'rule' ? 'Opened by rule' : 'Opened manually'}</span>
                {i.closedReason && <span>Closed: {i.closedReason}</span>}
              </div>
            </div>
          </li>
        )
      })}
    </ul>
  )
}
