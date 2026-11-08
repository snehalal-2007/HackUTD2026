import { useEffect, useMemo, useRef, useState } from 'react'
import { MinusIcon, MoveRightIcon, PlusIcon } from 'lucide-react'
import { useReducer, useSpacetimeDB } from 'spacetimedb/react'
import { reducers } from '@mesa/bindings'
import { cabOf, RACK_SLOTS, type RackVM, type RunVM } from './use-cluster'
import { DARK_PALETTE, LIGHT_PALETTE, PlacementScene } from './placement-scene'

const isDark = () => document.documentElement.classList.contains('dark')

/**
 * 3D placement map: the racks as they are in the data, the simulated instances in their slots. A live migration shows
 * as the instance flying from one rack to the other. Click an instance, then a highlighted Ready rack, to migrate it
 * by hand with the same `live_migrate_instance` reducer the automatic path uses (needs a registered operator).
 */
export function Placement3D({ racks, runs, ready }: { racks: RackVM[]; runs: RunVM[]; ready: boolean }) {
  const conn = useSpacetimeDB()
  const migrate = useReducer(reducers.liveMigrateInstance)
  const hostRef = useRef<HTMLDivElement>(null)
  const labelsRef = useRef<HTMLDivElement>(null)
  const sceneRef = useRef<PlacementScene | null>(null)
  const [selected, setSelected] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const instance = useMemo(() => racks.flatMap(r => r.instances.map(i => ({ ...i, rackId: r.id }))).find(i => i.id === selected), [racks, selected])
  const targets = useMemo(() => {
    const t = new Set<string>()
    if (!instance || instance.state === 'patching') return t
    for (const r of racks) {
      if (r.id !== instance.rackId && r.status === 'ready' && r.instances.length < RACK_SLOTS && !r.instances.some(i => i.service === instance.service)) t.add(r.id)
    }
    return t
  }, [racks, instance])

  // Latest handlers for the scene, which is created once.
  const act = useRef({ selected, targets, pick: (_: string | null) => {}, rack: (_: string) => {} })
  act.current.selected = selected
  act.current.targets = targets
  act.current.pick = id => { setError(null); setSelected(id) }
  act.current.rack = async to => {
    const id = act.current.selected
    if (!id || !act.current.targets.has(to) || busy) return
    setBusy(true)
    setError(null)
    try {
      await migrate({ instanceId: id, toRackId: to })
      setSelected(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  useEffect(() => {
    const scene = new PlacementScene(hostRef.current!, labelsRef.current!, {
      onPickInstance: id => act.current.pick(id),
      onPickRack: id => void act.current.rack(id),
    })
    scene.setPalette(isDark() ? DARK_PALETTE : LIGHT_PALETTE)
    sceneRef.current = scene
    const mo = new MutationObserver(() => scene.setPalette(isDark() ? DARK_PALETTE : LIGHT_PALETTE))
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] })
    return () => { mo.disconnect(); scene.dispose(); sceneRef.current = null }
  }, [])

  useEffect(() => { if (ready) sceneRef.current?.setRacks(racks) }, [racks, ready])
  useEffect(() => { sceneRef.current?.setSelection(instance?.id ?? null, targets) }, [instance, targets])

  const lastMove = runs.find(r => r.action === 'live_migrate' && r.status === 'succeeded')
  const total = racks.reduce((n, r) => n + r.instances.length, 0)

  return (
    <div className="relative h-[520px] overflow-hidden rounded-lg border bg-gradient-to-b from-[#f7f5f1] to-[#efece6] dark:from-[#1a1a1d] dark:to-[#141416]">
      <div ref={hostRef} className="absolute inset-0 z-0">
        <div ref={labelsRef} className="pointer-events-none absolute inset-0" />
      </div>

      <div className="absolute top-3 left-3 z-[2] flex flex-wrap items-center gap-2">
        <span className="rounded-full bg-card/90 px-2.5 py-1 text-xs tabular-nums">{total} instances on {racks.length} racks</span>
      </div>

      <div className="absolute top-3 right-3 z-[2] flex flex-col overflow-hidden rounded-lg border bg-card">
        {([['in', 'Zoom in', PlusIcon], ['out', 'Zoom out', MinusIcon]] as const).map(([dir, label, Icon]) => (
          <button key={dir} type="button" aria-label={label} title={label} onClick={() => sceneRef.current?.zoom(dir)} className="grid size-9 place-items-center border-b last:border-b-0 hover:bg-muted">
            <Icon className="size-4" aria-hidden="true" />
          </button>
        ))}
      </div>

      <div className="pointer-events-none absolute right-3 bottom-3 left-3 z-[2] flex flex-wrap items-end justify-between gap-2">
        <div className="pointer-events-auto flex max-w-full flex-col gap-1.5">
          {error && <p role="alert" className="rounded-md bg-destructive/10 px-2.5 py-1 text-xs text-destructive">{error}</p>}
          <p className="rounded-md bg-card/90 px-2.5 py-1.5 text-xs" aria-live="polite">
            {instance ? (
              instance.state === 'patching' ? (
                <>{instance.id} is being patched and cannot move right now.</>
              ) : targets.size > 0 ? (
                <>
                  <span className="font-medium">{instance.id}</span> selected on {cabOf(instance.rackId)}.{' '}
                  {conn.isActive ? 'Click a highlighted Ready rack to live-migrate it (operator or lead).' : 'Not connected.'}
                </>
              ) : (
                <>{instance.id} has no Ready rack with a free slot that is not already running {instance.service}.</>
              )
            ) : lastMove ? (
              <span className="inline-flex flex-wrap items-center gap-1">
                Last move: <span className="font-medium">{lastMove.instance}</span> {cabOf(lastMove.from)}
                <MoveRightIcon className="size-3" aria-label="to" />
                {cabOf(lastMove.to)}, one transaction: no second copy, no gap.
              </span>
            ) : (
              <>Drag to orbit, scroll to zoom. Click an instance to move it by hand. Live migrations fly here as they happen.</>
            )}
          </p>
        </div>
        <ul className="pointer-events-none flex flex-wrap gap-1.5 text-[11px]" aria-label="Legend">
          {[
            ['#3b82f6', 'Running'],
            ['#e59a1a', 'Throttled'],
            ['#8b5cf6', 'Patching'],
          ].map(([c, l]) => (
            <li key={l} className="flex items-center gap-1 rounded-full bg-card/90 px-2 py-0.5">
              <span className="inline-block h-2 w-3 rounded-sm" style={{ background: c }} aria-hidden="true" />
              {l}
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}
