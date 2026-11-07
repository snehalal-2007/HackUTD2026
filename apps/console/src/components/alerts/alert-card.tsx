import { CircleAlertIcon, InfoIcon, TriangleAlertIcon } from 'lucide-react'
import { Alert, AlertDescription, AlertTitle } from '@/components/reui/alert'
import { Badge } from '@/components/reui/badge'
import { Button } from '@/components/ui/button'
import type { PreviewAlert, Severity } from './sample'

const VARIANT: Record<Severity, 'destructive' | 'warning' | 'info'> = {
  high: 'destructive',
  medium: 'warning',
  low: 'info',
}

const STATUS_BADGE = {
  open: 'destructive-light',
  acknowledged: 'warning-light',
  mitigating: 'info-light',
} as const

// Severity is shown three ways (color, icon, word) so it never depends on color alone.
function SeverityIcon({ severity }: { severity: Severity }) {
  if (severity === 'high') return <CircleAlertIcon aria-hidden="true" />
  if (severity === 'medium') return <TriangleAlertIcon aria-hidden="true" />
  return <InfoIcon aria-hidden="true" />
}

export function AlertCard({ alert }: { alert: PreviewAlert }) {
  return (
    <Alert variant={VARIANT[alert.severity]}>
      <SeverityIcon severity={alert.severity} />
      <AlertTitle className="flex flex-wrap items-center gap-2">
        <span className="font-mono">{alert.assetId}</span>
        <span>{alert.summary}</span>
      </AlertTitle>
      <AlertDescription>
        <ul className="mt-1 list-inside list-disc space-y-0.5 text-sm">
          <li>
            Severity: <span className="font-medium capitalize">{alert.severity}</span> · {alert.kind}
          </li>
          <li>Owner: {alert.owner ?? <span className="font-medium">Unowned</span>}</li>
          {alert.status === 'open' && (
            <li>
              Acknowledge within <span className="font-medium tabular-nums">{alert.ackDueMin} min</span>, or it
              escalates to the next on call
            </li>
          )}
          {alert.breachInMin !== null && (
            <li>
              Predicted to cross its limit in <span className="font-medium tabular-nums">{alert.breachInMin} min</span>
            </li>
          )}
          <li>Runbook: {alert.runbookHint}</li>
        </ul>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Badge variant={STATUS_BADGE[alert.status]} className="capitalize">
            {alert.status}
          </Badge>
          {alert.status === 'open' && (
            <Button size="sm" disabled title="Available once alerts are live (Phase 2)">
              Acknowledge
            </Button>
          )}
        </div>
      </AlertDescription>
    </Alert>
  )
}
