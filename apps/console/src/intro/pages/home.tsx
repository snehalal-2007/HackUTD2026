import { ArrowDownIcon, ArrowRightIcon } from 'lucide-react'
import { AUTH_ROUTES } from '@/auth/components/routes'
import { WalkthroughBackdrop } from '@/auth/components/walkthrough-backdrop'
import { BrandMark } from '@/components/shell/brand-mark'
import { Reveal, RiseText } from '../shared/motion'
import { SiteFooter, SiteHeader } from '../shared/site-chrome'
import { RackField, WhatIf } from './grid'

const scrollTo = (id: string) => (e: React.MouseEvent) => {
  e.preventDefault()
  document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' })
}

function NextHint({ to, label }: { to: string; label: string }) {
  return (
    <a href={`#${to}`} onClick={scrollTo(to)} aria-label={label} className="absolute bottom-8 left-1/2 z-10 -translate-x-1/2 rounded-full p-2 text-white/60 hover:text-white">
      <ArrowDownIcon className="scroll-hint size-5" aria-hidden="true" />
    </a>
  )
}

/**
 * The public home page (#/), one color scheme throughout (near-black, white, grays):
 *   1. "No alert left unowned." over the data-hall walkthrough
 *   2. "See the heat before it becomes an outage." over racks that warm under the cursor
 *   3. The cooling-failure what-if
 * "Get started" and the Sign in button in the scroll bar both lead to the sign-in page.
 */
export function HomePage() {
  return (
    <div id="top" className="overflow-x-clip bg-[#0b0c0f] text-white">
      <SiteHeader tone="dark" links={[{ href: '#heat', label: 'Heat map' }, { href: '#whatif', label: 'What-if' }, { href: '#start', label: 'Get started' }]} />

      {/* 1 */}
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
            <a href="#whatif" onClick={scrollTo('whatif')} className="flex h-12 items-center rounded-full border border-white/25 px-6 font-medium hover:bg-white/10">
              Fail a cooling unit
            </a>
          </Reveal>
        </div>
        <NextHint to="heat" label="Next: the heat map" />
      </section>

      {/* 2 */}
      <section id="heat" className="relative flex min-h-svh scroll-mt-0 flex-col overflow-hidden border-t border-white/5">
        <RackField tone="neutral" />
        <div aria-hidden="true" className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_10%,#0b0c0f_75%)]" />
        <div className="pointer-events-none relative mx-auto flex w-full max-w-6xl flex-1 flex-col justify-center px-6 py-24 sm:px-10">
          <Reveal variant="blur" className="font-mono text-sm text-white/55">// move your cursor over the floor</Reveal>
          <h2 className="mt-6 max-w-4xl text-5xl leading-[1.03] font-semibold tracking-tight sm:text-7xl">
            <Reveal as="span" variant="up" className="block">See the heat</Reveal>
            <Reveal as="span" variant="up" delay={200} className="block text-white/60">before it becomes an outage.</Reveal>
          </h2>
          <Reveal delay={400} className="mt-8 max-w-xl text-lg text-white/75">
            MESA maps every rack, cooling unit and virtual machine on one live floor plan, then tells you what fails next and who owns it.
          </Reveal>
        </div>
        <NextHint to="whatif" label="Next: the what-if" />
      </section>

      {/* 3 */}
      <section id="whatif" className="mx-auto max-w-6xl scroll-mt-24 border-t border-transparent px-6 py-28 sm:px-10">
        <Reveal variant="left">
          <p className="font-mono text-sm text-white/55">what_if(cooling_failure)</p>
          <h2 className="mt-3 max-w-3xl text-4xl font-semibold tracking-tight sm:text-5xl">Fail a cooling unit. Scrub the clock.</h2>
          <p className="mt-4 max-w-2xl text-white/65">A sample hall: four rows of six racks between two cooling units. Turn one off, drag the timeline, and switch to Virtual to see which workloads ride on the racks at risk.</p>
        </Reveal>
        <Reveal variant="scale" delay={150} className="mt-12"><WhatIf tone="neutral" /></Reveal>
      </section>

      <section id="start" className="scroll-mt-24 px-6 pt-8 pb-32 text-center">
        <Reveal variant="blur"><h2 className="mx-auto max-w-3xl text-5xl font-semibold tracking-tight sm:text-6xl">Put your floor on the map.</h2></Reveal>
        <Reveal delay={150} className="mx-auto mt-5 max-w-xl text-white/65">Sign in to your console, or create an organization and be live in three business days.</Reveal>
        <Reveal delay={250} className="mt-10 flex justify-center">
          <a href={AUTH_ROUTES.quickSignIn} className="flex h-12 items-center gap-2 rounded-full bg-white px-7 font-semibold text-neutral-950 transition-transform hover:scale-[1.04]">
            Get started <ArrowRightIcon className="size-4" aria-hidden="true" />
          </a>
        </Reveal>
      </section>
      <SiteFooter tone="dark" />
    </div>
  )
}
