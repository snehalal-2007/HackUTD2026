import { ArrowRightIcon, CircleCheckIcon, FlaskConicalIcon, UserRoundIcon } from 'lucide-react'
import { Badge } from '@/components/reui/badge'
import { Button } from '@/components/ui/button'
import { requestView } from '@/components/notify/navigate'
import { PriorityBadge } from './badges'
import { Section } from './section'
import type { ActionItem, ShiftReportData } from './types'

const VIEW_LABEL: Record<NonNullable<ActionItem['view']>, string> = {
  floor: 'Open Floor',
  cluster: 'Open Cluster',
  alerts: 'Open Alerts',
  log: 'Open Log',
}
const ORDER = { high: 0, medium: 1, low: 2 }

/** What the incoming operator must do, most urgent first. One action per row. */
export function ActionsSection({ report }: { report: ShiftReportData }) {
  const items = [...report.actions].sort((a, b) => ORDER[a.priority] - ORDER[b.priority])
  return (
    <Section
      id="ho-actions"
      title="Action items for the incoming shift"
      aside={report.kind === 'live' ? <span className="text-xs text-muted-foreground">Worked out from live racks, incidents and runs</span> : <span className="text-xs text-muted-foreground">Illustrative suggestions in a sample shift</span>}
    >
      {items.length === 0 ? (
        <div className="flex items-center gap-2 rounded-lg border bg-card px-4 py-4 text-sm">
          <CircleCheckIcon className="size-4 text-success" aria-hidden="true" />
          Nothing is waiting for you. Keep an eye on the Alerts view.
        </div>
      ) : (
        <ul className="flex flex-col divide-y rounded-lg border bg-card" aria-label="Action items">
          {items.map(item => (
            <li key={item.id} className="flex flex-col gap-2 px-3 py-3 sm:flex-row sm:items-start">
              <div className="flex min-w-0 flex-1 flex-col gap-1">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <span className="text-sm font-medium">{item.what}</span>
                  <PriorityBadge priority={item.priority} />
                  {item.illustrative && (
                    <Badge size="default" variant="outline">
                      <FlaskConicalIcon aria-hidden="true" />
                      Illustrative suggestion
                    </Badge>
                  )}
                </div>
                <p className="text-sm">
                  <span className="font-medium">Where: </span>
                  {item.where}
                </p>
                <p className="text-sm text-muted-foreground">
                  <span className="font-medium text-foreground">Why: </span>
                  {item.why}
                </p>
                <p className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                  <UserRoundIcon className="size-3" aria-hidden="true" />
                  Who should act: <span className="font-medium text-foreground">{item.role}</span>
                </p>
              </div>
              {item.view && !item.illustrative && (
                <Button type="button" variant="outline" size="sm" data-noprint className="shrink-0 self-start" onClick={() => requestView(item.view!)}>
                  {VIEW_LABEL[item.view]}
                  <ArrowRightIcon aria-hidden="true" />
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
    </Section>
  )
}
