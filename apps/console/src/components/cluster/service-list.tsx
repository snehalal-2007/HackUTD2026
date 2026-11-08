import { useState } from 'react'
import { WrenchIcon } from 'lucide-react'
import { useReducer, useSpacetimeDB } from 'spacetimedb/react'
import { reducers } from '@mesa/bindings'
import { Badge } from '@/components/reui/badge'
import { Button } from '@/components/ui/button'
import { cabOf, type ServiceVM } from './use-cluster'

/** Services, their version and where their instances run. One action per row: apply a known patch in place. */
export function ServiceList({ services }: { services: ServiceVM[] }) {
  const conn = useSpacetimeDB()
  const applyPatch = useReducer(reducers.applyPatch)
  const [error, setError] = useState<{ service: string; message: string } | null>(null)
  const [pending, setPending] = useState<string | null>(null)

  async function patch(s: ServiceVM) {
    setError(null)
    setPending(s.id)
    try {
      await applyPatch({ serviceId: s.id, version: s.knownPatch })
    } catch (err) {
      setError({ service: s.id, message: err instanceof Error ? err.message : String(err) })
    } finally {
      setPending(null)
    }
  }

  if (services.length === 0) {
    return <p className="text-sm text-muted-foreground">The cluster seeds once all 16 racks have reported telemetry.</p>
  }
  return (
    <ul className="flex flex-col divide-y rounded-lg border bg-card" aria-label="Services">
      {services.map(s => (
        <li key={s.id} className="flex flex-col gap-1 px-3 py-2">
          <div className="flex items-center gap-2">
            <span className="min-w-0 flex-1 truncate text-sm font-medium">{s.id}</span>
            <span className="text-xs text-muted-foreground tabular-nums">{s.version}</span>
            {s.rolling ? (
              <Badge size="sm" variant="info-light">
                <WrenchIcon aria-hidden="true" />
                Patching {Math.min(s.rolling.step, s.rolling.steps)}/{s.rolling.steps}
              </Badge>
            ) : (
              s.knownPatch && (
                <Button size="xs" variant="outline" disabled={!conn.isActive || pending === s.id} onClick={() => patch(s)}>
                  Patch to {s.knownPatch}
                </Button>
              )
            )}
          </div>
          <div className="text-xs text-muted-foreground">
            {s.tier} · {s.instances} instance{s.instances === 1 ? '' : 's'} on {s.racks.map(cabOf).join(', ')}
          </div>
          {error?.service === s.id && <p className="text-xs text-destructive" role="alert">{error.message}</p>}
        </li>
      ))}
    </ul>
  )
}
