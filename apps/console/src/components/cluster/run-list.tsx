import { ArrowRightIcon, CircleCheckIcon, CircleXIcon, HandIcon, LoaderIcon, TriangleAlertIcon } from 'lucide-react'
import { Badge } from '@/components/reui/badge'
import { ago } from '@/lib/snapshot'
import { cabOf, type RunVM } from './use-cluster'

const ACTION: Record<string, string> = {
  throttle_in_place: 'Throttle in place',
  live_migrate: 'Live migrate',
  patch_in_place: 'Patch in place',
  failover_to_site: 'Failover to site',
}

type Variant = 'info-light' | 'success-light' | 'warning-light' | 'destructive-light' | 'secondary'
const STATUS: Record<string, { label: string; variant: Variant; icon: React.ReactNode }> = {
  running: { label: 'Running', variant: 'info-light', icon: <LoaderIcon aria-hidden="true" /> },
  succeeded: { label: 'Succeeded', variant: 'success-light', icon: <CircleCheckIcon aria-hidden="true" /> },
  insufficient: { label: 'Not enough', variant: 'warning-light', icon: <TriangleAlertIcon aria-hidden="true" /> },
  needs_approval: { label: 'Needs approval', variant: 'destructive-light', icon: <HandIcon aria-hidden="true" /> },
  failed: { label: 'Failed', variant: 'destructive-light', icon: <CircleXIcon aria-hidden="true" /> },
}

function countdown(ms: number, now: number) {
  const s = Math.max(0, Math.ceil((ms - now) / 1000))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

/** Remediation runs, newest first. Cooling numbers are modeled and labeled "simulated effect". */
export function RunList({ runs, now }: { runs: RunVM[]; now: number }) {
  if (runs.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No remediation yet. When a rack incident goes critical, MESA throttles in place first, then live-migrates if the rack is still over the limit after 2 minutes.
      </p>
    )
  }
  return (
    <ul className="flex flex-col divide-y rounded-lg border bg-card" aria-label="Remediation runs">
      {runs.map(r => {
        const s = STATUS[r.status] ?? { label: r.status, variant: 'secondary' as const, icon: null }
        return (
          <li key={r.id} className="flex flex-col gap-1.5 px-3 py-2.5">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-sm font-medium">{ACTION[r.action] ?? r.action}</span>
              <Badge size="sm" variant={s.variant}>
                {s.icon}
                {s.label}
              </Badge>
              <span className="text-xs text-muted-foreground tabular-nums">#{r.id}</span>
              <span className="ml-auto text-xs text-muted-foreground tabular-nums">{ago(r.startedMs, now)}</span>
            </div>
            <div className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-xs">
              <span className="font-medium">{r.instance || r.service}</span>
              {r.from && <span className="text-muted-foreground">{cabOf(r.from)}</span>}
              {r.to && (
                <>
                  <ArrowRightIcon className="size-3 text-muted-foreground" aria-label="to" />
                  <span className="text-muted-foreground">{cabOf(r.to)}</span>
                </>
              )}
              {r.status === 'running' && r.action === 'throttle_in_place' && r.decideMs && (
                <span className="text-muted-foreground tabular-nums">· decides in {countdown(r.decideMs, now)}</span>
              )}
              {r.action === 'patch_in_place' && (
                <span className="text-muted-foreground tabular-nums">
                  · {r.version} · {Math.min(r.step, r.steps)} of {r.steps} done
                </span>
              )}
            </div>
            <p className="text-xs text-muted-foreground">{r.detail}</p>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
              <span>{r.automatic ? 'Automatic' : 'By an operator'}{r.incidentId ? ` · incident #${r.incidentId}` : ''}</span>
              {r.simulatedEffectC !== 0 && (
                <span className="tabular-nums">Simulated effect: {r.simulatedEffectC.toFixed(1)} °C on the rack</span>
              )}
              {r.duplicatesAvoided > 0 && (
                <span className="tabular-nums">
                  {r.duplicatesAvoided} duplicate{r.duplicatesAvoided === 1 ? '' : 's'} avoided
                </span>
              )}
              {(r.action === 'live_migrate' || r.action === 'patch_in_place') && r.status === 'succeeded' && (
                <span className="tabular-nums">Downtime {r.downtimeS} s</span>
              )}
              {r.leadTimeS > 0 && <span className="tabular-nums">Warning lead time {Math.round(r.leadTimeS)} s</span>}
            </div>
          </li>
        )
      })}
    </ul>
  )
}
