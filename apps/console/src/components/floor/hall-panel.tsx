import type { ReactNode } from 'react'
import { TimerIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import { ITEM_LABEL, LIMIT, STATUS, TABS, fmtHours, type Hall, type Item, type ItemState, type TabId } from './data'

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

function Stat({ k, v, u }: { k: string; v: ReactNode; u?: string }) {
  return (
    <div>
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

function Rows({ items }: { items: Item[] }) {
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

function Body({ hall, tab }: { hall: Hall; tab: TabId }) {
  if (tab === 'overview') {
    return (
      <>
        <div className="grid grid-cols-2 gap-x-4.5 gap-y-4">
          <Stat k="Inlet temperature" v={hall.temp.toFixed(1)} u="°C" />
          <Stat k="Humidity" v={hall.hum} u="%" />
          <Stat k="IT load" v={hall.load} u={`/ ${hall.cap} kW`} />
          <Stat k="PUE" v={hall.pue.toFixed(2)} />
        </div>
        {hall.breachH != null && (
          <div className="mt-4 flex items-center gap-2 rounded-md bg-muted px-3 py-2.5 text-[14.5px]">
            <TimerIcon className="size-4" aria-hidden="true" />
            Inlet reaches {LIMIT} °C in <b className="tabular-nums">{fmtHours(hall.breachH)}</b>
          </div>
        )}
        <H4>Risks</H4>
        {hall.risks.length ? (
          <ul>
            {hall.risks.map(r => (
              <li key={r} className="relative my-2.5 pl-5 text-[15px] leading-normal">
                <span aria-hidden="true" className={cn('absolute top-0.5 left-0 text-[10px]', hall.status === 'crit' ? 'text-destructive' : 'text-warning')}>▲</span>
                {r}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-[14px] text-muted-foreground">No open risks. Every system in {hall.id} is reporting normally.</p>
        )}
      </>
    )
  }
  if (tab === 'power') {
    return (
      <>
        <Stat k="IT load" v={hall.load} u={`/ ${hall.cap} kW`} />
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-border">
          <div className="h-full rounded-full bg-foreground" style={{ width: `${Math.round((hall.load / hall.cap) * 100)}%` }} />
        </div>
        <H4>Power chain</H4>
        <Rows items={hall.power} />
      </>
    )
  }
  if (tab === 'infra') {
    return (
      <>
        <div className="grid grid-cols-2 gap-x-4.5">
          <Stat k="Inlet temperature" v={hall.temp.toFixed(1)} u="°C" />
          <Stat k="Humidity" v={hall.hum} u="%" />
        </div>
        <H4>Facility systems</H4>
        <Rows items={hall.infra} />
      </>
    )
  }
  const bad = hall.apps.filter(x => x.state !== 'ok').length
  return (
    <>
      <div className="grid grid-cols-2 gap-x-4.5">
        <Stat k="Services" v={hall.apps.length} u="hosted" />
        <Stat k="Degraded" v={bad} u={bad === 1 ? 'service' : 'services'} />
      </div>
      <H4>App services</H4>
      <Rows items={hall.apps} />
    </>
  )
}

/** Folder-style tabs joined to the details card, then the selected hall's details. */
export function HallPanel({ hall, floor, tab, onTab }: { hall: Hall; floor: number; tab: TabId; onTab: (t: TabId) => void }) {
  const first = tab === TABS[0].id, last = tab === TABS[TABS.length - 1].id
  return (
    <section className="flex h-full min-h-0 flex-col" aria-label={`Hall ${hall.id} details`}>
      <div role="tablist" aria-label="Hall details" className="folder-tabs flex items-end">
        {TABS.map(t => {
          const items = t.id === 'overview' ? [] : hall[t.id]
          const crit = items.filter(x => x.state === 'crit').length, warn = items.filter(x => x.state === 'warn').length
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
      <div role="tabpanel" className={cn('min-h-0 flex-1 overflow-auto rounded-lg bg-card p-5.5', first && 'rounded-tl-none', last && 'rounded-tr-none')}>
        <div className="border-b-0 pb-4">
          <div className="text-[13px] text-muted-foreground">Floor {floor} · Data hall</div>
          <h2 className="mt-1 mb-2 text-2xl leading-tight font-semibold tracking-tight">Hall {hall.id}</h2>
          <StatusPill state={hall.status} />
          <p className="mt-2.5 text-[15.5px] leading-normal">{hall.headline}</p>
        </div>
        <Body hall={hall} tab={tab} />
      </div>
    </section>
  )
}
