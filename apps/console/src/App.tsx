import { useState } from 'react'
import { AgentChat } from '@/components/agent/agent-chat'
import { AppShell } from '@/components/shell/app-shell'
import type { ViewId } from '@/components/shell/nav'
import { AlertsView } from '@/views/alerts-view'
import { FloorView } from '@/views/floor-view'
import { OperatorsView } from '@/views/operators-view'
import { SecurityView } from '@/views/security-view'

const VIEWS: ViewId[] = ['floor', 'agent', 'alerts', 'operators', 'security']
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

  function navigate(v: ViewId) {
    setView(v)
    try {
      localStorage.setItem(KEY, v)
    } catch {
      // Storage blocked: the view just won't be remembered.
    }
  }

  return (
    <AppShell view={view} onNavigate={navigate}>
      {view === 'floor' && <FloorView />}
      {view === 'agent' && <AgentChat />}
      {view === 'alerts' && <AlertsView />}
      {view === 'operators' && <OperatorsView />}
      {view === 'security' && <SecurityView />}
    </AppShell>
  )
}
