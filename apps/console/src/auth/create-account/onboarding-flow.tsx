import { useEffect, useRef, useState } from 'react'
import { CheckIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import { AuthCard } from '../components/auth-layout'
import { AUTH_ROUTES, type AuthRoute } from '../components/routes'
import { AuthorizeStep } from './authorize-step'
import { CompleteStep } from './complete-step'
import { DetailsStep } from './details-step'
import { EMPTY_ADMIN, type Onboarding } from './onboarding'
import { navigateTo } from '@/lib/route'

const STEPS = [
  { route: AUTH_ROUTES.createAccount, label: 'Organization details' },
  { route: AUTH_ROUTES.authorize, label: 'Authorize access' },
  { route: AUTH_ROUTES.complete, label: 'Confirmation' },
] as const

function Stepper({ current }: { current: number }) {
  return (
    <ol className="flex items-center gap-2 text-xs" aria-label="Sign-up progress">
      {STEPS.map((s, i) => (
        <li key={s.route} className="flex flex-1 items-center gap-2" aria-current={i === current ? 'step' : undefined}>
          <span
            className={cn(
              'flex size-6 shrink-0 items-center justify-center rounded-full border text-[0.7rem] font-semibold',
              i < current && 'border-foreground bg-foreground text-background',
              i === current && 'border-foreground',
              i > current && 'border-border text-muted-foreground',
            )}
          >
            {i < current ? <CheckIcon className="size-3.5" aria-hidden="true" /> : i + 1}
          </span>
          <span className={cn('hidden sm:inline', i === current ? 'font-medium' : 'text-muted-foreground')}>
            {s.label}
            {i < current && <span className="sr-only"> (done)</span>}
          </span>
          {i < STEPS.length - 1 && <span className="h-px flex-1 bg-border" aria-hidden="true" />}
        </li>
      ))}
    </ol>
  )
}

const go = (route: AuthRoute) => navigateTo(route)

/**
 * Create-an-organization flow across three routes. One component stays mounted for all three,
 * so what was typed survives Back and Next. Nothing leaves the browser tab.
 */
export function OnboardingFlow({ route }: { route: AuthRoute }) {
  const [data, setData] = useState<Onboarding>({ admin: EMPTY_ADMIN, dataCenters: [] })
  const heading = useRef<HTMLHeadingElement>(null)
  const step = Math.max(0, STEPS.findIndex(s => s.route === route))

  // Don't let someone land on a later step without the earlier ones (e.g. from a bookmark).
  const allowed = step === 0 || (step === 1 && data.dataCenters.length > 0) || (step === 2 && !!data.signature)
  useEffect(() => {
    if (!allowed) go(AUTH_ROUTES.createAccount)
  }, [allowed])

  // Each step is a new page for the reader: start at the top and move focus to its title.
  useEffect(() => {
    window.scrollTo({ top: 0 })
    heading.current?.focus()
  }, [step])

  if (!allowed) return null

  const titles = [
    { title: 'Create a MESA organization', subtitle: 'Tell us who you are and what MESA will look after. You become the organization’s administrator.' },
    { title: 'Authorize MESA to access your resources', subtitle: 'Review what MESA will read from your sites, then sign.' },
    { title: 'Welcome to MESA', subtitle: undefined },
  ][step]

  return (
    <AuthCard
      size="xl"
      title={titles.title}
      titleRef={heading}
      subtitle={titles.subtitle}
      top={<Stepper current={step} />}
      below={
        step === 0 ? (
          <p className="text-center text-sm text-muted-foreground">
            Already have an organization?{' '}
            <a href={AUTH_ROUTES.quickSignIn} className="font-medium text-foreground underline-offset-4 hover:underline">Sign in</a>
          </p>
        ) : undefined
      }
    >
      {step === 0 && <DetailsStep value={data} onNext={v => { setData(v); go(AUTH_ROUTES.authorize) }} />}
      {step === 1 && <AuthorizeStep value={data} onBack={() => go(AUTH_ROUTES.createAccount)} onSign={v => { setData(v); go(AUTH_ROUTES.complete) }} />}
      {step === 2 && <CompleteStep value={data} />}
    </AuthCard>
  )
}
