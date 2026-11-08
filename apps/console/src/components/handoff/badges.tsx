import { ArrowUpIcon, CircleCheckIcon, CircleDotIcon, EyeIcon, FlaskConicalIcon, MinusIcon, RadioIcon, SirenIcon, TriangleAlertIcon } from 'lucide-react'
import { Badge } from '@/components/reui/badge'
import type { Priority, ShiftIncident } from './types'

// Status is always colour plus icon plus text, so it reads the same in a dark room, in grayscale and in print.

type Variant = 'success-light' | 'warning-light' | 'destructive-light' | 'info-light' | 'secondary'

const STATUS: Record<ShiftIncident['status'], { label: string; variant: Variant; icon: React.ReactNode }> = {
  closed: { label: 'Closed', variant: 'success-light', icon: <CircleCheckIcon aria-hidden="true" /> },
  open: { label: 'Open', variant: 'warning-light', icon: <TriangleAlertIcon aria-hidden="true" /> },
  acknowledged: { label: 'Acknowledged', variant: 'info-light', icon: <EyeIcon aria-hidden="true" /> },
  escalated: { label: 'Escalated', variant: 'destructive-light', icon: <SirenIcon aria-hidden="true" /> },
}

export function IncidentStatusBadge({ status }: { status: ShiftIncident['status'] }) {
  const s = STATUS[status]
  return (
    <Badge size="default" variant={s.variant}>
      {s.icon}
      {s.label}
    </Badge>
  )
}

const PRIORITY: Record<Priority, { label: string; variant: Variant; icon: React.ReactNode }> = {
  high: { label: 'High', variant: 'destructive-light', icon: <ArrowUpIcon aria-hidden="true" /> },
  medium: { label: 'Medium', variant: 'warning-light', icon: <MinusIcon aria-hidden="true" /> },
  low: { label: 'Low', variant: 'info-light', icon: <CircleDotIcon aria-hidden="true" /> },
}

export function PriorityBadge({ priority }: { priority: Priority }) {
  const p = PRIORITY[priority]
  return (
    <Badge size="default" variant={p.variant}>
      {p.icon}
      {p.label} priority
    </Badge>
  )
}

/** Every figure derived from assumptions wears this. */
export function EstimateBadge() {
  return (
    <Badge size="sm" variant="outline" className="uppercase tracking-wide">
      Estimate
    </Badge>
  )
}

export function SampleBadge() {
  return (
    <Badge size="default" variant="warning-light">
      <FlaskConicalIcon aria-hidden="true" />
      Sample shift (illustrative)
    </Badge>
  )
}

export function LiveBadge() {
  return (
    <Badge size="default" variant="success-light">
      <RadioIcon aria-hidden="true" />
      Live data
    </Badge>
  )
}
