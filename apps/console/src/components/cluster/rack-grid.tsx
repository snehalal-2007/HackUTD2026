import { CircleCheckIcon, FlameIcon, GaugeIcon, ThermometerIcon, WifiOffIcon, WrenchIcon } from 'lucide-react'
import { Badge } from '@/components/reui/badge'
import { RACK_SLOTS, type InstanceVM, type RackStatus, type RackVM } from './use-cluster'

const STATUS: Record<RackStatus, { label: string; variant: 'success-light' | 'warning-light' | 'destructive-light' | 'secondary'; icon: React.ReactNode }> = {
  ready: { label: 'Ready', variant: 'success-light', icon: <CircleCheckIcon aria-hidden="true" /> },
  warm: { label: 'Not Ready: warm', variant: 'warning-light', icon: <ThermometerIcon aria-hidden="true" /> },
  incident: { label: 'Incident', variant: 'destructive-light', icon: <FlameIcon aria-hidden="true" /> },
  stale: { label: 'Feed silent', variant: 'secondary', icon: <WifiOffIcon aria-hidden="true" /> },
}

function InstanceRow({ i }: { i: InstanceVM }) {
  return (
    <li className="flex items-center gap-2 text-xs">
      <span className="min-w-0 flex-1 truncate font-medium" title={`${i.id} · ${i.version}`}>{i.id}</span>
      {i.state === 'throttled' && (
        <Badge size="sm" variant="warning-light">
          <GaugeIcon aria-hidden="true" />
          Throttled
        </Badge>
      )}
      {i.state === 'patching' && (
        <Badge size="sm" variant="info-light">
          <WrenchIcon aria-hidden="true" />
          Patching
        </Badge>
      )}
      <span className="shrink-0 text-muted-foreground tabular-nums" title={`Cap ${i.capKw} kW`}>
        {i.powerKw.toFixed(1)} kW
      </span>
    </li>
  )
}

/** Every rack with the simulated instances on it. Rack status and temperature are live telemetry. */
export function RackGrid({ racks, highlight }: { racks: RackVM[]; highlight: Set<string> }) {
  if (racks.length === 0) {
    return <p className="text-sm text-muted-foreground">No racks yet. They appear as telemetry feeds stream in.</p>
  }
  return (
    <ul className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4" aria-label="Racks">
      {racks.map(r => {
        const s = STATUS[r.status]
        return (
          <li
            key={r.id}
            className={`flex flex-col gap-2 rounded-lg border bg-card px-3 py-2.5 ${highlight.has(r.id) ? 'border-destructive/50' : ''}`}
          >
            <div className="flex items-center gap-1.5">
              <span className="min-w-0 flex-1 truncate text-sm font-medium" title={r.id}>
                {r.datacenter} · {r.cab}
              </span>
              <Badge size="sm" variant={s.variant}>
                {s.icon}
                {s.label}
              </Badge>
            </div>
            <div className="flex items-center gap-3 text-xs text-muted-foreground">
              <span className="tabular-nums" title="Hottest GPU, recorded telemetry">
                GPU max {r.gpuMaxC.toFixed(1)} °C
              </span>
              <span className="ml-auto tabular-nums">
                {r.instances.length} / {RACK_SLOTS} slots
              </span>
            </div>
            {r.instances.length > 0 ? (
              <ul className="flex flex-col gap-1 border-t pt-2" aria-label={`Instances on ${r.datacenter} ${r.cab}`}>
                {r.instances.map(i => (
                  <InstanceRow key={i.id} i={i} />
                ))}
              </ul>
            ) : (
              <p className="border-t pt-2 text-xs text-muted-foreground">No instances</p>
            )}
          </li>
        )
      })}
    </ul>
  )
}
