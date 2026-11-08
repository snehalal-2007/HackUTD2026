import { useMemo } from 'react'
import { ActivityIcon, ArrowRightIcon, CircleCheckIcon, GaugeIcon, TriangleAlertIcon, WrenchIcon } from 'lucide-react'
import { Badge } from '@/components/reui/badge'
import { ago } from '@/lib/snapshot'
import { useArrivals } from '@/lib/use-arrivals'
import type { RolloutCell, RolloutPhase, RolloutVM } from './use-cluster'

type Variant = 'info-light' | 'success-light'
const PHASE: Record<RolloutPhase, { label: string; hint: string; variant: Variant; icon: React.ReactNode }> = {
  waiting: { label: 'Serving', hint: 'old version, waiting its turn', variant: 'success-light', icon: <ActivityIcon aria-hidden="true" /> },
  updating: { label: 'Updating', hint: 'in place, not restarted', variant: 'info-light', icon: <WrenchIcon aria-hidden="true" /> },
  updated: { label: 'Updated', hint: 'new version, serving', variant: 'success-light', icon: <CircleCheckIcon aria-hidden="true" /> },
}

function Cell({ c, run, to, fresh }: { c: RolloutCell; run: string; to: string; fresh: boolean }) {
  const p = PHASE[c.phase]
  const updating = c.phase === 'updating'
  // Only a real change pops: the version label and status badge re-mount (keyed) when they change.
  const pop = fresh ? ' enter-pop' : ''
  return (
    <li
      className={`relative flex min-w-0 flex-col gap-1.5 rounded-md border bg-background px-3 py-2.5 ${updating ? 'border-transparent' : ''}`}
      aria-label={`${c.id}, ${p.label}, ${c.version}`}
      data-phase={c.phase}
      data-run={run}
    >
      {/* The highlight is an overlay that fades, so only opacity moves. */}
      <span
        aria-hidden="true"
        className={`pointer-events-none absolute -inset-px rounded-md border-2 border-blue-500 transition-opacity duration-200 ease-out-strong motion-reduce:duration-150 ${updating ? 'opacity-100' : 'opacity-0'}`}
      />
      <div className="flex items-center gap-1.5">
        <span className="min-w-0 flex-1 truncate text-xs font-medium" title={c.id}>{c.id}</span>
        {c.throttled && (
          <Badge size="sm" variant="warning-light">
            <GaugeIcon aria-hidden="true" />
            Throttled
          </Badge>
        )}
      </div>
      <span key={c.version} className={`text-lg font-semibold leading-none tabular-nums${c.version === to ? '' : ' text-muted-foreground'}${pop}`}>
        {c.version}
      </span>
      <div className="flex flex-col gap-0.5">
        <Badge key={c.phase} size="sm" variant={p.variant} className={`w-fit${pop}`}>
          {p.icon}
          {p.label}
        </Badge>
        <span className="text-[11px] text-muted-foreground">{p.hint}</span>
        <span className="truncate text-[11px] text-muted-foreground" title={c.rack}>{c.rack}</span>
      </div>
    </li>
  )
}

function Card({ r, now, animate, fresh, flipped }: { r: RolloutVM; now: number; animate: boolean; fresh: Set<string>; flipped: boolean }) {
  const total = r.run.steps
  const present = r.cells.length
  const step = Math.min(r.run.step, total)
  const widthOk = present === total
  const oneAtATime = r.updating <= 1
  return (
    <li
      className={`flex flex-col gap-3 rounded-lg border bg-card px-3 py-3${animate ? ' enter-rise' : ''}`}
      aria-label={`Rolling update of ${r.service}`}
      data-running={r.running}
    >
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <span className="text-sm font-medium">{r.service}</span>
        <span className="flex items-center gap-1 text-xs tabular-nums text-muted-foreground">
          {r.fromVersion || 'previous'}
          <ArrowRightIcon className="size-3" aria-label="to" />
          <span className="font-medium text-foreground">{r.toVersion}</span>
        </span>
        {r.running ? (
          <Badge key="running" size="sm" variant="info-light">
            <WrenchIcon aria-hidden="true" />
            Rolling update: step {Math.min(step + 1, total)} of {total}
          </Badge>
        ) : (
          <Badge key="done" size="sm" variant="success-light" className={flipped ? 'enter-pop' : undefined}>
            <CircleCheckIcon aria-hidden="true" />
            Completed
          </Badge>
        )}
        <span className="ml-auto text-xs text-muted-foreground tabular-nums">
          #{r.run.id} · {r.running ? 'started' : 'finished'} {ago(r.running ? r.run.startedMs : (r.run.finishedMs ?? r.run.startedMs), now)}
        </span>
      </div>

      <ul className="grid gap-2" style={{ gridTemplateColumns: `repeat(${Math.max(present, 1)}, minmax(0, 1fr))` }} aria-label={`Instances of ${r.service}`}>
        {r.cells.map(c => (
          <Cell
            key={c.id}
            c={c}
            run={r.run.id}
            to={r.toVersion}
            fresh={fresh.has(`${r.run.id}:${c.id}:${c.phase}`)}
          />
        ))}
      </ul>

      <div className="flex flex-wrap items-center gap-1.5 text-xs" aria-label="Capacity during the update">
        <Badge size="sm" variant={widthOk ? 'success-light' : 'warning-light'}>
          {widthOk ? <CircleCheckIcon aria-hidden="true" /> : <TriangleAlertIcon aria-hidden="true" />}
          {present} of {total} instances present
        </Badge>
        <Badge size="sm" variant={oneAtATime ? 'success-light' : 'warning-light'}>
          {oneAtATime ? <CircleCheckIcon aria-hidden="true" /> : <TriangleAlertIcon aria-hidden="true" />}
          {r.updating} updating now (at most 1)
        </Badge>
        <span className="text-muted-foreground tabular-nums">
          {r.updated} of {total} on {r.toVersion}
          {!r.running && r.run.duplicatesAvoided > 0 && ` · ${r.run.duplicatesAvoided} duplicate copies avoided`}
        </span>
      </div>
    </li>
  )
}

/**
 * Rolling in-place updates, drawn from live rows: each instance of a patched service is a cell. The one
 * being updated is highlighted, the others show they are still serving, and the version flips as each one
 * finishes. Instance count and "at most one updating" are read from the data, never assumed.
 */
export function RollingUpdates({ rollouts, ready, now }: { rollouts: RolloutVM[]; ready: boolean; now: number }) {
  const runKeys = useMemo(() => rollouts.map(r => r.run.id), [rollouts])
  const cellKeys = useMemo(() => rollouts.flatMap(r => r.cells.map(c => `${r.run.id}:${c.id}:${c.phase}`)), [rollouts])
  const statusKeys = useMemo(() => rollouts.map(r => `${r.run.id}:${r.running}`), [rollouts])
  const newRuns = useArrivals(runKeys, ready)
  const flippedRuns = useArrivals(statusKeys, ready)
  const changed = useArrivals(cellKeys, ready)

  if (rollouts.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No rolling update yet. Use <span className="font-medium text-foreground">Patch to vX</span> on a service below: its instances are updated one at a time while the others keep serving.
      </p>
    )
  }
  return (
    <ul className="grid gap-2 lg:grid-cols-2" aria-label="Rolling updates">
      {rollouts.map(r => (
        <Card
          key={r.run.id}
          r={r}
          now={now}
          animate={newRuns.has(r.run.id)}
          flipped={!newRuns.has(r.run.id) && flippedRuns.has(`${r.run.id}:${r.running}`)}
          // A card that just appeared brings its cells with it; only later changes pop on their own.
          fresh={newRuns.has(r.run.id) ? new Set<string>() : changed}
        />
      ))}
    </ul>
  )
}
