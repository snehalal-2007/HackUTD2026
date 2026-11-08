import { useRef } from 'react'
import { ActivityIcon, ArrowRightIcon, CheckCircle2Icon, HandIcon, LineChartIcon, ServerIcon, CloudIcon } from 'lucide-react'
import { AUTH_ROUTES } from '@/auth/components/routes'
import { BrandMark } from '@/components/shell/brand-mark'
import { cn } from '@/lib/utils'
import { useScrollProgress } from '../shared/hooks'
import { Reveal, RiseText } from '../shared/motion'
import { SiteFooter, SiteHeader } from '../shared/site-chrome'

// Scroll-scrubbed story: the chart, countdown and owner chip are driven by how far you've scrolled.

const STEPS = [
  { Icon: ActivityIcon, title: 'Detect', body: 'Readings stream in every two seconds. Inlet temperature on rack B-12 starts climbing.' },
  { Icon: LineChartIcon, title: 'Predict', body: 'MESA projects the trend forward and puts a countdown on the alert: the limit is 14 minutes away.' },
  { Icon: HandIcon, title: 'Own', body: 'The alert needs an owner before its deadline. The shift lead takes it; escalation stands down.' },
  { Icon: CheckCircle2Icon, title: 'Resolve', body: 'Load moves, the curve bends back under the limit, and the alert closes with a full trail.' },
]

// 25 points of "past" plus 13 of forecast, in °C.
const PAST = [23.1, 23.2, 23.0, 23.3, 23.4, 23.3, 23.5, 23.6, 23.5, 23.7, 23.9, 24.1, 24.3, 24.6, 24.9, 25.2, 25.4, 25.7, 25.9, 26.0, 26.2, 26.3, 26.5, 26.6, 26.7]
const FORE = [26.7, 26.9, 27.1, 27.3, 27.5, 27.7, 27.9]
const FIX = [26.7, 26.4, 25.9, 25.3, 24.8, 24.4, 24.1]
const W = 640, H = 300, LIMIT = 27, LO = 22.5, HI = 28.5
const x = (i: number) => 20 + (i / (PAST.length + FORE.length - 2)) * (W - 40)
const y = (v: number) => H - 20 - ((v - LO) / (HI - LO)) * (H - 40)
const path = (vals: number[], from: number) => vals.map((v, i) => `${i ? 'L' : 'M'}${x(from + i).toFixed(1)},${y(v).toFixed(1)}`).join(' ')

function Chart({ p }: { p: number }) {
  // Stage progress: 0–0.25 detect, 0.25–0.5 predict, 0.5–0.75 own, 0.75–1 resolve.
  const draw = Math.min(1, p / 0.25)
  const fore = Math.min(1, Math.max(0, (p - 0.25) / 0.2))
  const fix = Math.min(1, Math.max(0, (p - 0.78) / 0.18))
  const owned = p >= 0.55
  const resolved = p >= 0.92
  const breach = Math.max(0, Math.round(14 - Math.max(0, p - 0.3) * 30))
  const pastPath = path(PAST, 0)
  const len = 1400

  return (
    <div className="relative w-full rounded-[2rem] border border-black/5 bg-white p-6 shadow-[0_30px_80px_-30px_rgb(0_0_0/0.25)]">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs tracking-widest text-neutral-400 uppercase">Hall B · Rack B-12</p>
          <p className="font-semibold">Inlet temperature</p>
        </div>
        <div className="flex items-center gap-2">
          {fore > 0.3 && !resolved && (
            <span className="rounded-full bg-orange-100 px-3 py-1 text-sm font-semibold text-orange-700 tabular-nums animate-in fade-in-0 zoom-in-95">
              {owned ? 'Countdown paused' : `Breach in ${breach} min`}
            </span>
          )}
          {owned && (
            <span className={cn('flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-medium animate-in fade-in-0 slide-in-from-right-4', resolved ? 'bg-emerald-100 text-emerald-700' : 'bg-neutral-900 text-white')}>
              {resolved ? <CheckCircle2Icon className="size-4" aria-hidden="true" /> : <HandIcon className="size-4" aria-hidden="true" />}
              {resolved ? 'Resolved' : 'Owned by shift lead'}
            </span>
          )}
        </div>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="mt-4 w-full" role="img" aria-label="Inlet temperature rising toward the 27 °C limit, then falling after mitigation">
        <line x1="20" x2={W - 20} y1={y(LIMIT)} y2={y(LIMIT)} stroke="#e5484d" strokeDasharray="4 6" strokeWidth="1.5" />
        <text x={W - 20} y={y(LIMIT) - 8} textAnchor="end" fontSize="12" fill="#e5484d">27 °C limit</text>
        <line x1={x(PAST.length - 1)} x2={x(PAST.length - 1)} y1="10" y2={H - 20} stroke="#d4d4d4" strokeDasharray="2 4" />
        <text x={x(PAST.length - 1)} y={H - 4} textAnchor="middle" fontSize="11" fill="#a3a3a3">now</text>
        <path d={`${pastPath} L${x(PAST.length - 1)},${H - 20} L20,${H - 20} Z`} fill="url(#fade)" opacity={draw} />
        <defs>
          <linearGradient id="fade" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor="#f97316" stopOpacity="0.18" /><stop offset="1" stopColor="#f97316" stopOpacity="0" /></linearGradient>
        </defs>
        <path d={pastPath} fill="none" stroke="#f97316" strokeWidth="3" strokeLinecap="round" strokeDasharray={len} strokeDashoffset={len * (1 - draw)} />
        <path d={path(FORE, PAST.length - 1)} fill="none" stroke="#f97316" strokeWidth="2.5" strokeDasharray="6 6" opacity={fore * (1 - fix)} />
        {fore > 0.9 && fix < 1 && <circle cx={x(PAST.length + 1.6)} cy={y(LIMIT)} r="7" fill="#e5484d" opacity={1 - fix} className="pulse" />}
        <path d={path(FIX, PAST.length - 1)} fill="none" stroke="#10b981" strokeWidth="3" strokeLinecap="round" strokeDasharray="400" strokeDashoffset={400 * (1 - fix)} />
      </svg>
    </div>
  )
}

function Story() {
  const ref = useRef<HTMLElement>(null)
  const p = useScrollProgress(ref)
  const active = Math.min(STEPS.length - 1, Math.floor(p * STEPS.length))
  return (
    <section id="story" ref={ref} className="relative scroll-mt-0" style={{ height: '420vh' }}>
      <div className="sticky top-0 flex min-h-svh items-center">
        <div className="mx-auto grid w-full max-w-6xl items-center gap-6 px-6 py-16 sm:gap-10 sm:py-24 lg:grid-cols-[0.9fr_1.1fr]">
          <div>
            <div className="mb-8 h-1 w-full overflow-hidden rounded-full bg-black/10" aria-hidden="true">
              <div className="h-full rounded-full bg-neutral-900" style={{ width: `${p * 100}%` }} />
            </div>
            <ol className="flex flex-col gap-1 sm:gap-2">
              {STEPS.map((s, i) => (
                <li
                  key={s.title}
                  aria-current={i === active ? 'step' : undefined}
                  className={cn('rounded-3xl p-3 transition-all sm:p-5 duration-500', i === active ? 'bg-white shadow-lg' : 'opacity-40')}
                >
                  <p className="flex items-center gap-3 text-2xl font-semibold">
                    <span className={cn('flex size-9 items-center justify-center rounded-xl transition-colors', i === active ? 'bg-orange-500 text-white' : 'bg-black/5')}>
                      <s.Icon className="size-4" aria-hidden="true" />
                    </span>
                    {s.title}
                  </p>
                  <div className={cn('grid transition-all duration-500', i === active ? 'mt-3 grid-rows-[1fr]' : 'grid-rows-[0fr]')}>
                    <p className="overflow-hidden text-neutral-600">{s.body}</p>
                  </div>
                </li>
              ))}
            </ol>
          </div>
          <Chart p={p} />
        </div>
      </div>
    </section>
  )
}

const CAPS = [
  { n: '01', title: 'Physical floor', body: 'Racks, PDUs, UPS units, generators and cooling, with warning and critical limits per asset.', Icon: ServerIcon },
  { n: '02', title: 'Virtual estate', body: 'Hypervisor hosts and virtual machines mapped to the racks they run on, so a hot aisle shows which workloads are at risk.', Icon: CloudIcon },
  { n: '03', title: 'Owners and deadlines', body: 'Acknowledge, assign and resolve with rules enforced in the database, not just the screen.', Icon: HandIcon },
  { n: '04', title: 'Prediction', body: 'A time-to-breach estimate on every alert, refreshed as new readings arrive.', Icon: LineChartIcon },
]

export function CountdownIntro() {
  return (
    <div id="top" className="overflow-x-clip bg-[#f4f1ea] text-neutral-900">
      <SiteHeader tone="light" links={[{ href: '#story', label: 'How it works' }, { href: '#capabilities', label: 'Capabilities' }, { href: '#start', label: 'Get started' }]} />
      <section className="relative flex min-h-svh flex-col overflow-hidden">
        <div aria-hidden="true" className="absolute -top-40 -right-40 size-[38rem] rounded-full bg-orange-300/40 blur-3xl" />
        <div aria-hidden="true" className="absolute -bottom-40 -left-32 size-[30rem] rounded-full bg-rose-200/60 blur-3xl" />
        <div className="relative flex items-center gap-2.5 px-6 pt-6 sm:px-10">
          <BrandMark className="bg-neutral-950 text-white" />
          <span className="font-brand text-2xl tracking-wide">mesa</span>
        </div>
        <div className="relative mx-auto flex w-full max-w-6xl flex-1 flex-col justify-center px-6 pb-20 sm:px-10">
          <h1 className="max-w-5xl font-serif text-5xl leading-[1.05] tracking-tight sm:text-7xl lg:text-[6.5rem]">
            <RiseText text="Every alert knows" /><br />
            <RiseText text="how long until" start={300} /><em className="text-orange-600"><RiseText text="it gets worse." start={520} /></em>
          </h1>
          <Reveal delay={800} className="mt-8 max-w-xl text-lg text-neutral-600">
            MESA watches power, cooling and the workloads on top of them, and tells your team which problem will hurt first.
          </Reveal>
          <Reveal delay={1000} className="mt-10 flex items-center gap-3 text-sm text-neutral-500">
            <span className="flex h-10 w-6 justify-center rounded-full border-2 border-neutral-400 pt-2" aria-hidden="true"><span className="scroll-hint block h-2 w-1 rounded-full bg-neutral-500" /></span>
            Scroll to watch one alert from first reading to resolved
          </Reveal>
        </div>
      </section>

      <Story />

      <section id="capabilities" className="mx-auto max-w-6xl scroll-mt-24 px-6 py-28 sm:px-10">
        <Reveal><h2 className="max-w-3xl font-serif text-5xl leading-tight tracking-tight">Physical and virtual, on one timeline.</h2></Reveal>
        <div className="mt-14 divide-y divide-black/10 border-y border-black/10">
          {CAPS.map((c, i) => (
            <Reveal key={c.n} variant={i % 2 ? 'right' : 'left'} className="group grid items-center gap-4 py-8 sm:grid-cols-[6rem_1fr_1.4fr]">
              <span className="font-mono text-sm text-neutral-400">{c.n}</span>
              <p className="flex items-center gap-3 text-2xl font-semibold transition-transform duration-500 group-hover:translate-x-2">
                <c.Icon className="size-6 text-orange-600" aria-hidden="true" /> {c.title}
              </p>
              <p className="text-neutral-600">{c.body}</p>
            </Reveal>
          ))}
        </div>
      </section>

      <section id="start" className="scroll-mt-24 px-6 pb-28">
        <Reveal variant="scale" className="mx-auto max-w-6xl overflow-hidden rounded-[2.5rem] bg-neutral-950 px-8 py-20 text-center text-white sm:px-16">
          <h2 className="mx-auto max-w-2xl font-serif text-4xl leading-tight sm:text-6xl">Stop chasing the loudest alarm.</h2>
          <p className="mx-auto mt-5 max-w-lg text-white/65">Tell us about your sites and assets. Access is ready in three business days.</p>
          <a href={AUTH_ROUTES.quickSignIn} className="mt-10 inline-flex h-12 items-center gap-2 rounded-full bg-orange-500 px-7 font-semibold text-white transition-transform hover:scale-[1.04]">
            Get started <ArrowRightIcon className="size-4" aria-hidden="true" />
          </a>
        </Reveal>
      </section>
      <SiteFooter tone="light" />
    </div>
  )
}
