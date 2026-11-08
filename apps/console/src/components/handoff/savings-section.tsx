import { useState } from 'react'
import { PencilIcon, RotateCcwIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { EstimateBadge } from './badges'
import { ASSUMPTION_FIELDS, money, type CostAssumptions, type CostResult, type useCostAssumptions } from './cost-model'
import { Section, Stat } from './section'
import { type ShiftReportData } from './types'

type Assumptions = ReturnType<typeof useCostAssumptions>

/** One number box that lets you type freely and only commits valid, non-negative numbers. */
function NumberField({ id, value, step, prefix, onCommit }: { id: string; value: number; step: number; prefix?: string; onCommit: (n: number) => void }) {
  const [text, setText] = useState(String(value))
  return (
    <div className="flex items-center gap-1">
      {prefix && <span className="text-sm text-muted-foreground">{prefix}</span>}
      <Input
        id={id}
        type="number"
        inputMode="decimal"
        min={0}
        step={step}
        value={text}
        className="h-8 w-24"
        onChange={e => {
          setText(e.target.value)
          const n = Number(e.target.value)
          if (e.target.value.trim() !== '' && Number.isFinite(n) && n >= 0) onCommit(n)
        }}
        onBlur={() => setText(String(value))}
      />
    </div>
  )
}

function AssumptionsPanel({ a }: { a: Assumptions }) {
  const [editing, setEditing] = useState(false)
  return (
    <div className="flex flex-col gap-3 rounded-lg border bg-card p-3" role="group" aria-label="Assumptions behind every estimate">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="text-sm font-medium">Assumptions behind every estimate</h3>
        <span className="text-xs text-muted-foreground">{a.isCustom ? 'Changed on this device' : 'Placeholder values, not measured prices'}</span>
        <Button type="button" variant="outline" size="xs" data-noprint className="ml-auto" aria-expanded={editing} onClick={() => setEditing(e => !e)}>
          <PencilIcon aria-hidden="true" />
          {editing ? 'Done' : 'Change'}
        </Button>
      </div>
      <dl className="grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
        {ASSUMPTION_FIELDS.map(f => (
          <div key={f.key} className="flex items-baseline justify-between gap-3 border-b border-dashed py-1">
            <dt className="text-muted-foreground">{f.label}</dt>
            <dd className="tabular-nums">
              {f.prefix}
              {a.values[f.key].toLocaleString('en-US')} <span className="text-xs text-muted-foreground">{f.unit}</span>
            </dd>
          </div>
        ))}
      </dl>
      {editing && (
        <div data-noprint className="flex flex-col gap-3 border-t pt-3">
          <p className="text-xs text-muted-foreground">Edits stay on this device and change every report on this page, samples included. They are not shared.</p>
          <div className="grid gap-x-6 gap-y-2 sm:grid-cols-2">
            {ASSUMPTION_FIELDS.map(f => (
              <div key={f.key} className="flex items-center justify-between gap-3">
                <label htmlFor={`ho-a-${f.key}`} className="text-sm">
                  {f.label} <span className="text-xs text-muted-foreground">({f.unit})</span>
                </label>
                <NumberField id={`ho-a-${f.key}`} value={a.values[f.key]} step={f.step} prefix={f.prefix} onCommit={n => a.set(f.key, n)} />
              </div>
            ))}
          </div>
          <div>
            <Button type="button" variant="ghost" size="xs" disabled={!a.isCustom} onClick={a.reset}>
              <RotateCcwIcon aria-hidden="true" />
              Reset to placeholder values
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}

/** The money and downtime saved by moving or patching instances in place, with the formula in plain words. */
export function SavingsSection({ report, costs, assumptions }: { report: ShiftReportData; costs: CostResult; assumptions: Assumptions }) {
  const r = report.remediation
  const a: CostAssumptions = assumptions.values
  return (
    <Section id="ho-savings" title="Saved by automatic moving" aside={<EstimateBadge />}>
      <div className="flex flex-col gap-2 rounded-xl border bg-card p-4">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <span className="text-3xl font-semibold tabular-nums">{money(costs.avoided.total)}</span>
          <span className="text-sm text-muted-foreground">estimated saving this shift</span>
          <EstimateBadge />
        </div>
        <p className="max-w-3xl text-sm text-muted-foreground">
          When a rack runs hot, MESA moves the running instance to a cooler rack in a single step, or patches it where it stands. The usual alternative is to start a second copy elsewhere and cut traffic over. MESA never starts that copy, so the copy’s cost and the cut-over downtime never happen.
        </p>
      </div>

      <ul className="grid grid-cols-2 gap-2 lg:grid-cols-4" aria-label="Automatic moving, totals">
        <Stat label="Instances moved" value={r.instancesMoved} note="live, one step each" />
        <Stat label="Duplicates avoided" value={r.duplicatesAvoided} note="copies never started" />
        <Stat label="Downtime" value={`${r.downtimeS} s`} note={`a failover would cost about ${costs.avoidedDowntimeS} s`} />
        <Stat label="Warning lead time" value={r.leadTimeS == null ? 'n/a' : r.leadTimeS < 120 ? `${Math.round(r.leadTimeS)} s` : `${Math.round(r.leadTimeS / 60)} min`} note={r.leadTimeS == null ? 'no run recorded one' : 'average, before the limit'} />
      </ul>

      <div className="flex flex-col gap-1.5 rounded-lg border bg-card p-3 text-sm" role="group" aria-label="How the saving is worked out">
        <h3 className="font-medium">How it is worked out</h3>
        <p className="text-muted-foreground">Real counts from the shift, times the assumptions below. Estimates, not invoices.</p>
        <ul className="flex flex-col gap-1 tabular-nums">
          <li>
            Duplicate copies: {r.duplicatesAvoided} avoided × ({money(a.duplicateCostPerHour)}/h × {a.duplicateHours} h running + {money(a.failoverHandlingCost)} handling) = <b>{money(costs.avoided.duplicateRunning + costs.avoided.failoverHandling)}</b>
          </li>
          <li>
            Failover downtime: {r.instancesMoved} moved × {a.failoverDowntimeS} s × {money(a.downtimeCostPerHour)} per instance-hour = <b>{money(costs.avoided.failoverDowntime)}</b>
          </li>
          <li>
            Total: <b>{money(costs.avoided.total)}</b> saved, against <b>{money(costs.incurred.total)}</b> of estimated cost this shift: net <b>{money(costs.net)}</b>.
          </li>
        </ul>
        {report.kind === 'live' && <p className="text-xs text-muted-foreground">Counts come from remediation_stats. The cluster is simulated, so moves are real rows in a simulated cluster, not real servers.</p>}
        {report.kind === 'sample' && <p className="text-xs text-muted-foreground">The counts in this sample shift are made up; the arithmetic is the same as for the live report.</p>}
      </div>

      <AssumptionsPanel a={assumptions} />
    </Section>
  )
}
