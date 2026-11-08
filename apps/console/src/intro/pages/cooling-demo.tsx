import { useEffect, useRef, useState } from 'react'
import { PauseIcon, PlayIcon, RotateCcwIcon } from 'lucide-react'
import type { Hall, Status } from '@/components/floor/data'
import { DARK_PALETTE, FloorScene } from '@/components/floor/scene'
import { cn } from '@/lib/utils'

// The home page's cooling-failure story, played on the console's own 3D floor (eight blocks, two rows of four,
// cooling on the east side). It runs by itself: a cooling unit fails, the blocks nearest it heat up, MESA raises
// alerts and an owner takes them, backup cooling comes on, and the hall slowly cools back to normal. Then it loops.
// This is an illustration with made-up numbers, not live telemetry.

const WARN = 50
const CRIT = 55
const LOOP_S = 40 // one full story, in seconds; one second on screen stands for one minute
const FAIL_AT = 4
const PEAK_AT = 15
const FIX_AT = 18
const COOL_BY = 33
const BASE = [41.2, 42.0, 41.6, 42.4, 40.8, 41.9, 42.2, 41.4]
const REACH = [0.3, 0.52, 0.78, 1, 0.26, 0.48, 0.74, 0.96] // how hard each block is hit: the east end sits by the failed unit
const RISE = 17.5

const STEPS = [
  { at: 0, text: 'All eight blocks running normally' },
  { at: FAIL_AT, text: 'Cooling unit CRAC-2 fails on the east wall' },
  { at: 10, text: 'MESA raises alerts on the blocks crossing 50 °C' },
  { at: 13, text: 'The on-shift operator is assigned the alerts' },
  { at: FIX_AT, text: 'Backup cooling on, hot workloads moved west' },
  { at: COOL_BY, text: 'Every block back under 50 °C, alerts closed' },
]

const smooth = (a: number, b: number, t: number) => {
  const x = Math.min(1, Math.max(0, (t - a) / (b - a)))
  return x * x * (3 - 2 * x)
}
const tempAt = (i: number, t: number) => BASE[i] + RISE * REACH[i] * smooth(FAIL_AT, PEAK_AT, t) * (1 - smooth(FIX_AT, COOL_BY, t))
const statusOf = (c: number): Status => (c >= CRIT ? 'crit' : c >= WARN ? 'warn' : 'ok')

const SETTLE_MS = 2200 // a reset eases every block back to its resting temperature over this long

function hallsFrom(temps: number[]): Hall[] {
  return temps.map((temp, i) => {
    const tag = `${i < 4 ? 'A' : 'B'}${(i % 4) + 1}`
    return {
      id: `demo#${i}`, label: `Block ${tag}`, tag, cabinet: '', nodes: '', site: 'demo', floor: 1, datacenter: 'demo',
      status: statusOf(temp), temp, load: 10, cap: 14, servers: 6, hot: 0, risk: 0, headline: '', short: '',
      risks: [], power: [], infra: [], apps: [], past: [], fore: [], breachH: null,
    }
  })
}

export function CoolingDemo() {
  const hostRef = useRef<HTMLDivElement>(null)
  const labelsRef = useRef<HTMLDivElement>(null)
  const sceneRef = useRef<FloorScene | null>(null)
  const [t, setT] = useState(0)
  const [playing, setPlaying] = useState(true)
  const [visible, setVisible] = useState(false)
  const [settle, setSettle] = useState<{ from: number[]; k: number } | null>(null) // easing back to rest after a reset (k: 0 → 1)
  const tRef = useRef(0)
  const boxRef = useRef<HTMLDivElement>(null)
  const reduce = typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches

  useEffect(() => {
    const scene = new FloorScene(hostRef.current!, labelsRef.current!, { onSelect: () => {}, topInset: () => 0 })
    scene.setPalette(DARK_PALETTE)
    scene.setHalls(hallsFrom(BASE))
    scene.zoom('out') // a little wider than the console's framing, so the whole hall fits the smaller panel
    sceneRef.current = scene
    return () => { scene.dispose(); sceneRef.current = null }
  }, [])

  // Starts from T+00 the first time the demo scrolls into view, and pauses while it's off screen.
  useEffect(() => {
    const io = new IntersectionObserver(([e]) => setVisible(e.isIntersecting), { threshold: 0.35 })
    io.observe(boxRef.current!)
    return () => io.disconnect()
  }, [])

  // The story clock: advances in real time while playing and on screen. At the end it settles back and starts again.
  useEffect(() => {
    if (!playing || !visible || settle) return
    let last = performance.now()
    const id = setInterval(() => {
      const now = performance.now()
      const next = tRef.current + (now - last) / 1000
      last = now
      if (next >= LOOP_S) {
        tRef.current = 0
        setT(0)
        if (!reduce) setSettle({ from: BASE.map((_, i) => tempAt(i, LOOP_S)), k: 0 })
      } else {
        tRef.current = next
        setT(next)
      }
    }, reduce ? 1000 : 250)
    return () => clearInterval(id)
  }, [playing, visible, reduce, settle])

  // Settling: ease k from 0 to 1, then hand back to the story clock.
  useEffect(() => {
    if (!settle) return
    const start = performance.now() - settle.k * SETTLE_MS
    const id = setInterval(() => {
      const k = Math.min(1, (performance.now() - start) / SETTLE_MS)
      setSettle(s => (s && k < 1 ? { ...s, k } : null))
    }, 80)
    return () => clearInterval(id)
  }, [settle === null]) // eslint-disable-line react-hooks/exhaustive-deps -- one timer per settle, not per frame

  const temps = settle ? settle.from.map((c, i) => c + (BASE[i] - c) * smooth(0, 1, settle.k)) : BASE.map((_, i) => tempAt(i, t))
  useEffect(() => { sceneRef.current?.setHalls(hallsFrom(temps)) })

  /** Back to the start without a jump: every block eases from where it is to its resting temperature. */
  function rewind() {
    if (!reduce) setSettle({ from: temps, k: 0 })
    tRef.current = 0
    setT(0)
    setPlaying(true)
  }

  const hottest = Math.max(...temps)
  const alerts = temps.filter(c => c >= WARN).length
  const step = STEPS.reduce((cur, s, i) => (t >= s.at ? i : cur), 0)
  const phase = settle ? 'Resetting' : t < FAIL_AT ? 'Normal' : t < FIX_AT ? 'Cooling failure' : t < COOL_BY ? 'Recovering' : 'Recovered'
  const mins = Math.floor(t)

  return (
    <div ref={boxRef} className="grid gap-5 lg:grid-cols-[1.5fr_1fr]">
      <div className="relative h-[420px] overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-b from-[#1a1a1d] to-[#111113] sm:h-[500px]">
        {/* the scene only illustrates: no orbit or zoom, so scrolling the page over it still scrolls the page */}
        <div ref={hostRef} className="pointer-events-none absolute inset-0" aria-hidden="true">
          <div ref={labelsRef} className="absolute inset-0" />
        </div>
        <div className="absolute top-4 left-4 flex items-center gap-2 rounded-full bg-black/50 px-3 py-1.5 font-mono text-xs text-white/80 backdrop-blur">
          <span className={cn('size-2 rounded-full', phase === 'Cooling failure' ? 'bg-red-400' : phase === 'Recovering' ? 'bg-amber-300' : 'bg-emerald-400')} aria-hidden="true" />
          {phase} · T+{String(mins).padStart(2, '0')} min
        </div>
        <div className="absolute top-4 right-4 flex gap-1.5">
          <button type="button" onClick={() => setPlaying(p => !p)} aria-label={playing ? 'Pause' : 'Play'} className="grid size-8 place-items-center rounded-full bg-black/50 text-white/80 backdrop-blur hover:text-white">
            {playing ? <PauseIcon className="size-4" aria-hidden="true" /> : <PlayIcon className="size-4" aria-hidden="true" />}
          </button>
          <button type="button" onClick={rewind} aria-label="Replay from the start" className="grid size-8 place-items-center rounded-full bg-black/50 text-white/80 backdrop-blur hover:text-white">
            <RotateCcwIcon className="size-4" aria-hidden="true" />
          </button>
        </div>
        <div className="absolute inset-x-4 bottom-4 h-1 overflow-hidden rounded-full bg-white/10" aria-hidden="true">
          <div className={cn('h-full rounded-full bg-white/60', settle && 'transition-[width] duration-[1200ms] ease-out')} style={{ width: `${(t / LOOP_S) * 100}%` }} />
        </div>
      </div>

      <div className="flex flex-col gap-4">
        <div className="grid grid-cols-2 gap-3">
          <div className={cn('rounded-2xl border p-4 transition-colors duration-500', alerts ? 'border-amber-300/40 bg-amber-300/10' : 'border-white/10 bg-white/[0.03]')}>
            <p className="text-xs text-white/60">Blocks in alert</p>
            <p className="mt-1 font-mono text-2xl font-semibold tabular-nums">{alerts} <span className="text-sm font-normal text-white/50">of 8</span></p>
          </div>
          <div className={cn('rounded-2xl border p-4 transition-colors duration-500', hottest >= CRIT ? 'border-red-400/40 bg-red-500/10' : 'border-white/10 bg-white/[0.03]')}>
            <p className="text-xs text-white/60">Hottest GPU</p>
            <p className="mt-1 font-mono text-2xl font-semibold tabular-nums">{hottest.toFixed(1)} <span className="text-sm font-normal text-white/50">°C</span></p>
          </div>
        </div>
        <ol className="flex-1 rounded-3xl border border-white/10 bg-white/[0.03] p-5" aria-label="What happens" aria-live="polite">
          {STEPS.map((s, i) => (
            <li key={s.at} className={cn('flex gap-3 py-1.5 text-sm transition-colors duration-500', i === step ? 'text-white' : i < step ? 'text-white/55' : 'text-white/30')}>
              <span className="w-12 shrink-0 font-mono text-xs leading-5 tabular-nums">T+{String(s.at).padStart(2, '0')}</span>
              <span className={cn(i === step && 'font-semibold')}>{s.text}</span>
            </li>
          ))}
        </ol>
        <p className="text-xs text-white/40">Illustration with sample numbers; one second here is one minute on the floor.</p>
      </div>
    </div>
  )
}
