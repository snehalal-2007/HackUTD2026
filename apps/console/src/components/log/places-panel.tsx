import { CircleAlertIcon } from 'lucide-react'
import { SITES, type Hall, type Status } from '@/components/floor/data'
import type { SiteFloors } from '@/components/floor/use-live-floors'
import { ago } from '@/lib/snapshot'
import { cn } from '@/lib/utils'
import type { FeedVM, IncidentVM } from './use-log-data'

// The Log's left column: the places the location filter leaves, as a list to click.
//   Locations + floors picked → those floors with their blocks.
//   Only locations → their floors, each with its blocks.
//   No location (all, or only floors) → the floors, grouped by site.
// Clicking a floor or a block narrows the incidents and the event log to it. A floor whose feed went silent says so.

export type Focus = { kind: 'floor'; dc: string; label: string } | { kind: 'block'; dc: string; rackId: string; hallId: string; label: string } | null

const DOT: Record<Status, string> = { ok: 'bg-success', warn: 'bg-warning', crit: 'bg-destructive' }
const WORD: Record<Status, string> = { ok: 'Nominal', warn: 'Warning', crit: 'Critical' }
const TONE: Record<Status, string> = { ok: 'text-success', warn: 'text-warning', crit: 'text-destructive' }
const BORDER: Record<Status, string> = { ok: 'border-success/60', warn: 'border-warning', crit: 'border-destructive' }

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

  // A floor is a card: its header (click = the whole floor) and, once locations are picked, its blocks as tiles.
  const floorCard = (siteId: string, siteName: string, f: number, label: string, halls: Hall[], withBlocks: boolean) => {
    const dc = dcOf(siteId, f)
    const feed = feeds.find(x => x.id === dc)
    const on = focus?.kind === 'floor' && focus.dc === dc
    const open = incidents.filter(i => i.dcId === dc && i.status !== 'closed').length
    const worst: Status = halls.some(h => h.status === 'crit') ? 'crit' : halls.some(h => h.status === 'warn') ? 'warn' : 'ok'
    return (
      <div key={dc} className={cn('rounded-lg border-y-2 bg-card p-2 shadow-[0_1px_2px_rgba(24,24,27,.06)]', on ? 'border-foreground' : 'border-transparent')}> {/* selected floor: a line on top and bottom only */}
        <button
          type="button"
          aria-pressed={on}
          onClick={() => onFocus(on ? null : { kind: 'floor', dc, label: `${siteName} · Floor ${f}` })}
          className="flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left hover:bg-muted"
        >
          <span className={cn('size-2.5 shrink-0 rounded-full', DOT[worst])} aria-hidden="true" />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[14.5px] font-semibold">{label}</span>
            <span className="block truncate text-[12px] text-muted-foreground">
              {feed ? `Last batch ${ago(feed.lastMs, now)}` : 'No feed yet'}
            </span>
          </span>
          {feed?.stale ? (
            <span className="inline-flex shrink-0 items-center gap-1 text-[12px] font-medium text-destructive">
              <CircleAlertIcon className="size-3.5" aria-hidden="true" /> Feed silent
            </span>
          ) : open > 0 ? (
            <span className="shrink-0 rounded-full bg-destructive/10 px-2 py-0.5 text-[11.5px] font-semibold text-destructive tabular-nums">{open} open</span>
          ) : null}
        </button>
        {withBlocks && halls.length > 0 && (
          <div className="mt-1.5 grid grid-cols-2 gap-1.5">
            {halls.map(h => blockTile(siteName, f, h))}
          </div>
        )}
      </div>
    )
  }

  const blockTile = (siteName: string, f: number, h: Hall) => {
    const on = focus?.kind === 'block' && focus.hallId === h.id
    const open = openOn(rackOf(h))
    return (
      <button
        key={h.id}
        type="button"
        aria-pressed={on}
        title={`Block ${h.tag}: ${WORD[h.status]}, hottest GPU ${h.temp.toFixed(1)} °C${open ? `, ${open} open alert${open === 1 ? '' : 's'} on its row` : ''}`}
        onClick={() => onFocus(on ? null : { kind: 'block', dc: h.datacenter, rackId: rackOf(h), hallId: h.id, label: `Block ${h.tag} · ${siteName} · Floor ${f}` })}
        className={cn(
          'flex flex-col gap-0.5 rounded-md border-l-[3px] px-2.5 py-2 text-left transition-colors',
          BORDER[h.status],
          on ? 'bg-card shadow-sm ring-2 ring-foreground ring-inset' : 'bg-muted hover:bg-accent', // selected: a white tile with an outline, inside its own edge so nothing clips
        )}
      >
        <span className="flex items-center gap-1.5">
          <span className="text-[14px] font-semibold">{h.tag}</span>
          {open > 0 && (
            <span className="ml-auto rounded-full bg-foreground px-1.5 text-[11px] font-semibold text-background tabular-nums">{open}</span>
          )}
        </span>
        <span className="text-[12px] text-muted-foreground tabular-nums">
          <span className={cn('font-medium', TONE[h.status])}>{WORD[h.status]}</span> · {h.temp.toFixed(1)} °C
        </span>
      </button>
    )
  }

  const shownSites = SITES.filter(s => !sitesSel.length || sitesSel.includes(s.id))
  const blocks = sitesSel.length > 0 // blocks appear once you've narrowed to locations
  const grouped = shownSites.length > 1
  return (
    <div className="flex flex-col gap-2.5">
      {shownSites.map(s => {
        const floors = (sites[s.id] ?? []).map((halls, i) => ({ f: i + 1, halls })).filter(x => !floorsSel.length || floorsSel.includes(x.f))
        if (!floors.length) return null
        return (
          <div key={s.id} className="flex flex-col gap-2">
            {grouped && <h3 className="px-1 pt-1 text-[12px] font-semibold tracking-[.06em] text-muted-foreground uppercase">{s.name}</h3>}
            {floors.map(({ f, halls }) => floorCard(s.id, s.name, f, `Floor ${f}`, halls, blocks))}
          </div>
        )
      })}
    </div>
  )
}
