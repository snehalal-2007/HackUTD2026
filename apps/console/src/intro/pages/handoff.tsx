import { useEffect, useRef, useState } from 'react'
import { ArrowRightIcon, CheckIcon, GripVerticalIcon, LockIcon, MoonIcon, PartyPopperIcon, RotateCcwIcon, SunIcon, SunriseIcon, UnlockIcon } from 'lucide-react'
import { AUTH_ROUTES } from '@/auth/components/routes'
import { BrandMark } from '@/components/shell/brand-mark'
import { cn } from '@/lib/utils'
import { useScrollProgress } from '../shared/hooks'
import { Reveal, RiseText } from '../shared/motion'
import { SiteFooter, SiteHeader } from '../shared/site-chrome'

// ---- Handoff board: drag (or click Accept) every open item to the incoming shift to unlock "End shift".

interface Item { id: string; title: string; note: string; sev: 'crit' | 'warn' | 'info' }
const ITEMS: Item[] = [
  { id: 'a', title: 'UPS-3C-1 on battery', note: 'Utility feed A down since 04:50. Generator G-3C on second start attempt.', sev: 'crit' },
  { id: 'b', title: 'Hall B inlet trending up', note: 'Fan tray swap on CRAC-2 due by 07:00. Load already moved off B-12.', sev: 'warn' },
  { id: 'c', title: 'payments-core on reduced capacity', note: 'Failed over to 3D overnight. Fail back after UPS recovers.', sev: 'warn' },
  { id: 'd', title: 'Firmware window tonight', note: 'PDU firmware in Hall A at 22:00. Change ticket approved.', sev: 'info' },
]
const SEV = {
  crit: 'bg-red-500/15 text-red-200 border-red-400/40',
  warn: 'bg-amber-400/15 text-amber-100 border-amber-300/40',
  info: 'bg-sky-400/15 text-sky-100 border-sky-300/40',
}

function HandoffBoard() {
  const [accepted, setAccepted] = useState<string[]>([])
  const [over, setOver] = useState(false)
  const [ended, setEnded] = useState(false)
  const pending = ITEMS.filter(i => !accepted.includes(i.id))
  const left = pending.length
  const accept = (id: string) => setAccepted(a => (a.includes(id) ? a : [...a, id]))

  return (
    <div className="relative">
      <div className="grid gap-4 md:grid-cols-2">
        <div className="rounded-3xl border border-white/15 bg-white/[0.06] p-5">
          <p className="flex items-center gap-2 text-sm font-semibold text-white/80"><MoonIcon className="size-4" aria-hidden="true" /> Outgoing · night shift</p>
          <ul className="mt-4 flex min-h-72 flex-col gap-3">
            {pending.map(i => (
              <li
                key={i.id}
                draggable
                onDragStart={e => e.dataTransfer.setData('text/plain', i.id)}
                className="group flex cursor-grab gap-3 rounded-2xl border border-white/10 bg-neutral-950/60 p-4 transition-all duration-300 active:cursor-grabbing active:scale-[0.98] animate-in fade-in-0"
              >
                <GripVerticalIcon className="mt-0.5 size-4 shrink-0 text-white/30" aria-hidden="true" />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={cn('rounded-full border px-2 py-0.5 text-[0.65rem] font-semibold uppercase', SEV[i.sev])}>{i.sev === 'crit' ? 'Critical' : i.sev === 'warn' ? 'Warning' : 'Info'}</span>
                    <p className="font-medium">{i.title}</p>
                  </div>
                  <p className="mt-1.5 text-sm text-white/60">{i.note}</p>
                </div>
                <button type="button" onClick={() => accept(i.id)} className="h-8 shrink-0 self-center rounded-full bg-white px-3 text-xs font-semibold text-neutral-950 outline-none hover:scale-105 focus-visible:ring-2 focus-visible:ring-white/70">
                  Accept
                </button>
              </li>
            ))}
            {left === 0 && <li className="flex flex-1 items-center justify-center rounded-2xl border border-dashed border-white/15 text-sm text-white/40">Nothing left to hand over</li>}
          </ul>
        </div>

        <div
          onDragOver={e => { e.preventDefault(); setOver(true) }}
          onDragLeave={() => setOver(false)}
          onDrop={e => { e.preventDefault(); setOver(false); accept(e.dataTransfer.getData('text/plain')) }}
          className={cn('rounded-3xl border-2 border-dashed p-5 transition-colors', over ? 'border-amber-300 bg-amber-300/10' : 'border-white/15 bg-white/[0.03]')}
        >
          <p className="flex items-center gap-2 text-sm font-semibold text-white/80"><SunriseIcon className="size-4" aria-hidden="true" /> Incoming · day shift</p>
          <ul className="mt-4 flex min-h-72 flex-col gap-3" aria-live="polite">
            {accepted.length === 0 && <li className="flex flex-1 items-center justify-center rounded-2xl text-center text-sm text-white/40">Drag items here, or press Accept</li>}
            {accepted.map(id => {
              const i = ITEMS.find(x => x.id === id)!
              return (
                <li key={id} className="flex items-center gap-3 rounded-2xl bg-emerald-400/10 p-4 animate-in fade-in-0 slide-in-from-left-6 duration-500">
                  <span className="flex size-7 items-center justify-center rounded-full bg-emerald-400 text-neutral-950"><CheckIcon className="size-4" aria-hidden="true" /></span>
                  <span className="min-w-0">
                    <span className="block truncate font-medium">{i.title}</span>
                    <span className="text-xs text-emerald-200/80">Accepted by day shift lead</span>
                  </span>
                </li>
              )
            })}
          </ul>
        </div>
      </div>

      <div className="mt-6 flex flex-col items-center gap-3">
        <button
          type="button"
          disabled={left > 0 || ended}
          onClick={() => setEnded(true)}
          className={cn(
            'flex h-14 items-center gap-2 rounded-full px-8 text-lg font-semibold transition-all duration-500',
            left > 0 ? 'cursor-not-allowed bg-white/10 text-white/50' : 'bg-gradient-to-r from-amber-300 to-orange-400 text-neutral-950 shadow-[0_0_40px_rgb(251_191_36/0.5)] hover:scale-105',
          )}
        >
          {left > 0 ? <LockIcon className="size-5" aria-hidden="true" /> : <UnlockIcon className="size-5" aria-hidden="true" />}
          End night shift
        </button>
        <p className="text-sm text-white/60" role="status">
          {ended ? '' : left > 0 ? `Locked: ${left} item${left === 1 ? '' : 's'} still need${left === 1 ? 's' : ''} the incoming lead to accept.` : 'Every item has a new owner. You can go home.'}
        </p>
      </div>

      {ended && (
        <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-4 rounded-3xl bg-neutral-950/85 text-center backdrop-blur animate-in fade-in-0 zoom-in-95 duration-500">
          <PartyPopperIcon className="size-12 text-amber-300" aria-hidden="true" />
          <p className="text-3xl font-semibold">Shift handed over.</p>
          <p className="max-w-sm text-white/65">Four open issues, four new owners, zero sticky notes.</p>
          <button type="button" onClick={() => { setAccepted([]); setEnded(false) }} className="mt-2 flex items-center gap-2 rounded-full border border-white/25 px-5 py-2 text-sm hover:bg-white/10">
            <RotateCcwIcon className="size-4" aria-hidden="true" /> Try again
          </button>
        </div>
      )}
    </div>
  )
}

// ---- A day in MESA: vertical scroll drives a horizontal track of shift moments.

const DAY = [
  { time: '05:31', Icon: MoonIcon, title: 'A fan fails', body: 'CRAC-2 drops a fan. MESA raises the alert and starts an 8-minute acknowledgment clock.' },
  { time: '05:39', Icon: MoonIcon, title: 'Nobody answers', body: 'The night operator is mid-walkthrough. MESA escalates to the on-call lead automatically.' },
  { time: '05:58', Icon: SunriseIcon, title: 'Handoff opens', body: 'Every open issue becomes a handoff item with the outgoing lead’s note attached.' },
  { time: '06:04', Icon: SunIcon, title: 'Day shift accepts', body: 'Item by item. The night shift can’t clock out until the last one is taken.' },
  { time: '06:20', Icon: SunIcon, title: 'Briefing ready', body: 'The AI agent drafts a shift brief from the event log, clearly labeled as AI drafted.' },
]

function DayTrack() {
  const ref = useRef<HTMLElement>(null)
  const track = useRef<HTMLDivElement>(null)
  const p = useScrollProgress(ref)
  const [distance, setDistance] = useState(0)
  useEffect(() => {
    const el = track.current!
    const measure = () => setDistance(Math.max(0, el.scrollWidth - window.innerWidth + 48))
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    window.addEventListener('resize', measure)
    return () => { ro.disconnect(); window.removeEventListener('resize', measure) }
  }, [])
  return (
    <section id="day" ref={ref} className="relative scroll-mt-0" style={{ height: '320vh' }}>
      <div className="sticky top-0 flex min-h-svh flex-col justify-center overflow-hidden py-20">
        <div className="mx-auto w-full max-w-6xl px-6 sm:px-10">
          <p className="text-sm tracking-widest text-amber-200/80 uppercase">A morning with MESA</p>
          <h2 className="mt-3 text-4xl font-semibold tracking-tight sm:text-5xl">From 05:31 to handed over.</h2>
        </div>
        <div ref={track} className="mt-12 flex w-max gap-6 pl-6 will-change-transform sm:pl-10 lg:pl-[max(2.5rem,calc((100vw-72rem)/2+2.5rem))]" style={{ transform: `translateX(${-p * distance}px)` }}>
          {DAY.map((d, i) => (
            <article key={d.time} className="w-[20rem] shrink-0 rounded-3xl border border-white/10 bg-gradient-to-b from-white/[0.09] to-white/[0.02] p-7">
              <div className="flex items-center justify-between">
                <span className="font-mono text-3xl font-semibold text-amber-200">{d.time}</span>
                <d.Icon className="size-5 text-white/50" aria-hidden="true" />
              </div>
              <p className="mt-8 text-xl font-semibold">{d.title}</p>
              <p className="mt-2 text-white/65">{d.body}</p>
              <p className="mt-8 font-mono text-xs text-white/30">0{i + 1} / 0{DAY.length}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  )
}

export function HandoffIntro() {
  return (
    <div id="top" className="overflow-x-clip bg-[linear-gradient(180deg,#1b1530_0%,#2a1d3a_35%,#3b2236_65%,#1b1530_100%)] text-white">
      <SiteHeader tone="dark" links={[{ href: '#board', label: 'Handoff' }, { href: '#day', label: 'A morning' }, { href: '#start', label: 'Get started' }]} />
      <section className="relative flex min-h-svh flex-col overflow-hidden">
        <div aria-hidden="true" className="absolute inset-x-0 bottom-0 h-[55%] bg-[radial-gradient(ellipse_at_bottom,rgb(251_146_60/0.55),transparent_65%)]" />
        <div aria-hidden="true" className="absolute bottom-[-18rem] left-1/2 size-[36rem] -translate-x-1/2 rounded-full bg-gradient-to-t from-amber-300 to-orange-500 opacity-80 blur-[2px]" />
        <div className="relative flex items-center gap-2.5 px-6 pt-6 sm:px-10">
          <BrandMark className="bg-white text-neutral-950" />
          <span className="font-brand text-2xl tracking-wide">mesa</span>
        </div>
        <div className="relative mx-auto flex w-full max-w-6xl flex-1 flex-col items-center justify-center px-6 pb-40 text-center">
          <Reveal variant="blur" className="font-mono text-sm tracking-[0.25em] text-amber-200/90">05:58 · SHIFT CHANGE IN 2 MIN</Reveal>
          <h1 className="mt-6 max-w-4xl text-5xl leading-[1.04] font-semibold tracking-tight sm:text-7xl">
            <RiseText text="The night shift ends" start={200} /><br />
            <RiseText text="when every issue has a new owner." start={500} step={55} className="text-amber-100/80" />
          </h1>
          <Reveal delay={900} className="mt-8 max-w-xl text-lg text-white/70">
            MESA locks the shift change until the incoming lead accepts each open item. Nothing gets lost between 05:59 and 06:00.
          </Reveal>
        </div>
      </section>

      <section id="board" className="mx-auto max-w-6xl scroll-mt-24 px-6 py-28 sm:px-10">
        <Reveal>
          <h2 className="text-4xl font-semibold tracking-tight sm:text-5xl">Try to end the shift.</h2>
          <p className="mt-4 max-w-2xl text-white/65">Drag each open item to the day shift, or press Accept. The button stays locked until the last one moves.</p>
        </Reveal>
        <Reveal variant="scale" delay={150} className="mt-12"><HandoffBoard /></Reveal>
      </section>

      <DayTrack />

      <section id="start" className="scroll-mt-24 px-6 py-32 text-center">
        <Reveal variant="blur"><h2 className="mx-auto max-w-3xl text-5xl font-semibold tracking-tight sm:text-6xl">Hand over the whole floor, not a sticky note.</h2></Reveal>
        <Reveal delay={200} className="mt-10 flex flex-wrap justify-center gap-3">
          <a href={AUTH_ROUTES.quickSignIn} className="flex h-12 items-center gap-2 rounded-full bg-gradient-to-r from-amber-300 to-orange-400 px-7 font-semibold text-neutral-950 hover:scale-[1.04]">
            Get started <ArrowRightIcon className="size-4" aria-hidden="true" />
          </a>
        </Reveal>
      </section>
      <SiteFooter tone="dark" />
    </div>
  )
}
