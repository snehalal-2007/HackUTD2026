import { useMemo } from 'react'
import { Badge } from '@/components/reui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Placement3D } from '@/components/cluster/placement-3d'
import { RackGrid } from '@/components/cluster/rack-grid'
import { RollingUpdates } from '@/components/cluster/rolling-update'
import { RunList } from '@/components/cluster/run-list'
import { ServiceList } from '@/components/cluster/service-list'
import { useCluster } from '@/components/cluster/use-cluster'
import { useNow } from '@/lib/snapshot'

// Capacity-neutral, in-place remediation on a simulated cluster (docs/CLUSTER-CYCLING.md).
export function ClusterView() {
  const { ready, racks, runs, services, rollouts, totals } = useCluster()
  const now = useNow()
  const hot = useMemo(() => new Set(racks.filter(r => r.status === 'incident').map(r => r.id)), [racks])

  if (!ready) {
    return (
      <div className="flex flex-col gap-3 p-4" aria-busy="true">
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    )
  }

  const tiles = [
    { k: 'Instances', v: String(totals.instances), note: 'never changes' },
    { k: 'Instances moved', v: String(totals.moved), note: 'live migration' },
    { k: 'Duplicates avoided', v: String(totals.duplicatesAvoided), note: 'copies a failover would start' },
    { k: 'Downtime', v: `${totals.downtimeS} s`, note: 'across all runs' },
    { k: 'Active runs', v: String(totals.active), note: 'throttle windows, patches' },
  ]

  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-4 px-4 py-4">
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <Badge variant="info" size="sm">Simulated cluster</Badge>
          <span>
            {totals.services} services placed on the real racks. Temperatures are recorded telemetry, so moving a service does not cool them; cooling figures are a simulated effect.
          </span>
        </div>

        <section aria-labelledby="cluster-3d" className="flex flex-col gap-2">
          <h2 id="cluster-3d" className="text-sm font-medium">Live placement</h2>
          <Placement3D racks={racks} runs={runs} ready={ready} />
        </section>

        <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5" aria-label="Remediation totals">
          {tiles.map(t => (
            <li key={t.k} className="flex flex-col gap-0.5 rounded-lg border bg-card px-3 py-2">
              <span className="text-xs text-muted-foreground">{t.k}</span>
              <span className="text-xl font-semibold tabular-nums">{t.v}</span>
              <span className="text-[11px] text-muted-foreground">{t.note}</span>
            </li>
          ))}
        </ul>

        <section aria-labelledby="cluster-rolling" className="flex flex-col gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <h2 id="cluster-rolling" className="text-sm font-medium">Rolling updates</h2>
            <span className="text-xs text-muted-foreground">
              One instance at a time, updated in place and never restarted; the rest keep serving. Simulated services.
            </span>
          </div>
          <RollingUpdates rollouts={rollouts} ready={ready} now={now} />
        </section>

        <div className="grid gap-4 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
          <section aria-labelledby="cluster-racks" className="flex flex-col gap-2">
            <h2 id="cluster-racks" className="text-sm font-medium">Services per rack</h2>
            <RackGrid racks={racks} highlight={hot} />
          </section>

          <div className="flex flex-col gap-4">
            <section aria-labelledby="cluster-runs" className="flex flex-col gap-2">
              <div className="flex items-center gap-2">
                <h2 id="cluster-runs" className="text-sm font-medium">Remediation runs</h2>
                <span className="text-xs text-muted-foreground">{runs.length}</span>
              </div>
              <RunList runs={runs} now={now} />
            </section>

            <section aria-labelledby="cluster-services" className="flex flex-col gap-2">
              <h2 id="cluster-services" className="text-sm font-medium">Services</h2>
              <ServiceList services={services} />
            </section>
          </div>
        </div>
      </div>
    </div>
  )
}
