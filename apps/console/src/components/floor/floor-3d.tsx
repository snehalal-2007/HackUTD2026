import { useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent } from 'react'
import { OctagonAlertIcon, RotateCcwIcon, TriangleAlertIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { BAND_COLOR, bandOf, type Band } from './bands'
import type { PreviewRack } from './sample'

const W = 76 // rack footprint width (px)
const D = 52 // rack footprint depth
const H = 70 // rack height
const GAP = 14 // space between racks in a row
const AISLE = 46 // space between rows

const DEFAULT_VIEW = { spin: -30, tilt: 58 } // degrees: rotation around the floor, and floor tilt away from you

const shade = (pct: number) => `color-mix(in oklch, var(--card) ${pct}%, black)` // darker sides fake simple lighting

export function Floor3D({ racks, rows }: { racks: PreviewRack[]; rows: string[] }) {
  const [view, setView] = useState(DEFAULT_VIEW)
  const drag = useRef<{ x: number; y: number } | null>(null)

  const cols = Math.max(...racks.map(r => r.col))
  const floorW = cols * W + (cols - 1) * GAP + 80 // +80 leaves room for the row labels
  const floorH = rows.length * D + (rows.length - 1) * AISLE + 60

  function onPointerDown(e: PointerEvent<HTMLDivElement>) {
    drag.current = { x: e.clientX, y: e.clientY }
    e.currentTarget.setPointerCapture(e.pointerId) // keep rotating even if the cursor leaves the scene
  }
  function onPointerMove(e: PointerEvent<HTMLDivElement>) {
    if (!drag.current) return
    const dx = e.clientX - drag.current.x
    const dy = e.clientY - drag.current.y
    drag.current = { x: e.clientX, y: e.clientY }
    setView(v => ({ spin: v.spin - dx * 0.4, tilt: clamp(v.tilt - dy * 0.3, 25, 75) })) // minus: the hall turns the way you drag
  }
  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    const step = { ArrowLeft: [10, 0], ArrowRight: [-10, 0], ArrowUp: [0, -5], ArrowDown: [0, 5] }[e.key]
    if (!step) return
    e.preventDefault() // arrows rotate the hall instead of scrolling the page
    setView(v => ({ spin: v.spin + step[0], tilt: clamp(v.tilt + step[1], 25, 75) }))
  }

  return (
    <div className="relative">
      <div
        role="list"
        aria-label="Hall racks in 3D. Drag or use arrow keys to rotate."
        tabIndex={0}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={() => (drag.current = null)}
        onPointerCancel={() => (drag.current = null)}
        onKeyDown={onKeyDown}
        className="relative z-10 flex h-[440px] cursor-grab touch-none items-center justify-center rounded-xl outline-none select-none focus-visible:ring-2 focus-visible:ring-ring active:cursor-grabbing" // no frame or clipping: the hall floats over the page and can overlap nearby text
        style={{ perspective: '1400px' }}
      >
        <div
          className="relative rounded-lg"
          style={{
            width: floorW,
            height: floorH,
            transformStyle: 'preserve-3d',
            transform: `translateY(-30px) rotateX(${view.tilt}deg) rotateZ(${view.spin}deg)`,
            background: 'repeating-linear-gradient(0deg, transparent 0 23px, var(--border) 23px 24px), repeating-linear-gradient(90deg, transparent 0 23px, var(--border) 23px 24px)', // see-through tile grid so the page shows beneath
            boxShadow: '0 40px 80px -20px rgb(0 0 0 / 0.6)', // soft shadow sells the lift off the page
          }}
        >
          {rows.map((row, ri) => {
            const top = 30 + ri * (D + AISLE)
            return (
              <div key={row} style={{ transformStyle: 'preserve-3d' }}>
                <span
                  className="absolute font-mono text-sm text-muted-foreground"
                  style={{ left: 18, top: top + D / 2 - 10 }}
                >
                  {row}
                </span>
                {racks
                  .filter(r => r.row === row)
                  .map(r => (
                    <RackBox key={r.assetId} rack={r} left={60 + (r.col - 1) * (W + GAP)} top={top} />
                  ))}
              </div>
            )
          })}
        </div>
      </div>

      <div className="absolute right-3 bottom-3 flex items-center gap-2 text-xs text-muted-foreground">
        <span className="hidden sm:inline">Drag or use arrow keys to rotate</span>
        <Button size="sm" variant="outline" onClick={() => setView(DEFAULT_VIEW)}>
          <RotateCcwIcon aria-hidden="true" />
          Reset view
        </Button>
      </div>
    </div>
  )
}

function RackBox({ rack, left, top }: { rack: PreviewRack; left: number; top: number }) {
  const band = bandOf(rack.inletC)
  const edge = `2px solid ${BAND_COLOR[band]}`
  const face: CSSProperties = { position: 'absolute', border: edge, backfaceVisibility: 'visible' }

  return (
    <div
      role="listitem"
      aria-label={`${rack.assetId}, ${rack.inletC.toFixed(1)} degrees${band === 'normal' ? '' : `, ${band}`}`}
      title={`${rack.assetId} · ${rack.inletC.toFixed(1)}°C`}
      className="absolute"
      style={{ left, top, width: W, height: D, transformStyle: 'preserve-3d' }}
    >
      {/* each side face stands up from one footprint edge by rotating 90° about that edge */}
      <div style={{ ...face, left: 0, top: D, width: W, height: H, transformOrigin: 'top', transform: 'rotateX(90deg)', background: shade(80) }} />
      <div style={{ ...face, left: 0, top: -H, width: W, height: H, transformOrigin: 'bottom', transform: 'rotateX(-90deg)', background: shade(80) }} />
      <div style={{ ...face, left: -H, top: 0, width: H, height: D, transformOrigin: 'right', transform: 'rotateY(90deg)', background: shade(65) }} />
      <div style={{ ...face, left: W, top: 0, width: H, height: D, transformOrigin: 'left', transform: 'rotateY(-90deg)', background: shade(65) }} />
      <div
        className="flex flex-col items-center justify-center gap-0.5"
        style={{ ...face, inset: 0, transform: `translateZ(${H}px)`, background: 'var(--card)' }}
      >
        <span className="font-mono text-[10px] leading-none text-muted-foreground">{rack.assetId}</span>
        <span className="flex items-center gap-0.5 font-mono text-sm leading-none font-semibold tabular-nums">
          {rack.inletC.toFixed(1)}°
          <BandIcon band={band} />
        </span>
      </div>
    </div>
  )
}

function BandIcon({ band }: { band: Band }) {
  if (band === 'warm') return <TriangleAlertIcon className="size-3 text-warning" aria-hidden="true" />
  if (band === 'hot') return <OctagonAlertIcon className="size-3 text-destructive" aria-hidden="true" />
  return null
}

function clamp(n: number, lo: number, hi: number) {
  return Math.min(hi, Math.max(lo, n))
}
