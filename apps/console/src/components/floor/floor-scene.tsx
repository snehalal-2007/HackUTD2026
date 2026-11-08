import { useEffect, useRef } from 'react'
import { Maximize2Icon, MinusIcon, PlusIcon } from 'lucide-react'
import { SidebarTrigger } from '@/components/ui/sidebar'
import { cn } from '@/lib/utils'
import { hotOn, worstOf, type Hall, type Site } from './data'
import { DARK_PALETTE, FloorScene, LIGHT_PALETTE } from './scene'

type Control = 'in' | 'out' | 'home'
const CONTROLS: { action: Control; label: string; icon: typeof PlusIcon }[] = [
  { action: 'in', label: 'Zoom in', icon: PlusIcon },
  { action: 'out', label: 'Zoom out', icon: MinusIcon },
  { action: 'home', label: 'Back to the start view', icon: Maximize2Icon },
]

const isDark = () => document.documentElement.classList.contains('dark')

/** The 3D floor tile: site name + floor filter on top, zoom controls on the right, the model behind. */
export function FloorSceneTile(props: {
  site: Site
  floor: number
  floors: Hall[][]
  halls: Hall[]
  selected: string
  onFloor: (f: number) => void
  onSelect: (id: string) => void
}) {
  const { site, floor, floors, halls, selected, onFloor, onSelect } = props
  const hostRef = useRef<HTMLDivElement>(null)
  const labelsRef = useRef<HTMLDivElement>(null)
  const barRef = useRef<HTMLDivElement>(null)
  const sceneRef = useRef<FloorScene | null>(null)
  const onSelectRef = useRef(onSelect)
  const shownFloor = useRef<string | null>(null)
  useEffect(() => { onSelectRef.current = onSelect }) // the scene calls the latest handler without being rebuilt

  useEffect(() => { // create the scene once; it lives as long as the tile
    const scene = new FloorScene(hostRef.current!, labelsRef.current!, {
      onSelect: id => onSelectRef.current(id),
      topInset: () => (barRef.current ? barRef.current.offsetTop + barRef.current.offsetHeight : 0),
    })
    scene.setPalette(isDark() ? DARK_PALETTE : LIGHT_PALETTE)
    sceneRef.current = scene
    const mo = new MutationObserver(() => scene.setPalette(isDark() ? DARK_PALETTE : LIGHT_PALETTE)) // follow the theme toggle
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] })
    return () => { mo.disconnect(); scene.dispose(); sceneRef.current = null; shownFloor.current = null }
  }, [])

  useEffect(() => {
    const scene = sceneRef.current
    if (!scene) return
    scene.setSelected(selected) // before setHalls, so the new labels know which one is selected
    const key = `${site.id}/${floor}`
    const switched = shownFloor.current !== null && shownFloor.current !== key
    scene.setHalls(halls, switched) // same racks: live recolour in place; new floor or site: rebuild with the drop-in animation
    shownFloor.current = key
  }, [site.id, floor, halls, selected])

  function control(action: Control) {
    const scene = sceneRef.current
    if (action === 'home') scene?.goHome() // glides back, never jumps
    else scene?.zoom(action)
  }

  return (
    <div className="relative h-full min-h-0 overflow-hidden rounded-lg bg-gradient-to-b from-[#f7f5f1] to-[#efece6] dark:from-[#1a1a1d] dark:to-[#141416]">
      <div ref={hostRef} className="absolute inset-0 z-0">
        <div ref={labelsRef} className="pointer-events-none absolute inset-0" />
      </div>

      <div ref={barRef} className="absolute top-4 right-[72px] left-5 z-[2] flex flex-wrap items-center gap-x-3.5 gap-y-2">
        <SidebarTrigger className="md:hidden" />
        <span className="flex items-baseline gap-2 whitespace-nowrap">
          <span className="text-[15px] font-semibold">{site.name}</span>
          <span className={site.verified ? 'text-[12.5px] font-medium text-success' : 'text-[12.5px] text-muted-foreground'}>{site.verified ? 'NMC² · verified' : 'Simulated site'}</span>
        </span>
        <div role="group" aria-label="Floor" className="inline-flex items-center gap-0.5 rounded-[10px] border bg-card p-1 shadow-[0_4px_14px_rgba(0,0,0,.06)]">
          <span className="px-2 text-[14.5px] font-semibold text-muted-foreground">Floor</span>
          {floors.map((list, i) => {
            const f = i + 1, w = worstOf(list), ct = hotOn(list)
            return (
              <button
                key={f}
                type="button"
                aria-pressed={f === floor}
                aria-label={`Floor ${f}`}
                title={`Floor ${f}: ${ct} server${ct === 1 ? '' : 's'} running hot`}
                onClick={() => onFloor(f)}
                className={cn(
                  'flex min-w-9 items-center justify-center gap-1.5 rounded-[7px] border-2 border-transparent px-2.5 py-1.5 text-[14.5px] font-semibold tabular-nums whitespace-nowrap text-muted-foreground hover:bg-muted hover:text-foreground',
                  f === floor && 'border-foreground bg-card text-foreground hover:bg-card', // selected floor: outlined, not filled
                )}
              >
                {f}
                {ct > 0 && (
                  <span className={cn('inline-grid h-[19px] min-w-[19px] place-items-center rounded-full px-1.5 text-[11.5px]', w === 'crit' ? 'bg-destructive text-white' : 'bg-warning text-[#1a1a1a]')}>
                    {ct}
                  </span>
                )}
              </button>
            )
          })}
        </div>
      </div>

      <div className="absolute top-4 right-4 z-[2] flex flex-col overflow-hidden rounded-lg border bg-card">
        {CONTROLS.map(({ action, label, icon: Icon }) => (
          <button key={action} type="button" aria-label={label} title={label} onClick={() => control(action)} className="grid size-[38px] place-items-center border-b last:border-b-0 hover:bg-muted">
            <Icon className="size-4" aria-hidden="true" />
          </button>
        ))}
      </div>

      <div className="pointer-events-none absolute bottom-3.5 left-4 z-[2] rounded-full bg-card/90 px-2.5 py-1 text-[13px]">
        Drag to orbit · scroll to zoom · click a block
      </div>
    </div>
  )
}
