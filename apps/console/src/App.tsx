import { useEffect, useState } from 'react'
import { AuthRoutes } from '@/auth/auth-routes'
import { AUTH_ROUTES, useAuthRoute } from '@/auth/components/routes'
import { CONSOLE_ROUTE, signedInAs } from '@/auth/components/session'
import { HomePage } from '@/intro/pages/home'
import { IntroRoutes } from '@/intro/intro-routes'
import { useIntroRoute } from '@/intro/routes'
import { logsPageFrom, logsPath, navigateTo, usePath } from '@/lib/route'
import { NAVIGATE_EVENT } from '@/components/notify/navigate'
import { IncidentToasts } from '@/components/notify/incident-toasts'
import { AgentChat } from '@/components/agent/agent-chat'
import { AppShell } from '@/components/shell/app-shell'
import type { ViewId } from '@/components/shell/nav'
import { AlertsView } from '@/views/alerts-view'
import { QueueView } from '@/views/queue-view'
import { ClusterView } from '@/views/cluster-view'
import { FloorView } from '@/views/floor-view'
import { HandoffView } from '@/views/handoff-view'
import { LogTableView } from '@/views/log-table-view'
import { LogView } from '@/views/log-view'
import { OperatorsView } from '@/views/operators-view'
import { SecurityView } from '@/views/security-view'

const VIEWS: ViewId[] = ['queue', 'floor', 'cluster', 'agent', 'alerts', 'handoff', 'log', 'operators', 'security']
const KEY = 'mesa:view'

/** "/console/floor" → 'floor'; anything else → null. */
function viewInPath(path: string): ViewId | null {
  const v = path.slice(CONSOLE_ROUTE.length + 1).replace(/\/$/, '') as ViewId
  return path.startsWith(`${CONSOLE_ROUTE}/`) && VIEWS.includes(v) ? v : null
}

function initialView(): ViewId {
  const fromPath = viewInPath(window.location.pathname)
  if (fromPath) return fromPath
  try {
    const v = localStorage.getItem(KEY) as ViewId | null
    return v && VIEWS.includes(v) ? v : 'agent'
  } catch {
    return 'agent'
  }
}

// Site flow (real paths, no "#"):
//   /                 interactive home page → Sign in
//   /auth/...         sign in → console, or create an organization → sign → confirmation → home
//   /console/<view>   the operations console, behind the demo sign-in (queue, floor, agent, alerts, log, …)
//   /logs/:page       the full event log (part of the console, so also behind sign-in)
//   /intro/...        the other intro page samples
export default function App() {
  const authRoute = useAuthRoute()
  const introRoute = useIntroRoute()
  const [view, setView] = useState<ViewId>(initialView)
  const { path, go } = usePath()
  const logsPage = logsPageFrom(path)
  const inConsole = logsPage != null || path === CONSOLE_ROUTE || path.startsWith(`${CONSOLE_ROUTE}/`)
  const allowed = inConsole && !!signedInAs()

  // /console/<view> opens that view: after sign-in, from a bookmark, or with Back/Forward.
  const fromPath = viewInPath(path)
  if (fromPath && fromPath !== view) setView(fromPath)

  // The console sits behind sign-in.
  useEffect(() => {
    if (inConsole && !allowed) navigateTo(AUTH_ROUTES.quickSignIn, { replace: true })
  }, [inConsole, allowed])

  // A bare /console gets the current page's name, without adding a history entry.
  useEffect(() => {
    if (path === CONSOLE_ROUTE || path === `${CONSOLE_ROUTE}/`) navigateTo(`${CONSOLE_ROUTE}/${view}`, { replace: true })
  }, [path, view])

  function navigate(v: ViewId) {
    setView(v)
    navigateTo(`${CONSOLE_ROUTE}/${v}`) // the URL names the page, so Back/Forward and bookmarks work
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
        <IncidentToasts />
        <LogTableView page={logsPage} onPage={p => go(logsPath(p))} onBack={() => navigate('log')} />
      </AppShell>
    )
  }

  return (
    <AppShell view={view} onNavigate={navigate}>
      <IncidentToasts /> {/* incident toasts only inside the signed-in console, never on the home or sign-in pages */}
      {view === 'queue' && <QueueView />}
      {view === 'floor' && <FloorView />}
      {view === 'cluster' && <ClusterView />}
      {view === 'agent' && <AgentChat />}
      {view === 'alerts' && <AlertsView />}
      {view === 'handoff' && <HandoffView />}
      {view === 'log' && <LogView onViewAll={() => go(logsPath(1))} />}
      {view === 'operators' && <OperatorsView />}
      {view === 'security' && <SecurityView />}
    </AppShell>
  )
}
