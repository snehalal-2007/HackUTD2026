import { ArrowRightIcon } from 'lucide-react'
import { BrandMark } from '@/components/shell/brand-mark'
import { INTRO_ROUTES, type IntroRoute } from './routes'
import { CinematicIntro } from './pages/cinematic'
import { CountdownIntro } from './pages/countdown'
import { GridIntro } from './pages/grid'
import { HandoffIntro } from './pages/handoff'

const SAMPLES = [
  { href: INTRO_ROUTES.cinematic, title: 'Cinematic', body: 'Dark, full-bleed data-hall walkthrough. Interactive: a live alert simulator with escalation.', swatch: 'from-neutral-900 to-neutral-700' },
  { href: INTRO_ROUTES.countdown, title: 'Countdown', body: 'Light editorial. Interactive: a scroll-scrubbed story that draws the alert from first reading to resolved.', swatch: 'from-orange-300 to-rose-200' },
  { href: INTRO_ROUTES.handoff, title: 'Handoff', body: 'Dusk gradient. Interactive: drag issues to the day shift to unlock “End shift”, plus a sideways-scrolling morning.', swatch: 'from-indigo-900 to-orange-400' },
  { href: INTRO_ROUTES.grid, title: 'Grid', body: 'Blueprint. Interactive: racks that heat under your cursor, and a cooling-failure what-if with a time scrubber.', swatch: 'from-[#050c18] to-cyan-400' },
]

function IntroIndex() {
  return (
    <main className="min-h-svh bg-neutral-100 px-6 py-16 text-neutral-900">
      <div className="mx-auto max-w-3xl">
        <div className="flex items-center gap-2.5">
          <BrandMark className="bg-neutral-950 text-white" />
          <span className="font-brand text-2xl">mesa</span>
        </div>
        <h1 className="mt-10 text-3xl font-semibold tracking-tight">Intro page samples</h1>
        <p className="mt-2 text-neutral-600">Four directions for the public intro page. Scroll each one: the Sign in and Contact bar appears after the first screen.</p>
        <ul className="mt-8 grid gap-4 sm:grid-cols-2">
          {SAMPLES.map(s => (
            <li key={s.href}>
              <a href={s.href} className="group flex h-full flex-col overflow-hidden rounded-2xl border border-black/10 bg-white transition-shadow hover:shadow-lg">
                <span className={`h-28 bg-gradient-to-br ${s.swatch}`} aria-hidden="true" />
                <span className="flex flex-1 flex-col gap-1 p-5">
                  <span className="flex items-center justify-between font-semibold">{s.title}<ArrowRightIcon className="size-4 transition-transform group-hover:translate-x-1" aria-hidden="true" /></span>
                  <span className="text-sm text-neutral-600">{s.body}</span>
                </span>
              </a>
            </li>
          ))}
        </ul>
      </div>
    </main>
  )
}

export function IntroRoutes({ route }: { route: IntroRoute }) {
  switch (route) {
    case INTRO_ROUTES.cinematic: return <CinematicIntro />
    case INTRO_ROUTES.countdown: return <CountdownIntro />
    case INTRO_ROUTES.handoff: return <HandoffIntro />
    case INTRO_ROUTES.grid: return <GridIntro />
    default: return <IntroIndex />
  }
}
