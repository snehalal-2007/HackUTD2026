import type { ReactNode } from 'react'
import { ChevronRightIcon, FileTextIcon, LightbulbIcon, SearchIcon, UserIcon } from 'lucide-react'
import { Badge } from '@/components/reui/badge'
import { GPU_CRIT_C, GPU_WARN_C, SITES, type Hall, type Status } from '@/components/floor/data'
import { PLACE } from '@/components/floor/names'
import { ago } from '@/lib/snapshot'
import { cn } from '@/lib/utils'
import type { Focus } from './places-panel'
import { AddressBlock } from '@/components/floor/address-block'
import type { FeedVM, IncidentVM } from './use-log-data'

// The Log's middle column when a floor or block is picked on the left: where it is (location › floor › block),
// how it's doing now, and each alert explained: why the rules raised it, and what to check. The steps are a fixed
// runbook per alert type (written here, not by the AI), so they're always available and always the same.

const TONE: Record<Status, string> = { ok: 'text-success', warn: 'text-warning', crit: 'text-destructive' }
const WORD: Record<Status, string> = { ok: 'Nominal', warn: 'Warning', crit: 'Critical' }
const GLYPH: Record<Status, string> = { ok: '●', warn: '▲', crit: '◆' }
const STATUS_BADGE = { escalated: 'destructive-light', open: 'warning-light', acknowledged: 'info-light', closed: 'secondary' } as const

function why(i: IncidentVM, where: string) {
  const peak = Math.round(i.peak * 10) / 10
  if (i.kind === 'feed_stale') {
    return `No telemetry arrived from ${where} for ${peak} s. The watchdog opens an alert when a feed is silent for 30 s and makes it high at 60 s, because the floor can't be watched while it's quiet.`
  }
  if (i.kind === 'gpu_failure') return `A server in ${where} reported a GPU failure flag in its telemetry.`
  if (i.kind === 'gpu_temp') {
    const over = peak >= GPU_CRIT_C ? `the ${GPU_CRIT_C} °C critical limit` : `the ${GPU_WARN_C} °C warning limit`
    return `A GPU in ${where} reached ${peak} °C, over ${over}. The threshold rule opens an alert only after several readings in a row are over the limit, so this is sustained heat, not a one-off spike.${
      i.status === 'escalated' ? ' It was escalated because it kept rising past the critical limit.' : ''
    }`
  }
  return `Opened ${i.source === 'rule' ? 'by a rule' : 'by an operator'}.`
}

function steps(i: IncidentVM, hall: Hall | undefined): string[] {
  if (i.kind === 'feed_stale') {
    return [
      "Check the telemetry collector for this floor: is the process running and can it reach the database?",
      'Check the network path from the floor to MESA.',
      'Once batches arrive again the watchdog closes this alert by itself.',
    ]
  }
  if (i.kind === 'gpu_failure') {
    return ['Drain the server: move its jobs to healthy nodes.', 'Open a hardware ticket to replace the GPU.', 'Keep the server out of scheduling until it is swapped.']
  }
  const hottest = hall?.risks[0]?.split(' GPU')[0]
  return [
    `Check cooling for this row${hall ? ` (blocks ${hall.tag[0]}1–${hall.tag[0]}3)` : ''}: the CRAC unit, airflow and blanking panels.`,
    hottest ? `Start with the hottest server, ${hottest}, then the others under Hottest servers.` : 'Start with the hottest servers in the row.',
    'Move or pause the heaviest jobs on the hot servers, or cap their power, to bring the temperature down.',
    `When the GPUs stay under ${GPU_WARN_C} °C for a few readings, the rule closes this alert by itself.`,
  ]
}

function Stat({ k, v, u, tone }: { k: string; v: ReactNode; u?: string; tone?: string }) {
  return (
    <div className="rounded-md bg-muted px-3 py-2">
      <div className="text-[12px] text-muted-foreground">{k}</div>
      <div className={cn('text-[19px] leading-tight font-semibold tabular-nums', tone)}>
        {v}
        {u && <span className="ml-1 text-[12px] font-normal text-muted-foreground">{u}</span>}
      </div>
    </div>
  )
}

interface Props {
  focus: NonNullable<Focus>
  halls: Hall[] // the floor's blocks
  feed: FeedVM | undefined
  incidents: IncidentVM[] // already narrowed to this place (and to Active/All)
  onFocus: (f: Focus) => void
  now: number
}

export function PlaceDetail({ focus, halls, feed, incidents, onFocus, now }: Props) {
  const place = PLACE.get(focus.dc)
  const siteName = SITES.find(s => s.id === place?.site)?.name ?? ''
  const floor = place?.floor ?? 0
  const hall = focus.kind === 'block' ? halls.find(h => h.id === focus.hallId) : undefined
  const floorLabel = `${siteName} · Floor ${floor}`
  const where = hall ? `block ${hall.tag} (${floorLabel})` : floorLabel
  const status: Status = hall?.status ?? (halls.some(h => h.status === 'crit') ? 'crit' : halls.some(h => h.status === 'warn') ? 'warn' : 'ok')
  const hottest = hall ?? [...halls].sort((a, b) => b.temp - a.temp)[0]
  const open = incidents.filter(i => i.status !== 'closed').length

  const crumb = (label: string, onClick?: () => void) =>
    onClick ? (
      <button type="button" onClick={onClick} className="rounded px-1 text-muted-foreground hover:bg-muted hover:text-foreground">{label}</button>
    ) : (
      <span className="px-1 font-semibold">{label}</span>
    )

  return (
    <div className="flex flex-col gap-3">
      {/* where */}
      <div className="rounded-lg bg-card p-4">
        <div className="flex items-center gap-0.5 text-[13px]">
          {crumb(siteName)}
          <ChevronRightIcon className="size-3.5 text-muted-foreground" aria-hidden="true" />
          {hall ? crumb(`Floor ${floor}`, () => onFocus({ kind: 'floor', dc: focus.dc, label: floorLabel })) : crumb(`Floor ${floor}`)}
          {hall && (
            <>
              <ChevronRightIcon className="size-3.5 text-muted-foreground" aria-hidden="true" />
              {crumb(`Block ${hall.tag}`)}
            </>
          )}
        </div>
        <div className="mt-2 flex items-center justify-between gap-3">
          <h3 className="text-[22px] leading-tight font-semibold tracking-tight">{hall ? `Block ${hall.tag}` : `Floor ${floor}`}</h3>
          <span className={cn('inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[13px] font-semibold', TONE[status], status === 'crit' ? 'bg-destructive/10' : status === 'warn' ? 'bg-warning/12' : 'bg-success/10')}>
            <span aria-hidden="true">{GLYPH[status]}</span> {WORD[status]}
          </span>
        </div>
        {hall && <p className="mt-1 text-[14px] text-muted-foreground">{hall.headline}</p>}
        {!hall && feed && <p className={cn('mt-1 text-[14px]', feed.stale ? 'text-destructive' : 'text-muted-foreground')}>{feed.stale ? 'Feed silent' : 'Feed live'} · last batch {ago(feed.lastMs, now)}</p>}

        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Stat k="Hottest GPU" v={hottest ? hottest.temp.toFixed(1) : '—'} u="°C" tone={hottest ? TONE[hottest.status] : undefined} />
          <Stat k={`Hot servers`} v={hall ? hall.hot : halls.reduce((n, h) => n + h.hot, 0)} u={`of ${hall ? hall.servers : halls.reduce((n, h) => n + h.servers, 0)}`} />
          <Stat k="Power" v={(hall ? hall.load : halls.reduce((n, h) => n + h.load, 0)).toFixed(1)} u="kW" />
          <Stat k="Open alerts" v={open} tone={open ? 'text-destructive' : undefined} />
        </div>

        {/* a block: its hottest servers. a floor: its blocks, to drill into */}
        {hall ? (
          hall.risks.length > 0 && (
            <div className="mt-3">
              <h4 className="mb-1 text-[12px] font-semibold tracking-[.06em] text-muted-foreground uppercase">Hottest servers</h4>
              <ul className="flex flex-col gap-1 text-[13.5px]">
                {hall.risks.map(r => (
                  <li key={r} className="flex gap-2"><span aria-hidden="true" className={cn('text-[10px] leading-5', TONE[hall.status])}>▲</span>{r}</li>
                ))}
              </ul>
            </div>
          )
        ) : (
          <div className="mt-3 grid grid-cols-3 gap-1.5">
            {halls.map(h => (
              <button
                key={h.id}
                type="button"
                onClick={() => onFocus({ kind: 'block', dc: h.datacenter, rackId: h.id.split('#')[0], hallId: h.id, label: `Block ${h.tag} · ${floorLabel}` })}
                className="flex items-center gap-2 rounded-md bg-muted px-2.5 py-1.5 text-left hover:bg-accent"
              >
                <span className={cn('size-2 rounded-full', h.status === 'crit' ? 'bg-destructive' : h.status === 'warn' ? 'bg-warning' : 'bg-success')} aria-hidden="true" />
                <span className="text-[13.5px] font-semibold">{h.tag}</span>
                <span className="ml-auto text-[12.5px] text-muted-foreground tabular-nums">{h.temp.toFixed(0)} °C</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* each alert, explained */}
      {!incidents.length ? (
        <p className="rounded-lg bg-card p-4 text-[14px] text-muted-foreground">No alerts {hall ? 'on this row' : 'on this floor'} right now.</p>
      ) : (
        incidents.map(i => (
          <article key={i.id}> {/* severity reads from the word and tags, no colour bar */}
            <div className="rounded-lg bg-card p-4">
              <div className="flex gap-3.5">
              <AddressBlock
                block={i.rackId ? (halls.filter(h => h.id.startsWith(`${i.rackId}#`)).sort((a, b) => b.temp - a.temp)[0]?.tag ?? '—') : 'Feed'}
                floor={floor}
                site={siteName}
                severity={i.severity}
              />
              <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-1.5">
                <span className={cn('text-xs font-semibold capitalize', i.severity === 'critical' ? 'text-destructive' : i.severity === 'high' ? 'text-warning' : 'text-muted-foreground')}>{i.severity}</span>
                <Badge size="sm" variant={STATUS_BADGE[i.status as keyof typeof STATUS_BADGE] ?? 'secondary'} className="capitalize">{i.status}</Badge>
                {i.status !== 'closed' && (i.ownerName ? <Badge size="sm" variant="secondary"><UserIcon aria-hidden="true" />{i.ownerName}</Badge> : <Badge size="sm" variant="outline">Unassigned</Badge>)}
                {i.handedFrom && !i.ownerName && i.status !== 'closed' && <Badge size="sm" variant="outline">Left by {i.handedFrom}</Badge>}
                {i.reports.map(r => <Badge key={r} size="sm" variant="outline"><FileTextIcon aria-hidden="true" />{r} report</Badge>)}
                <span className="text-xs text-muted-foreground tabular-nums">#{i.id}</span>
                <span className="ml-auto text-xs text-muted-foreground tabular-nums">opened {ago(i.openedMs, now)}</span>
              </div>
              <p className="mt-1.5 text-[15px] leading-snug font-semibold">{i.title.includes(': ') ? i.title.slice(i.title.indexOf(': ') + 2) : i.title.replace(`${floorLabel} `, '')}</p>
              </div>
              </div>

              <div className="mt-3 rounded-md bg-muted px-3 py-2.5">
                <h5 className="mb-1 flex items-center gap-1.5 text-[12px] font-semibold tracking-[.06em] text-muted-foreground uppercase"><SearchIcon className="size-3.5" aria-hidden="true" /> Why this alert</h5>
                <p className="text-[13.5px] leading-relaxed">{why(i, where)}</p>
              </div>

              {i.status === 'closed' ? (
                <p className="mt-2 text-[13px] text-muted-foreground">Closed: {i.closedReason || 'resolved'}</p>
              ) : (
                <div className="mt-2 rounded-md bg-muted px-3 py-2.5">
                  <h5 className="mb-1 flex items-center gap-1.5 text-[12px] font-semibold tracking-[.06em] text-muted-foreground uppercase"><LightbulbIcon className="size-3.5" aria-hidden="true" /> What to do</h5>
                  <ol className="ml-4 list-decimal text-[13.5px] leading-relaxed">
                    {steps(i, hall ?? halls.find(h => h.id.startsWith(`${i.rackId}#`))).map(s => <li key={s}>{s}</li>)}
                  </ol>
                </div>
              )}
            </div>
          </article>
        ))
      )}
    </div>
  )
}
