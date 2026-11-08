import { useEffect, useMemo, useRef, useState } from 'react'
import { PauseIcon, PlayIcon, RotateCcwIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import { ClusterStoryScene, type Placement, type StoryBlock } from './cluster-story-scene'

// The home page's cooling-failure story, played on the cluster scene (docs/cluster.html): three floors in a triangle,
// each block open with its six servers coloured by service. A cooling unit beside Spartanburg fails, the blocks next to
// it heat up, MESA raises alerts and an owner takes them, then MESA live-migrates the services off the hot blocks to
// North Carolina and Dallas so they can cool. When the loop restarts the services fly home.
// This is an illustration with made-up numbers, not live telemetry.

const WARN = 50
const CRIT = 55
const LOOP_S = 40 // one full story, in seconds; one second on screen stands for one minute
const FAIL_AT = 4
const PEAK_AT = 15
const MOVE_AT = 16 // services start leaving the hot blocks
const FIX_AT = 18
const COOL_BY = 33
const RISE = 17.5

const SITES = [{ name: 'Spartanburg' }, { name: 'North Carolina' }, { name: 'Dallas' }]
const ROWS = [['A', 'B'], ['G', 'H'], ['M', 'N']] // console naming: letter = rack row, number = position
const BLOCKS: StoryBlock[] = SITES.flatMap((_, si) => ROWS[si].flatMap((r, ri) => [1, 2, 3].map((n, ci) => ({ tag: `${r}${n}`, site: si, idx: ri * 3 + ci }))))
const BASE: Record<string, number> = Object.fromEntries(BLOCKS.map((b, i) => [b.tag, 40.6 + ((i * 37) % 23) / 10])) // 40.6–42.8 °C at rest
const REACH: Record<string, number> = { A1: 0.3, A2: 0.62, A3: 1, B1: 0.28, B2: 0.58, B3: 0.96 } // Spartanburg's east end sits by the failed unit
const SERVICES = [
  ['api-gateway', '#6366f1'], ['auth', '#2dd4bf'], ['billing', '#c084fc'], ['search', '#f472b6'],
  ['ml-infer', '#38bdf8'], ['storage', '#fb923c'], ['cache', '#a3e635'], ['queue', '#e2e8f0'],
] as const

// Starting placement: each service has 6 copies on 6 different blocks, never two in one block (as in docs/cluster.html).
const START: Placement = {}
const COLORS: Record<string, string> = {}
const used = new Map<string, number>()
SERVICES.forEach(([name, color], s) => {
  for (let r = 0; r < 6; r++) {
    const b = BLOCKS[(s + r * 3) % BLOCKS.length].tag
    const id = `${name}-${r + 1}`
    START[id] = { block: b, slot: used.get(b) ?? 0 }
    used.set(b, (used.get(b) ?? 0) + 1)
    COLORS[id] = color
  }
})

// The moves MESA makes: every service on the four hottest blocks goes to the coolest remote block with a free server
// and no copy of that service, one every half second.
const MOVES: { id: string; to: { block: string; slot: number }; at: number }[] = (() => {
  const place = structuredClone(START)
  const svc = (id: string) => id.replace(/-\d+$/, '')
  const remote = BLOCKS.filter(b => b.site !== 0).sort((a, b) => BASE[a.tag] - BASE[b.tag])
  const out: { id: string; to: { block: string; slot: number }; at: number }[] = []
  for (const hot of ['A3', 'B3', 'A2', 'B2']) {
    for (const id of Object.keys(place).filter(i => place[i].block === hot)) {
      const here = (tag: string) => Object.keys(place).filter(i => place[i].block === tag)
      const to = remote.find(b => here(b.tag).length < 6 && !here(b.tag).some(i => svc(i) === svc(id)))
      if (!to) continue
      const taken = new Set(here(to.tag).map(i => place[i].slot))
      const slot = [0, 1, 2, 3, 4, 5].find(k => !taken.has(k))!
      place[id] = { block: to.tag, slot }
      out.push({ id, to: place[id], at: MOVE_AT + out.length * 0.5 })
    }
  }
  return out
})()

const STEPS = [
  { at: 0, text: 'All three floors running normally' },
  { at: FAIL_AT, text: 'A cooling unit beside Spartanburg blocks A3 and B3 fails' },
  { at: 10, text: 'MESA raises alerts on the blocks crossing 50 °C' },
  { at: 13, text: 'The on-shift operator owns the alerts' },
  { at: MOVE_AT, text: `MESA moves ${MOVES.length} services to North Carolina and Dallas, no downtime` },
  { at: FIX_AT + 4, text: 'Backup cooling on; the emptied blocks cool down' },
  { at: COOL_BY, text: 'Every block back under 50 °C, alerts closed' },
]

const smooth = (a: number, b: number, t: number) => {
  const x = Math.min(1, Math.max(0, (t - a) / (b - a)))
  return x * x * (3 - 2 * x)
}
const tempsAt = (t: number) => Object.fromEntries(BLOCKS.map(b => [b.tag, BASE[b.tag] + RISE * (REACH[b.tag] ?? 0) * smooth(FAIL_AT, PEAK_AT, t) * (1 - smooth(FIX_AT, COOL_BY, t))]))
const placementAt = (t: number): Placement => {
  const p = { ...START }
  for (const m of MOVES) if (t >= m.at) p[m.id] = m.to
  return p
}

const SETTLE_MS = 2200 // a reset eases every block back to its resting temperature over this long

export function CoolingDemo() {
  const hostRef = useRef<HTMLDivElement>(null)
  const labelsRef = useRef<HTMLDivElement>(null)
  const sceneRef = useRef<ClusterStoryScene | null>(null)
  const [t, setT] = useState(0)
  const [playing, setPlaying] = useState(true)
  const [visible, setVisible] = useState(false)
  const [settle, setSettle] = useState<{ from: Record<string, number>; k: number } | null>(null) // easing back to rest after a reset (k: 0 → 1)
  const tRef = useRef(0)
  const boxRef = useRef<HTMLDivElement>(null)
  const reduce = typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches

  useEffect(() => {
    let scene: ClusterStoryScene | null = null
    try {
      scene = new ClusterStoryScene(hostRef.current!, labelsRef.current!, SITES, BLOCKS, COLORS, 0)
    } catch {
      // No WebGL: the timeline and numbers still tell the story.
    }
    sceneRef.current = scene
    return () => { scene?.dispose(); sceneRef.current = null }
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
        if (!reduce) setSettle({ from: tempsAt(LOOP_S), k: 0 })
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

  const temps = useMemo(
    () => (settle ? Object.fromEntries(BLOCKS.map(b => [b.tag, settle.from[b.tag] + (BASE[b.tag] - settle.from[b.tag]) * smooth(0, 1, settle.k)])) : tempsAt(t)),
    [settle, t],
  )
  const failing = !settle && t >= FAIL_AT && t < FIX_AT
  useEffect(() => { sceneRef.current?.set(temps, placementAt(settle ? 0 : t), failing) }) // a reset sends every service home

  /** Back to the start without a jump: every block eases to its resting temperature and the services fly home. */
  function rewind() {
    if (!reduce) setSettle({ from: temps, k: 0 })
    tRef.current = 0
    setT(0)
    setPlaying(true)
  }

  const values = Object.values(temps)
  const hottest = Math.max(...values)
  const alerts = values.filter(c => c >= WARN).length
  const moved = settle ? 0 : MOVES.filter(m => t >= m.at).length
  const step = STEPS.reduce((cur, s, i) => (t >= s.at ? i : cur), 0)
  const phase = settle ? 'Resetting' : t < FAIL_AT ? 'Normal' : t < MOVE_AT ? 'Cooling failure' : t < COOL_BY ? 'Recovering' : 'Recovered'
  const mins = Math.floor(t)

  return (
    <div ref={boxRef} className="grid gap-5 lg:grid-cols-[1.5fr_1fr]">
      <div className="relative h-[440px] overflow-hidden rounded-3xl border border-white/10 bg-[radial-gradient(ellipse_at_50%_35%,#1d2030_0%,#111216_70%)] sm:h-[520px]">
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
        <div className="grid grid-cols-3 gap-3">
          <div className={cn('rounded-2xl border p-4 transition-colors duration-500', alerts ? 'border-amber-300/40 bg-amber-300/10' : 'border-white/10 bg-white/[0.03]')}>
            <p className="text-xs text-white/60">Blocks in alert</p>
            <p className="mt-1 font-mono text-2xl font-semibold tabular-nums">{alerts} <span className="text-sm font-normal text-white/50">of {BLOCKS.length}</span></p>
          </div>
          <div className={cn('rounded-2xl border p-4 transition-colors duration-500', hottest >= CRIT ? 'border-red-400/40 bg-red-500/10' : 'border-white/10 bg-white/[0.03]')}>
            <p className="text-xs text-white/60">Hottest GPU</p>
            <p className="mt-1 font-mono text-2xl font-semibold tabular-nums">{hottest.toFixed(1)} <span className="text-sm font-normal text-white/50">°C</span></p>
          </div>
          <div className={cn('rounded-2xl border p-4 transition-colors duration-500', moved ? 'border-sky-300/40 bg-sky-400/10' : 'border-white/10 bg-white/[0.03]')}>
            <p className="text-xs text-white/60">Services moved</p>
            <p className="mt-1 font-mono text-2xl font-semibold tabular-nums">{moved} <span className="text-sm font-normal text-white/50">· 0 s down</span></p>
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
        <p className="text-xs text-white/40">Illustration with sample numbers; one second here is one minute on the floor. Each bar is a server, coloured by the service it runs.</p>
      </div>
    </div>
  )
}
