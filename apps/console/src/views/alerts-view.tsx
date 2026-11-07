import { Badge } from '@/components/reui/badge'
import { AlertCard } from '@/components/alerts/alert-card'
import { InletChart } from '@/components/alerts/inlet-chart'
import { PREVIEW_ALERTS } from '@/components/alerts/sample'

const RANK = { high: 0, medium: 1, low: 2 } as const

export function AlertsView() {
  const alerts = [...PREVIEW_ALERTS].sort((a, b) => RANK[a.severity] - RANK[b.severity])
  const unowned = alerts.filter(a => !a.owner).length
  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-6">
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <Badge variant="warning" size="sm">Preview</Badge>
          <span>Sample alerts and readings. Live data arrives with Phase 2.</span>
        </div>
        <InletChart />
        <section aria-labelledby="active-alerts" className="flex flex-col gap-3">
          <h2 id="active-alerts" className="flex items-center gap-2 text-sm font-medium">
            Active alerts
            <span className="text-muted-foreground">
              {alerts.length} active{unowned ? `, ${unowned} unowned` : ''}
            </span>
          </h2>
          {alerts.map(a => (
            <AlertCard key={a.alertId} alert={a} />
          ))}
        </section>
      </div>
    </div>
  )
}
