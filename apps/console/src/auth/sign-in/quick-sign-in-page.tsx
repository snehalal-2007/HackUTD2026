import { useState, type FormEvent } from 'react'
import { BellRingIcon, ClockIcon, UsersIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { AuthSplit } from '../components/auth-layout'
import { Field, PasswordField } from '../components/fields'
import { AUTH_ROUTES } from '../components/routes'
import { useSignIn } from '../components/use-sign-in'

const POINTS = [
  { Icon: BellRingIcon, text: 'Every alert gets an owner and a deadline.' },
  { Icon: UsersIcon, text: 'Shift handoff needs each open issue accepted.' },
  { Icon: ClockIcon, text: 'Each alert shows how long until it gets worse.' },
]

/** Sample 3: split layout with a single "username or email" field, for teams that just want one box. */
export function QuickSignInPage() {
  const [login, setLogin] = useState('')
  const [password, setPassword] = useState('')
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false)
  const finishSignIn = useSignIn()

  function submit(e: FormEvent) {
    e.preventDefault()
    const errs: Record<string, string> = {}
    if (!login.trim()) errs.login = 'Enter your username or email address.'
    if (!password) errs.password = 'Enter your password.'
    setErrors(errs)
    if (Object.keys(errs).length === 0) {
      setBusy(true)
      void finishSignIn(login.includes('@') ? login.split('@')[0] : login, password).then(err => {
        setPassword('')
        if (err) { setErrors({ password: err }); setBusy(false) }
      })
    }
  }

  return (
    <AuthSplit
      aside={
        <div className="flex flex-col gap-8">
          <h2 className="max-w-md text-4xl leading-tight font-semibold tracking-tight">No alert left unowned.</h2>
          <ul className="flex flex-col gap-4 [@media(max-height:820px)]:hidden">
            {POINTS.map(({ Icon, text }) => (
              <li key={text} className="flex items-center gap-3 text-sm text-white/90 in-data-[tone=light]:text-neutral-800">
                <span className="flex size-8 items-center justify-center rounded-lg bg-white/10 backdrop-blur-sm in-data-[tone=light]:bg-white/70 in-data-[tone=light]:ring-1 in-data-[tone=light]:ring-neutral-950/10"><Icon className="size-4" aria-hidden="true" /></span>
                {text}
              </li>
            ))}
          </ul>
        </div>
      }
    >
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Welcome back</h1>
        <p className="mt-1 text-sm text-muted-foreground">Sign in to the operations console.</p>
      </div>
      <form onSubmit={submit} noValidate className="flex flex-col gap-5">
        <Field
          label="Username or email address"
          autoComplete="username"
          autoCapitalize="none"
          value={login}
          onChange={e => setLogin(e.target.value)}
          error={errors.login}
        />
        <PasswordField
          autoComplete="current-password"
          value={password}
          onChange={e => setPassword(e.target.value)}
          error={errors.password}
          aside={<a href={AUTH_ROUTES.quickSignIn} className="text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline">Forgot password?</a>}
        />
        <Button type="submit" size="lg" className="h-10 w-full" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</Button>
      </form>
      <p className="text-sm text-muted-foreground">
        New to MESA?{' '}
        <a href={AUTH_ROUTES.createAccount} className="font-medium text-foreground underline-offset-4 hover:underline">Create an organization</a>
      </p>
    </AuthSplit>
  )
}
