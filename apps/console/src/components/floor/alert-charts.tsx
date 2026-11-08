import { useState, type ReactNode } from 'react'
import { GPU_CRIT_C, GPU_WARN_C, SITES, type Hall } from './data'
import { cn } from '@/lib/utils'
import { StatusGlyph } from './status-glyph'

// The Alerts dashboard's charts, all from live SpacetimeDB data (incident, rack, server_latest):
//   1. Blocks: one site's blocks as a heat map (floor × block) or a sortable table, coloured by the rule's heat bands.
//   3. Opened in the last 6 hours: new alerts per 30 minutes, split by severity.
// Colour carries status only (critical / high / medium, and the temperature bands that match the rule limits),
// and every mark also has a number or word, so nothing is colour alone. 

export interface ChartIncident {
  severity: string
  status: string
  datacenterId: string
  openedMs: number
}

const SEV_ORDER = ['critical', 'high', 'medium'] as const
const SEV_FILL: Record<string, string> = { critical: 'bg-destructive', high: 'bg-warning', medium: 'bg-warning/45' }
const SEV_LABEL: Record<string, string> = { critical: 'Critical', high: 'High', medium: 'Medium' }

function Card({ title, aside, children }: { title: string; aside?: ReactNode; children: ReactNode }) {
  return (
    <section className="flex shrink-0 flex-col rounded-lg bg-card p-4" aria-label={title}> {/* never squeezed: the column scrolls instead */}
      <div className="mb-2.5 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h3 className="text-[14.5px] font-semibold">{title}</h3>
        {aside}
      </div>
      {children}
    </section>
  )
}

function SevLegend() {
  return (
    <div className="flex items-center gap-3 text-[12px] text-muted-foreground" aria-hidden="true">
      {SEV_ORDER.map(s => (
        <span key={s} className="inline-flex items-center gap-1.5"><i className={cn('size-2.5 rounded-sm', SEV_FILL[s])} />{SEV_LABEL[s]}</span>
      ))}
    </div>
  )
}

// ── 1. block heat map ──
const band = (c: number) => (c >= GPU_CRIT_C ? 'crit' : c >= GPU_WARN_C ? 'warn' : c >= 45 ? 'warm' : 'cool')
const BAND: Record<string, string> = {
  crit: 'bg-destructive text-white',
  warn: 'bg-warning text-[#1a1a1a]',
  warm: 'bg-warning/25 text-foreground',
  cool: 'bg-muted text-muted-foreground',
}

type SortKey = 'tag' | 'floor' | 'temp' | 'hot' | 'load' | 'open'

/** Every block of one site as a table (a "data frame"): sortable, heat-coloured temperature, click a row to open it. */
export function BlockTable({ sites, site, floorsSel, openOn, focus, onOpen }: {
  sites: Record<string, Hall[][]>
  site: string // the page's one data center (Alerts header filter)
  floorsSel: number[] // floors picked on the page; none = all
  openOn: (rackId: string) => number // open alerts on a block's rack
  focus?: string
  onOpen: (h: Hall) => void
}) {
  const [sort, setSort] = useState<{ key: SortKey; desc: boolean }>({ key: 'temp', desc: true })
  const [mode, setMode] = useState<'map' | 'table'>('map') // heat map grid, or the sortable table
  const floors = (sites[site] ?? []).map((halls, k) => ({ floor: k + 1, halls })).filter(f => !floorsSel.length || floorsSel.includes(f.floor))
  const rows = floors.flatMap(f => f.halls).map(h => ({ h, open: openOn(h.id.split('#')[0]) }))
  const val = (r: (typeof rows)[number]) => (sort.key === 'tag' ? r.h.tag : sort.key === 'open' ? r.open : r.h[sort.key])
  rows.sort((a, b) => {
    const x = val(a), y = val(b)
    const c = typeof x === 'string' ? x.localeCompare(y as string) : (x as number) - (y as number)
    return sort.desc ? -c : c
  })
  const cols: { key: SortKey; label: string; right?: boolean }[] = [
    { key: 'tag', label: 'Block' },
    { key: 'floor', label: 'Floor' },
    { key: 'temp', label: 'Hottest GPU', right: true },
    { key: 'hot', label: 'Hot servers', right: true },
    { key: 'load', label: 'Power', right: true },
    { key: 'open', label: 'Open alerts', right: true },
  ]
  const STATUS: Record<string, [string, string, 'diamond' | 'triangle' | 'dot']> = { crit: ['Critical', 'text-destructive', 'diamond'], warn: ['Warning', 'text-warning', 'triangle'], ok: ['Nominal', 'text-success', 'dot'] }

  return (
    <Card
      title={`Blocks · ${SITES.find(x => x.id === site)?.name.split(',')[0] ?? ''}`}
      aside={
        <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-0.5 rounded-lg bg-muted p-0.5" role="tablist" aria-label="View">
          {(['map', 'table'] as const).map(m => (
            <button key={m} type="button" role="tab" aria-selected={mode === m} onClick={() => setMode(m)}
              className={cn('rounded-md px-2.5 py-1 text-[12.5px] font-medium', mode === m ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground')}>
              {m === 'map' ? 'Heat map' : 'Table'}
            </button>
          ))}
        </div>
        </div>
      }
    >
      {mode === 'map' ? (
        <div className="flex flex-col gap-1.5" role="list">
          {floors.map(({ floor, halls }) => (
            <div key={floor} className="grid grid-cols-[64px_repeat(6,minmax(0,1fr))] items-center gap-1" role="listitem">
              <span className="text-[12.5px] font-semibold">Floor {floor}</span>
              {halls.slice(0, 6).map(h => (
                <button
                  key={h.id}
                  type="button"
                  onClick={() => onOpen(h)}
                  title={`Block ${h.tag}, Floor ${floor}: hottest GPU ${h.temp.toFixed(1)} °C, ${h.hot} of ${h.servers} servers at or over 50 °C. Click to open it on the Floor page.`}
                  className={cn(
                    'flex h-11 flex-col items-center justify-center rounded-[4px] text-[11.5px] leading-tight tabular-nums transition-[box-shadow] hover:ring-2 hover:ring-foreground/40',
                    BAND[band(h.temp)],
                    focus === h.id && 'ring-2 ring-foreground',
                  )}
                >
                  <span className="font-semibold">{h.tag}</span>
                  <span>{h.temp.toFixed(1)}°</span>
                </button>
              ))}
            </div>
          ))}
          {!floors.length && <p className="text-[13.5px] text-muted-foreground">No blocks report from this site yet.</p>}
        </div>
      ) : (
      <div className="no-scrollbar max-h-[340px] overflow-y-auto rounded-md border">
        <table className="w-full border-collapse text-[13px]">
          <thead className="sticky top-0 bg-muted text-[12px] text-muted-foreground">
            <tr>
              {cols.map(c => (
                <th key={c.key} scope="col" aria-sort={sort.key === c.key ? (sort.desc ? 'descending' : 'ascending') : 'none'} className={cn('px-2.5 py-1.5 font-medium', c.right ? 'text-right' : 'text-left')}>
                  <button type="button" onClick={() => setSort(sv => ({ key: c.key, desc: sv.key === c.key ? !sv.desc : c.key !== 'tag' && c.key !== 'floor' }))} className="inline-flex items-center gap-1 hover:text-foreground">
                    {c.label}
                    <span aria-hidden="true" className={cn('text-[10px]', sort.key !== c.key && 'opacity-0')}>{sort.desc ? '▼' : '▲'}</span>
                  </button>
                </th>
              ))}
              <th scope="col" className="px-2.5 py-1.5 text-left font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ h, open }) => (
              <tr
                key={h.id}
                onClick={() => onOpen(h)}
                title={`Open block ${h.tag} on the Floor page`}
                className={cn('cursor-pointer border-t tabular-nums hover:bg-muted/70', focus === h.id && 'bg-muted font-medium')}
              >
                <td className="px-2.5 py-1.5 font-semibold">{h.tag}</td>
                <td className="px-2.5 py-1.5">{h.floor}</td>
                <td className="px-2.5 py-1 text-right">
                  <span className={cn('inline-block min-w-[58px] rounded-[4px] px-1.5 py-0.5 text-right font-semibold', BAND[band(h.temp)])}>{h.temp.toFixed(1)} °C</span>
                </td>
                <td className="px-2.5 py-1.5 text-right">{h.hot} <span className="text-muted-foreground">/ {h.servers}</span></td>
                <td className="px-2.5 py-1.5 text-right">{h.load.toFixed(1)} <span className="text-muted-foreground">kW</span></td>
                <td className="px-2.5 py-1.5 text-right">{open || <span className="text-muted-foreground">0</span>}</td>
                <td className={cn('px-2.5 py-1.5 whitespace-nowrap', STATUS[h.status][1])}><span className="inline-flex items-center gap-1.5"><StatusGlyph shape={STATUS[h.status][2]} />{STATUS[h.status][0]}</span></td>
              </tr>
            ))}
            {!rows.length && (
              <tr><td colSpan={7} className="px-2.5 py-4 text-center text-muted-foreground">No blocks report from this site yet.</td></tr>
            )}
          </tbody>
        </table>
      </div>
      )}
      <div className="mt-2.5 flex items-center gap-2.5 text-[12px] text-muted-foreground" aria-hidden="true">
        Hottest GPU:
        {[['cool', '< 45'], ['warm', '45–50'], ['warn', '50–55'], ['crit', '≥ 55 °C']].map(([b, l]) => (
          <span key={b} className="inline-flex items-center gap-1"><i className={cn('size-2.5 rounded-sm', BAND[b].split(' ')[0])} />{l}</span>
        ))}
      </div>
    </Card>
  )
}

// ── 3. opened in the last 6 hours ──
const BIN_MS = 30 * 60_000
const BINS = 12

export function OpenedTimeline({ all, now }: { all: ChartIncident[]; now: number }) {
  const start = now - BINS * BIN_MS
  const bins = Array.from({ length: BINS }, (_, b) => {
    const from = start + b * BIN_MS
    const list = all.filter(a => a.openedMs >= from && a.openedMs < from + BIN_MS)
    return { from, total: list.length, by: SEV_ORDER.map(sev => ({ sev, n: list.filter(a => a.severity === sev).length })) }
  })
  const step = Math.max(1, Math.ceil(Math.max(...bins.map(b => b.total)) / 4)) // whole-number gridline spacing
  const top = step * 4 // y-axis ceiling: four gridlines above the baseline
  const ticks = [4, 3, 2, 1, 0].map(k => k * step) // top → bottom, matches the gridlines
  const clock = (t: number) => new Date(t).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
  const total = bins.reduce((n, b) => n + b.total, 0)
  return (
    <Card title="Alerts opened · last 6 hours" aside={<SevLegend />}>
      <div className="flex gap-1.5">
        <span className="w-3 shrink-0 self-center whitespace-nowrap text-[11.5px] text-muted-foreground [writing-mode:vertical-rl] rotate-180">Alerts opened</span> {/* y-axis label */}
        <div className="flex h-28 shrink-0 flex-col justify-between text-right text-[11px] leading-none text-muted-foreground tabular-nums" aria-hidden="true">
          {ticks.map(t => <span key={t} className="-my-[5px]">{t}</span>)} {/* centred on each gridline */}
        </div>
        <div className="flex-1">
          <div className="relative flex h-28 items-end gap-[3px] border-b border-l border-foreground/30 px-[3px]">
            {ticks.slice(0, -1).map((t, i) => (
              <i key={t} className="pointer-events-none absolute inset-x-0 border-t border-dashed border-border" style={{ top: `${(i / 4) * 100}%` }} aria-hidden="true" />
            ))}
            {bins.map((b, i) => (
              <div
                key={b.from}
                tabIndex={0}
                aria-label={`${clock(b.from)}–${clock(b.from + BIN_MS)}: ${b.total} opened${b.total ? ` (${b.by.filter(x => x.n).map(x => `${x.n} ${x.sev}`).join(', ')})` : ''}`}
                className="group relative flex h-full flex-1 flex-col-reverse gap-[2px] rounded-t-[4px] outline-none hover:bg-muted/60 focus-visible:bg-muted/60" // relative: bars sit above the gridlines
              >
                {b.by.filter(x => x.n).map((x, k, arr) => (
                  <div key={x.sev} className={cn(SEV_FILL[x.sev], k === arr.length - 1 && 'rounded-t-[4px]')} style={{ height: `${(x.n / top) * 100}%` }} />
                ))}
                <div
                  className={cn(
                    'pointer-events-none absolute z-10 mb-1.5 hidden w-max rounded-md bg-popover px-2.5 py-1.5 text-[12px] text-popover-foreground shadow-md ring-1 ring-border group-hover:block group-focus-visible:block',
                    i < 3 ? 'left-0' : i >= BINS - 3 ? 'right-0' : 'left-1/2 -translate-x-1/2', // edge bars: keep the tooltip inside the card
                  )}
                  style={{ bottom: `${Math.min((b.total / top) * 100, 55)}%` }} // just above the bar, capped so tall bars don't push it off the card
                  aria-hidden="true"
                >
                  <p className="font-semibold tabular-nums">{clock(b.from)}–{clock(b.from + BIN_MS)}</p>
                  <p className="text-muted-foreground">{b.total} opened</p>
                  {b.by.filter(x => x.n).map(x => (
                    <p key={x.sev} className="flex items-center gap-1.5 tabular-nums"><i className={cn('size-2 rounded-sm', SEV_FILL[x.sev])} />{x.n} {SEV_LABEL[x.sev]}</p>
                  ))}
                </div>
              </div>
            ))}
          </div>
          <div className="mt-1 flex justify-between text-[11.5px] text-muted-foreground tabular-nums">
            <span>{clock(start)}</span>
            <span>{clock(start + (BINS / 2) * BIN_MS)}</span>
            <span>now</span>
          </div>
          <p className="mt-0.5 text-center text-[11.5px] text-muted-foreground">Time opened (30-minute intervals)</p> {/* x-axis label */}
        </div>
      </div>
      <p className="mt-2 text-[12.5px] text-muted-foreground">{total} opened in this selection</p>
    </Card>
  )
}
