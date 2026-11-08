import { useState, type FormEvent } from 'react'
import { ArrowLeftIcon, Building2Icon, UserRoundIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { AuthCard } from '../components/auth-layout'
import { Field, PasswordField } from '../components/fields'
import { EMAIL_RE, ORG_RE } from '../components/validation'
import { AUTH_ROUTES } from '../components/routes'
import { useSignIn } from '../components/use-sign-in'

type Kind = 'owner' | 'operator'

const KINDS: { id: Kind; title: string; body: string; Icon: typeof UserRoundIcon }[] = [
  {
    id: 'owner',
    title: 'Organization owner',
    body: 'The person who created the MESA organization. Full access, including billing and sites.',
    Icon: Building2Icon,
  },
  {
    id: 'operator',
    title: 'Operator',
    body: 'A user the owner added to the organization, such as a shift lead or operator.',
    Icon: UserRoundIcon,
  },
]

/**
 * Sample 1: two-step sign-in. Step one picks the account kind and asks for the email (owner)
 * or the organization ID (operator); step two asks for the password, and the username for operators.
 */
export function SignInPage() {
  const [kind, setKind] = useState<Kind>('operator')
  const [step, setStep] = useState<1 | 2>(1)
  const [email, setEmail] = useState('')
  const [org, setOrg] = useState('')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false)
  const finishSignIn = useSignIn()

  function next(e: FormEvent) {
    e.preventDefault()
    const errs: Record<string, string> = {}
    if (kind === 'owner' && !EMAIL_RE.test(email.trim())) errs.email = 'Enter the email address you used to create the organization.'
    if (kind === 'operator' && !ORG_RE.test(org.trim())) errs.org = 'Enter a 12-digit organization ID or an alias like northwind-dfw.'
    setErrors(errs)
    if (Object.keys(errs).length === 0) setStep(2)
  }

  function signIn(e: FormEvent) {
    e.preventDefault()
    const errs: Record<string, string> = {}
    if (kind === 'operator' && !username.trim()) errs.username = 'Enter your username.'
    if (!password) errs.password = 'Enter your password.'
    setErrors(errs)
    if (Object.keys(errs).length === 0) {
      setBusy(true)
      void finishSignIn(kind === 'owner' ? email.trim().split('@')[0] : username, password).then(err => {
        setPassword('')
        if (err) { setErrors({ password: err }); setBusy(false) }
      })
    }
  }

  if (step === 1) {
    return (
      <AuthCard
        title="Sign in"
        subtitle="Choose how you sign in to MESA."
        below={<NewAccount />}
      >
        <form onSubmit={next} noValidate className="flex flex-col gap-5">
          <fieldset className="flex flex-col gap-2">
            <legend className="sr-only">Account type</legend>
            {KINDS.map(({ id, title, body, Icon }) => (
              <label
                key={id}
                className={cn(
                  'flex cursor-pointer gap-3 rounded-xl border p-3 transition-colors has-[:focus-visible]:ring-3 has-[:focus-visible]:ring-ring/50',
                  kind === id ? 'border-foreground bg-muted/60' : 'border-border hover:bg-muted/40',
                )}
              >
                <input
                  type="radio"
                  name="kind"
                  value={id}
                  checked={kind === id}
                  onChange={() => { setKind(id); setErrors({}) }}
                  className="mt-1 size-4 accent-foreground"
                />
                <span className="flex flex-col gap-0.5">
                  <span className="flex items-center gap-1.5 text-sm font-medium"><Icon className="size-4" aria-hidden="true" />{title}</span>
                  <span className="text-xs text-muted-foreground">{body}</span>
                </span>
              </label>
            ))}
          </fieldset>

          {kind === 'owner' ? (
            <Field
              key="email"
              label="Owner email address"
              type="email"
              autoComplete="username"
              placeholder="you@company.com"
              value={email}
              onChange={e => setEmail(e.target.value)}
              error={errors.email}
            />
          ) : (
            <Field
              key="org"
              label="Organization ID or alias"
              autoComplete="organization"
              placeholder="e.g. 123456789012 or northwind-dfw"
              hint="Your owner can find it under Organization settings."
              value={org}
              onChange={e => setOrg(e.target.value.toLowerCase())}
              error={errors.org}
            />
          )}

          <Button type="submit" size="lg" className="h-10 w-full">Next</Button>
        </form>
      </AuthCard>
    )
  }

  return (
    <AuthCard
      title={kind === 'owner' ? 'Owner sign-in' : 'Operator sign-in'}
      subtitle={
        <>
          {kind === 'owner' ? 'Email' : 'Organization'}: <span className="font-medium text-foreground">{kind === 'owner' ? email.trim() : org.trim()}</span>
        </>
      }
      below={<NewAccount />}
    >
      <form onSubmit={signIn} noValidate className="flex flex-col gap-5">
        {kind === 'operator' && (
          <Field
            label="Username"
            autoComplete="username"
            autoCapitalize="none"
            value={username}
            onChange={e => setUsername(e.target.value)}
            error={errors.username}
          />
        )}
        <PasswordField
          autoComplete="current-password"
          autoFocus={kind === 'owner'}
          value={password}
          onChange={e => setPassword(e.target.value)}
          error={errors.password}
          aside={<a href="/auth/sign-in" className="text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline">Forgot password?</a>}
        />
        <div className="flex flex-col gap-2">
          <Button type="submit" size="lg" className="h-10 w-full" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</Button>
          <Button
            type="button"
            variant="ghost"
            size="lg"
            className="h-10 w-full"
            onClick={() => { setStep(1); setPassword(''); setErrors({}) }}
          >
            <ArrowLeftIcon aria-hidden="true" /> Use a different account
          </Button>
        </div>
      </form>
    </AuthCard>
  )
}

function NewAccount() {
  return (
    <p className="text-center text-sm text-muted-foreground">
      New to MESA?{' '}
      <a href={AUTH_ROUTES.createAccount} className="font-medium text-foreground underline-offset-4 hover:underline">Create an organization</a>
    </p>
  )
}
