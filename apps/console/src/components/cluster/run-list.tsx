import { ArrowRightIcon, CircleCheckIcon, CircleXIcon, HandIcon, LoaderIcon, TriangleAlertIcon } from 'lucide-react'
import { Badge } from '@/components/reui/badge'
import { PLACE, rowLetters } from '@/components/floor/names'
import { ago } from '@/lib/snapshot'
import { cabOf, type RunVM } from './use-cluster'

/** A rack as operators know it: its row of blocks ("A1–A3") and where it is ("Spartanburg · Floor 1"). */
export function placeOf(rackId: string, rows: Map<string, string>) {
  const p = PLACE.get(rackId.split('/')[0])
  const row = rows.get(rackId)
  return { blocks: row ? `${row}1–${row}3` : cabOf(rackId), where: p ? `${p.siteName} · Floor ${p.floor}` : rackId.split('/')[0] }
}

/** One short sentence on what the run did, in plain words (the service is named before it). The full detail stays on hover. */
function summary(r: RunVM, now: number) {
  switch (r.action) {
    case 'live_migrate':
      return r.status === 'succeeded'
        ? 'Moved with its traffic in one step: no second copy, no downtime.'
        : r.status === 'running' ? 'Moving to a cooler rack.' : `Couldn’t move: ${r.detail}`
    case 'throttle_in_place':
      return r.status === 'running'
        ? `Power capped in place to cool the rack${r.decideMs ? `; decides in ${countdown(r.decideMs, now)}` : ''}.`
        : r.status === 'succeeded' ? `Capping power in place was enough: the rack cooled without moving anything.` : `Capping power wasn’t enough, so services move next.`
    case 'patch_in_place':
      return `Updating to ${r.version}, one instance at a time while the rest keep serving (${Math.min(r.step, r.steps)} of ${r.steps}).`
    case 'failover_to_site':
      return `Failover to another site: ${r.detail}`
    default:
      return r.detail
  }
}

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
export function RunList({ runs, now, rackIds }: { runs: RunVM[]; now: number; rackIds: string[] }) {
  const rows = rowLetters(rackIds)
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
            {r.from && r.to ? (
              <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2 rounded-md bg-muted/60 px-3 py-2">
                {[r.from, r.to].map((rack, k) => {
                  const p = placeOf(rack, rows)
                  return (
                    <div key={rack} className={k === 1 ? 'order-3 min-w-0 text-right' : 'min-w-0'}>
                      <div className="text-[11px] text-muted-foreground">{k === 0 ? 'From' : 'To'}</div>
                      <div className="truncate text-lg leading-tight font-semibold tabular-nums">{p.blocks}</div>
                      <div className="truncate text-xs text-muted-foreground">{p.where}</div>
                    </div>
                  )
                })}
                <ArrowRightIcon className="order-2 size-5 text-foreground" aria-label="to" />
              </div>
            ) : r.from ? (
              <div className="rounded-md bg-muted/60 px-3 py-2">
                <div className="text-lg leading-tight font-semibold tabular-nums">{placeOf(r.from, rows).blocks}</div>
                <div className="text-xs text-muted-foreground">{placeOf(r.from, rows).where}</div>
              </div>
            ) : null}
            <p className="text-sm" title={r.detail}>
              <span className="font-medium">{r.instance || r.service}</span>
              <span className="text-muted-foreground"> · {summary(r, now)}</span>
            </p>
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
