import { useEffect, useRef, useState } from 'react'
import { EraserIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

type Pt = { x: number; y: number } // fractions of the box, so strokes survive a resize
type Stroke = Pt[]

/**
 * Draw-to-sign box (mouse, pen or finger). Reports whether there is ink; the drawing itself is
 * never uploaded or stored. Pair it with a typed-signature option for keyboard and screen-reader users.
 */
export function SignaturePad({ onInk, invalid, labelledBy }: { onInk: (has: boolean) => void; invalid?: boolean; labelledBy: string }) {
  const canvas = useRef<HTMLCanvasElement>(null)
  const strokes = useRef<Stroke[]>([])
  const active = useRef<Stroke | null>(null)
  const [hasInk, setHasInk] = useState(false)

  function paint() {
    const c = canvas.current
    if (!c) return
    const { width, height } = c.getBoundingClientRect()
    const g = c.getContext('2d')!
    g.setTransform(1, 0, 0, 1, 0, 0)
    g.clearRect(0, 0, c.width, c.height)
    g.setTransform(c.width / width, 0, 0, c.height / height, 0, 0)
    g.lineCap = 'round'
    g.lineJoin = 'round'
    g.lineWidth = 2.2
    g.strokeStyle = getComputedStyle(c).color
    for (const s of strokes.current) {
      g.beginPath()
      s.forEach((p, i) => (i ? g.lineTo(p.x * width, p.y * height) : g.moveTo(p.x * width, p.y * height)))
      g.stroke()
    }
  }

  useEffect(() => {
    const c = canvas.current!
    const fit = () => {
      const r = c.getBoundingClientRect()
      const dpr = window.devicePixelRatio || 1
      const w = Math.round(r.width * dpr)
      const h = Math.round(r.height * dpr)
      if (c.width !== w || c.height !== h) {
        c.width = w
        c.height = h
      }
      paint()
    }
    fit()
    const ro = new ResizeObserver(fit)
    ro.observe(c)
    return () => ro.disconnect()
  }, [])

  function point(e: React.PointerEvent): Pt {
    const r = canvas.current!.getBoundingClientRect()
    return { x: (e.clientX - r.left) / r.width, y: (e.clientY - r.top) / r.height }
  }

  function down(e: React.PointerEvent) {
    e.currentTarget.setPointerCapture(e.pointerId)
    active.current = [point(e)]
    strokes.current.push(active.current)
  }

  function move(e: React.PointerEvent) {
    if (!active.current) return
    active.current.push(point(e))
    paint()
    if (!hasInk && active.current.length > 2) {
      setHasInk(true)
      onInk(true)
    }
  }

  function up() {
    active.current = null
  }

  function clear() {
    strokes.current = []
    paint()
    setHasInk(false)
    onInk(false)
  }

  return (
    <div className="flex flex-col gap-2">
      <div className={cn('relative rounded-xl border-2 border-dashed bg-background', invalid ? 'border-destructive' : 'border-border')}>
        <canvas
          ref={canvas}
          role="img"
          aria-labelledby={labelledBy}
          aria-label={hasInk ? 'Signature drawn' : 'Empty signature box'}
          className="block h-40 w-full cursor-crosshair touch-none text-foreground"
          onPointerDown={down}
          onPointerMove={move}
          onPointerUp={up}
          onPointerCancel={up}
        />
        {!hasInk && (
          <span className="pointer-events-none absolute inset-0 flex items-center justify-center text-sm text-muted-foreground">
            Sign here with your mouse, pen or finger
          </span>
        )}
        <span className="pointer-events-none absolute right-6 bottom-8 left-6 border-b border-muted-foreground/40" />
      </div>
      <Button type="button" variant="ghost" size="sm" className="self-end" onClick={clear} disabled={!hasInk}>
        <EraserIcon aria-hidden="true" /> Clear
      </Button>
    </div>
  )
}
