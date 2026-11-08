import { ArrowRightIcon } from 'lucide-react'
import { AuthCard } from './components/auth-layout'
import { AUTH_ROUTES, type AuthRoute } from './components/routes'
import { OnboardingFlow } from './create-account/onboarding-flow'
import { OperatorSignInPage } from './sign-in/operator-sign-in-page'
import { QuickSignInPage } from './sign-in/quick-sign-in-page'
import { SignInPage } from './sign-in/sign-in-page'

const SAMPLES = [
  { href: AUTH_ROUTES.signIn, title: 'Two-step sign-in', body: 'Pick owner or operator, then enter the password. Closest to an IAM-style console sign-in.' },
  { href: AUTH_ROUTES.operatorSignIn, title: 'Operator sign-in', body: 'Organization ID, username and password on one screen.' },
  { href: AUTH_ROUTES.quickSignIn, title: 'Split sign-in', body: 'One "username or email" box beside a product panel.' },
  { href: AUTH_ROUTES.createAccount, title: 'Create an organization', body: 'Admin and company details, each data center and its assets, an access authorization with e-signature, and a confirmation.' },
]

function SampleIndex() {
  return (
    <AuthCard title="Sign-in samples" subtitle="Pick a page to open it." wide>
      <ul className="flex flex-col gap-2">
        {SAMPLES.map(s => (
          <li key={s.href}>
            <a href={s.href} className="flex items-center justify-between gap-4 rounded-xl border border-border p-4 transition-colors hover:bg-muted/50">
              <span className="flex flex-col gap-0.5">
                <span className="text-sm font-medium">{s.title}</span>
                <span className="text-xs text-muted-foreground">{s.body}</span>
              </span>
              <ArrowRightIcon className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
            </a>
          </li>
        ))}
      </ul>
    </AuthCard>
  )
}

export function AuthRoutes({ route }: { route: AuthRoute }) {
  switch (route) {
    case AUTH_ROUTES.signIn: return <SignInPage />
    case AUTH_ROUTES.operatorSignIn: return <OperatorSignInPage />
    case AUTH_ROUTES.quickSignIn: return <QuickSignInPage />
    case AUTH_ROUTES.createAccount:
    case AUTH_ROUTES.authorize:
    case AUTH_ROUTES.complete:
      return <OnboardingFlow route={route} />
    default: return <SampleIndex />
  }
}
