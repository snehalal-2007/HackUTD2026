import { ArrowDownIcon, ArrowRightIcon, ArrowRightLeftIcon, LayoutGridIcon, UserCheckIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import { AUTH_ROUTES } from '@/auth/components/routes'
import { WalkthroughBackdrop } from '@/auth/components/walkthrough-backdrop'
import { BrandMark } from '@/components/shell/brand-mark'
import { Reveal, RiseText } from '../shared/motion'
import { SiteFooter, SiteHeader } from '../shared/site-chrome'
import { ThemeSwitch } from '../shared/theme-switch'
import { CoolingDemo } from './cooling-demo'

// The home page in the console's light theme (warm #ebe8e2 page, white cards, near-black ink, black buttons).
// Same story as the dark home page (home.tsx): the walk down a (light) data-hall aisle, what MESA does, the
// cooling-failure demo, get started.

const scrollTo = (id: string) => (e: React.MouseEvent) => {
  e.preventDefault()
  document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' })
}

function Feature({ icon, title, children, delay }: { icon: ReactNode; title: string; children: ReactNode; delay: number }) {
  return (
    <Reveal variant="up" delay={delay} className="flex flex-col gap-3 rounded-3xl bg-white p-7">
      <span className="grid size-11 place-items-center rounded-2xl bg-[#ebe8e2] text-neutral-900" aria-hidden="true">{icon}</span>
      <h3 className="text-xl font-semibold tracking-tight">{title}</h3>
      <p className="text-[15px] leading-relaxed text-neutral-600">{children}</p>
    </Reveal>
  )
}

export function LightHomePage() {
  return (
    <div id="top" className="overflow-x-clip bg-[#ebe8e2] text-neutral-950">
      <SiteHeader tone="light" links={[{ href: '#heat', label: 'What it does' }, { href: '#whatif', label: 'What-if' }, { href: '#start', label: 'Get started' }]} />

      {/* 1. the promise, over the walk down a bright data-hall aisle */}
      <section className="relative flex min-h-svh flex-col overflow-hidden">
        <WalkthroughBackdrop tone="light" />
        <div className="relative z-10 flex items-center gap-2.5 px-6 pt-6 sm:px-10">
          <BrandMark className="text-neutral-950" />
          <span className="font-brand text-2xl tracking-wide">mesa</span>
          <ThemeSwitch tone="light" />
        </div>
        <div className="relative z-10 mx-auto flex w-full max-w-6xl flex-1 flex-col justify-center px-6 pb-24 sm:px-10">
          <Reveal variant="blur"><p className="mb-6 text-sm tracking-[0.3em] text-neutral-600 uppercase">Operations console for data centers</p></Reveal>
          <h1 className="max-w-4xl text-5xl leading-[1.02] font-semibold tracking-tight sm:text-7xl lg:text-8xl">
            <RiseText text="No alert left" start={150} /><br />
            <RiseText text="unowned." start={450} className="text-neutral-500" />
          </h1>
          <Reveal delay={700} className="mt-8 max-w-xl text-lg text-neutral-700">
            One live console for your physical floor and your virtual estate. Every warning gets an owner, a deadline and a countdown.
          </Reveal>
          <Reveal delay={900} className="mt-10 flex flex-wrap gap-3">
            <a href={AUTH_ROUTES.quickSignIn} className="flex h-12 items-center gap-2 rounded-full bg-neutral-950 px-6 font-semibold text-white transition-transform hover:scale-[1.03]">
              Get started <ArrowRightIcon className="size-4" aria-hidden="true" />
            </a>
            <a href="#whatif" onClick={scrollTo('whatif')} className="flex h-12 items-center rounded-full border border-black/15 bg-white/60 px-6 font-medium backdrop-blur hover:bg-white">
              Fail a cooling unit
            </a>
          </Reveal>
        </div>
        <a href="#heat" onClick={scrollTo('heat')} aria-label="Next: what it does" className="absolute bottom-8 left-1/2 z-10 -translate-x-1/2 rounded-full p-2 text-neutral-500 hover:text-neutral-950">
          <ArrowDownIcon className="scroll-hint size-5" aria-hidden="true" />
        </a>
      </section>

      {/* 2. what it does */}
      <section id="heat" className="mx-auto max-w-6xl scroll-mt-24 px-6 py-28 sm:px-10">
        <Reveal variant="left">
          <p className="font-mono text-sm text-neutral-500">see_the_heat()</p>
          <h2 className="mt-3 max-w-3xl text-4xl font-semibold tracking-tight sm:text-5xl">See the heat before it becomes an outage.</h2>
          <p className="mt-4 max-w-2xl text-neutral-600">MESA maps every rack, cooling unit and virtual machine on one live floor plan, then tells you what fails next and who owns it.</p>
        </Reveal>
        <div className="mt-12 grid gap-4 md:grid-cols-3">
          <Feature icon={<LayoutGridIcon className="size-5" />} title="One live floor" delay={0}>
            Every site, floor and block in 3D, coloured by temperature and updated the moment telemetry lands.
          </Feature>
          <Feature icon={<UserCheckIcon className="size-5" />} title="Every alert owned" delay={120}>
            Alerts open themselves, land in someone’s queue and escalate on a countdown. Handoffs carry the leftovers to the next shift.
          </Feature>
          <Feature icon={<ArrowRightLeftIcon className="size-5" />} title="Move, don’t restart" delay={240}>
            Live-migrate services off a hot block to another site, with no downtime and no duplicate copies.
          </Feature>
        </div>
      </section>

      {/* 3. the cooling-failure story on the three-floor cluster */}
      <section id="whatif" className="mx-auto max-w-6xl scroll-mt-24 px-6 pb-28 sm:px-10">
        <Reveal variant="left">
          <p className="font-mono text-sm text-neutral-500">what_if(cooling_failure)</p>
          <h2 className="mt-3 max-w-3xl text-4xl font-semibold tracking-tight sm:text-5xl">Fail a cooling unit. Watch it recover.</h2>
          <p className="mt-4 max-w-2xl text-neutral-600">Three sample floors. A cooling unit fails beside Spartanburg, the nearest blocks heat up, MESA raises the alerts and gives them an owner, then moves the services to North Carolina and Dallas so the hot blocks can cool.</p>
        </Reveal>
        <Reveal variant="scale" delay={150} className="mt-12"><CoolingDemo tone="light" /></Reveal>
      </section>

      {/* 4. get started */}
      <section id="start" className="scroll-mt-24 px-6 pt-8 pb-32 text-center">
        <Reveal variant="blur"><h2 className="mx-auto max-w-3xl text-5xl font-semibold tracking-tight sm:text-6xl">Put your floor on the map.</h2></Reveal>
        <Reveal delay={150} className="mx-auto mt-5 max-w-xl text-neutral-600">Sign in to your console, or create an organization and be live in three business days.</Reveal>
        <Reveal delay={250} className="mt-10 flex justify-center">
          <a href={AUTH_ROUTES.quickSignIn} className="flex h-12 items-center gap-2 rounded-full bg-neutral-950 px-7 font-semibold text-white transition-transform hover:scale-[1.04]">
            Get started <ArrowRightIcon className="size-4" aria-hidden="true" />
          </a>
        </Reveal>
      </section>
      <SiteFooter tone="light" />
    </div>
  )
}
