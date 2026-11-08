import { useEffect, useReducer } from 'react'
import { ArrowDownIcon, ArrowRightIcon, BellRingIcon, CheckCircle2Icon, ClockIcon, FlameIcon, HandIcon, RotateCcwIcon, SirenIcon, UserRoundIcon, UsersIcon, WrenchIcon } from 'lucide-react'
import { WalkthroughBackdrop } from '@/auth/components/walkthrough-backdrop'
import { AUTH_ROUTES } from '@/auth/components/routes'
import { BrandMark } from '@/components/shell/brand-mark'
import { cn } from '@/lib/utils'
import { Reveal, RiseText } from '../shared/motion'
import { SiteFooter, SiteHeader } from '../shared/site-chrome'

// ---- Live alert simulator ---------------------------------------------------------------
// A small model of the real rules: an alert gets an acknowledgment deadline, escalates to the
// on-call lead if nobody takes it, and can't be resolved without an owner. 1 demo second = 1 minute.

type Phase = 'idle' | 'open' | 'owned' | 'mitigating' | 'resolved'
interface Sim {
  phase: Phase
  owner: string | null
  escalated: boolean
  ackLeft: number // minutes until escalation
  breachIn: number // minutes until the inlet limit
  temp: number
  log: { t: number; text: string }[]
  t: number
}
type Act = { type: 'trip' | 'ack' | 'mitigate' | 'resolve' | 'reset' | 'tick' }

const START: Sim = { phase: 'idle', owner: null, escalated: false, ackLeft: 8, breachIn: 14, temp: 24.1, log: [], t: 0 }
const clock = (t: number) => `05:${String(31 + t).padStart(2, '0')}`

function reduce(s: Sim, a: Act): Sim {
  const log = (text: string) => [{ t: s.t, text }, ...s.log].slice(0, 7)
  switch (a.type) {
    case 'reset': return START
    case 'trip': return { ...START, phase: 'open', log: [{ t: 0, text: 'CRAC-2 fan failure. Alert raised, owner needed within 8 min.' }] }
    case 'ack': return s.phase === 'open' ? { ...s, phase: 'owned', owner: 'You', log: log('You acknowledged. Escalation cancelled.') } : s
    case 'mitigate': return s.phase === 'owned' ? { ...s, phase: 'mitigating', log: log('Load shifted from B-12 to B-07. Fan tray swap dispatched.') } : s
    case 'resolve': return s.phase === 'mitigating' && s.temp < 25 && s.owner ? { ...s, phase: 'resolved', log: log(`Resolved by ${s.owner}.`) } : s
    case 'tick': {
      if (s.phase === 'idle' || s.phase === 'resolved') return s
      const t = s.t + 1
      const cooling = s.phase === 'mitigating'
      const temp = +(s.temp + (cooling ? -0.45 : 0.32)).toFixed(1)
      const breachIn = cooling ? s.breachIn : Math.max(0, s.breachIn - 1)
      let next: Sim = { ...s, t, temp, breachIn }
      if (s.phase === 'open') {
        const ackLeft = s.ackLeft - 1
        next = { ...next, ackLeft }
        if (ackLeft <= 0 && !s.escalated) {
          next = { ...next, phase: 'owned', owner: 'Night shift lead', escalated: true, log: [{ t, text: 'No one acknowledged in 8 min. Escalated to the on-call night shift lead, severity raised.' }, ...s.log] }
        }
      }
      return next
    }
  }
}

function Simulator() {
  const [s, dispatch] = useReducer(reduce, START)
  useEffect(() => {
    if (s.phase === 'idle' || s.phase === 'resolved') return
    const id = window.setInterval(() => dispatch({ type: 'tick' }), 1000)
    return () => window.clearInterval(id)
  }, [s.phase])

  const status = {
    idle: { label: 'All clear', tone: 'text-emerald-300 bg-emerald-400/10 border-emerald-400/30', Icon: CheckCircle2Icon },
    open: { label: 'Unowned', tone: 'text-red-300 bg-red-500/10 border-red-400/40', Icon: SirenIcon },
    owned: { label: 'Acknowledged', tone: 'text-amber-200 bg-amber-400/10 border-amber-300/40', Icon: HandIcon },
    mitigating: { label: 'Mitigating', tone: 'text-sky-200 bg-sky-400/10 border-sky-300/40', Icon: WrenchIcon },
    resolved: { label: 'Resolved', tone: 'text-emerald-300 bg-emerald-400/10 border-emerald-400/30', Icon: CheckCircle2Icon },
  }[s.phase]
  const hot = s.temp >= 27

  return (
    <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
      <div className="relative overflow-hidden rounded-3xl border border-white/10 bg-white/[0.04] p-6 backdrop-blur">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs tracking-widest text-white/50 uppercase">Hall B · CRAC-2</p>
            <p className="mt-1 text-xl font-semibold">Inlet temperature, rack B-12</p>
          </div>
          <span role="status" className={cn('flex items-center gap-1.5 rounded-full border px-3 py-1 text-sm font-medium transition-colors', status.tone)}>
            <status.Icon className={cn('size-4', s.phase === 'open' && 'pulse')} aria-hidden="true" /> {status.label}
          </span>
        </div>

        <div className="mt-6 grid grid-cols-3 gap-3">
          <Metric label="Inlet" value={`${s.temp.toFixed(1)} °C`} warn={hot} />
          <Metric label="Time to breach" value={s.phase === 'idle' || s.phase === 'resolved' || s.phase === 'mitigating' ? '—' : `${s.breachIn} min`} warn={s.breachIn <= 5 && s.phase !== 'idle'} />
          <Metric label="Owner" value={s.owner ?? (s.phase === 'open' ? `due in ${s.ackLeft} min` : '—')} warn={s.phase === 'open'} />
        </div>

        <div className="mt-5 h-2 overflow-hidden rounded-full bg-white/10" aria-hidden="true">
          <div
            className={cn('h-full rounded-full transition-all duration-700', hot ? 'bg-red-400' : s.temp > 25.5 ? 'bg-amber-300' : 'bg-emerald-400')}
            style={{ width: `${Math.min(100, ((s.temp - 20) / 12) * 100)}%` }}
          />
        </div>
        <p className="mt-1 text-right text-xs text-white/40">Limit 27 °C</p>

        <div className="mt-6 flex flex-wrap gap-2">
          {s.phase === 'idle' && <SimButton onClick={() => dispatch({ type: 'trip' })} primary><FlameIcon aria-hidden="true" /> Trip a cooling fan</SimButton>}
          {s.phase === 'open' && <SimButton onClick={() => dispatch({ type: 'ack' })} primary><HandIcon aria-hidden="true" /> Acknowledge</SimButton>}
          {s.phase === 'owned' && <SimButton onClick={() => dispatch({ type: 'mitigate' })} primary><WrenchIcon aria-hidden="true" /> Shift load and dispatch</SimButton>}
          {s.phase === 'mitigating' && (
            <SimButton onClick={() => dispatch({ type: 'resolve' })} primary disabled={s.temp >= 25}>
              <CheckCircle2Icon aria-hidden="true" /> {s.temp >= 25 ? 'Cooling down…' : 'Resolve'}
            </SimButton>
          )}
          {s.phase !== 'idle' && <SimButton onClick={() => dispatch({ type: 'reset' })}><RotateCcwIcon aria-hidden="true" /> Reset</SimButton>}
        </div>
        {s.phase === 'open' && <p className="mt-3 text-sm text-white/60">Do nothing for 8 seconds to see escalation take over.</p>}
      </div>

      <div className="rounded-3xl border border-white/10 bg-black/30 p-6">
        <p className="flex items-center gap-2 text-sm font-semibold"><ClockIcon className="size-4" aria-hidden="true" /> Event log</p>
        <ol className="mt-4 flex flex-col gap-3" aria-live="polite">
          {s.log.length === 0 && <li className="text-sm text-white/40">Nothing yet. Trip a fan to start.</li>}
          {s.log.map((e, i) => (
            <li key={`${e.t}-${i}-${e.text}`} className="flex gap-3 text-sm animate-in fade-in-0 slide-in-from-left-4 duration-500">
              <span className="w-11 shrink-0 font-mono text-white/40">{clock(e.t)}</span>
              <span className="text-white/85">{e.text}</span>
            </li>
          ))}
        </ol>
      </div>
    </div>
  )
}

function Metric({ label, value, warn }: { label: string; value: string; warn?: boolean }) {
  return (
    <div className="rounded-2xl bg-black/30 p-3">
      <p className="text-xs text-white/50">{label}</p>
      <p className={cn('mt-1 truncate text-lg font-semibold tabular-nums transition-colors', warn && 'text-red-300')}>{value}</p>
    </div>
  )
}

function SimButton({ children, primary, ...p }: React.ComponentProps<'button'> & { primary?: boolean }) {
  return (
    <button
      type="button"
      className={cn(
        'flex h-10 items-center gap-2 rounded-full px-5 text-sm font-semibold transition-all outline-none focus-visible:ring-2 focus-visible:ring-white/70 disabled:opacity-60 [&_svg]:size-4',
        primary ? 'bg-white text-neutral-950 hover:scale-[1.03]' : 'border border-white/20 text-white/80 hover:bg-white/10',
      )}
      {...p}
    >
      {children}
    </button>
  )
}

// ---- Page -------------------------------------------------------------------------------

const PILLARS = [
  { Icon: UserRoundIcon, title: 'Every alert has an owner', body: 'Each warning gets an owner and an acknowledgment deadline. If nobody takes it, it escalates on its own, even with every browser closed.' },
  { Icon: ClockIcon, title: 'Know what breaks next', body: 'MESA predicts how long until each reading crosses its limit, so the team fixes what will hurt first instead of what is loudest.' },
  { Icon: UsersIcon, title: 'Handoffs that hold', body: 'A shift cannot end while any open issue is unaccepted. The incoming lead takes ownership item by item, with notes.' },
]

const CAPS = ['Power', 'Cooling', 'Inlet temperature', 'Humidity', 'UPS runtime', 'Generators', 'Hypervisor hosts', 'Virtual machines', 'Escalation', 'Shift handoff', 'Event log', 'AI-drafted briefs']

export function CinematicIntro() {
  return (
    <div id="top" className="overflow-x-clip bg-[#0b0c0f] text-white">
      <SiteHeader tone="dark" links={[{ href: '#platform', label: 'Platform' }, { href: '#simulator', label: 'Try it' }, { href: '#live', label: 'Live sync' }]} />

      <section className="relative flex min-h-svh flex-col overflow-hidden">
        <WalkthroughBackdrop />
        <div className="relative z-10 flex items-center gap-2.5 px-6 pt-6 sm:px-10">
          <BrandMark className="bg-white text-neutral-950" />
          <span className="font-brand text-2xl tracking-wide">mesa</span>
        </div>
        <div className="relative z-10 mx-auto flex w-full max-w-6xl flex-1 flex-col justify-center px-6 pb-24 sm:px-10">
          <Reveal variant="blur"><p className="mb-6 text-sm tracking-[0.3em] text-white/60 uppercase">Operations console for data centers</p></Reveal>
          <h1 className="max-w-4xl text-5xl leading-[1.02] font-semibold tracking-tight sm:text-7xl lg:text-8xl">
            <RiseText text="No alert left" start={150} /><br />
            <RiseText text="unowned." start={450} className="text-white/60" />
          </h1>
          <Reveal delay={700} className="mt-8 max-w-xl text-lg text-white/75">
            One live console for your physical floor and your virtual estate. Every warning gets an owner, a deadline and a countdown.
          </Reveal>
          <Reveal delay={900} className="mt-10 flex flex-wrap gap-3">
            <a href={AUTH_ROUTES.quickSignIn} className="flex h-12 items-center gap-2 rounded-full bg-white px-6 font-semibold text-neutral-950 transition-transform hover:scale-[1.03]">
              Get started <ArrowRightIcon className="size-4" aria-hidden="true" />
            </a>
            <a href="#simulator" onClick={e => { e.preventDefault(); document.getElementById('simulator')?.scrollIntoView({ behavior: 'smooth' }) }} className="flex h-12 items-center rounded-full border border-white/25 px-6 font-medium hover:bg-white/10">
              Watch an alert get owned
            </a>
          </Reveal>
        </div>
        <ArrowDownIcon className="scroll-hint absolute bottom-8 left-1/2 z-10 size-5 -translate-x-1/2 text-white/60" aria-hidden="true" />
      </section>

      <section id="platform" className="mx-auto max-w-6xl scroll-mt-24 px-6 py-28 sm:px-10">
        <Reveal><h2 className="max-w-2xl text-4xl font-semibold tracking-tight sm:text-5xl">Built for the operator at 5 am.</h2></Reveal>
        <div className="mt-14 grid gap-5 md:grid-cols-3">
          {PILLARS.map((p, i) => (
            <Reveal key={p.title} delay={i * 140} className="group rounded-3xl border border-white/10 bg-gradient-to-b from-white/[0.07] to-transparent p-7 transition-transform duration-500 hover:-translate-y-1.5">
              <span className="flex size-11 items-center justify-center rounded-2xl bg-white/10 transition-colors group-hover:bg-white group-hover:text-neutral-950">
                <p.Icon className="size-5" aria-hidden="true" />
              </span>
              <h3 className="mt-6 text-xl font-semibold">{p.title}</h3>
              <p className="mt-3 text-white/65">{p.body}</p>
            </Reveal>
          ))}
        </div>
      </section>

      <div className="overflow-hidden border-y border-white/10 py-6" aria-label="What MESA watches">
        <div className="marquee flex w-max gap-10 text-2xl font-medium text-white/35">
          {[...CAPS, ...CAPS].map((c, i) => (
            <span key={i} className="flex items-center gap-10" aria-hidden={i >= CAPS.length}>{c}<span className="text-white/15">◆</span></span>
          ))}
        </div>
      </div>

      <section id="simulator" className="mx-auto max-w-6xl scroll-mt-24 px-6 py-28 sm:px-10">
        <Reveal variant="left">
          <p className="flex items-center gap-2 text-sm tracking-widest text-red-300 uppercase"><BellRingIcon className="size-4" aria-hidden="true" /> Try it</p>
          <h2 className="mt-3 max-w-3xl text-4xl font-semibold tracking-tight sm:text-5xl">Break something. Watch MESA make sure someone owns it.</h2>
          <p className="mt-4 max-w-2xl text-white/65">A one-minute simulation of a cooling failure, sped up so each second is a minute.</p>
        </Reveal>
        <Reveal delay={150} variant="scale" className="mt-12"><Simulator /></Reveal>
      </section>

      <section id="live" className="mx-auto grid max-w-6xl scroll-mt-24 items-center gap-12 px-6 py-28 sm:px-10 lg:grid-cols-2">
        <Reveal variant="left">
          <h2 className="text-4xl font-semibold tracking-tight sm:text-5xl">One state. Every screen.</h2>
          <p className="mt-5 text-lg text-white/65">
            Operators, the telemetry feed and the AI agent all read and write the same live database. Acknowledge on the floor tablet, and the boardroom display changes in the same instant.
          </p>
        </Reveal>
        <Reveal variant="right" className="relative h-72">
          {['Floor tablet', 'Operations wall', 'Lead’s laptop'].map((label, i) => (
            <div
              key={label}
              className="absolute w-64 rounded-2xl border border-white/15 bg-neutral-900/90 p-4 shadow-2xl transition-transform duration-700 hover:-translate-y-2"
              style={{ left: `${i * 18}%`, top: `${i * 22}%`, zIndex: i }}
            >
              <p className="text-xs text-white/45">{label}</p>
              <p className="mt-2 flex items-center gap-2 text-sm font-medium"><HandIcon className="size-4 text-amber-300" aria-hidden="true" /> CRAC-2 · Acknowledged</p>
              <p className="mt-1 text-xs text-white/55">Owner: night shift lead · 05:39</p>
            </div>
          ))}
        </Reveal>
      </section>

      <section className="px-6 py-32 text-center">
        <Reveal variant="blur">
          <h2 className="mx-auto max-w-3xl text-5xl font-semibold tracking-tight sm:text-6xl">Bring your halls online in three business days.</h2>
        </Reveal>
        <Reveal delay={200} className="mt-10 flex justify-center gap-3">
          <a href={AUTH_ROUTES.quickSignIn} className="flex h-12 items-center gap-2 rounded-full bg-white px-6 font-semibold text-neutral-950 hover:scale-[1.03]">Get started <ArrowRightIcon className="size-4" aria-hidden="true" /></a>
        </Reveal>
      </section>
      <SiteFooter tone="dark" />
    </div>
  )
}
