import { ArrowDownIcon, ArrowRightIcon } from 'lucide-react'
import { AUTH_ROUTES } from '@/auth/components/routes'
import { WalkthroughBackdrop } from '@/auth/components/walkthrough-backdrop'
import { BrandMark } from '@/components/shell/brand-mark'
import { cn } from '@/lib/utils'
import { Reveal, RiseText } from '../shared/motion'
import { SiteFooter, SiteHeader } from '../shared/site-chrome'
import { ThemeSwitch } from '../shared/theme-switch'
import { CoolingDemo } from './cooling-demo'
import { FloorCards } from './floor-cards'

// The public home page, one layout in two themes (dark at /, light at /intro/light) so they never drift apart:
//   1. "No alert left unowned." over a walk down a data-hall aisle
//   2. "See the heat before it becomes an outage." three points and a floor map that forms itself (FloorCards)
//   3. "Fail a cooling unit. Watch it recover." the three-floor cluster story (CoolingDemo)
//   4. "Put your floor on the map." then the footer
// Only colours differ between the themes; every word and section is shared.

export type LandingTone = 'dark' | 'light'

const T = {
  dark: {
    page: 'bg-[#0b0c0f] text-white', mark: 'text-white', eyebrow: 'text-white/60', soft: 'text-white/60', lead: 'text-white/75', body: 'text-white/65', code: 'text-white/55',
    primary: 'bg-white text-neutral-950', secondary: 'border-white/25 hover:bg-white/10', hint: 'text-white/60 hover:text-white', rule: 'border-white/5',
  },
  light: {
    page: 'bg-[#ebe8e2] text-neutral-950', mark: 'text-neutral-950', eyebrow: 'text-neutral-600', soft: 'text-neutral-500', lead: 'text-neutral-700', body: 'text-neutral-600', code: 'text-neutral-500',
    primary: 'bg-neutral-950 text-white', secondary: 'border-black/15 bg-white/60 backdrop-blur hover:bg-white', hint: 'text-neutral-500 hover:text-neutral-950', rule: 'border-black/5',
  },
}

const scrollTo = (id: string) => (e: React.MouseEvent) => {
  e.preventDefault()
  document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' })
}

export function Landing({ tone }: { tone: LandingTone }) {
  const t = T[tone]
  return (
    <div id="top" className={cn('overflow-x-clip', t.page)}>
      <SiteHeader tone={tone} links={[{ href: '#heat', label: 'What it does' }, { href: '#whatif', label: 'What-if' }, { href: '#start', label: 'Get started' }]} />

      {/* 1. the promise, over a walk down a data-hall aisle */}
      <section className="relative flex min-h-svh flex-col overflow-hidden">
        <WalkthroughBackdrop tone={tone} />
        <div className="relative z-10 flex items-center gap-2.5 px-6 pt-6 sm:px-10">
          <BrandMark className={t.mark} />
          <span className="font-brand text-2xl tracking-wide">mesa</span>
          <ThemeSwitch tone={tone} />
        </div>
        <div className="relative z-10 mx-auto flex w-full max-w-6xl flex-1 flex-col justify-center px-6 pb-24 sm:px-10">
          <Reveal variant="blur"><p className={cn('mb-6 text-sm tracking-[0.3em] uppercase', t.eyebrow)}>Operations console for data centers</p></Reveal>
          <h1 className="max-w-4xl text-5xl leading-[1.02] font-semibold tracking-tight sm:text-7xl lg:text-8xl">
            <RiseText text="No alert left" start={150} /><br />
            <RiseText text="unowned." start={450} className={t.soft} />
          </h1>
          <Reveal delay={700} className={cn('mt-8 max-w-xl text-lg', t.lead)}>
            One live console for your physical floor and your virtual estate. Every warning gets an owner, a deadline and a countdown.
          </Reveal>
          <Reveal delay={900} className="mt-10 flex flex-wrap gap-3">
            <a href={AUTH_ROUTES.quickSignIn} className={cn('flex h-12 items-center gap-2 rounded-full px-6 font-semibold transition-transform hover:scale-[1.03]', t.primary)}>
              Get started <ArrowRightIcon className="size-4" aria-hidden="true" />
            </a>
            <a href="#whatif" onClick={scrollTo('whatif')} className={cn('flex h-12 items-center rounded-full border px-6 font-medium', t.secondary)}>
              Fail a cooling unit
            </a>
          </Reveal>
        </div>
        <a href="#heat" onClick={scrollTo('heat')} aria-label="Next: what it does" className={cn('absolute bottom-8 left-1/2 z-10 -translate-x-1/2 rounded-full p-2', t.hint)}>
          <ArrowDownIcon className="scroll-hint size-5" aria-hidden="true" />
        </a>
      </section>

      {/* 2. what it does */}
      <section id="heat" className="mx-auto max-w-6xl scroll-mt-24 px-6 py-28 sm:px-10">
        <Reveal variant="left">
          <p className={cn('font-mono text-sm', t.code)}>see_the_heat()</p>
          <h2 className="mt-3 max-w-3xl text-4xl font-semibold tracking-tight sm:text-5xl">See the heat before it becomes an outage.</h2>
          <p className={cn('mt-4 max-w-2xl', t.body)}>MESA maps every rack, cooling unit and virtual machine on one live floor plan, then tells you what fails next and who owns it.</p>
        </Reveal>
        <FloorCards tone={tone} />
      </section>

      {/* 3. the cooling-failure story on the three-floor cluster */}
      <section id="whatif" className="mx-auto max-w-6xl scroll-mt-24 px-6 pb-28 sm:px-10">
        <Reveal variant="left">
          <p className={cn('font-mono text-sm', t.code)}>what_if(cooling_failure)</p>
          <h2 className="mt-3 max-w-3xl text-4xl font-semibold tracking-tight sm:text-5xl">Fail a cooling unit. Watch it recover.</h2>
          <p className={cn('mt-4 max-w-2xl', t.body)}>Three sample floors. A cooling unit fails beside Spartanburg, the nearest blocks heat up, MESA raises the alerts and gives them an owner, then moves the services to North Carolina and Dallas so the hot blocks can cool.</p>
        </Reveal>
        <Reveal variant="scale" delay={150} className="mt-12"><CoolingDemo tone={tone} /></Reveal>
      </section>

      {/* 4. get started */}
      <section id="start" className="scroll-mt-24 px-6 pt-8 pb-32 text-center">
        <Reveal variant="blur"><h2 className="mx-auto max-w-3xl text-5xl font-semibold tracking-tight sm:text-6xl">Put your floor on the map.</h2></Reveal>
        <Reveal delay={150} className={cn('mx-auto mt-5 max-w-xl', t.body)}>Sign in to your console, or create an organization and be live in three business days.</Reveal>
        <Reveal delay={250} className="mt-10 flex justify-center">
          <a href={AUTH_ROUTES.quickSignIn} className={cn('flex h-12 items-center gap-2 rounded-full px-7 font-semibold transition-transform hover:scale-[1.04]', t.primary)}>
            Get started <ArrowRightIcon className="size-4" aria-hidden="true" />
          </a>
        </Reveal>
      </section>
      <SiteFooter tone={tone} />
    </div>
  )
}
