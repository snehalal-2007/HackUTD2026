import { useState } from 'react'
import { logsPageFrom, logsPath, usePath } from '@/lib/route'
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

function initialView(): ViewId {
  try {
    const v = localStorage.getItem(KEY) as ViewId | null
    return v && VIEWS.includes(v) ? v : 'agent'
  } catch {
    return 'agent'
  }
}

export default function App() {
  const [view, setView] = useState<ViewId>(initialView)
  const { path, go } = usePath()
  const logsPage = logsPageFrom(path)

  function navigate(v: ViewId) {
    setView(v)
    go('/') // leave /logs/:page when switching views
    try {
      localStorage.setItem(KEY, v)
    } catch {
      // Storage blocked: the view just won't be remembered.
    }
  }

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
