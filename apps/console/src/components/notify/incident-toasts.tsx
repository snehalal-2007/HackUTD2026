import { useEffect, useMemo, useRef } from 'react'
import { toast } from 'sonner'
import { useTable } from 'spacetimedb/react'
import { tables } from '@mesa/bindings'
import { makeNamer } from '@/components/floor/names'
import { requestView } from './navigate'

// Statuses worth interrupting an operator for. Acknowledged means someone already has
// it; closed incidents are shown in the Log, not announced.
const ANNOUNCED = new Set(['open', 'escalated'])

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
  const [dcs] = useTable(tables.datacenter)
  const [racks] = useTable(tables.rack)
  const names = useMemo(() => makeNamer(dcs, racks.map(r => r.rackId)), [dcs, racks])
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
      const where = i.rackId ? `${names.place(i.datacenterId)} · ${names.blocks(i.rackId)}` : names.place(i.datacenterId)
      const show = escalated ? toast.error : toast.warning
      // The id makes a repeated call (StrictMode, reconnect) update the same toast
      // instead of stacking a duplicate.
      show(names.text(i.title), {
        id: key,
        description: `${escalated ? 'Escalated' : 'Opened'} · ${where}`,
        className: `sev-${i.severity}${escalated ? ' is-escalated' : ''}`, // the label above the title says the severity
        duration: escalated ? 15_000 : 10_000,
        action: { label: 'View in Log', onClick: () => requestView('log') },
      })
    }
  }, [incidents, ready, names])

  return null
}
