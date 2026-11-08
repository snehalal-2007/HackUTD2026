import { useState } from 'react'
import { ArrowRightIcon, CalendarClockIcon, CircleCheckIcon, MailIcon, PlugZapIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { HOME_ROUTE } from '../components/session'
import { addBusinessDays, formatDate, type Onboarding } from './onboarding'

/** Step 3: confirmation, with the date access will be ready (3 business days from signing). */
export function CompleteStep({ value }: { value: Onboarding }) {
  const [signedAt] = useState(() => value.signature?.signedAt ?? new Date())
  const ready = addBusinessDays(signedAt, 3)
  const first = value.admin.name.trim().split(/\s+/)[0]
  const NEXT = [
    { Icon: PlugZapIcon, text: `Our onboarding team connects to the reading sources for your ${value.dataCenters.length} data center${value.dataCenters.length === 1 ? '' : 's'}.` },
    { Icon: MailIcon, text: `We email sign-in details for ${value.admin.organization.trim()} to ${value.admin.email.trim()}.` },
    { Icon: CalendarClockIcon, text: `Your services are ready by ${formatDate(ready)}.` },
  ]

  return (
    <div className="flex flex-col items-center gap-6 text-center">
      <span className="flex size-14 items-center justify-center rounded-full bg-success/15 text-success">
        <CircleCheckIcon className="size-8" aria-hidden="true" />
      </span>
      <div className="flex flex-col gap-2">
        <h2 className="text-2xl font-semibold tracking-tight">You’re all set, {first}.</h2>
        <p className="max-w-md text-muted-foreground">
          {value.admin.company.trim()} is now working with MESA. You’ll have access to your services within
          <span className="font-medium text-foreground"> 3 business days</span>.
        </p>
      </div>
      <ol className="flex w-full flex-col gap-3 rounded-xl border border-border p-4 text-left">
        {NEXT.map(({ Icon, text }, i) => (
          <li key={text} className="flex items-start gap-3 text-sm">
            <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-muted">
              <Icon className="size-4" aria-hidden="true" />
              <span className="sr-only">Step {i + 1}:</span>
            </span>
            <span className="pt-1">{text}</span>
          </li>
        ))}
      </ol>
      <Button asChild size="lg" className="h-10 w-full sm:w-auto sm:px-6">
        <a href={HOME_ROUTE}>
          Back to the home page <ArrowRightIcon data-icon="inline-end" aria-hidden="true" />
        </a>
      </Button>
    </div>
  )
}
