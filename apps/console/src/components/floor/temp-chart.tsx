import { useEffect, useRef, useState } from 'react'
import { LIMIT, type Hall } from './data'

const PAD = { l: 34, r: 10, t: 10, b: 22 }

/** Inlet temperature: 24 h of history (solid), 12 h forecast (dashed), the limit line, and a hover readout. */
export function TempChart({ hall, height = 190 }: { hall: Hall; height?: number }) {
  const boxRef = useRef<HTMLDivElement>(null)
  const [W, setW] = useState(600)
  const [hover, setHover] = useState<number | null>(null) // hour offset under the pointer

  useEffect(() => {
    const el = boxRef.current!
    const ro = new ResizeObserver(() => setW(Math.max(200, el.clientWidth)))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const H = height
  const all = [...hall.past, ...hall.fore, LIMIT]
  const lo = Math.floor(Math.min(...all) - 0.5), hi = Math.ceil(Math.max(...all) + 0.5)
  const X = (h: number) => PAD.l + ((h + 24) / 36) * (W - PAD.l - PAD.r)
  const Y = (v: number) => PAD.t + ((hi - v) / (hi - lo)) * (H - PAD.t - PAD.b)
  const path = (arr: number[], off: number) => arr.map((v, i) => `${i ? 'L' : 'M'}${X(i + off).toFixed(1)},${Y(v).toFixed(1)}`).join('')
  const pts: [number, number][] = [...hall.past.map((v, i): [number, number] => [i - 24, v]), ...hall.fore.slice(1).map((v, j): [number, number] => [j + 1, v])]
  const hp = hover == null ? null : pts.find(p => p[0] === hover)!

  return (
    <div ref={boxRef} className="w-full min-w-0">
      <svg
        width={W}
        height={H}
        viewBox={`0 0 ${W} ${H}`}
        className="block overflow-visible text-[12.5px]"
        role="img"
        aria-label={`Inlet temperature for hall ${hall.id}, past 24 hours and 12 hour forecast`}
        onMouseMove={e => {
          const r = e.currentTarget.getBoundingClientRect()
          const h = Math.round(((e.clientX - r.left - PAD.l) / (W - PAD.l - PAD.r)) * 36 - 24)
          setHover(Math.max(-24, Math.min(12, h)))
        }}
        onMouseLeave={() => setHover(null)}
      >
        <line x1={PAD.l} x2={W - PAD.r} y1={H - PAD.b} y2={H - PAD.b} className="stroke-border" />
        <text x={PAD.l - 6} y={Y(hi) + 4} textAnchor="end" className="fill-muted-foreground">{hi}°</text>
        <text x={PAD.l - 6} y={Y(lo) + 4} textAnchor="end" className="fill-muted-foreground">{lo}°</text>
        <line x1={PAD.l} x2={W - PAD.r} y1={Y(LIMIT)} y2={Y(LIMIT)} className="stroke-destructive" strokeDasharray="2 4" />
        <path d={`${path(hall.past, -24)}L${X(0)},${H - PAD.b}L${X(-24)},${H - PAD.b}Z`} className="fill-chart-1" opacity={0.08} />
        <path d={path(hall.past, -24)} className="stroke-chart-1" fill="none" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
        <path d={path(hall.fore, 0)} className="stroke-chart-1" fill="none" strokeWidth={2} strokeDasharray="5 5" strokeLinecap="round" />
        <line x1={X(0)} x2={X(0)} y1={PAD.t} y2={H - PAD.b} className="stroke-muted-foreground" strokeDasharray="2 3" />
        <text x={X(-24)} y={H - 5} className="fill-muted-foreground">−24 h</text>
        <text x={X(0)} y={H - 5} textAnchor="middle" className="fill-muted-foreground">Now</text>
        <text x={X(12)} y={H - 5} textAnchor="end" className="fill-muted-foreground">+12 h</text>
        {hp && (() => {
          const x = X(hp[0]), y = Y(hp[1]), bx = Math.min(Math.max(x - 54, PAD.l), W - PAD.r - 108), by = y - 32 < 0 ? y + 10 : y - 32
          return (
            <g pointerEvents="none">
              <line x1={x} x2={x} y1={PAD.t} y2={H - PAD.b} className="stroke-foreground" opacity={0.35} />
              <circle cx={x} cy={y} r={4.5} className="fill-chart-1 stroke-card" strokeWidth={2} />
              <rect x={bx} y={by} width={108} height={22} rx={4} className="fill-foreground" />
              <text x={bx + 54} y={by + 15} textAnchor="middle" className="fill-background text-[12px] font-semibold">
                {hp[0] === 0 ? 'Now' : `${hp[0] > 0 ? '+' : ''}${hp[0]} h`} · {hp[1].toFixed(1)} °C
              </text>
            </g>
          )
        })()}
      </svg>
    </div>
  )
}

export function ChartKey() {
  const item = 'inline-flex items-center gap-1.5 before:w-4 before:content-[""]'
  return (
    <div className="flex gap-3.5 text-[13px] text-muted-foreground">
      <span className={`${item} before:border-t-2 before:border-chart-1`}>Past 24 h</span>
      <span className={`${item} before:border-t-2 before:border-dashed before:border-chart-1`}>Forecast</span>
      <span className={`${item} before:border-t before:border-dashed before:border-destructive`}>{LIMIT} °C limit</span>
    </div>
  )
}
