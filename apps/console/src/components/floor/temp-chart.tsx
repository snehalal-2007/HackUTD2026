import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import { Liveline, type LivelinePoint } from 'liveline'
import { useTable } from 'spacetimedb/react'
import { tables } from '@mesa/bindings'
import { LIMIT, type Hall } from './data'
import { blockServerIds, setHistoryOnScreen } from './use-live-floors'

// Live streaming chart of a block's hottest GPU over the last 15 minutes (server_reading), drawn by Liveline.
// Liveline has one plain reference line and no trend line, so a small canvas on top draws the 55 °C limit and the
// dashed straight-line trend, using Liveline's own layout so they line up (see ScaleOverlay).

const WINDOW_S = 15 * 60
const PAD = { top: 14, right: 54, bottom: 26, left: 8 } // right: Liveline's y-axis labels
/** Liveline 0.0.7 leaves this share of the window empty right of "now" when there's no badge (WINDOW_BUFFER_NO_BADGE). */
const RIGHT_BUFFER = 0.015
const STALE_MS = 2 * 60_000 // how long a server's last reading still counts when the feed skips a sample
const FONT = '500 11.5px "Lexend Variable", system-ui, sans-serif'

const ms = (ts: { microsSinceUnixEpoch: bigint }) => Number(ts.microsSinceUnixEpoch / 1000n)
const clock = (t: number) => new Date(t * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })

/** Least-squares line through the points: value = a + slope × (time − t0), slope in °C per second. */
function lineFit(points: LivelinePoint[]) {
  const n = points.length
  if (n < 2) return null
  const t0 = points[0].time
  const mx = points.reduce((s, p) => s + (p.time - t0), 0) / n
  const my = points.reduce((s, p) => s + p.value, 0) / n
  let num = 0
  let den = 0
  for (const p of points) {
    num += (p.time - t0 - mx) * (p.value - my)
    den += (p.time - t0 - mx) ** 2
  }
  const slope = den ? num / den : 0
  return { t0, slope, a: my - slope * mx, at: (t: number) => my - slope * mx + slope * (t - t0) }
}
type Fit = NonNullable<ReturnType<typeof lineFit>>

/** Liveline's y-range rule (computeRange, liveline 0.0.7): visible values, the live value and the reference line, plus a 12% margin. */
function liveRange(visible: LivelinePoint[], value: number, ref: number) {
  let lo = Math.min(value, ref)
  let hi = Math.max(value, ref)
  for (const p of visible) {
    if (p.value < lo) lo = p.value
    if (p.value > hi) hi = p.value
  }
  const raw = hi - lo
  const min = raw * 0.1 || 0.4
  if (raw < min) return { lo: (lo + hi) / 2 - min / 2, hi: (lo + hi) / 2 + min / 2 }
  return { lo: lo - raw * 0.12, hi: hi + raw * 0.12 }
}

// --- page state the chart follows: dark mode and tab visibility ---
const subscribeTheme = (cb: () => void) => {
  const mo = new MutationObserver(cb)
  mo.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] })
  return () => mo.disconnect()
}
const isDark = () => document.documentElement.classList.contains('dark')
const subscribePageVisible = (cb: () => void) => {
  document.addEventListener('visibilitychange', cb)
  return () => document.removeEventListener('visibilitychange', cb)
}
const pageVisible = () => document.visibilityState === 'visible'

/** Canvas needs concrete colours: read the theme tokens (hex in both themes, see index.css). */
function themeColors(dark: boolean) {
  const css = getComputedStyle(document.documentElement)
  const v = (name: string, light: string, darkFallback: string) => css.getPropertyValue(name).trim() || (dark ? darkFallback : light)
  return {
    line: v('--chart-1', '#ff6a3d', '#ff7a50'),
    limit: v('--destructive', '#e5484d', '#f2555a'),
    ink: v('--muted-foreground', '#5b5b63', '#a1a1aa'),
    card: v('--card', '#ffffff', '#1c1c1f'),
  }
}

/** True while the element is on screen and the tab is visible. */
function useOnScreen(ref: React.RefObject<HTMLElement | null>) {
  const [inView, setInView] = useState(false)
  const visible = useSyncExternalStore(subscribePageVisible, pageVisible)
  useEffect(() => {
    const io = new IntersectionObserver(([e]) => setInView(e.isIntersecting))
    io.observe(ref.current!)
    return () => io.disconnect()
  }, [ref])
  return inView && visible
}

/** Hottest GPU in the block, streaming: last 15 minutes, the 55 °C limit and a dashed straight-line trend. */
export function TempChart({ hall, height = 190 }: { hall: Hall; height?: number }) {
  const boxRef = useRef<HTMLDivElement>(null)
  const onScreen = useOnScreen(boxRef)
  useEffect(() => {
    setHistoryOnScreen(onScreen)
    return () => setHistoryOnScreen(false)
  }, [onScreen])

  // only this block's 6 servers, and only while the chart can be seen
  const ids = useMemo(() => blockServerIds(hall.id), [hall.id])
  const [rows, ready] = useTable(
    tables.serverReading.where(r => ids.slice(1).reduce((q, id) => q.or(r.serverId.eq(id)), r.serverId.eq(ids[0]))),
    { enabled: onScreen },
  )

  const { points, value, fit } = useMemo(() => {
    // The source data skips samples now and then, so a reading time may lack some of the block's servers. Each server
    // keeps its last reading for up to STALE_MS; otherwise the hottest GPU would dip whenever the hottest server skips one.
    const sorted = [...rows].sort((a, b) => Number(a.measuredAt.microsSinceUnixEpoch - b.measuredAt.microsSinceUnixEpoch))
    const last = new Map<string, { t: number; c: number }>() // server → its latest reading so far
    const hottest = new Map<number, number>() // measuredAt (ms) → hottest GPU in the block at that time
    for (const r of sorted) {
      const t = ms(r.measuredAt)
      last.set(r.serverId, { t, c: r.gpuTempC })
      let max = -Infinity
      for (const s of last.values()) if (t - s.t <= STALE_MS && s.c > max) max = s.c
      hottest.set(t, max)
    }
    const times = [...hottest.keys()]
    if (!times.length) return { points: [] as LivelinePoint[], value: 0, fit: null }
    const latest = times[times.length - 1]
    const latestReceived = ms(sorted[sorted.length - 1].receivedAt)
    // A replay faster than real time stamps readings ahead of the clock; slide them back so the newest sits where the
    // database received it. Real-time data is never moved, so a stalled feed still shows as a line that stops short of now.
    const shift = Math.min(0, latestReceived - latest)
    const points = times.filter(t => t >= latest - WINDOW_S * 1000).map(t => ({ time: (t + shift) / 1000, value: hottest.get(t)! }))
    return { points, value: points[points.length - 1].value, fit: lineFit(points) }
  }, [rows])

  const dark = useSyncExternalStore(subscribeTheme, isDark)
  const colors = useMemo(() => themeColors(dark), [dark])

  const perMin = fit ? fit.slope * 60 : 0
  const label = points.length
    ? `Hottest GPU in block ${hall.tag}: ${value.toFixed(1)} °C now. Trend ${perMin >= 0 ? '+' : '−'}${Math.abs(perMin).toFixed(2)} °C per minute over the last 15 minutes; limit ${LIMIT} °C.`
    : `Hottest GPU in block ${hall.tag}: no readings yet.`

  return (
    <div ref={boxRef} className="relative w-full min-w-0" style={{ height }} role="img" aria-label={label}>
      <Liveline
        data={points}
        value={value}
        theme={dark ? 'dark' : 'light'}
        color={colors.line}
        window={WINDOW_S}
        referenceLine={{ value: LIMIT }}
        padding={PAD}
        // motion rules: the line scrolls with time, but values snap (no tweening), no pulse, no momentum glow
        lerpSpeed={0.8}
        badge={false}
        momentum={false}
        pulse={false}
        loading={onScreen && !ready}
        emptyText="No readings in the last 15 minutes"
        formatValue={v => `${v.toFixed(1)}°`}
        formatTime={clock}
      />
      <ScaleOverlay points={points} value={value} fit={fit} colors={colors} />
    </div>
  )
}

/** Draws the limit line and the trend on top of Liveline, recomputing its x/y scales every frame as the window scrolls. */
function ScaleOverlay({ points, value, fit, colors }: { points: LivelinePoint[]; value: number; fit: Fit | null; colors: ReturnType<typeof themeColors> }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const latest = useRef({ points, value, fit, colors })
  useEffect(() => {
    latest.current = { points, value, fit, colors }
  }, [points, value, fit, colors])

  useEffect(() => {
    const canvas = canvasRef.current!
    const ctx = canvas.getContext('2d')!
    let w = 0
    let h = 0
    const ro = new ResizeObserver(() => {
      const dpr = window.devicePixelRatio || 1
      w = canvas.clientWidth
      h = canvas.clientHeight
      canvas.width = Math.round(w * dpr)
      canvas.height = Math.round(h * dpr)
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    })
    ro.observe(canvas)

    let raf = 0
    const draw = () => {
      raf = requestAnimationFrame(draw)
      ctx.clearRect(0, 0, w, h)
      const { points, value, fit, colors } = latest.current
      const right = Date.now() / 1000 + WINDOW_S * RIGHT_BUFFER
      const left = right - WINDOW_S
      const visible = points.filter(p => p.time >= left - 2 && p.time <= right)
      if (visible.length < 2 || w === 0) return // Liveline shows its empty or loading state
      const { lo, hi } = liveRange(visible, value, LIMIT)
      const cw = w - PAD.left - PAD.right
      const ch = h - PAD.top - PAD.bottom
      const X = (t: number) => PAD.left + ((t - left) / WINDOW_S) * cw
      const Y = (v: number) => PAD.top + (1 - (v - lo) / (hi - lo)) * ch

      ctx.save()
      ctx.beginPath()
      ctx.rect(PAD.left, 0, cw, h)
      ctx.clip()
      ctx.font = FONT
      ctx.lineJoin = 'round'
      const text = (s: string, x: number, y: number, align: CanvasTextAlign) => {
        ctx.textAlign = align
        ctx.lineWidth = 4
        ctx.strokeStyle = colors.card // halo so labels stay readable over the line
        ctx.strokeText(s, x, y)
        ctx.fillStyle = colors.ink
        ctx.fillText(s, x, y)
      }

      // 55 °C limit: status red, dashed, labeled in ink
      const yl = Y(LIMIT)
      ctx.setLineDash([4, 4])
      ctx.lineWidth = 1.5
      ctx.strokeStyle = colors.limit
      ctx.beginPath()
      ctx.moveTo(PAD.left, yl)
      ctx.lineTo(PAD.left + cw, yl)
      ctx.stroke()
      const limitY = yl > PAD.top + 14 ? yl - 5 : yl + 14
      text(`${LIMIT} °C limit`, PAD.left + 4, limitY, 'left')

      // trend: straight-line fit over the window, dashed in neutral ink, labeled where it starts
      if (fit) {
        const t1 = Math.max(visible[0].time, left)
        const t2 = visible[visible.length - 1].time
        ctx.setLineDash([6, 5])
        ctx.lineWidth = 2
        ctx.lineCap = 'round'
        ctx.strokeStyle = colors.ink // neutral, so it doesn't read as Liveline's faint current-value guide
        ctx.beginPath()
        ctx.moveTo(X(t1), Y(fit.at(t1)))
        ctx.lineTo(X(t2), Y(fit.at(t2)))
        ctx.stroke()
        const y1 = Y(fit.at(t1))
        // above the line, unless that's off the top or on top of the limit label; then below it
        const above = y1 - 7
        const below = y1 + 15
        let ty = above > PAD.top + 9 ? above : below
        if (Math.abs(ty - limitY) < 14) ty = ty === above ? below : above
        text('trend', X(t1) + 4, ty, 'left')
      }
      ctx.restore()
    }
    raf = requestAnimationFrame(draw)
    return () => {
      cancelAnimationFrame(raf)
      ro.disconnect()
    }
  }, [])

  return <canvas ref={canvasRef} aria-hidden className="pointer-events-none absolute inset-0 size-full" />
}

export function ChartKey() {
  const item = 'inline-flex items-center gap-1.5 before:w-4 before:content-[""]'
  return (
    <div className="flex gap-3.5 text-[13px] text-muted-foreground">
      <span className={`${item} before:border-t-2 before:border-chart-1`}>Last 15 min</span>
      <span className={`${item} before:border-t-2 before:border-dashed before:border-muted-foreground`}>Trend</span>
      <span className={`${item} before:border-t-2 before:border-dashed before:border-destructive`}>{LIMIT} °C limit</span>
    </div>
  )
}
