import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { cn } from '@/lib/utils'

// The light home page's "what it does" section: three short points on the left, one floor map on the right.
// The map is 18 tiles, one per block, in the console's heat-map bands. When the section scrolls in, the tiles start
// scattered across the page and flow in to form the map, its white card grows down from it, then the points settle.
// The points take turns (or click one) and the map shows each: the heat, who owns the hot blocks, a service moving off one.

type Band = 'cool' | 'warm' | 'warn' | 'crit'
type Mode = 'heat' | 'owned' | 'move'
const HEAT: Band[] = ['cool', 'cool', 'warm', 'cool', 'cool', 'crit', 'cool', 'warm', 'warn', 'cool', 'cool', 'cool', 'cool', 'warn', 'cool', 'warm', 'cool', 'cool']
const TAGS = ['A1', 'A2', 'A3', 'B1', 'B2', 'B3', 'C1', 'C2', 'C3', 'D1', 'D2', 'D3', 'E1', 'E2', 'E3', 'F1', 'F2', 'F3']
const OWNERS: Record<number, string> = { 5: 'P', 8: 'M', 13: 'D' } // the hot blocks, each with someone's initial on it
const FROM = 5 // the hot block a service leaves (top right)
const TO = 12 // the cool block it lands on (bottom left)
const TURN_MS = 5200 // how long each point stays active

const POINTS: { mode: Mode; title: string; body: string }[] = [
  { mode: 'heat', title: 'One live floor', body: 'Every block, coloured by temperature the moment telemetry lands.' },
  { mode: 'owned', title: 'Every alert owned', body: 'Hot blocks open alerts that land in someone’s queue, with a countdown.' },
  { mode: 'move', title: 'Move, don’t restart', body: 'Services leave a hot block for a cool one with zero downtime.' },
]

/** Deterministic scatter, so every visit flows in the same way. */
function scatter(i: number) {
  const r = (n: number) => {
    const x = Math.sin((i + 1) * 12.9898 + n * 37.719) * 43758.5453
    return x - Math.floor(x)
  }
  return { '--x': `${(r(1) - 0.7) * 900}px`, '--y': `${(r(2) - 0.4) * 520}px`, '--r': `${(r(3) - 0.5) * 240}deg`, '--d': `${i * 32}ms` } as CSSProperties
}

/** `tone` matches the page: dark (/) or light (/intro/light). Colours come from the .fc / .fc-dark variables in intro.css. */
export function FloorCards({ tone = 'light' }: { tone?: 'dark' | 'light' }) {
  const dark = tone === 'dark'
  const ref = useRef<HTMLDivElement>(null)
  const [formed, setFormed] = useState(false)
  const [active, setActive] = useState(0)
  const [cycle, setCycle] = useState(0) // bumps on every click, so the timer and progress line restart

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const io = new IntersectionObserver(([e]) => {
      if (e.isIntersecting) { setFormed(true); io.disconnect() }
    }, { threshold: 0.3 })
    io.observe(el)
    return () => io.disconnect()
  }, [])

  // Points take turns once the map has formed.
  useEffect(() => {
    if (!formed) return
    const id = setInterval(() => setActive(a => (a + 1) % POINTS.length), TURN_MS)
    return () => clearInterval(id)
  }, [formed, cycle])

  const mode = POINTS[active].mode
  return (
    <div ref={ref} className={cn('fc mt-12 grid items-center gap-10 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:gap-14', dark && 'fc-dark')} data-formed={formed ? '' : undefined} data-mode={mode}>
      {/* left: the points */}
      <ol className="flex flex-col">
        {POINTS.map((p, i) => (
          <li key={p.mode} className="fc-point" style={{ '--k': `${1300 + i * 140}ms` } as CSSProperties}>
            <button
              type="button"
              onClick={() => { setActive(i); setCycle(c => c + 1) }}
              aria-pressed={i === active}
              className={cn('group flex w-full gap-5 border-t py-5 text-left transition-colors', dark ? 'border-white/10' : 'border-neutral-950/10', i === active ? (dark ? 'text-white' : 'text-neutral-950') : dark ? 'text-white/35 hover:text-white/70' : 'text-neutral-400 hover:text-neutral-700')}
            >
              <span className="w-7 shrink-0 pt-1 font-mono text-xs tabular-nums">{String(i + 1).padStart(2, '0')}</span>
              <span className="flex min-w-0 flex-1 flex-col gap-1.5">
                <span className="text-xl font-semibold tracking-tight">{p.title}</span>
                <span className={cn('text-[15px] leading-relaxed transition-colors', i === active ? (dark ? 'text-white/65' : 'text-neutral-600') : dark ? 'text-white/35' : 'text-neutral-400')}>{p.body}</span>
                <span className={cn('mt-2 h-0.5 overflow-hidden rounded-full', dark ? 'bg-white/10' : 'bg-neutral-950/5')} aria-hidden="true">
                  {i === active && formed && <span key={`${active}-${cycle}`} className={cn('fc-progress block h-full', dark ? 'bg-white' : 'bg-neutral-950')} style={{ animationDuration: `${TURN_MS}ms` }} />}
                </span>
              </span>
            </button>
          </li>
        ))}
      </ol>

      {/* right: one floor map */}
      <figure className="fc-card relative m-0 p-6 sm:p-8">
        <figcaption className="fc-cap mb-5 flex items-baseline justify-between gap-3 text-sm">
          <span className="font-semibold">Spartanburg · Floor 1</span>
          <span className={cn('tabular-nums', dark ? 'text-white/55' : 'text-neutral-500')}>{mode === 'heat' ? '3 blocks over 50 °C' : mode === 'owned' ? '3 alerts · 3 owners' : '1 service moved · 0 s down'}</span>
        </figcaption>
        <div className="fc-map relative grid grid-cols-6 gap-1.5" aria-hidden="true">
          {HEAT.map((b, i) => (
            <span key={i} style={scatter(i)} className={cn('fc-tile relative grid aspect-square place-items-center rounded-lg', `fc-${b}`, i === FROM && 'fc-from', i === TO && 'fc-to')}>
              <span className="absolute top-1.5 left-2 text-[10px] font-semibold opacity-70">{TAGS[i]}</span>
              {OWNERS[i] && <span className="fc-owner grid size-7 place-items-center rounded-full bg-white text-xs font-bold text-neutral-950 shadow-sm">{OWNERS[i]}</span>}
            </span>
          ))}
          <span className="fc-svc" />
        </div>
        <div className={cn('fc-cap mt-5 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs', dark ? 'text-white/55' : 'text-neutral-500')} aria-hidden="true">
          {(['cool', 'warm', 'warn', 'crit'] as const).map((b, i) => (
            <span key={b} className="inline-flex items-center gap-1.5"><i className={cn('size-2.5 rounded-sm', `fc-${b}`)} />{['under 45 °C', '45–50', '50–55', '55 °C +'][i]}</span>
          ))}
        </div>
      </figure>
    </div>
  )
}
