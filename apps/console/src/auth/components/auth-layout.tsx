import { useEffect, useState, type ReactNode, type RefObject } from 'react'
import { BrandMark } from '@/components/shell/brand-mark'
import { ThemeToggle } from '@/components/shell/theme-toggle'
import { cn } from '@/lib/utils'
import { AUTH_ROUTES } from './routes'
import { HOME_ROUTE } from './session'
import { TestimonialRotator } from './testimonial-rotator'
import { WalkthroughBackdrop } from './walkthrough-backdrop'

function Wordmark() {
  return (
    <a href={HOME_ROUTE} aria-label="MESA home" className="flex items-center gap-2.5 rounded-lg outline-none focus-visible:ring-3 focus-visible:ring-ring/50">
      <BrandMark className="text-foreground" />
      <span className="flex flex-col leading-none">
        <span className="font-brand text-2xl tracking-wide">mesa</span>
        <span className="text-xs text-muted-foreground">No alert left unowned</span>
      </span>
    </a>
  )
}

function Footer() {
  return (
    <footer className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
      <span>© 2026 MESA</span>
      <a className="hover:text-foreground" href={HOME_ROUTE}>Home</a>
      <a className="hover:text-foreground" href={AUTH_ROUTES.index}>All sign-in samples</a>
    </footer>
  )
}

/** Centered card layout, used by most of the sign-in samples. */
export function AuthCard({
  title,
  subtitle,
  children,
  below,
  wide = false,
  size,
  top,
  titleRef,
}: {
  title: string
  subtitle?: ReactNode
  children: ReactNode
  below?: ReactNode
  wide?: boolean
  /** 'xl' for long multi-section forms. */
  size?: 'xl'
  /** Shown above the card, e.g. a step indicator. */
  top?: ReactNode
  /** Lets multi-step flows move focus to the title when the step changes. */
  titleRef?: RefObject<HTMLHeadingElement | null>
}) {
  return (
    <div className="flex min-h-svh flex-col bg-background text-foreground">
      <header className="flex items-center justify-between px-4 py-4 sm:px-8">
        <Wordmark />
        <ThemeToggle />
      </header>
      <main className="flex flex-1 items-start justify-center px-4 pt-6 pb-10 sm:items-center sm:pt-0">
        <div className={cn('flex w-full flex-col gap-4', size === 'xl' ? 'max-w-3xl' : wide ? 'max-w-xl' : 'max-w-sm')}>
          {top}
          <section className="rounded-2xl border border-border bg-card p-6 shadow-sm sm:p-8">
            <h1 ref={titleRef} tabIndex={titleRef ? -1 : undefined} className="text-xl font-semibold tracking-tight outline-none">{title}</h1>
            {subtitle && <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>}
            <div className="mt-6">{children}</div>
          </section>
          {below}
        </div>
      </main>
      <div className="px-4 pb-6"><Footer /></div>
    </div>
  )
}

/** The page theme ('dark' class on <html>, set by ThemeToggle), kept current when it is toggled. */
function usePageTheme() {
  const read = () => (document.documentElement.classList.contains('dark') ? 'dark' : 'light')
  const [theme, setTheme] = useState<'dark' | 'light'>(read)
  useEffect(() => {
    const mo = new MutationObserver(() => setTheme(read()))
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] })
    return () => mo.disconnect()
  }, [])
  return theme
}

/**
 * Two-column layout: product context on the left, the form on the right. Stacks on phones. The left panel follows the
 * page theme: the dark walkthrough with white text in dark mode, the light data hall with dark text in light mode.
 * Content inside it styles its light look with the `in-data-[tone=light]:` variant.
 */
export function AuthSplit({ aside, children }: { aside: ReactNode; children: ReactNode }) {
  const tone = usePageTheme()
  return (
    <div className="grid min-h-svh bg-background text-foreground lg:grid-cols-[1fr_minmax(0,32rem)]">
      <aside data-tone={tone} className={cn('relative hidden overflow-hidden lg:block', tone === 'light' ? 'border-r bg-[#ebe8e2] text-neutral-950' : 'bg-[#0b0c0f] text-white')}>
        <WalkthroughBackdrop key={tone} tone={tone} />
        <div className="relative z-10 flex h-full min-h-svh flex-col justify-between gap-10 p-10 xl:p-14">
          <a href={HOME_ROUTE} aria-label="MESA home" className="flex items-center gap-2.5">
            <BrandMark className={tone === 'light' ? 'text-neutral-950' : 'text-white'} />
            <span className="font-brand text-2xl tracking-wide">mesa</span>
          </a>
          {aside}
          <div className="flex flex-col gap-6">
            <TestimonialRotator />
            <p className="text-xs text-white/60 in-data-[tone=light]:text-neutral-600">Real-time operations console for data-center teams.</p>
          </div>
        </div>
      </aside>
      <div className="flex flex-col">
        <header className="flex items-center justify-between px-4 py-4 sm:px-8">
          <span className="lg:invisible"><Wordmark /></span>
          <ThemeToggle />
        </header>
        <main className="flex flex-1 items-start justify-center px-4 pt-6 pb-10 sm:items-center sm:px-8 sm:pt-0">
          <div className="flex w-full max-w-sm flex-col gap-6">
            {children}
          </div>
        </main>
        <div className="px-4 pb-6"><Footer /></div>
      </div>
    </div>
  )
}
