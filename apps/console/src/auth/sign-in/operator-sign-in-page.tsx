import { useState, type FormEvent } from 'react'
import { Button } from '@/components/ui/button'
import { AuthCard } from '../components/auth-layout'
import { Field, PasswordField } from '../components/fields'
import { ORG_RE } from '../components/validation'
import { AUTH_ROUTES } from '../components/routes'
import { useSignIn } from '../components/use-sign-in'

/**
 * Sample 2: one-screen operator sign-in, the page an organization would bookmark.
 * Organization ID, username and password together; the organization can be prefilled from the link.
 */
export function OperatorSignInPage() {
  const [org, setOrg] = useState('')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [remember, setRemember] = useState(true)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false)
  const finishSignIn = useSignIn()

  function submit(e: FormEvent) {
    e.preventDefault()
    const errs: Record<string, string> = {}
    if (!ORG_RE.test(org.trim())) errs.org = 'Enter a 12-digit organization ID or an alias.'
    if (!username.trim()) errs.username = 'Enter your username.'
    if (!password) errs.password = 'Enter your password.'
    setErrors(errs)
    if (Object.keys(errs).length === 0) {
      setBusy(true)
      void finishSignIn(username, password).then(err => {
        setPassword('')
        if (err) { setErrors({ password: err }); setBusy(false) }
      })
    }
  }

  return (
    <AuthCard
      title="Sign in as an operator"
      subtitle="Use the username your organization owner gave you."
      below={
        <p className="text-center text-sm text-muted-foreground">
          Created the organization?{' '}
          <a href={AUTH_ROUTES.signIn} className="font-medium text-foreground underline-offset-4 hover:underline">Sign in as the owner</a>
        </p>
      }
    >
      <form onSubmit={submit} noValidate className="flex flex-col gap-5">
        <Field
          label="Organization ID or alias"
          autoComplete="organization"
          placeholder="e.g. 123456789012"
          value={org}
          onChange={e => setOrg(e.target.value.toLowerCase())}
          error={errors.org}
        />
        <Field
          label="Username"
          autoComplete="username"
          autoCapitalize="none"
          value={username}
          onChange={e => setUsername(e.target.value)}
          error={errors.username}
        />
        <PasswordField
          autoComplete="current-password"
          value={password}
          onChange={e => setPassword(e.target.value)}
          error={errors.password}
        />
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={remember} onChange={e => setRemember(e.target.checked)} className="size-4 accent-foreground" />
          Remember this organization on this device
        </label>
        <Button type="submit" size="lg" className="h-10 w-full" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</Button>
        <a href={AUTH_ROUTES.operatorSignIn} className="text-center text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline">
          Forgot your password? Ask your organization owner to reset it.
        </a>
      </form>
    </AuthCard>
  )
}
