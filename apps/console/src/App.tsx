import { useEffect, useState } from 'react'
import { AuthRoutes } from '@/auth/auth-routes'
import { AUTH_ROUTES, useAuthRoute } from '@/auth/components/routes'
import { CONSOLE_ROUTE, signedInAs } from '@/auth/components/session'
import { HomePage } from '@/intro/pages/home'
import { IntroRoutes } from '@/intro/intro-routes'
import { useIntroRoute } from '@/intro/routes'
import { logsPageFrom, logsPath, usePath } from '@/lib/route'
import { NAVIGATE_EVENT } from '@/components/notify/navigate'
import { AgentChat } from '@/components/agent/agent-chat'
import { AppShell } from '@/components/shell/app-shell'
import type { ViewId } from '@/components/shell/nav'
import { AlertsView } from '@/views/alerts-view'
import { FloorView } from '@/views/floor-view'
import { LogTableView } from '@/views/log-table-view'
import { LogView } from '@/views/log-view'
import { OperatorsView } from '@/views/operators-view'
import { SecurityView } from '@/views/security-view'

const VIEWS: ViewId[] = ['floor', 'agent', 'alerts', 'log', 'operators', 'security']
const KEY = 'mesa:view'

function viewInHash(): ViewId | null {
  const v = window.location.hash.slice(CONSOLE_ROUTE.length + 1) as ViewId
  return window.location.hash.startsWith(`${CONSOLE_ROUTE}/`) && VIEWS.includes(v) ? v : null
}

function initialView(): ViewId {
  const fromHash = viewInHash()
  if (fromHash) return fromHash
  try {
    const v = localStorage.getItem(KEY) as ViewId | null
    return v && VIEWS.includes(v) ? v : 'agent'
  } catch {
    return 'agent'
  }
}

function useHash() {
  const [hash, setHash] = useState(() => window.location.hash)
  useEffect(() => {
    const on = () => setHash(window.location.hash)
    window.addEventListener('hashchange', on)
    return () => window.removeEventListener('hashchange', on)
  }, [])
  return hash
}

// Site flow:
//   /#/            interactive home page → Sign in
//   /#/auth/...    sign in → console (Floor), or create an organization → sign → confirmation → home
//   /#/console     the operations console, behind the demo sign-in
//   /logs/:page    the full event log (part of the console, so also behind sign-in)
//   /#/intro/...   the other intro page samples
export default function App() {
  const hash = useHash()
  const authRoute = useAuthRoute()
  const introRoute = useIntroRoute()
  const [view, setView] = useState<ViewId>(initialView)
  const { path, go } = usePath()
  const logsPage = logsPageFrom(path)
  const inConsole = logsPage != null || hash === CONSOLE_ROUTE || hash.startsWith(`${CONSOLE_ROUTE}/`)
  const allowed = inConsole && !!signedInAs()

  // #/console/<view> opens that view, e.g. right after sign-in.
  useEffect(() => {
    const on = () => {
      const v = viewInHash()
      if (v) setView(v)
    }
    window.addEventListener('hashchange', on)
    return () => window.removeEventListener('hashchange', on)
  }, [])

  // The console sits behind sign-in.
  useEffect(() => {
    if (inConsole && !allowed) {
      if (logsPage != null) window.history.replaceState(null, '', '/')
      window.location.replace(AUTH_ROUTES.quickSignIn)
    }
  }, [inConsole, allowed, logsPage])

  function navigate(v: ViewId) {
    setView(v)
    go('/') // leave /logs/:page when switching views
    if (!window.location.hash.startsWith(CONSOLE_ROUTE)) window.location.hash = CONSOLE_ROUTE // stay in the console
    try {
      localStorage.setItem(KEY, v)
    } catch {
      // Storage blocked: the view just won't be remembered.
    }
  }

  // Toasts ("View in Log") ask for a view switch through a window event.
  useEffect(() => {
    const onNavigate = (e: Event) => navigate((e as CustomEvent<ViewId>).detail)
    window.addEventListener(NAVIGATE_EVENT, onNavigate)
    return () => window.removeEventListener(NAVIGATE_EVENT, onNavigate)
  })
  if (authRoute) return <AuthRoutes route={authRoute} />
  if (introRoute) return <IntroRoutes route={introRoute} />
  if (!inConsole) return <HomePage />
  if (!allowed) return null

  if (logsPage != null) {
    return (
      <AppShell view="log" title="Log · all events" onNavigate={navigate}>
        <LogTableView page={logsPage} onPage={p => go(logsPath(p))} onBack={() => navigate('log')} />
      </AppShell>
    )
  }

  return (
    <AppShell view={view} onNavigate={navigate}>
      {view === 'floor' && <FloorView />}
      {view === 'agent' && <AgentChat />}
      {view === 'alerts' && <AlertsView />}
      {view === 'log' && <LogView onViewAll={() => go(logsPath(1))} />}
      {view === 'operators' && <OperatorsView />}
      {view === 'security' && <SecurityView />}
    </AppShell>
  )
}
