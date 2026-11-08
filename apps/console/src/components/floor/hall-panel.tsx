import type { ReactNode } from 'react'
import { ChevronRightIcon, TimerIcon } from 'lucide-react'
import { BlockTasks } from './block-tasks'
import { useBlockTasks } from './use-block-tasks'
import { cn } from '@/lib/utils'
import { GPU_WARN_C, ITEM_LABEL, LIMIT, RACK_CAP_KW, STATUS, TABS, fmtHours, type Hall, type Item, type ItemState, type TabId } from './data'

const TONE: Record<ItemState, string> = {
  ok: 'text-success',
  warn: 'text-warning',
  crit: 'text-destructive',
  info: 'text-muted-foreground',
}

/** Status with colour + glyph + word, never colour alone. */
export function StatusPill({ state, label }: { state: ItemState; label?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-1 rounded-full border border-current px-2 py-0.5 text-[13px] leading-tight font-semibold whitespace-nowrap', TONE[state])}>
      <span aria-hidden="true">{STATUS[state].glyph}</span>
      {label ?? STATUS[state].label}
    </span>
  )
}

function Stat({ k, v, u, title }: { k: string; v: ReactNode; u?: string; title?: string }) {
  return (
    <div title={title}>
      <div className="mb-0.5 text-[13px] text-muted-foreground">{k}</div>
      <div className="text-[26px] leading-tight font-semibold tracking-tight tabular-nums">
        {v}
        {u && <span className="ml-1 text-[13px] font-normal tracking-normal text-muted-foreground">{u}</span>}
      </div>
    </div>
  )
}

const H4 = ({ children }: { children: ReactNode }) => (
  <h4 className="mt-5 mb-1.5 text-[13px] font-semibold tracking-[.06em] text-muted-foreground uppercase">{children}</h4>
)

function Rows({ items, empty }: { items: Item[]; empty: string }) {
  if (!items.length) return <p className="text-[14px] text-muted-foreground">{empty}</p>
  return (
    <ul>
      {items.map(x => (
        <li key={x.name} className="flex items-center justify-between gap-2.5 border-b py-2.5 last:border-b-0">
          <div>
            <div className="text-[15px] font-semibold">{x.name}</div>
            <div className="mt-0.5 text-[13.5px] text-muted-foreground">{x.detail}</div>
          </div>
          <StatusPill state={x.state} label={ITEM_LABEL[x.state]} />
        </li>
      ))}
    </ul>
  )
}

function Body({ hall, tab, onTab, taskCount }: { hall: Hall; tab: TabId; onTab: (t: TabId) => void; taskCount: number }) {
  if (tab === 'tasks') return <BlockTasks hall={hall} />
  if (tab === 'overview') {
    return (
      <>
        <div className="grid grid-cols-2 gap-x-4.5 gap-y-4">
          <Stat k="Hottest GPU" v={hall.temp.toFixed(1)} u="°C" />
          <Stat k={`Servers ≥ ${GPU_WARN_C} °C`} v={hall.hot} u={`of ${hall.servers}`} />
          <Stat k="Block power" v={hall.load.toFixed(1)} u={`/ ${hall.cap} kW`} title={`Capacity is an assumption: ${RACK_CAP_KW} kW (6 Summit nodes at ~2.2 kW peak)`} />
          {hall.hum != null && <Stat k="Humidity" v={hall.hum} u="%" />}
          {hall.pue != null && <Stat k="PUE" v={hall.pue.toFixed(2)} />}
        </div>
        {hall.breachH != null && (
          <div className="mt-4 flex items-center gap-2 rounded-md bg-muted px-3 py-2.5 text-[14.5px]" title="Straight-line fit over the last 15 minutes">
            <TimerIcon className="size-4" aria-hidden="true" />
            {hall.breachH === 0 ? <>Hottest GPU is over {LIMIT} °C now</> : <>On the current trend, the hottest GPU reaches {LIMIT} °C in <b className="tabular-nums">{fmtHours(hall.breachH)}</b></>}
          </div>
        )}
        <button type="button" onClick={() => onTab('tasks')} className="mt-4 flex w-full items-center justify-between gap-2 rounded-md border px-3 py-2.5 text-left text-[14.5px] hover:bg-muted">
          <span>
            <b className="font-semibold">{taskCount} task{taskCount === 1 ? '' : 's'}</b> on this row · <b className="font-semibold">{hall.risks.length} risk{hall.risks.length === 1 ? '' : 's'}</b> in this block
          </span>
          <ChevronRightIcon className="size-4 text-muted-foreground" aria-hidden="true" />
        </button>
      </>
    )
  }
  if (tab === 'power') {
    return (
      <>
        <Stat k="Block power" v={hall.load.toFixed(1)} u={`/ ${hall.cap} kW (assumed capacity)`} />
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-border">
          <div className="h-full rounded-full bg-foreground" style={{ width: `${Math.min(100, Math.round((hall.load / hall.cap) * 100))}%` }} />
        </div>
        <H4>Highest-draw servers</H4>
        <Rows items={hall.power} empty="No server readings yet." />
      </>
    )
  }
  if (tab === 'infra') {
    return (
      <>
        <H4>Facility systems</H4>
        <Rows items={hall.infra} empty="No live data for cooling, leak detection or fire suppression yet. The telemetry only covers servers." />
      </>
    )
  }
  const hot = hall.apps.filter(x => x.state !== 'ok').length
  return (
    <>
      <div className="grid grid-cols-2 gap-x-4.5">
        <Stat k="Running a job" v={hall.apps.length} u={`of ${hall.servers}`} />
        <Stat k="Of those, hot" v={hot} u={hot === 1 ? 'server' : 'servers'} />
      </div>
      <H4>Servers running a job</H4>
      <p className="-mt-1 mb-1 text-[12.5px] text-muted-foreground">Usage is estimated from power draw.</p>
      <Rows items={hall.apps} empty="No server in this block is running a job." />
    </>
  )
}

/** Folder-style tabs joined to the details card, then the selected hall's details. */
export function HallPanel({ hall, siteName, floor, tab, onTab }: { hall: Hall; siteName: string; floor: number; tab: TabId; onTab: (t: TabId) => void }) {
  const first = tab === TABS[0].id
  const tasks = useBlockTasks(hall)
  const unowned = tasks.filter(i => !i.owner)
  return (
    <section className="flex h-full min-h-0 flex-col" aria-label={`${hall.label} details`}>
      <div role="tablist" aria-label="Block details" className="folder-tabs flex items-end">
        {TABS.map(t => {
          // Tasks tab: unassigned tasks (red when one is critical). Other tabs: items over their limits.
          const items = t.id === 'overview' || t.id === 'tasks' ? [] : hall[t.id]
          const crit = t.id === 'tasks' ? unowned.filter(i => i.severity === 'critical').length : items.filter(x => x.state === 'crit').length
          const warn = t.id === 'tasks' ? unowned.filter(i => i.severity !== 'critical').length : items.filter(x => x.state === 'warn').length
          return (
            <button key={t.id} type="button" role="tab" aria-selected={tab === t.id} title={t.full} onClick={() => onTab(t.id)} className="folder-tab">
              <span>{t.label}</span>
              {crit + warn > 0 && (
                <span className={cn('inline-grid h-[19px] min-w-[19px] place-items-center rounded-full px-1 text-[11.5px] font-semibold', crit ? 'bg-destructive text-white' : 'bg-warning text-[#1a1a1a]')}>
                  {crit + warn}
                </span>
              )}
            </button>
          )
        })}
      </div>
      <div role="tabpanel" className={cn('min-h-0 flex-1 overflow-auto rounded-lg bg-card p-5.5', first && 'rounded-tl-none')}>
        <div className="border-b-0 pb-4">
          <div className="text-[13px] text-muted-foreground" title={`Telemetry: Summit cabinet ${hall.cabinet}, servers ${hall.nodes} (${hall.datacenter})`}>{siteName} · Floor {floor}</div>
          <div className="mt-1 mb-2 flex items-center justify-between gap-3">
            <h2 className="text-2xl leading-tight font-semibold tracking-tight">Block {hall.tag}</h2>
            <span className="mr-3"><StatusPill state={hall.status} /></span>
          </div>
          <p className="mt-2.5 text-[15.5px] leading-normal">{hall.headline}</p>
        </div>
        <Body hall={hall} tab={tab} onTab={onTab} taskCount={tasks.length} />
      </div>
    </section>
  )
}
