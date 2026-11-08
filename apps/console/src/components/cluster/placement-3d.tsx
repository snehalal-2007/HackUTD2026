import { useEffect, useMemo, useRef, useState } from 'react'
import { LoaderCircleIcon, MoveRightIcon } from 'lucide-react'
import { toast } from 'sonner'
import { useReducer, useSpacetimeDB } from 'spacetimedb/react'
import { reducers } from '@mesa/bindings'
import { DARK_PALETTE, LIGHT_PALETTE } from '@/components/floor/scene'
import { cabOf, RACK_SLOTS, type RackVM, type RunVM, type ServiceVM } from './use-cluster'
import { placeOf } from './run-list'
import { StackScene, TIER_COLOR } from './stack-scene'
import { rowLetters } from '@/components/floor/names'

const isDark = () => document.documentElement.classList.contains('dark')

/**
 * 3D placement map: every site as a column of floors from one fixed view, each floor's racks as rows of blocks with
 * their server bars, and the simulated instances on those bars, coloured by tier. A live migration (by hand or by the
 * rules) flies along a line in the instance's colour. Click an instance, then a highlighted Ready rack, or drag it
 * there, to migrate it with the same `live_migrate_instance` reducer the automatic path uses (needs a registered operator).
 */
export function Placement3D({ racks, runs, services, ready }: { racks: RackVM[]; runs: RunVM[]; services: ServiceVM[]; ready: boolean }) {
  const conn = useSpacetimeDB()
  const migrate = useReducer(reducers.liveMigrateInstance)
  const hostRef = useRef<HTMLDivElement>(null)
  const labelsRef = useRef<HTMLDivElement>(null)
  const sceneRef = useRef<StackScene | null>(null)
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
  const act = useRef({ selected, targets, racks, pick: (_: string | null) => {}, rack: (_: string) => {}, drop: (_: string, __: string) => {} })
  act.current.selected = selected
  act.current.targets = targets
  act.current.racks = racks
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

  // A drop computes its own targets: the drag may start before React has re-rendered with the new selection.
  act.current.drop = async (id, to) => {
    const all = act.current.racks
    const from = all.find(r => r.instances.some(i => i.id === id))
    const inst = from?.instances.find(i => i.id === id)
    const dest = all.find(r => r.id === to)
    if (!inst || !dest || busy) return
    if (inst.state === 'patching') return setError(`${id} is being patched and cannot move right now.`)
    if (dest.status !== 'ready') return setError(`${dest.cab} is not Ready (${dest.status}), so it can't take ${inst.service}.`)
    if (dest.instances.length >= RACK_SLOTS) return setError(`${dest.cab} has no free slot.`)
    if (dest.instances.some(i => i.service === inst.service)) return setError(`${dest.cab} already runs ${inst.service}.`)
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

  // Move everything off hot racks: every instance on a rack with an open incident (red) goes to the coolest Ready
  // (green) rack with a free slot and no copy of the same service, one move at a time so each one flies. Same reducer
  // and same rules as a move by hand; the plan is worked out up front so two moves never aim at the same last slot.
  const hot = racks.filter(r => r.status === 'incident' && r.instances.length > 0)
  const [draining, setDraining] = useState<{ done: number; total: number } | null>(null)
  const drain = async () => {
    if (busy || draining) return
    const room = new Map(racks.map(r => [r.id, { free: RACK_SLOTS - r.instances.length, services: new Set(r.instances.map(i => i.service)) }]))
    const plan: { id: string; service: string; to: string }[] = []
    let stuck = 0
    for (const r of hot) for (const i of r.instances) {
      if (i.state === 'patching') { stuck++; continue }
      const to = racks
        .filter(t => t.status === 'ready' && t.id !== r.id && room.get(t.id)!.free > 0 && !room.get(t.id)!.services.has(i.service))
        .sort((a, b) => a.gpuMaxC - b.gpuMaxC)[0]
      if (!to) { stuck++; continue }
      room.get(to.id)!.free--
      room.get(to.id)!.services.add(i.service)
      plan.push({ id: i.id, service: i.service, to: to.id })
    }
    if (!plan.length) {
      toast('Nothing could move', { description: stuck ? `${stuck} instance${stuck === 1 ? ' has' : 's have'} no Ready rack with a free slot that isn’t already running the same service.` : 'No hot rack is running anything right now.' })
      return
    }
    setError(null)
    setSelected(null)
    setDraining({ done: 0, total: plan.length })
    let moved = 0
    for (const step of plan) {
      try {
        await migrate({ instanceId: step.id, toRackId: step.to })
        moved++
        setDraining({ done: moved, total: plan.length })
        await new Promise(res => setTimeout(res, 700)) // let each move fly before the next
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err))
        break
      }
    }
    setDraining(null)
    if (moved) toast(`Moved ${moved} instance${moved === 1 ? '' : 's'} off hot racks`, { description: `Each went to the coolest Ready rack with a free slot and no copy of itself${stuck ? `; ${stuck} had nowhere to go` : ''}. No downtime, no duplicates.` })
  }

  useEffect(() => {
    const scene = new StackScene(hostRef.current!, labelsRef.current!, {
      onPickInstance: id => act.current.pick(id),
      onPickRack: id => void act.current.rack(id),
      onDropInstance: (id, rack) => void act.current.drop(id, rack),
    })
    scene.setPalette(isDark() ? DARK_PALETTE : LIGHT_PALETTE)
    sceneRef.current = scene
    const mo = new MutationObserver(() => scene.setPalette(isDark() ? DARK_PALETTE : LIGHT_PALETTE))
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] })
    return () => { mo.disconnect(); scene.dispose(); sceneRef.current = null }
  }, [])

  useEffect(() => { sceneRef.current?.setTiers(new Map(services.map(s => [s.id, s.tier]))) }, [services])
  useEffect(() => { if (ready) sceneRef.current?.setRacks(racks) }, [racks, ready])
  useEffect(() => { sceneRef.current?.setSelection(instance?.id ?? null, targets) }, [instance, targets])

  // The latest move shows for 5 seconds after it happens, then the line goes back to the usual hint.
  const latestMove = runs.find(r => r.action === 'live_migrate' && r.status === 'succeeded')
  const [shownMove, setShownMove] = useState<string | null>(null)
  useEffect(() => {
    if (!latestMove) return
    const left = 5000 - (Date.now() - (latestMove.finishedMs ?? latestMove.startedMs))
    if (left <= 0) return // an old move, from before the page opened
    setShownMove(latestMove.id)
    const t = setTimeout(() => setShownMove(id => (id === latestMove.id ? null : id)), left)
    return () => clearTimeout(t)
  }, [latestMove?.id]) // eslint-disable-line react-hooks/exhaustive-deps
  const lastMove = latestMove && latestMove.id === shownMove ? latestMove : undefined
  const rows = useMemo(() => rowLetters(racks.map(r => r.id)), [racks])
  const total = racks.reduce((n, r) => n + r.instances.length, 0)

  return (
    <div className="relative h-[600px] overflow-hidden rounded-lg border bg-gradient-to-b from-[#f7f5f1] to-[#efece6] dark:from-[#1a1a1d] dark:to-[#141416]">
      <div ref={hostRef} className="absolute inset-0 z-0">
        <div ref={labelsRef} className="pointer-events-none absolute inset-0" />
      </div>

      <div className="absolute top-3 left-3 z-[2] flex flex-wrap items-center gap-2">
        <span className="rounded-full bg-card/90 px-2.5 py-1 text-xs tabular-nums">{total} instances on {racks.length} racks</span>
      </div>


      <ul className="pointer-events-none absolute top-3 right-3 z-[2] flex flex-col gap-1 rounded-lg border bg-card/90 px-3 py-2 text-[11px]" aria-label="Legend">
        {[
          ...Object.entries(TIER_COLOR).map(([tier, c]) => [c, tier === 'ml' ? 'ML' : tier[0].toUpperCase() + tier.slice(1)]),
          ['', 'Free server'], // drawn by class below: it follows the theme like the free bars do
        ].map(([c, l]) => (
          <li key={l} className="flex items-center gap-1.5">
            <span className={c ? 'inline-block size-2.5 rounded-sm' : 'inline-block size-2.5 rounded-sm bg-[#2b2b2e] dark:bg-[#6b6b73]'} style={c ? { background: c } : undefined} aria-hidden="true" />
            {l}
          </li>
        ))}
        <li className="mt-1 border-t pt-1.5 text-muted-foreground">Short bar: throttled</li>
        <li className="text-muted-foreground">Glowing: patching</li>
      </ul>

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
                Moved <span className="font-medium">{lastMove.instance}</span> {placeOf(lastMove.from, rows).blocks}
                <MoveRightIcon className="size-3" aria-label="to" />
                {placeOf(lastMove.to, rows).blocks} ({placeOf(lastMove.to, rows).where}): no second copy, no downtime.
              </span>
            ) : (
              <>Click or drag an instance onto a highlighted Ready rack to move it, on any floor or site.</>
            )}
          </p>
        </div>
        <button
          type="button"
          onClick={() => void drain()}
          disabled={!!draining || busy || hot.length === 0 || !conn.isActive}
          title={hot.length === 0 ? 'No hot rack is running anything right now' : `Move every instance off the ${hot.length} hot rack${hot.length === 1 ? '' : 's'}`}
          className="pointer-events-auto inline-flex items-center gap-1.5 rounded-lg border bg-white px-3 py-2 text-xs font-medium text-black shadow-sm hover:bg-neutral-100 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {draining && <LoaderCircleIcon className="size-3.5 animate-spin motion-reduce:animate-none" aria-hidden="true" />}
          {draining ? `Moving ${draining.done} of ${draining.total}…` : `Move off hot racks${hot.length ? ` (${hot.reduce((n, r) => n + r.instances.length, 0)})` : ''}`}
        </button>
      </div>
    </div>
  )
}
