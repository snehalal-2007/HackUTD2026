import { useEffect, useRef } from 'react'
import { toast } from 'sonner'
import { useTable } from 'spacetimedb/react'
import { SirenIcon, TriangleAlertIcon } from 'lucide-react'
import { tables } from '@mesa/bindings'
import { requestView } from './navigate'

// Statuses worth interrupting an operator for. Acknowledged means someone already has
// it; closed incidents are shown in the Log, not announced.
const ANNOUNCED = new Set(['open', 'escalated'])

const SEVERITY_LABEL: Record<string, string> = {
  low: 'Low',
  medium: 'Medium',
  high: 'High',
  critical: 'Critical',
}

/**
 * Announces incidents that open or escalate while the page is open.
 *
 * Everything present when the subscription first becomes ready is treated as already
 * seen, so a page load or refresh shows no toasts. After that, each incident gets at most
 * one toast per status: `open` once, `escalated` once. Renders nothing itself; the
 * toasts go to the single <Toaster /> mounted in main.tsx.
 */
export function IncidentToasts() {
  const [incidents, ready] = useTable(tables.incident)
  // "<incidentId>:<status>" pairs already shown, or present at first load.
  const seen = useRef<Set<string> | null>(null)

  useEffect(() => {
    if (!ready) return
    if (seen.current == null) {
      seen.current = new Set(incidents.map(i => `${i.incidentId}:${i.status}`))
      return
    }
    for (const i of incidents) {
      if (!ANNOUNCED.has(i.status)) continue
      const key = `${i.incidentId}:${i.status}`
      if (seen.current.has(key)) continue
      seen.current.add(key)

      const escalated = i.status === 'escalated'
      const severity = SEVERITY_LABEL[i.severity] ?? i.severity
      const where = i.rackId || i.datacenterId // rack ids already carry the data center
      const show = escalated ? toast.error : toast.warning
      // The id makes a repeated call (StrictMode, reconnect) update the same toast
      // instead of stacking a duplicate.
      show(i.title, {
        id: key,
        description: `${severity} severity · ${escalated ? 'Escalated' : 'Opened'}${where ? ` · ${where}` : ''}`,
        icon: escalated ? <SirenIcon aria-hidden="true" /> : <TriangleAlertIcon aria-hidden="true" />,
        duration: escalated ? 15_000 : 10_000,
        action: { label: 'View in Log', onClick: () => requestView('log') },
      })
    }
  }, [incidents, ready])

  return null
}
