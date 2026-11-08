import { useEffect, useMemo, useRef, useState } from 'react'
import { AlertTriangleIcon, ArrowRightIcon, BoxesIcon, CpuIcon, FanIcon, OctagonAlertIcon, ServerIcon, TimerIcon } from 'lucide-react'
import { AUTH_ROUTES } from '@/auth/components/routes'
import { BrandMark } from '@/components/shell/brand-mark'
import { cn } from '@/lib/utils'
import { prefersReducedMotion } from '../shared/hooks'
import { Reveal, RiseText } from '../shared/motion'
import { SiteFooter, SiteHeader } from '../shared/site-chrome'

// ---- Hero: a field of racks that warm up under the cursor ----------------------------------

export type Tone = 'blueprint' | 'neutral'

/** A field of racks that warm up under the cursor. Neutral = gray racks turning amber/red (home page). */
export function RackField({ tone = 'blueprint' }: { tone?: Tone }) {
  const canvas = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const c = canvas.current!
    const g = c.getContext('2d')!
    const still = prefersReducedMotion()
    let raf = 0
    let mouse = { x: -9999, y: -9999 }
    const heat: number[] = []
    const CELL = 26
    let cols = 0
    let rows = 0
    const fit = () => {
      const r = c.getBoundingClientRect()
      const dpr = Math.min(2, window.devicePixelRatio || 1)
      c.width = r.width * dpr
      c.height = r.height * dpr
      g.setTransform(dpr, 0, 0, dpr, 0, 0)
      cols = Math.ceil(r.width / CELL)
      rows = Math.ceil(r.height / CELL)
      heat.length = cols * rows
      heat.fill(0)
    }
    const draw = (t: number) => {
      const { width, height } = c.getBoundingClientRect()
      g.clearRect(0, 0, width, height)
      for (let j = 0; j < rows; j++) {
        for (let i = 0; i < cols; i++) {
          const k = j * cols + i
          const cx = i * CELL + CELL / 2
          const cy = j * CELL + CELL / 2
          const d = Math.hypot(cx - mouse.x, cy - mouse.y)
          const target = Math.max(0, 1 - d / 180)
          heat[k] += (target - heat[k]) * 0.08
          const flicker = still ? 0 : (Math.sin(t / 900 + i * 1.7 + j * 2.3) + 1) * 0.05
          const h = Math.min(1, heat[k] + flicker)
          // blueprint: cool blue → amber → red; neutral: gray → amber → red
          const r = tone === 'neutral' ? Math.round(190 + h * 65) : Math.round(40 + h * 215)
          const gg = tone === 'neutral' ? Math.round(190 - h * 40 - h * h * 110) : Math.round(90 + h * 60 - h * h * 110)
          const b = tone === 'neutral' ? Math.round(196 - h * 176) : Math.round(160 - h * 140)
          g.fillStyle = `rgba(${r},${gg},${b},${(tone === 'neutral' ? 0.07 : 0.12) + h * 0.75})`
          g.beginPath()
          g.roundRect(cx - 8, cy - 10, 16, 20, 3)
          g.fill()
        }
      }
      if (!still) raf = requestAnimationFrame(draw)
    }
    const onMove = (e: PointerEvent) => {
      const r = c.getBoundingClientRect()
      mouse = { x: e.clientX - r.left, y: e.clientY - r.top }
      if (still) draw(0)
    }
    const onLeave = () => { mouse = { x: -9999, y: -9999 } }
    fit()
    const ro = new ResizeObserver(fit)
    ro.observe(c)
    window.addEventListener('pointermove', onMove)
    c.parentElement?.addEventListener('pointerleave', onLeave)
    raf = requestAnimationFrame(draw)
    return () => { cancelAnimationFrame(raf); ro.disconnect(); window.removeEventListener('pointermove', onMove) }
  }, [tone])
  return <canvas ref={canvas} aria-hidden="true" className="absolute inset-0 h-full w-full" />
}

// ---- What-if: a hall of 4 rows × 6 racks with two cooling units --------------------------

const ROWS = 4
const COLS = 6
const WARN = 27
const CRIT = 32
const CRACS = [
  { id: 'CRAC-1', x: -1.2, y: 1.5 },
  { id: 'CRAC-2', x: COLS + 0.2, y: 1.5 },
]
// Fixed sample loads and VM counts so the hall looks the same every visit.
const RACKS = Array.from({ length: ROWS * COLS }, (_, k) => {
  const r = Math.floor(k / COLS)
  const c = k % COLS
  const load = 0.6 + ((k * 37) % 11) / 25
  return { id: `${String.fromCharCode(65 + r)}-${String(c + 1).padStart(2, '0')}`, r, c, load, vms: 6 + ((k * 53) % 31) }
})

function tempAt(rack: (typeof RACKS)[number], failed: boolean[], minutes: number) {
  let t = 21.8 + rack.load * 1.8
  CRACS.forEach((u, i) => {
    if (!failed[i]) return
    const d = Math.hypot(rack.c - u.x, rack.r - u.y)
    const share = Math.exp(-d / 3.2)
    const both = failed.every(Boolean) ? 1.6 : 1
    t += 13 * share * both * rack.load * (1 - Math.exp(-minutes / 11))
  })
  return t
}

function breachMinutes(rack: (typeof RACKS)[number], failed: boolean[]) {
  for (let m = 0; m <= 60; m += 0.5) if (tempAt(rack, failed, m) >= WARN) return m
  return null
}

/** `tone` picks the palette: blueprint (Grid sample) or neutral (home page). Colors come from CSS variables in intro.css. */
export function WhatIf({ tone = 'blueprint' }: { tone?: Tone }) {
  const [failed, setFailed] = useState([false, true])
  const [minutes, setMinutes] = useState(8)
  const [virtual, setVirtual] = useState(false)
  const [focus, setFocus] = useState<string | null>(null)

  const temps = useMemo(() => RACKS.map(r => tempAt(r, failed, minutes)), [failed, minutes])
  const alerts = RACKS.map((r, i) => ({ ...r, temp: temps[i] })).filter(r => r.temp >= WARN).sort((a, b) => b.temp - a.temp)
  const next = RACKS.filter((_, i) => temps[i] < WARN)
    .map(r => ({ ...r, at: breachMinutes(r, failed) }))
    .filter(r => r.at !== null && r.at > minutes)
    .sort((a, b) => a.at! - b.at!)[0]
  const vmsAtRisk = alerts.reduce((n, r) => n + r.vms, 0)
  const sel = RACKS.find(r => r.id === focus)
  const selTemp = sel ? temps[RACKS.indexOf(sel)] : null

  const color = (t: number) =>
    t >= CRIT ? 'bg-red-500 text-white border-red-300' : t >= WARN ? 'bg-amber-400 text-neutral-950 border-amber-200' : t >= 25 ? 'bg-(--wi-mild) text-white border-(--wi-line-strong)' : 'bg-(--wi-cool) text-(--wi-cool-text) border-(--wi-line)'

  return (
    <div className={cn(`tone-${tone}`, 'grid gap-5 lg:grid-cols-[1.35fr_1fr]')}>
      <div className="rounded-3xl border border-(--wi-line) bg-(--wi-panel) p-5 sm:p-6">
        <div className="flex flex-wrap items-center gap-2">
          {CRACS.map((u, i) => (
            <button
              key={u.id}
              type="button"
              aria-pressed={failed[i]}
              onClick={() => setFailed(f => f.map((v, j) => (j === i ? !v : v)))}
              className={cn(
                'flex h-9 items-center gap-2 rounded-full border px-4 text-sm font-medium transition-colors outline-none focus-visible:ring-2 focus-visible:ring-(--wi-accent)',
                failed[i] ? 'border-red-400/60 bg-red-500/20 text-red-100' : 'border-(--wi-line-strong) text-(--wi-cool-text) hover:bg-(--wi-cool)',
              )}
            >
              <FanIcon className={cn('size-4', !failed[i] && 'motion-safe:animate-spin [animation-duration:2.5s]')} aria-hidden="true" />
              {u.id} {failed[i] ? 'failed' : 'running'}
            </button>
          ))}
          <div role="radiogroup" aria-label="Show" className="ml-auto flex rounded-full border border-(--wi-line-strong) p-0.5 text-xs">
            {[['Physical', false, ServerIcon], ['Virtual', true, CpuIcon]].map(([label, v, Icon]) => {
              const I = Icon as typeof ServerIcon
              return (
                <button key={label as string} type="button" role="radio" aria-checked={virtual === v} onClick={() => setVirtual(v as boolean)}
                  className={cn('flex items-center gap-1 rounded-full px-3 py-1.5', virtual === v ? 'bg-(--wi-accent) text-(--wi-accent-ink)' : 'text-(--wi-muted)')}>
                  <I className="size-3.5" aria-hidden="true" /> {label as string}
                </button>
              )
            })}
          </div>
        </div>

        <div className="relative mt-6 grid grid-cols-[2rem_1fr_2rem] items-center gap-2">
          {CRACS.map((u, i) => (
            <div key={u.id} className={cn('row-start-1 flex h-full items-center justify-center rounded-lg border text-[0.6rem] font-mono [writing-mode:vertical-rl]', i === 0 ? 'col-start-1' : 'col-start-3', failed[i] ? 'border-red-400/50 bg-red-500/20 text-red-200' : 'border-(--wi-line-strong) bg-(--wi-cool) text-(--wi-cool-text)')}>
              {u.id}
            </div>
          ))}
          <div className="col-start-2 row-start-1 grid gap-1.5" style={{ gridTemplateColumns: `repeat(${COLS}, minmax(0, 1fr))` }}>
            {RACKS.map((r, i) => {
              const t = temps[i]
              return (
                <button
                  key={r.id}
                  type="button"
                  onMouseEnter={() => setFocus(r.id)}
                  onFocus={() => setFocus(r.id)}
                  onClick={() => setFocus(r.id)}
                  aria-label={`Rack ${r.id}, ${t.toFixed(1)} degrees${t >= CRIT ? ', critical' : t >= WARN ? ', warning' : ''}${virtual ? `, ${r.vms} virtual machines` : ''}`}
                  className={cn(
                    'flex h-14 flex-col sm:h-16 items-center justify-center rounded-md border font-mono text-[0.65rem] leading-tight transition-all duration-500 outline-none focus-visible:ring-2 focus-visible:ring-white',
                    color(t),
                    focus === r.id && 'scale-110 shadow-lg shadow-black/50',
                    // Alternate rows face each other: hot and cold aisles.
                    r.r % 2 ? 'mt-0' : 'mb-2',
                  )}
                >
                  {t >= CRIT ? <OctagonAlertIcon className="mb-0.5 size-3" aria-hidden="true" /> : t >= WARN ? <AlertTriangleIcon className="mb-0.5 size-3" aria-hidden="true" /> : null}
                  <span>{virtual ? `${r.vms}` : t.toFixed(1)}</span>
                  <span className="opacity-60">{virtual ? 'VMs' : '°C'}</span>
                </button>
              )
            })}
          </div>
        </div>

        <label className="mt-7 block">
          <span className="flex items-center justify-between text-sm text-(--wi-muted)">
            <span className="flex items-center gap-2"><TimerIcon className="size-4" aria-hidden="true" /> Minutes since failure</span>
            <span className="font-mono text-lg text-white tabular-nums">{minutes}</span>
          </span>
          <input type="range" min={0} max={30} value={minutes} onChange={e => setMinutes(Number(e.target.value))} className="mt-3 w-full accent-(--wi-accent)" />
        </label>
      </div>

      <div className="flex flex-col gap-4">
        <div className="grid grid-cols-3 gap-3">
          <Stat label="Racks in alert" value={String(alerts.length)} hot={alerts.length > 0} />
          <Stat label="VMs at risk" value={String(vmsAtRisk)} hot={vmsAtRisk > 0} />
          <Stat label="Next breach" value={next ? `+${Math.round(next.at! - minutes)} min` : '—'} />
        </div>
        <div className="rounded-3xl border border-(--wi-line) bg-(--wi-panel) p-5" aria-live="polite">
          <p className="text-sm font-semibold text-(--wi-text)">{sel ? `Rack ${sel.id}` : 'Hover a rack'}</p>
          {sel && selTemp !== null && (
            <p className="mt-1 text-sm text-(--wi-muted)">
              {selTemp.toFixed(1)} °C inlet · {sel.vms} VMs · {Math.round(sel.load * 100)}% load
              {selTemp < WARN && breachMinutes(sel, failed) !== null && ` · warning at ${breachMinutes(sel, failed)} min`}
            </p>
          )}
        </div>
        <div className="flex-1 rounded-3xl border border-(--wi-line) bg-(--wi-panel) p-5">
          <p className="flex items-center gap-2 text-sm font-semibold text-(--wi-text)"><BoxesIcon className="size-4" aria-hidden="true" /> Alerts MESA would raise</p>
          <ul className="mt-3 flex max-h-64 flex-col gap-2 overflow-auto pr-1">
            {alerts.length === 0 && <li className="text-sm text-(--wi-faint)">None. Fail a cooling unit or move the clock forward.</li>}
            {alerts.map(a => (
              <li key={a.id} className="flex items-center gap-3 rounded-xl bg-white/[0.04] px-3 py-2 text-sm animate-in fade-in-0 slide-in-from-right-4">
                <span className={cn('size-2 shrink-0 rounded-full', a.temp >= CRIT ? 'bg-red-400' : 'bg-amber-300')} aria-hidden="true" />
                <span className="font-mono text-(--wi-text)">{a.id}</span>
                <span className="text-(--wi-muted)">{a.temp >= CRIT ? 'Critical' : 'Warning'} · {a.temp.toFixed(1)} °C</span>
                <span className="ml-auto text-xs text-(--wi-faint)">{a.vms} VMs · owner due 8 min</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  )
}

function Stat({ label, value, hot }: { label: string; value: string; hot?: boolean }) {
  return (
    <div className={cn('rounded-2xl border p-4 transition-colors duration-500', hot ? 'border-amber-300/40 bg-amber-300/10' : 'border-(--wi-line) bg-(--wi-panel)')}>
      <p className="text-xs text-(--wi-muted)">{label}</p>
      <p className="mt-1 font-mono text-2xl font-semibold text-white tabular-nums">{value}</p>
    </div>
  )
}

const SPECS = [
  { k: '2 s', v: 'between readings for every asset' },
  { k: '1', v: 'shared live database for people, sensors and the AI agent' },
  { k: '0', v: 'alerts that can be resolved without an owner' },
  { k: '24/7', v: 'escalation, even with every browser closed' },
]

export function GridIntro() {
  return (
    <div id="top" className="overflow-x-clip bg-[#050c18] text-white [background-image:linear-gradient(rgb(103_232_249/0.05)_1px,transparent_1px),linear-gradient(90deg,rgb(103_232_249/0.05)_1px,transparent_1px)] [background-size:48px_48px]">
      <SiteHeader tone="dark" links={[{ href: '#whatif', label: 'What-if' }, { href: '#specs', label: 'Under the hood' }, { href: '#start', label: 'Get started' }]} />
      <section className="relative flex min-h-svh flex-col overflow-hidden">
        <RackField />
        <div aria-hidden="true" className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_10%,#050c18_75%)]" />
        <div className="relative flex items-center gap-2.5 px-6 pt-6 sm:px-10">
          <BrandMark className="bg-cyan-200 text-[#050c18]" />
          <span className="font-brand text-2xl tracking-wide">mesa</span>
        </div>
        <div className="pointer-events-none relative mx-auto flex w-full max-w-6xl flex-1 flex-col justify-center px-6 pb-24 sm:px-10">
          <Reveal variant="blur" className="font-mono text-sm text-cyan-200/80">// move your cursor over the floor</Reveal>
          <h1 className="mt-6 max-w-4xl text-5xl leading-[1.03] font-semibold tracking-tight sm:text-7xl">
            <RiseText text="See the heat" /><br />
            <RiseText text="before it becomes an outage." start={300} step={60} className="text-cyan-200" />
          </h1>
          <Reveal delay={800} className="mt-8 max-w-xl text-lg text-cyan-50/70">
            MESA maps every rack, cooling unit and virtual machine on one live floor plan, then tells you what fails next and who owns it.
          </Reveal>
        </div>
      </section>

      <section id="whatif" className="mx-auto max-w-6xl scroll-mt-24 px-6 py-28 sm:px-10">
        <Reveal variant="left">
          <p className="font-mono text-sm text-cyan-300">what_if(cooling_failure)</p>
          <h2 className="mt-3 max-w-3xl text-4xl font-semibold tracking-tight sm:text-5xl">Fail a cooling unit. Scrub the clock.</h2>
          <p className="mt-4 max-w-2xl text-cyan-50/65">A sample hall: four rows of six racks between two cooling units. Turn one off, drag the timeline, and switch to Virtual to see which workloads ride on the racks at risk.</p>
        </Reveal>
        <Reveal variant="scale" delay={150} className="mt-12"><WhatIf tone="blueprint" /></Reveal>
      </section>

      <section id="specs" className="mx-auto max-w-6xl scroll-mt-24 px-6 py-28 sm:px-10">
        <div className="grid gap-px overflow-hidden rounded-3xl border border-cyan-300/15 bg-cyan-300/15 sm:grid-cols-2 lg:grid-cols-4">
          {SPECS.map((s, i) => (
            <Reveal key={s.v} delay={i * 120} className="bg-[#050c18] p-8">
              <p className="font-mono text-5xl font-semibold text-cyan-200">{s.k}</p>
              <p className="mt-4 text-cyan-50/70">{s.v}</p>
            </Reveal>
          ))}
        </div>
      </section>

      <section id="start" className="scroll-mt-24 px-6 py-32 text-center">
        <Reveal variant="blur"><h2 className="mx-auto max-w-3xl text-5xl font-semibold tracking-tight sm:text-6xl">Put your floor on the map.</h2></Reveal>
        <Reveal delay={200} className="mt-10 flex flex-wrap justify-center gap-3">
          <a href={AUTH_ROUTES.quickSignIn} className="flex h-12 items-center gap-2 rounded-full bg-cyan-200 px-7 font-semibold text-[#050c18] hover:scale-[1.04]">
            Get started <ArrowRightIcon className="size-4" aria-hidden="true" />
          </a>
        </Reveal>
      </section>
      <SiteFooter tone="dark" />
    </div>
  )
}
