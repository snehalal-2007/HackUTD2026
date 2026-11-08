import { ActivityIcon, CircleAlertIcon } from 'lucide-react'
import { SITES, type Hall, type Status } from '@/components/floor/data'
import type { SiteFloors } from '@/components/floor/use-live-floors'
import { ago } from '@/lib/snapshot'
import { cn } from '@/lib/utils'
import type { FeedVM, IncidentVM } from './use-log-data'

// The Log's left column: the places the location filter leaves, as a list to click.
//   Locations + floors picked → those floors with their blocks.
//   Only locations → their floors, each with its blocks.
//   No location (all, or only floors) → the floors, grouped by site.
// Clicking a floor or a block narrows the incidents and the event log to it. Each floor carries its feed status.

export type Focus = { kind: 'floor'; dc: string; label: string } | { kind: 'block'; dc: string; rackId: string; label: string } | null

const DOT: Record<Status, string> = { ok: 'bg-success', warn: 'bg-warning', crit: 'bg-destructive' }
const WORD: Record<Status, string> = { ok: 'Nominal', warn: 'Warning', crit: 'Critical' }

interface Props {
  sitesSel: string[] // picked locations; none = all
  floorsSel: number[] // picked floors; none = all
  sites: SiteFloors
  feeds: FeedVM[]
  incidents: IncidentVM[]
  focus: Focus
  onFocus: (f: Focus) => void
  now: number
}

export function PlacesPanel({ sitesSel, floorsSel, sites, feeds, incidents, focus, onFocus, now }: Props) {
  const openOn = (rackId: string) => incidents.filter(i => i.rackId === rackId && i.status !== 'closed').length
  const dcOf = (siteId: string, f: number) => SITES.find(s => s.id === siteId)?.floors[f - 1]?.[0] ?? ''
  const rackOf = (h: Hall) => h.id.split('#')[0]

  const floorRow = (siteId: string, f: number, label: string) => {
    const dc = dcOf(siteId, f)
    const feed = feeds.find(x => x.id === dc)
    const on = focus?.kind === 'floor' && focus.dc === dc
    const open = incidents.filter(i => i.dcId === dc && i.status !== 'closed').length
    return (
      <button
        type="button"
        aria-pressed={on}
        onClick={() => onFocus(on ? null : { kind: 'floor', dc, label })}
        className={cn('flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left transition-colors', on ? 'bg-[#e6e2da] dark:bg-[#303035]' : 'hover:bg-muted')}
      >
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[14px] font-semibold">{label}</span>
          <span className="block truncate text-[12px] text-muted-foreground">
            {feed ? `Last batch ${ago(feed.lastMs, now)}` : 'No feed yet'}{open ? ` · ${open} open` : ''}
          </span>
        </span>
        {feed && (
          <span className={cn('inline-flex shrink-0 items-center gap-1 text-[12px] font-medium', feed.stale ? 'text-destructive' : 'text-success')}>
            {feed.stale ? <CircleAlertIcon className="size-3.5" aria-hidden="true" /> : <ActivityIcon className="size-3.5" aria-hidden="true" />}
            {feed.stale ? 'Silent' : 'Live'}
          </span>
        )}
      </button>
    )
  }

  const blockRow = (siteName: string, f: number, h: Hall) => {
    const on = focus?.kind === 'block' && focus.rackId === rackOf(h) && focus.label.startsWith(`Block ${h.tag} `)
    const open = openOn(rackOf(h))
    return (
      <button
        key={h.id}
        type="button"
        aria-pressed={on}
        onClick={() => onFocus(on ? null : { kind: 'block', dc: h.datacenter, rackId: rackOf(h), label: `Block ${h.tag} · ${siteName} · Floor ${f}` })}
        className={cn('flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left transition-colors', on ? 'bg-[#e6e2da] dark:bg-[#303035]' : 'hover:bg-muted')}
      >
        <span className={cn('size-2 shrink-0 rounded-full', DOT[h.status])} aria-hidden="true" />
        <span className="w-8 shrink-0 text-[13.5px] font-semibold">{h.tag}</span>
        <span className="min-w-0 flex-1 truncate text-[12.5px] text-muted-foreground">{WORD[h.status]} · {h.temp.toFixed(1)} °C</span>
        {open > 0 && <span className="shrink-0 rounded-full bg-foreground px-1.5 text-[11px] font-semibold text-background tabular-nums">{open}</span>}
      </button>
    )
  }

  const shownSites = SITES.filter(s => !sitesSel.length || sitesSel.includes(s.id))
  const blocks = sitesSel.length > 0 // blocks appear once you've narrowed to locations
  const grouped = shownSites.length > 1
  return (
    <div className="flex flex-col gap-3">
      {shownSites.map(s => {
        const floors = (sites[s.id] ?? []).map((halls, i) => ({ f: i + 1, halls })).filter(x => !floorsSel.length || floorsSel.includes(x.f))
        if (!floors.length) return null
        return (
          <div key={s.id} className="flex flex-col gap-0.5">
            {grouped && <h3 className="px-2.5 pb-1 text-[12px] font-semibold tracking-[.06em] text-muted-foreground uppercase">{s.name}</h3>}
            {floors.map(({ f, halls }) => (
              <div key={f} className="flex flex-col gap-0.5">
                {floorRow(s.id, f, grouped && !blocks ? `${s.name} · Floor ${f}` : `Floor ${f}`)}
                {blocks && halls.length > 0 && (
                  <div className="mb-1.5 ml-2.5 flex flex-col gap-0.5 border-l pl-1.5">
                    {halls.map(h => blockRow(s.name, f, h))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )
      })}
    </div>
  )
}
